# =============================================================================
# VISUALISER — ml-service/training/train.py
#
# Trains the isolated-sign classifier from the clips in data/<LABEL>/*.{webm,mp4..}
# and writes:
#   models/classifier.pkl        the model bundle the service loads
#   models/metrics.json          machine-readable metrics
#   evaluation/RESULTS.md        human-readable report (REAL numbers from this run)
#
# Usage (from ml-service/, venv active):
#   python training/train.py
#   python training/train.py --data data --min-per-class 10
#
# FILE NAMES encode the recording session:  <LABEL>_<session>_<NNN>.webm
# (the Collect page does this for you).
#
# SPLIT PROTOCOL — avoids leakage:
#   Clips recorded back-to-back are near duplicates, so a random split would
#   leak and over-estimate accuracy. We split BY SESSION (a sitting):
#     >= 3 sessions : test = latest session, validation = the one before,
#                     train = the rest.
#     == 2 sessions : train = first, test = second; model chosen by 5-fold CV
#                     on train.
#     == 1 session  : stratified random 60/20/20  -> reported with an explicit
#                     "optimistic, same-sitting" warning.
#   The test set is used ONCE, after the model has been chosen.
# =============================================================================

import argparse
import hashlib
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import joblib  # noqa: E402
import sklearn  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,  # noqa: E402
                             f1_score)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402
from sklearn.svm import SVC  # noqa: E402

from recognition.features import (DEFAULT_MIN_MOTION, FEATURE_CONFIG, FEATURE_VERSION,  # noqa: E402
                                  extract_features, motion_energy)
from recognition.video import VideoError, decode_gray_frames  # noqa: E402

VIDEO_EXT = {".webm", ".mp4", ".mov", ".mkv", ".ogv"}
NAME_RE = re.compile(r"^(?P<label>[A-Z][A-Z0-9_]*)_(?P<session>[a-z0-9]+)_(?P<idx>\d+)$")


def candidate_models(seed: int) -> dict:
    def pipe(clf):
        return Pipeline([("scale", StandardScaler()), ("clf", clf)])
    return {
        "LogisticRegression(C=1)": pipe(LogisticRegression(C=1.0, max_iter=3000)),
        "LogisticRegression(C=10)": pipe(LogisticRegression(C=10.0, max_iter=3000)),
        "SVC(rbf,C=10)": pipe(SVC(kernel="rbf", C=10.0, gamma="scale", probability=True, random_state=seed)),
        "RandomForest(300)": pipe(RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1)),
    }


def scan(data_dir: Path):
    items = []
    for label_dir in sorted(p for p in data_dir.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for f in sorted(label_dir.iterdir()):
            if f.suffix.lower() not in VIDEO_EXT:
                continue
            m = NAME_RE.match(f.stem)
            session = m.group("session") if m else "unknown"
            items.append({"path": f, "label": label_dir.name, "session": session})
    return items


def cached_features(item, cache_dir: Path):
    """Decode + extract once per file; cache on disk (key includes file size/mtime)."""
    st = item["path"].stat()
    key = hashlib.sha1(f"{item['path']}|{st.st_size}|{st.st_mtime_ns}|v{FEATURE_VERSION}".encode()).hexdigest()
    cp = cache_dir / f"{key}.npz"
    if cp.exists():
        z = np.load(cp)
        return z["vec"], float(z["peak"])
    frames = decode_gray_frames(str(item["path"]), fps=FEATURE_CONFIG["fps"], width=FEATURE_CONFIG["width"],
                                height=FEATURE_CONFIG["height"], max_seconds=FEATURE_CONFIG["max_seconds"])
    peak = float(motion_energy(frames).max()) if len(frames) > 1 else 0.0
    vec, _ = extract_features(frames, FEATURE_CONFIG, min_motion=0.0)  # keep every clip; report motion
    np.savez(cp, vec=vec, peak=peak)
    return vec, peak


def choose_split(sessions_per_item, y, seed):
    sess = sorted(set(sessions_per_item))
    sp = np.array(sessions_per_item)
    idx = np.arange(len(y))
    if len(sess) >= 3:
        test, val = sess[-1], sess[-2]
        return ("session-held-out (test=%s, val=%s)" % (test, val),
                idx[(sp != test) & (sp != val)], idx[sp == val], idx[sp == test], False)
    if len(sess) == 2:
        return ("2 sessions (train=%s, test=%s; model chosen by CV)" % (sess[0], sess[1]),
                idx[sp == sess[0]], None, idx[sp == sess[1]], False)
    tr, rest = train_test_split(idx, test_size=0.4, stratify=y, random_state=seed)
    va, te = train_test_split(rest, test_size=0.5, stratify=y[rest], random_state=seed)
    return ("single-session stratified random 60/20/20 (OPTIMISTIC: same sitting)", tr, va, te, True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "data"))
    ap.add_argument("--out", default=str(ROOT / "models" / "classifier.pkl"))
    ap.add_argument("--report", default=str(ROOT / "evaluation" / "RESULTS.md"))
    ap.add_argument("--min-per-class", type=int, default=8)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    data_dir = Path(args.data)
    if not data_dir.exists():
        sys.exit(f"Data folder not found: {data_dir}. Record clips with the Collect page first.")
    items = scan(data_dir)
    if not items:
        sys.exit("No video clips found under data/<LABEL>/.")

    counts = Counter(i["label"] for i in items)
    too_few = {l: c for l, c in counts.items() if c < args.min_per_class}
    if too_few:
        sys.exit(f"Classes with fewer than {args.min_per_class} clips: {too_few}. Record more or lower --min-per-class.")
    if len(counts) < 2:
        sys.exit("Need at least 2 classes.")

    cache_dir = data_dir / ".cache"
    cache_dir.mkdir(exist_ok=True)
    print(f"Extracting features for {len(items)} clips ...")
    t0 = time.perf_counter()
    X, y, sess, peaks, bad = [], [], [], [], []
    for it in items:
        try:
            vec, peak = cached_features(it, cache_dir)
        except VideoError as e:
            bad.append((str(it["path"]), str(e)))
            continue
        X.append(vec); y.append(it["label"]); sess.append(it["session"]); peaks.append((it["label"], peak))
    if not X:
        sys.exit("No decodable clips remain. Check the videos and record new clips.")
    usable_counts = Counter(y)
    if len(usable_counts) < 2 or any(c < args.min_per_class for c in usable_counts.values()) or set(usable_counts) != set(counts):
        sys.exit(f"Too few usable clips after decoding: {dict(usable_counts)}. Record more clips for every class.")
    X, y = np.vstack(X), np.array(y)
    print(f"  done in {time.perf_counter() - t0:.1f}s; skipped {len(bad)} undecodable clip(s)")

    protocol, tr, va, te, optimistic = choose_split(sess, y, args.seed)
    for split_name, indices in (("training", tr), ("validation", va), ("test", te)):
        if indices is not None and set(y[indices]) != set(y):
            sys.exit(f"The {split_name} split is missing classes. Record every label in every session.")
    if va is None and min(Counter(y[tr]).values()) < 2:
        sys.exit("Cross-validation needs at least 2 training clips per class. Record more clips.")
    print("Split protocol:", protocol)
    print(f"  train={len(tr)} val={0 if va is None else len(va)} test={len(te)}")

    # ---- model selection (validation set or CV on train) -------------------
    scores = {}
    for name, model in candidate_models(args.seed).items():
        if va is not None:
            model.fit(X[tr], y[tr])
            scores[name] = f1_score(y[va], model.predict(X[va]), average="macro")
        else:
            k = max(2, min(5, min(Counter(y[tr]).values())))
            pred = cross_val_predict(model, X[tr], y[tr], cv=StratifiedKFold(k, shuffle=True, random_state=args.seed))
            scores[name] = f1_score(y[tr], pred, average="macro")
        print(f"  {name:28s} selection macro-F1 = {scores[name]:.3f}")
    best = max(scores, key=scores.get)
    print("Selected:", best)

    # ---- refit on train(+val), evaluate ONCE on test -----------------------
    fit_idx = np.concatenate([tr, va]) if va is not None else tr
    model = candidate_models(args.seed)[best]
    model.fit(X[fit_idx], y[fit_idx])
    pred = model.predict(X[te])
    labels = sorted(set(y))
    acc = accuracy_score(y[te], pred)
    rep = classification_report(y[te], pred, labels=labels, output_dict=True, zero_division=0)
    cm = confusion_matrix(y[te], pred, labels=labels)
    # failure cases: names of misclassified test clips (ok_items is aligned with X / y)
    bad_paths = {b[0] for b in bad}
    ok_items = [it for it in items if str(it["path"]) not in bad_paths]
    failures = [(ok_items[i]["path"].name, y[i], pred[k]) for k, i in enumerate(te) if pred[k] != y[i]]

    print(f"\nTEST accuracy = {acc:.3f}  (n={len(te)})")

    bundle = {
        "model": model, "labels": labels, "model_name": best,
        "feature_version": FEATURE_VERSION, "feature_config": FEATURE_CONFIG,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "split_protocol": protocol, "sklearn_version": sklearn.__version__,
        "test_accuracy": float(acc), "n_test": int(len(te)),
    }
    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out)

    metrics = {
        "protocol": protocol, "optimistic": optimistic, "selected_model": best,
        "selection_scores_macro_f1": scores,
        "n_train": int(len(tr)), "n_val": 0 if va is None else int(len(va)), "n_test": int(len(te)),
        "accuracy": float(acc),
        "macro": {k: rep["macro avg"][k] for k in ("precision", "recall", "f1-score")},
        "weighted": {k: rep["weighted avg"][k] for k in ("precision", "recall", "f1-score")},
        "per_class": {l: {k: rep[l][k] for k in ("precision", "recall", "f1-score", "support")} for l in labels},
        "labels": labels, "confusion_matrix": cm.tolist(),
        "clips_per_class": dict(counts), "skipped_clips": bad,
        "trained_at": bundle["trained_at"], "sklearn_version": sklearn.__version__,
    }
    (out.parent / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    # motion statistics help calibrate MIN_MOTION for YOUR camera
    by_label = defaultdict(list)
    for l, p in peaks:
        by_label[l].append(p)
    write_report(Path(args.report), metrics, failures, by_label)
    print(f"\nSaved model  -> {out}\nSaved report -> {args.report}")
    if optimistic:
        print("\nWARNING: only one recording session found. Numbers are OPTIMISTIC.\n"
              "Record at least 3 separate sittings (different time/lighting) for an honest estimate.")


def write_report(path: Path, m: dict, failures, motion_by_label):
    labels = m["labels"]
    L = []
    L.append("# Training / evaluation results (auto-generated)\n")
    L.append(f"Generated by `training/train.py` on {m['trained_at']} (scikit-learn {m['sklearn_version']}). "
             "Every number below was produced by that run on the recorded dataset.\n")
    if m["optimistic"]:
        L.append("> **WARNING: single recording session — these numbers are optimistic (same-sitting leakage).**\n")
    L.append("## Setup\n")
    L.append(f"- Split protocol: **{m['protocol']}**")
    L.append(f"- Train / validation / test clips: {m['n_train']} / {m['n_val']} / {m['n_test']}")
    L.append(f"- Classes ({len(labels)}): {', '.join(labels)}")
    L.append(f"- Clips per class (all sessions): {m['clips_per_class']}")
    L.append(f"- Feature extractor: version {FEATURE_VERSION} (see recognition/features.py), config {FEATURE_CONFIG}")
    L.append("- Candidate models and selection macro-F1 (validation, or 5-fold CV on train):\n")
    for k, v in m["selection_scores_macro_f1"].items():
        L.append(f"  - {k}: {v:.3f}")
    L.append(f"- Selected model: **{m['selected_model']}** (refit on train+val, test used once)\n")
    L.append("## Test-set metrics\n")
    L.append(f"- Accuracy: **{m['accuracy']:.3f}** (n={m['n_test']})")
    L.append("- Macro avg  — precision {precision:.3f}, recall {recall:.3f}, F1 {f1-score:.3f}".format(**m["macro"]))
    L.append("- Weighted avg — precision {precision:.3f}, recall {recall:.3f}, F1 {f1-score:.3f}\n".format(**m["weighted"]))
    L.append("| Class | Precision | Recall | F1 | Support |\n|---|---|---|---|---|")
    for l in labels:
        c = m["per_class"][l]
        L.append(f"| {l} | {c['precision']:.2f} | {c['recall']:.2f} | {c['f1-score']:.2f} | {int(c['support'])} |")
    L.append("\n## Confusion matrix (rows = true, columns = predicted)\n")
    L.append("| true \\ pred | " + " | ".join(labels) + " |\n|---|" + "---|" * len(labels))
    for l, row in zip(labels, m["confusion_matrix"]):
        L.append(f"| **{l}** | " + " | ".join(str(v) for v in row) + " |")
    L.append("\n## Failure cases (misclassified test clips)\n")
    L.append("\n".join(f"- `{n}`: true {t}, predicted {p}" for n, t, p in failures) if failures else "- none in this test set")
    L.append("\n## Motion-energy statistics (peak mean |frame diff| per clip)\n")
    L.append("Use these to choose `MIN_MOTION` (idle clips should fall below it, real signs above).\n")
    L.append("| Class | min | median | max |\n|---|---|---|---|")
    for l in labels:
        v = sorted(motion_by_label[l])
        L.append(f"| {l} | {v[0]:.4f} | {v[len(v)//2]:.4f} | {v[-1]:.4f} |")
    L.append(f"\nCurrent default MIN_MOTION = {DEFAULT_MIN_MOTION}\n")
    if m["skipped_clips"]:
        L.append("## Skipped clips\n" + "\n".join(f"- {p}: {e}" for p, e in m["skipped_clips"]))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

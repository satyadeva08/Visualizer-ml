# =============================================================================
# VISUALISER — ml-service/service/app.py
# Flask HTTP service wrapping recognition + text generation.
#
#   GET  /health         liveness + model info
#   POST /predict        video  -> signs + text
#   POST /generate       {"labels": [...]} -> text   (sign sequence -> sentence)
#   POST /collect        (only if ENABLE_COLLECT=1) save a labelled training clip
#   GET  /collect/stats  (only if ENABLE_COLLECT=1) clips per label
#
# Called by the Go backend only. It listens on 127.0.0.1 and must never be
# exposed to the phone / network directly.
# =============================================================================

import logging
import os
import re
import shutil
import tempfile
import time
from pathlib import Path

from flask import Flask, jsonify, request

from generation.text_generator import TextGenerator
from recognition.pipeline import ModelUnavailable, RecognitionPipeline
from recognition.video import FFmpegMissing, VideoError, decode_gray_frames
from recognition.features import extract_features, FEATURE_CONFIG

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("visualiser.service")

ALLOWED_EXTENSIONS = {".webm", ".mp4", ".mov", ".mkv", ".ogv"}
MAX_VIDEO_MB = int(os.environ.get("MAX_VIDEO_MB", "50"))
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
LABEL_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")
SESSION_RE = re.compile(r"^[a-z0-9]{1,16}$")


def looks_like_video(head: bytes) -> bool:
    """Cheap container check on the first bytes (extension alone can lie)."""
    return (head.startswith(b"\x1a\x45\xdf\xa3")                       # WebM / Matroska
            or head[4:8] in (b"ftyp", b"moov", b"mdat", b"free", b"wide")  # MP4 / MOV
            or head.startswith(b"OggS"))                                # Ogg


def create_app(pipeline: RecognitionPipeline | None = None) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = (MAX_VIDEO_MB + 1) * 1024 * 1024
    pipe = pipeline or RecognitionPipeline()
    generator = TextGenerator()
    collect_enabled = os.environ.get("ENABLE_COLLECT", "0") == "1"

    def err(message, code, status):
        return jsonify({"error": message, "code": code}), status

    @app.errorhandler(413)
    def too_large(_):
        return err(f"Video exceeds {MAX_VIDEO_MB} MB", "FILE_TOO_LARGE", 413)

    # ------------------------------------------------------------- helpers
    def save_upload():
        """Validate the 'video' field and write it to a temp file. -> (path, suffix) or error tuple."""
        if "video" not in request.files:
            return None, err("Missing 'video' file field", "MISSING_FILE", 400)
        f = request.files["video"]
        suffix = Path(f.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            return None, err(f"Unsupported file type '{suffix}'. Supported: "
                             f"{', '.join(sorted(ALLOWED_EXTENSIONS))}",
                             "UNSUPPORTED_FORMAT", 415)
        head = f.stream.read(16)
        f.stream.seek(0)
        if not head:
            return None, err("Video file is empty", "EMPTY_FILE", 400)
        if not looks_like_video(head):
            return None, err("File content is not a recognised video container",
                             "UNSUPPORTED_FORMAT", 415)
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False,
                                             prefix="visualiser_") as tmp:
                f.save(tmp)
                return tmp.name, None
        except OSError as e:
            logger.error("Could not save upload: %s", e)
            return None, err("Server could not save file", "INTERNAL_ERROR", 500)

    # -------------------------------------------------------------- routes
    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "model": pipe.model_info(),
                        "collect_enabled": collect_enabled})

    @app.post("/predict")
    def predict():
        path, bad = save_upload()
        if bad:
            return bad
        try:
            t0 = time.perf_counter()
            res = pipe.predict(path)
            gen = generator.generate(res["signs"])
            total_ms = int((time.perf_counter() - t0) * 1000)
            return jsonify({
                "signs": res["signs"],
                "text": gen["text"],
                "text_method": gen["method"],
                "emphasis": gen["emphasis"],
                "outcome": res["outcome"],
                "reason": res["reason"],
                "alternatives": res["alternatives"],
                "timings": res["timings"],
                "processing_time_ms": total_ms,
                "is_mock": res["is_mock"],
            })
        except ModelUnavailable as e:
            return err(str(e), "MODEL_NOT_TRAINED", 503)
        except FFmpegMissing as e:
            logger.error("%s", e)
            return err(str(e), "FFMPEG_MISSING", 503)
        except VideoError as e:
            return err(str(e), e.code, 422)
        except ValueError as e:
            return err(str(e), "PREDICTION_FAILED", 422)
        except Exception:
            logger.exception("Unexpected error during prediction")
            return err("Internal recognition error", "INTERNAL_ERROR", 500)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    @app.post("/generate")
    def generate():
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            return err("Request body must be a JSON object", "INVALID_REQUEST", 400)
        labels = body.get("labels")
        if (not isinstance(labels, list) or not labels or len(labels) > 12
                or not all(isinstance(l, str) and 0 < len(l) <= 40 for l in labels)):
            return err("'labels' must be a list of 1-12 non-empty strings",
                       "INVALID_REQUEST", 400)
        gen = generator.generate([{"label": l} for l in labels])
        return jsonify({"text": gen["text"], "text_method": gen["method"],
                        "emphasis": gen["emphasis"]})

    # ------------------------------------------- data collection (dev only)
    if collect_enabled:
        @app.post("/collect")
        def collect():
            label = (request.form.get("label") or "").strip().upper()
            session = (request.form.get("session") or "").strip().lower()
            if not LABEL_RE.match(label):
                return err("label must match [A-Z][A-Z0-9_]{0,31}", "INVALID_LABEL", 400)
            if not SESSION_RE.match(session):
                return err("session must match [a-z0-9]{1,16}", "INVALID_SESSION", 400)
            path, bad = save_upload()
            if bad:
                return bad
            try:
                cfg = FEATURE_CONFIG
                frames = decode_gray_frames(path, fps=cfg["fps"], width=cfg["width"],
                                            height=cfg["height"], max_seconds=cfg["max_seconds"])
                motion = None
                try:
                    _, info = extract_features(frames, cfg, min_motion=pipe.min_motion)
                    motion = info["motion_peak"]
                except VideoError as ve:
                    # An idle clip is only valid for the background class NONE.
                    if label != "NONE":
                        return err(str(ve), ve.code, 422)
                label_dir = DATA_DIR / label
                label_dir.mkdir(parents=True, exist_ok=True)
                n = 1
                while True:
                    dest = label_dir / f"{label}_{session}_{n:03d}{Path(path).suffix}"
                    try:
                        target = dest.open("xb")
                        break
                    except FileExistsError:
                        n += 1
                try:
                    with target, open(path, "rb") as source:
                        shutil.copyfileobj(source, target)
                except Exception:
                    dest.unlink(missing_ok=True)
                    raise
                total = sum(1 for p in label_dir.iterdir() if p.is_file())
                return jsonify({"saved": True, "label": label, "session": session,
                                "count_for_label": total, "motion_peak": motion})
            except FFmpegMissing as e:
                return err(str(e), "FFMPEG_MISSING", 503)
            except VideoError as e:
                return err(str(e), e.code, 422)
            finally:
                if path:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass

        @app.get("/collect/stats")
        def collect_stats():
            stats = {}
            if DATA_DIR.exists():
                for d in sorted(p for p in DATA_DIR.iterdir() if p.is_dir() and LABEL_RE.match(p.name)):
                    stats[d.name] = sum(1 for p in d.iterdir() if p.is_file())
            return jsonify({"counts": stats})

    return app


# Module-level app for `flask --app service/app.py run`
app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=os.environ.get("FLASK_DEBUG", "0") == "1")

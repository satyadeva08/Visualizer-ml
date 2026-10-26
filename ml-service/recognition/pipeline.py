# =============================================================================
# VISUALISER — ml-service/recognition/pipeline.py
#
# RecognitionPipeline: video file  ->  decode -> features -> classifier -> sign
#
# Three honest modes (reported by /health and by every response):
#   "real"        a trained model bundle (models/classifier.pkl) is loaded.
#   "mock"        NO model, and ALLOW_MOCK=1 was set explicitly. Every result
#                 carries is_mock=True and the UI shows "MOCK / DEMO RESULT".
#   "unavailable" NO model and mocking not allowed. /predict answers 503.
#
# The classifier only ever knows the labels it was trained on. To reduce wrong
# answers it can say "unknown sign" in two cases:
#   - the top probability is below MIN_CONFIDENCE, or
#   - the predicted class is the optional background class (label "NONE").
# Probabilities come from scikit-learn's predict_proba. They are the model's own
# scores, NOT calibrated accuracy: never quote them as "% correct".
# =============================================================================

import logging
import os
import time
from pathlib import Path

from recognition.features import (
    FEATURE_CONFIG, FEATURE_VERSION, DEFAULT_MIN_MOTION, extract_features,
)
from recognition.video import decode_gray_frames

logger = logging.getLogger("visualiser.recognition.pipeline")

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "classifier.pkl"
DEFAULT_MIN_CONFIDENCE = 0.5
REJECT_LABEL = "NONE"


class ModelUnavailable(RuntimeError):
    """No trained model is loaded and mock mode is not enabled."""


class RecognitionPipeline:
    def __init__(self, model_path=None, allow_mock: bool | None = None,
                 min_confidence: float | None = None, min_motion: float | None = None):
        self.model_path = Path(model_path or os.environ.get("MODEL_PATH") or DEFAULT_MODEL_PATH)
        self.allow_mock = (os.environ.get("ALLOW_MOCK", "0") == "1") if allow_mock is None else allow_mock
        self.min_confidence = float(
            min_confidence if min_confidence is not None
            else os.environ.get("MIN_CONFIDENCE", DEFAULT_MIN_CONFIDENCE))
        self.min_motion = float(
            min_motion if min_motion is not None
            else os.environ.get("MIN_MOTION", DEFAULT_MIN_MOTION))
        self._bundle = None
        self._load_error: str | None = None
        self._load()

    # ------------------------------------------------------------------ setup
    def _load(self):
        if not self.model_path.exists():
            logger.warning("No trained model at %s", self.model_path)
            return
        try:
            import joblib
            bundle = joblib.load(self.model_path)  # only load files YOU trained
            if bundle.get("feature_version") != FEATURE_VERSION:
                raise ValueError(
                    f"model feature_version={bundle.get('feature_version')} "
                    f"but code expects {FEATURE_VERSION}; retrain the model")
            self._bundle = bundle
            logger.info("Loaded model %s (%d classes)", self.model_path.name,
                        len(bundle["labels"]))
        except Exception as e:  # corrupt file, version mismatch, ...
            self._load_error = str(e)
            logger.error("Could not load model: %s", e)

    @property
    def mode(self) -> str:
        if self._bundle is not None:
            return "real"
        return "mock" if self.allow_mock else "unavailable"

    def model_info(self) -> dict:
        info = {"mode": self.mode, "loaded": self._bundle is not None,
                "min_confidence": self.min_confidence}
        if self._load_error:
            info["load_error"] = self._load_error
        if self._bundle is not None:
            b = self._bundle
            info.update({
                "labels": [l for l in b["labels"] if l != REJECT_LABEL],
                "n_classes": len(b["labels"]),
                "model_name": b.get("model_name"),
                "trained_at": b.get("trained_at"),
                "split_protocol": b.get("split_protocol"),
            })
        return info

    # ---------------------------------------------------------------- predict
    def predict(self, video_path: str) -> dict:
        """
        Returns:
          {"signs": [{"label", "confidence"}],   # [] when the sign is unknown
           "outcome": "recognized" | "unknown_sign",
           "reason": str | None,
           "alternatives": [{"label", "confidence"}, ...],   # top-3
           "timings": {"decode_ms", "features_ms", "inference_ms"},
           "is_mock": bool}
        Raises ValueError (VideoError) for unusable videos, ModelUnavailable.
        """
        if not os.path.exists(video_path) or os.path.getsize(video_path) == 0:
            raise ValueError("Video file is empty")

        if self.mode == "mock":
            logger.warning("[MOCK MODE] returning a fake result — no model is loaded")
            return {"signs": [{"label": "HELLO", "confidence": None}],
                    "outcome": "recognized", "reason": None, "alternatives": [],
                    "timings": {}, "is_mock": True}
        if self.mode == "unavailable":
            raise ModelUnavailable(
                "No trained model found. Collect data and run training/train.py "
                "(or set ALLOW_MOCK=1 for a clearly-labelled demo).")

        cfg = self._bundle.get("feature_config", FEATURE_CONFIG)

        t0 = time.perf_counter()
        frames = decode_gray_frames(
            video_path, fps=cfg["fps"], width=cfg["width"], height=cfg["height"],
            max_seconds=cfg["max_seconds"])
        t1 = time.perf_counter()
        vec, info = extract_features(frames, cfg, min_motion=self.min_motion)
        t2 = time.perf_counter()

        model = self._bundle["model"]
        labels = list(model.classes_)
        proba = model.predict_proba(vec.reshape(1, -1))[0]
        t3 = time.perf_counter()

        order = proba.argsort()[::-1]
        alts = [{"label": str(labels[i]), "confidence": round(float(proba[i]), 4)}
                for i in order[:3] if labels[i] != REJECT_LABEL]
        top_label, top_p = str(labels[order[0]]), float(proba[order[0]])

        timings = {"decode_ms": round((t1 - t0) * 1000, 1),
                   "features_ms": round((t2 - t1) * 1000, 1),
                   "inference_ms": round((t3 - t2) * 1000, 1)}
        logger.info("top=%s p=%.3f motion=%.4f timings=%s",
                    top_label, top_p, info["motion_peak"], timings)

        reason = None
        if top_label == REJECT_LABEL:
            reason = "NO_KNOWN_SIGN"
        elif top_p < self.min_confidence:
            reason = "LOW_CONFIDENCE"

        if reason:
            return {"signs": [], "outcome": "unknown_sign", "reason": reason,
                    "alternatives": alts, "timings": timings, "is_mock": False}
        return {"signs": [{"label": top_label, "confidence": round(top_p, 4)}],
                "outcome": "recognized", "reason": None, "alternatives": alts,
                "timings": timings, "is_mock": False}

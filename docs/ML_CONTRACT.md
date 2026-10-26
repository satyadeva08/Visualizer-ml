# ML contract: video → preprocessing → recognition → signs → text

```
webm/mp4 file
  │  FFmpeg (subprocess)                     recognition/video.py
  ▼
gray frames  (N × 48 × 64, 10 fps, ≤10 s)
  │  motion energy → trim idle → 12 frames   recognition/features.py
  │  − median background → pool to 6×8
  ▼
feature vector (1140 floats, fixed length)
  │  scikit-learn pipeline (scaler + classifier)   recognition/pipeline.py
  ▼
class probabilities → sign or "unknown"
  │  generation/text_generator.py (lookup + safe templates)
  ▼
text + emphasis words
```

## What the model is
* **Task:** isolated-sign classification (one sign per clip). Scope: *signer-dependent, fixed camera, small vocabulary.*
* **Features (version 1):** time-normalised foreground (|frame − median background|) and motion maps on a 6×8 grid, centroid trajectory, mass per frame, sign duration.
* **Classifier:** the best of Logistic Regression (C=1, 10), SVM-RBF, Random Forest — chosen on the validation session by macro-F1 and refit on train+val. Which one won is recorded in `models/metrics.json` and `evaluation/RESULTS.md`.
* **Why this, not a CNN/LSTM:** the dataset is ~250 clips of one signer; deep models would overfit, take longer to train, and are harder to explain. Classical models train in seconds on a laptop CPU, run on any ARM/x64 CPU without special wheels, and every step is explainable.
* **Why not MediaPipe landmarks:** Python MediaPipe/OpenCV have no Windows-ARM64 wheels on the Snapdragon laptop (as reported in the original README). Landmarks would generalise better — see Future work.

## Outputs
`signs` (empty when unknown), `confidence` = `predict_proba` of the top class (model score, **not** accuracy), `alternatives` (top-3), `timings`, `is_mock`.

Unknown handling: (1) no motion → error `NO_SIGN_DETECTED`; (2) top class is the background label `NONE` → `unknown_sign / NO_KNOWN_SIGN`; (3) top probability < `MIN_CONFIDENCE` → `unknown_sign / LOW_CONFIDENCE`. A closed-set classifier can still be confidently wrong on a sign it never saw; the NONE class and threshold reduce, not remove, this.

## Model bundle (`models/classifier.pkl`, joblib)
`{model, labels, model_name, feature_version, feature_config, trained_at, split_protocol, sklearn_version, test_accuracy, n_test}`. The service refuses a bundle whose `feature_version` differs from the code. Load only files you trained yourself (pickle can execute code).

## Text generation (grounded, no LLM)
1 sign → dictionary word · known sequence → exact `SAFE_TEMPLATES` entry (adds function words only) · otherwise `Recognized signs: A, B`. See `generation/text_generator.py` for the rules and how to add words.

## Future work (not implemented, say so honestly)
Hand-landmark features (e.g. MediaPipe Hand Landmarker in the browser via WASM, sending landmarks) for signer independence; temporal model (GRU/1D-CNN) with ≥ hundreds of clips per sign; continuous signing needs sign segmentation or CTC — a different project.

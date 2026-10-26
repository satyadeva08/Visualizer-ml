# VISUALISER — technical project report

## Abstract
VISUALISER is a browser-based prototype for converting isolated sign recordings into text with animated typography. The browser records a short video, a Go API validates and forwards it, and a Python service extracts motion and appearance features for a classical classifier. Text is constructed with deterministic mappings and templates. The implementation includes recording, dataset collection, training, evaluation and error handling. This submission snapshot contains no real ISL dataset or trained model; recognition quality has therefore not been established.

## Problem and objectives
The project explores a small, explainable sign-to-text workflow with expressive visual output. Its objectives are to record video reliably, provide a repeatable training pipeline, distinguish unavailable or uncertain recognition from accepted predictions, and present recognized content clearly. The intended experimental scope is a small vocabulary, one signer and a fixed camera. Continuous signing, general ISL translation and deployment as an accessibility aid are outside the demonstrated scope.

## System design
The React/TypeScript frontend handles camera permissions, recording, preview, retakes and results. Vite proxies API requests to the Go service on port 8080. Go validates uploads and forwards them to Flask on port 5000. The Python service decodes videos with FFmpeg, extracts features, applies a trained classifier and generates text. Both backend services bind to loopback by default. Phone camera access requires HTTPS; localhost development can use HTTP.

## Methodology
FFmpeg resamples video to 10 frames per second at 64 by 48 grayscale pixels, with a maximum decoded duration of ten seconds. Mean absolute frame differences estimate motion. Low-motion clips are rejected; active motion is trimmed and normalized to twelve frames. Temporal median subtraction suppresses a static background. Foreground and motion grids, centroid trajectories, foreground mass and duration form the feature vector. These are pixel-based features, not hand landmarks.

Training compares two logistic regression configurations, an RBF support-vector classifier and a random forest. Scaling occurs inside each scikit-learn pipeline. With at least three recording sessions, the lexicographically last session is held out for testing and the previous session for validation. Timestamp-based session identifiers preserve chronological order; manually assigned names must be chosen accordingly. Macro F1 selects the candidate; the selected model is refitted using training and validation data before test evaluation. Every split must contain every class. A two-session fallback uses cross-validation on the training session. A single-session fallback is explicitly labelled optimistic and is unsuitable as evidence of cross-session generalization.

## Dataset protocol
Record each chosen sign and an optional NONE background class in at least three separate sessions. Use consistent labels and camera framing, while varying recording time and lighting between sessions. Record at least 25 clips per label overall, distributed across sessions. Confirm sign meanings with an appropriate ISL reference or knowledgeable signer. Obtain consent for identifiable recordings. Retain a manifest of labels, session identifiers, counts and exclusions. No such recordings are included in the current snapshot.

## Prediction and text output
Missing models produce an explicit service-unavailable response. With a real model, low motion, a low model score or a NONE prediction can reject a clip. A classifier can still be confidently wrong on an unseen gesture, so these guards do not prove reliable open-set recognition. The displayed model score is not a calibrated probability of correctness. Text uses label mappings and fixed sequence templates; it is not LLM-generated translation. Framer Motion provides kinetic typography, including reduced-motion handling in the typography component.

## Validation and results
See SUBMISSION.md for software checks performed on this machine and EVALUATION.md for the real-data evaluation protocol. Synthetic moving-blob clips exercise decoding, collection, training and prediction; their classification scores are not ISL recognition results. Real-sign accuracy, precision, recall, F1, confusion matrix, unknown-sign rejection rates and latency remain unmeasured. The system must not be presented as a validated ISL recognizer until these experiments are completed.

## Limitations and future work
Appearance features are sensitive to background, illumination, clothing, framing and signer changes. No signer-independent evaluation, continuous sign segmentation, linguistic grammar model or GPU/NPU acceleration is demonstrated. Future work could investigate hand landmarks, more signers, temporal sequence models and calibrated rejection thresholds. These are proposals, not implemented results.

## Reproduction and accompanying material
Use setup.ps1 to create the Python environment and install locked frontend dependencies. Install FFmpeg or set FFMPEG_PATH. Start collection with start.bat collect, train using ml-service/.venv/Scripts/python.exe training/train.py from ml-service, and restart the ML service. Run verify.ps1 for software checks. DEVELOPMENT_SETUP.md provides phone testing instructions; API_CONTRACT.md and ML_CONTRACT.md describe interfaces; VIVA.md supports oral preparation. Add the institution's required cover page, author details and declaration before final hand-in.

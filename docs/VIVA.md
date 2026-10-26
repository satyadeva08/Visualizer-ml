# Viva preparation — VISUALISER

Answer in your own words. Items marked **[YOUR NUMBER]** come from your `evaluation/RESULTS.md` / `LATENCY.md`; never quote a number you did not measure.

## The project
**What problem does it solve?** It turns a short Indian Sign Language clip into text and shows the text with expressive animation — a demonstrator of sign recognition + accessible, engaging output. It is *not* a full interpreter.
**Why ISL?** It is the sign language of India; I chose it at the start and kept it. Public ISL resources are limited, which is why I recorded my own small vocabulary.
**Why recorded clips, not real time?** A clip gives the model the whole motion at once, is simpler to make reliable, and needs no WebSockets/streaming. Real time would need continuous segmentation of signs — a larger problem. The architecture could be extended (see "Real time?").
**Scope in one sentence:** isolated-sign, signer-dependent recognition of a small vocabulary with a fixed camera.

## Technology
**React + TypeScript + Vite + Tailwind** — component UI, type safety on the API shapes, fast dev server, utility CSS. Framer Motion for animation.
**MediaRecorder** — browser API that records a `MediaStream` (from `getUserMedia`) into chunks → a Blob (WebM on Chrome, MP4 on Safari). I detect supported MIME types with `MediaRecorder.isTypeSupported` instead of assuming one.
**Why HTTPS for the phone?** `getUserMedia` only works in secure contexts (HTTPS or localhost). Vite serves a self-signed certificate; the phone accepts the warning.
**Why Go?** Small, fast, safe HTTP server in the standard library: strict upload validation, timeouts, graceful errors. **Why Python?** The ML ecosystem (NumPy, scikit-learn). **Why a separate ML service?** Replaceable recogniser, language fit, and the ML never faces the network directly (Go validates first, Python listens on loopback only).
**How does the video reach the model?** Browser POST (multipart) → Vite proxy → Go (validate, temp file) → Python (`/predict`) → FFmpeg decodes to frames → features → classifier.

## ML
**Preprocessing:** FFmpeg → 10 fps, 64×48 gray frames; find the active motion segment; resample to 12 frames; subtract the median background so only moving hands/arms remain; pool to a 6×8 grid; add motion maps, centroid path, mass per frame and duration → 1140 numbers.
**Which model and why?** The best of logistic regression / SVM-RBF / random forest, picked on a validation session by macro-F1 **[YOUR NUMBER: which one]**. Small data → classical models are less likely to overfit than a CNN/LSTM, train in seconds, and run on any CPU (important on Windows-ARM where MediaPipe/OpenCV wheels were missing).
**Dataset / classes:** my own recordings, **[YOUR NUMBER]** signs + NONE, **[YOUR NUMBER]** clips per sign. Public ISL datasets (INCLUDE, CISLR …) were reviewed in `docs/DATASET.md`; INCLUDE is 56.8 GB with 7 signers and CC BY-NC-SA (non-commercial) — unrealistic for a one-week solo project.
**Train/test split:** by *recording session*, newest session = test, previous = validation. Clips from one sitting are near-duplicates, so a random split would leak and inflate accuracy (data leakage). The test set is used once.
**Accuracy** = correct predictions / all predictions **[YOUR NUMBER]**. **Precision** = of clips predicted as class X, how many really are X. **Recall** = of real X clips, how many were found. **F1** = harmonic mean of the two. **Macro** averages classes equally; **weighted** by class size. **Confusion matrix** = table of true vs predicted class; off-diagonal cells show which signs get mixed up.
**Confidence?** The classifier's `predict_proba` — the model's own score. It is not calibrated accuracy; I never present it as "% correct".
**Unknown sign?** Three guards: no motion → error; predicted class NONE → "no known sign"; top probability below `MIN_CONFIDENCE` → "not recognised". A closed-set classifier can still be confidently wrong on an unseen sign — I measured how often **[YOUR NUMBER from EVALUATION §2]**.
**Limitations:** one signer, fixed camera/background, tiny vocabulary, isolated signs only, pixel features sensitive to lighting/background changes, no hand-pose understanding, ISL grammar not modelled.

## Text and typography
**How is text generated?** Lookup + fixed templates: one sign → its word; a known sequence → an exact template that only adds function words ("I want water."); anything else → "Recognized signs: A, B". Nothing is guessed.
**Why not an LLM first?** Latency, dependency, and the risk of fluent but wrong sentences; with a tiny vocabulary a lookup is fully explainable. An LLM could be added later only with constrained/grounded prompts.
**Sentences from isolated signs?** Each clip gives one sign; "Add another sign" collects several and `/compose` applies the templates.
**Kinetic typography:** Framer Motion variants with staggered children: single word → letter-by-letter spring; sentence → words fade/scale in; words that came from recognised signs are bigger, brighter and float gently, template filler words stay small. `useReducedMotion` removes movement for users who prefer reduced motion.

## Performance, security, deployment
**Latency?** **[YOUR NUMBER from LATENCY.md]** on **[YOUR MACHINE]**; stages: upload, FFmpeg decode (usually the largest), features, inference.
**Security:** content-type allow-list **and** magic-byte check, 50 MB cap, random temp file names (client name ignored → no path traversal), temp files deleted, timeouts, CORS allow-list, Go/Python on loopback only, internal errors logged not returned, no secrets in code (env vars), mock results only when explicitly enabled and labelled.
**Can it be real time?** Possibly, with a sliding window, sign start/end detection and a faster feature path (landmarks in the browser, WebSocket or WebRTC); continuous signing needs sequence models (CTC / transformers) and far more data.
**Scale to continuous ISL?** Not with this approach: needs a large continuous corpus (iSign, ISL-CSLRT), segmentation or sequence-to-sequence models, and ISL grammar handling.
**Mobile / edge deployment?** Replace the pixel features with on-device landmarks (e.g. MediaPipe in the browser/WASM) and a small model exported to ONNX/TFLite; run it in the browser or on the phone, removing the upload.
**Snapdragon considerations:** I run everything on CPU and **claim no NPU/GPU acceleration**. The Snapdragon X laptop is Windows-ARM64: Python wheels for OpenCV/MediaPipe were unavailable, which is why decoding uses FFmpeg and the classifier uses scikit-learn. A future ONNX model could use ONNX Runtime's Qualcomm (QNN) execution provider — untested here.
**Future improvements:** landmark features, more signers/clips, temporal model, calibration of confidence, signer-independent evaluation, ISL grammar-aware text.

## Likely follow-ups
* *Why median background subtraction?* Static background cancels out; moving hands remain.
* *Why trim to the active segment?* Users start/stop at different times; the classifier needs aligned motion.
* *What if two signs look alike?* The confusion matrix shows it; record more clips or choose more distinct signs.
* *Why is test accuracy lower than validation?* Different session; that is the point of the split.
* *Why is the mock mode still in the code?* For UI development without a model; it must be switched on explicitly and the UI labels it MOCK / DEMO RESULT.

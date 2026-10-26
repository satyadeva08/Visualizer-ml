# VISUALISER

**Indian Sign Language (isolated signs) → text → generative kinetic typography.**
A web app: record a short ISL clip in the browser, a Python model recognises the sign, grounded templates produce text, and the result is shown with animated typography.

> **Honest status:** the whole pipeline is implemented and tested, but the recognition model is **trained on your own recordings** — none ships with this repository. Until you record data and run `training/train.py`, the app says *"No trained model yet"* and refuses to invent a result. See `docs/DEVELOPMENT_SETUP.md`.

## Scope and limits
Isolated-sign recognition · small vocabulary · **signer-dependent** · fixed camera · CPU only (no GPU/NPU/Snapdragon acceleration claimed) · not continuous ISL translation.

## Architecture
```
Browser (React, HTTPS) → Vite proxy → Go :8080 → Python/Flask :5000 → FFmpeg → features → classifier → text
```
Details: `docs/ARCHITECTURE.md`. API: `docs/API_CONTRACT.md`. ML: `docs/ML_CONTRACT.md`.

## Features
Camera permission handling · live preview · MediaRecorder with MIME detection (WebM/MP4) · record/preview/retake/submit · processing screen · result with model score and real timings · honest "sign not recognised" / "no movement" outcomes · sentence building from several signs · kinetic typography with reduced-motion support · built-in tool to record your own training clips · session-held-out evaluation with accuracy, precision/recall/F1 and confusion matrix.

## Tech stack
React 18 · TypeScript · Vite · Tailwind · Framer Motion · Go (`net/http`) · Python 3.14 (verified on Windows ARM64) · Flask · NumPy · scikit-learn · FFmpeg.

## Submission package

Read [SUBMISSION.md](docs/SUBMISSION.md) for the remaining academic requirements and verified software status. The technical report is [PROJECT_REPORT.md](docs/PROJECT_REPORT.md). Run `powershell -ExecutionPolicy Bypass -File verify.ps1` to verify the software and `py -3 scripts/package_submission.py` to create a clean source ZIP. No real-sign accuracy is claimed until a recorded dataset has been evaluated.

## Quick start (Windows)
```powershell
winget install Gyan.FFmpeg                       # reopen terminal afterwards
cd ml-service ; py -3 -m venv .venv ; .venv\Scripts\python.exe -m pip install -r requirements-dev.txt
cd ..\web ; npm ci ; cd ..
.\start.bat collect                                # opens ML service, Go backend, frontend (+ collect tool)
```
Open http://localhost:5173 → **Collect training clips** → record → `cd ml-service ; .venv\Scripts\python.exe training\train.py` → restart ML service → **Start Signing**.
Phone testing (HTTPS), full manual test list, troubleshooting: `docs/DEVELOPMENT_SETUP.md`.

## Repository layout
```
web/           React app (src/components, hooks, api, tests)
backend-go/    Go API (handlers/, models/, tests)
ml-service/    recognition/ generation/ service/ training/ evaluation/ tests/ models/ data/
docs/          ARCHITECTURE · API_CONTRACT · ML_CONTRACT · DATASET · EVALUATION · DEVELOPMENT_SETUP · INTEGRATION_PLAN · VIVA
start.bat · stop-all.ps1 · .env.example
```

## Tests
`pytest` (ml-service) · `go test ./...` (backend-go) · `npm test && npm run build` (web). See `docs/EVALUATION.md` for what they do and do not prove.

## Environment variables
All configuration is environment-based; see `.env.example` and `web/.env.example`. Local environment files are excluded from the source package.

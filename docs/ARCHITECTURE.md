# Architecture

```
Phone / laptop browser ──HTTPS──► Vite dev server (React app)  :5173
                                      │  /api/*  (proxy, same origin for the browser)
                                      ▼
                                  Go backend    127.0.0.1:8080   validate • temp file • timeout • relay
                                      │  multipart over loopback
                                      ▼
                                  Python/Flask  127.0.0.1:5000   FFmpeg → features → classifier → text
```
Only the Vite port is reachable from the phone. Go and Python bind to loopback.

## Components
| Component | Folder | Responsibility |
|---|---|---|
| React UI | `web/` | Camera (`getUserMedia`), recording (`MediaRecorder`, MIME auto-detect), upload, result + kinetic typography, sentence building, data-collection page |
| Go API | `backend-go/` | Routing, content-type + size + magic-byte validation, safe temp files (random name, client name ignored), timeouts, CORS allow-list, error mapping (internal errors never leaked) |
| ML service | `ml-service/` | `recognition/` (decode, features, pipeline), `generation/` (text), `service/` (HTTP), `training/` (train.py), `evaluation/` |

## Data flow for one request
1. Browser records a clip (WebM or MP4) and POSTs it to `/api/v1/recognize`.
2. Go validates, writes a temp file, forwards it to Python `/predict`, deletes the file.
3. Python decodes with FFmpeg, extracts features, predicts, builds text, deletes its temp file.
4. Go returns JSON; React shows kinetic typography (or an honest "not recognised").
5. "Add another sign" repeats 1–4; `POST /compose` turns the labels into a sentence via safe templates.

## Key decisions (and why)
* **Synchronous API, no job queue** — ~1 s latency; fewer parts, easier debugging.
* **Go + Python** — Go is a small, safe edge (validation/timeouts); Python hosts the ML. Keeping ML in a separate process lets the recogniser be replaced without touching the API.
* **FFmpeg via subprocess, classical ML** — works on Windows-ARM where OpenCV/MediaPipe wheels don't exist.
* **No auth/database** — not needed for the assessed flow.
* **Clips are deleted** after analysis (only the dev-only Collect tool stores clips, into `ml-service/data/`).
* **Mock only when explicit** (`ALLOW_MOCK=1`) and always labelled; the frontend no longer fabricates a result when the backend is down.

# Development setup, data collection, training, phone testing

Windows ARM64 setup and software checks are recorded in SUBMISSION.md. Real camera/phone behavior and recognition accuracy still require your own recordings and manual checks.

## 1. One-time install (Windows, PowerShell)
```powershell
winget install Gyan.FFmpeg          # then CLOSE and reopen the terminal
ffmpeg -version                     # must print a version
go version ; node --version ; py -3 --version

cd ml-service
py -3 -m venv .venv               # skip if venv already works
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
cd ..\web
npm ci                         # postinstall is safe on every platform
```
The dependencies installed successfully with Python 3.14 ARM64 on the verification machine. Recreate environments after moving the project; virtual environments contain absolute paths.

## 2. Run everything
`start.bat` (opens 3 windows) or manually:
```powershell
# 1 ML service
cd ml-service ; .venv\Scripts\python.exe -m flask --app service/app.py run --host 127.0.0.1 --port 5000
# 2 Go backend
cd backend-go ; go run .
# 3 Frontend
cd web ; npm run dev
```
Open `http://localhost:5173`. The home page shows one status line (model ready / no model / services down) taken from `/api/v1/health`.

## 3. Record your dataset (≈ 1 hour)
```powershell
.\start.bat collect            # or set ENABLE_COLLECT=1 for BOTH ml-service and backend-go
```
Open the site → **Collect training clips**. For each sign: type the label (e.g. `HELLO`), press Record (3-2-1 countdown, then sign), review, Save.
Rules: 8–10 distinct signs + `NONE`; ≥ 25 clips per label; **≥ 3 sessions** (change the Session box or reload the page at a different time/lighting); same camera spot and background as the demo. Details: `docs/DATASET.md`.

## 4. Train and evaluate
```powershell
cd ml-service
.venv\Scripts\python.exe training\train.py
```
Produces `models/classifier.pkl`, `models/metrics.json` and **`evaluation/RESULTS.md`** (accuracy, macro/weighted precision-recall-F1, confusion matrix, failure cases, motion statistics) — real numbers from your data. If it warns "single session", record more sessions; the number is optimistic.
Restart the ML service; the home page should say `Model ready · N signs`.
If idle clips are wrongly accepted or real signs wrongly rejected as "no movement", set `MIN_MOTION` using the motion table in `RESULTS.md`.

## 5. Phone testing over Wi-Fi (HTTPS)
Why: browsers expose the camera only on **https://** pages (or `http://localhost`). A plain `http://192.168.x.x:5173` page has no `navigator.mediaDevices`, so the app shows an HTTPS hint.

1. Create `web/.env.local`:
   ```
   VITE_HOST=true
   VITE_HTTPS=true
   ```
   (Vite then listens on all interfaces and serves HTTPS with an auto-generated self-signed certificate via `@vitejs/plugin-basic-ssl`.)
2. `npm run dev` → note the `Network: https://192.168.x.x:5173/` URL (find the IP with `ipconfig` if needed). Use the **IP**, not a hostname (Vite blocks unknown host names by default).
3. Phone on the **same Wi-Fi**, open that URL. The browser warns "not private" because the certificate is self-signed → Advanced → proceed. Then allow the camera when asked.
4. Windows Firewall: allow inbound TCP **5173** for Node (Windows usually asks the first time; choose *Private networks*). Do **not** open 8080 or 5000 — the phone never needs them.
5. Guest/campus Wi-Fi often blocks device-to-device traffic ("client isolation"). Use a phone hotspot or home Wi-Fi if the page does not load.
6. Optional trusted certificate instead of the warning: install `mkcert`, run `mkcert -install` and `mkcert <laptop-ip>`, install the root CA on the phone, and point Vite's `server.https` to the generated files. The self-signed route above is enough for the demo.

Go and Python stay on `127.0.0.1`; Vite proxies `/api` to Go, so no IP address is hard-coded anywhere.
⚠ iOS Safari records MP4 (`video/mp4`), Chrome/Android records WebM. Both are accepted; test your actual phone.

## 6. Manual end-to-end test (do this on your phone)
1. `start.bat`; home page says **Model ready · N signs** (if it says no model → section 3–4).
2. Phone: open the HTTPS URL, accept the warning, press **Start Signing**, allow camera. Preview visible.
3. Record a sign you trained, **Stop**, review playback, **Submit**. "Analyzing your sign…" appears.
4. Result page: sign label + score, text animates word by word, recognition time shown.
5. Press **Add another sign**, record a second sign → a sentence appears (template or "Recognized signs: …").
6. Record with hands out of frame / no movement → clear "no movement" error, **no sign invented**.
7. Record a sign not in the vocabulary → either "Sign not recognised" or a wrong guess — **write down which**; that goes into the limitations section.
8. Stop the Python service, submit → "recognition service is not running" error (no fake result). Restart it.
9. Deny camera permission in the browser settings → clear permission message.
10. `Try again` returns to the camera.

## 7. Automated tests
```powershell
cd ml-service ; .venv\Scripts\python.exe -m pytest        # synthetic clips verify plumbing only
cd backend-go ; go test ./...                            # upload validation, timeouts, relay, CORS …
cd web ; npm test ; npm run build                        # frontend tests, type-check + production build
```

## 8. Measure latency on YOUR machine
With services running and a real recorded clip (e.g. one saved in `ml-service/data/HELLO/`):
```powershell
cd ml-service ; .venv\Scripts\python.exe evaluation\measure_latency.py data\HELLO\HELLO_<session>_001.webm -n 20
```
Writes `evaluation/LATENCY.md` — copy the table into `docs/EVALUATION.md`.

## 9. Troubleshooting — what to send me
* `FFMPEG_MISSING` → install FFmpeg, reopen terminal. * `MODEL_NOT_TRAINED` → section 3–4. * Page loads but camera message mentions HTTPS → use the `https://` URL.
* Anything else: the 3 service windows' last 30 lines, `curl http://localhost:8080/api/v1/health`, and the browser console error.

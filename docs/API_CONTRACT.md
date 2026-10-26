# API contract (browser ⇄ Go)

Base path `/api/v1`. The browser only talks to the Vite origin; Vite proxies `/api` to Go (`127.0.0.1:8080`); Go talks to Python (`127.0.0.1:5000`).
The API is **synchronous** (one request → one answer, ~1 s for a short clip). No job queue was built because it would add moving parts without a benefit at this latency; `GET /jobs/{id}` therefore does not exist.

## Error shape (all endpoints)
```json
{ "error": "human readable, safe to show", "code": "STABLE_MACHINE_CODE" }
```

| HTTP | code | Meaning |
|---|---|---|
| 400 | INVALID_REQUEST, EMPTY_FILE, INVALID_LABEL, INVALID_SESSION | Bad form / empty file / bad collect fields |
| 404 | – | Collect endpoints when `ENABLE_COLLECT` is not 1 |
| 413 | FILE_TOO_LARGE | Video larger than `MAX_UPLOAD_MB` (default 50) |
| 415 | UNSUPPORTED_FORMAT | MIME not in {webm, mp4, quicktime, matroska, ogg} **or** content is not a video container |
| 422 | NO_SIGN_DETECTED, CLIP_TOO_SHORT, INVALID_VIDEO, DECODE_TIMEOUT | Relayed from Python: the clip is unusable |
| 502 | ML_ERROR | Python failed internally (details are logged, not returned) |
| 503 | ML_UNREACHABLE, MODEL_NOT_TRAINED, FFMPEG_MISSING | Python down / no trained model / FFmpeg missing |
| 504 | ML_TIMEOUT | Python did not answer within `ML_TIMEOUT_SECONDS` (default 60) |

## `GET /api/v1/health`
`200` when Go and Python are reachable, `503` ("degraded") when Python is not.
```json
{ "status": "ok", "backend": "ok",
  "ml_service": { "status": "ok",
    "model": { "mode": "real", "loaded": true, "labels": ["HELLO","YES"], "n_classes": 3,
               "model_name": "LogisticRegression(C=1)", "trained_at": "…", "split_protocol": "…", "min_confidence": 0.5 } },
  "collect_enabled": false, "timestamp": "2026-10-24T06:21:05Z" }
```
`model.mode`: `real` | `mock` (explicit `ALLOW_MOCK=1`, fake results) | `unavailable` (no model).

## `POST /api/v1/recognize`
`multipart/form-data`, field **`video`** (webm / mp4 / quicktime …, ≤ 50 MB, recommended ≤ 10 s). The client file name is ignored.

`200`:
```json
{ "job_id": "job-…", "status": "completed",
  "result": {
    "signs": [ { "label": "HELLO", "confidence": 0.93 } ],
    "text": "Hello", "text_method": "single_sign", "emphasis": ["hello"],
    "outcome": "recognized", "reason": null,
    "alternatives": [ { "label": "HELLO", "confidence": 0.93 }, { "label": "YES", "confidence": 0.04 } ],
    "timings": { "decode_ms": 0, "features_ms": 0, "inference_ms": 0 },
    "processing_time_ms": 0, "backend_total_ms": 0, "is_mock": false } }
```
(The numbers above are placeholders, not measurements.)

* `outcome` = `recognized` | `unknown_sign`. When `unknown_sign`: `signs` is `[]`, `text` is `""`, `reason` is `LOW_CONFIDENCE` or `NO_KNOWN_SIGN`.
* `confidence` is the classifier's probability — **a model score, not accuracy** (may be `null`).
* `is_mock` is `true` only in explicit mock mode; the UI must then show **MOCK / DEMO RESULT**.
* `text_method`: `single_sign` | `template` | `fallback_list` | `none`. `emphasis`: lower-case words that come from recognised signs.

## `POST /api/v1/compose`
Body `{"labels": ["I","WANT","WATER"]}` (1–12 labels, `[A-Za-z][A-Za-z0-9_ ]{0,39}`) → `{"text":"I want water.","text_method":"template","emphasis":["water"]}`.

## Development only (`ENABLE_COLLECT=1` on **both** Go and Python)
* `POST /api/v1/collect` — `multipart`: `video`, `label` (`[A-Z][A-Z0-9_]{0,31}`), `session` (`[a-z0-9]{1,16}`) → `{"saved":true,"label":…,"session":…,"count_for_label":n,"motion_peak":x}`. An idle clip is refused (422) unless label is `NONE`.
* `GET /api/v1/collect/stats` → `{"counts":{"HELLO":25,…}}`.

## Limits and timeouts
Upload ≤ 50 MB · Go→Python timeout 60 s · Go server read timeout 2 min (slow Wi-Fi) · browser request timeout 60 s · recording auto-stops at 10 s · FFmpeg decode timeout 30 s.

## Python service (internal, loopback only)
`GET /health`, `POST /predict` (same `result` object plus errors above), `POST /generate` (`{"labels":[…]}`), and `/collect`, `/collect/stats` when enabled.

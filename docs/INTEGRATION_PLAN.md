# Milestones and honest status (24 Oct 2026)

| # | Milestone | Status |
|---|---|---|
| 1 | Frontend camera MVP (home, camera, record, preview, submit, result, retake, MIME detection, error states) | ✅ done; automated tests for recorder states + API errors. ⚠ camera behaviour not tested on a real device by me |
| 2 | Go backend (health, recognize, compose, validation, timeouts, CORS allow-list) | ✅ done, `go test` passes. Synchronous by design |
| 3 | Python ML service (/predict, /generate, error handling, FFmpeg decode) | ✅ done, 23 tests |
| 4 | ISL dataset research | ✅ `docs/DATASET.md` (sources cited; licences to verify) |
| 5 | Recognition model | ⏳ **code ready; model NOT trained** — needs your recordings |
| 6 | Training / evaluation | ⏳ `training/train.py` ready (session-held-out split, full metrics); **no real results yet** |
| 7 | Sign → text | ✅ grounded templates, tested; sentence building via /compose |
| 8 | Kinetic typography | ✅ word/letter reveal, emphasis words, reduced-motion support |
| 9 | Integration | ✅ pipeline verified end-to-end in a sandbox with synthetic clips; ⚠ real phone + real signs pending |
| – | VIVA.md | ✅ (fill your numbers) |

## Your remaining plan
| Day | Do |
|---|---|
| 24 Oct (today) | Install FFmpeg; run tests; `start.bat`; open site on laptop; verify home status line |
| 25 Oct | Choose 8–10 signs + NONE; record session 1 (≈8 clips/sign); start HTTPS phone test |
| 26 Oct | Record sessions 2 and 3 (different time/lighting); train; read RESULTS.md |
| 27 Oct | If weak: more clips, fewer/more distinct signs, tune `MIN_CONFIDENCE`/`MIN_MOTION` |
| 28 Oct | Manual E2E test list (DEVELOPMENT_SETUP §6), latency script, fill EVALUATION.md |
| 29 Oct | Fix bugs only, rehearse, record a backup demo video |
| 30 Oct | Critical fixes only |

**Fallback if accuracy is poor:** fewer signs (5–6 very different ones), a plain background, fixed distance, more clips. A small measured model is the goal.

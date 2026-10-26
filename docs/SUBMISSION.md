# Submission checklist — VISUALISER

Prepared 26 October 2026. Status: source implementation prepared; real-sign experimental submission remains incomplete.

## Included
- Frontend, Go API, Python recognition service, collection and training code.
- Setup and verification scripts, dependency lockfile, API and architecture documentation.
- Technical report (PROJECT_REPORT.md), viva guide and evaluation protocol.
- Source ZIP generator: `py -3 scripts/package_submission.py`.

## Verified software
- Windows ARM64, Python 3.14 and Go 1.27.
- Go: `go test ./...` passed.
- Frontend: 19 tests passed; TypeScript and Vite production build passed after dependency updates.
- npm audit: zero reported vulnerabilities after updates (including development dependencies).
- Python: 28 tests passed, including FFmpeg decoding, synthetic collect/train/predict and regression tests (365.46 seconds). No tests skipped. These tests do not establish real-sign accuracy.

## Required before claiming a completed ML experiment
- Record real, correctly labelled signs in at least three sessions, with every label in each session.
- Train the classifier and retain classifier.pkl, metrics.json and evaluation/RESULTS.md.
- Fill EVALUATION.md using actual held-out results, unknown-sign trials and measured latency.
- Verify the camera workflow on the intended laptop/phone; capture screenshots from the real run.
- Add student name, register number, institution, supervisor and any required report format.
- Confirm the submission rubric; none was supplied with this workspace.

## Demonstration sequence
1. Start with `start.bat collect` for recording or `start.bat` for evaluation.
2. Show the health status. Without a model, explain that recognition is unavailable.
3. With a trained model, record a known sign, preview and submit; explain its model score.
4. Add a second sign to demonstrate template-based sentence construction.
5. Show an idle clip rejection and discuss unknown-sign failure cases.
6. Show the actual held-out metrics and limitations.

## Packaging
Run `py -3 scripts/package_submission.py`. The resulting submission/VISUALISER-source.zip excludes virtual environments, node_modules, caches, local environment files, private recordings and trained pickle files. SHA256SUMS.txt records its checksum. This source ZIP is not a substitute for the required trained model and experiment evidence; attach those separately when available and permitted. Do not submit synthetic test accuracy as recognition accuracy.

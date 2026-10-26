# Evaluation (fill in from your own runs — nothing here is invented)

Every number must come from `evaluation/RESULTS.md` (written by `training/train.py`) or `evaluation/LATENCY.md` (written by `measure_latency.py`). Cells marked **TO FILL** are intentionally empty: no model has been trained on real ISL recordings yet in this repository snapshot.

## 1. Recognition quality
| Item | Value |
|---|---|
| Vocabulary (labels) | TO FILL |
| Clips per label / sessions | TO FILL |
| Split protocol | TO FILL (e.g. "session-held-out (test=…, val=…)") |
| Train / val / test clips | TO FILL |
| Selected model | TO FILL |
| Test accuracy | TO FILL |
| Macro precision / recall / F1 | TO FILL |
| Weighted precision / recall / F1 | TO FILL |
| Confusion matrix + worst confusions | paste from RESULTS.md |
| Failure cases | paste from RESULTS.md |

Interpretation to write: the test set is a **later session of the same signer**, so this measures robustness to a new sitting, **not** to new signers. State that explicitly.

## 2. Open-set behaviour (do this by hand, ~20 attempts, record counts)
| Situation | Attempts | Correctly rejected | Wrongly named a sign |
|---|---|---|---|
| No movement | TO FILL | TO FILL | TO FILL |
| Random gesture | TO FILL | TO FILL | TO FILL |
| Sign outside vocabulary | TO FILL | TO FILL | TO FILL |

## 3. Performance (machine: TO FILL — CPU model, OS, RAM)
Run `evaluation/measure_latency.py` (see DEVELOPMENT_SETUP §8) and paste the table. Also note: clip length, clip size, phone upload over Wi-Fi vs. localhost (the script measures from the machine it runs on).
Memory: optionally read the ML service's working set in Task Manager during a request — report it as an observation, not a benchmark.

## 4. Acceleration
CPU only. No GPU/NPU/Snapdragon acceleration was implemented or tested, so none is claimed.

## 5. Software verification
See [SUBMISSION.md](SUBMISSION.md) for the current machine's verified test results. Synthetic moving-blob videos test decoding, collection, training and prediction only. Their accuracy is not an ISL recognition result. Run `verify.ps1` from the repository root to repeat the software checks.

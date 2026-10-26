# Dataset research and decision

> Facts below come from the sources in the "Source" column, found by web search on 24 Oct 2026.
> Anything marked **verify** must be checked on the dataset's own page before you quote it.
> I did **not** download any of these datasets.

## Candidate ISL datasets

| Dataset | Source | Classes / samples | Format | Licence / access | Fit for a 1-week solo MVP |
|---|---|---|---|---|---|
| **INCLUDE** (IIT Madras / AI4Bharat, ACM MM 2020) | Zenodo record 4010759; doi 10.1145/3394171.3413528 | 263 word signs, 4,292 videos (paper: 4,287), 15 categories; INCLUDE-50 subset = 766 train / 192 test videos; 7 signers; 1920×1080 RGB | Videos in many zip parts, **56.8 GB total** | A derived dataset's page states INCLUDE is **CC BY-NC-SA 4.0 (non-commercial)** — **verify** on Zenodo. Redistribution only under the same licence | **No** for this deadline: huge download, 7 signers, 1080p. Best future benchmark |
| INCLUDE-derived landmark tensors ("Silent Voice", IEEE DataPort, doi 10.21227/vfyn-1246) | IEEE DataPort | 261 words, 4,276 MediaPipe landmark sequences | Pre-extracted landmarks | Same CC BY-NC-SA 4.0 (stated on its page); access rules **verify** | Possible, but needs a landmark pipeline we cannot run in Python on Windows-ARM |
| CISLR (IIT Kanpur, EMNLP 2022) | aclanthology 2022.emnlp-main.707 | 4,765 words, 7,050 videos, 71 signers (~1.5 videos/word) | Videos | "Agreement needed" per a dataset survey — **verify** | No: too few clips per word |
| ISL-CSLRT | cited in the iSign paper | 186 sentences, ~700 videos, 7 signers | Videos | **verify** | Continuous sentences, not isolated signs |
| iSign (IIT Kanpur, 2024) | exploration-lab.github.io/iSign | Large video–sentence set | Videos + text | **verify** | Sentence translation benchmark, out of scope |
| Common phrases in ISL (Mendeley, doi 10.17632/y8vg69brn2.1) | data.mendeley.com | 40 signs × 30 images | **Static images** (NumPy) | **verify** | No: no motion, our input is video |
| Nandy 2010 / Kishore 2012 lab sets | dataset survey (arXiv 2606.19352) | 22 classes/600 samples; 80 classes/1,600 videos | Lab video | No public download found | No |

## Decision: record our own small dataset

Chosen: **self-recorded isolated signs, recorded through the app itself** (the "Collect training clips" page).

Why:
1. No public ISL set is small, clearly licensed for this use *and* recorded through the same camera path as the demo.
2. Recording through the app means identical browser, codec, framing and resolution at training and demo time.
3. We own the data, so there is no redistribution problem. (Do not publish clips of other people without consent.)
4. 8–10 signs × ≥25 clips takes about an hour and gives a real, measurable, signer-dependent model.

**Scope consequence (say this in the viva):** *isolated-sign recognition, signer-dependent, fixed camera, small vocabulary.* It is **not** continuous ISL translation and **not** signer-independent.

### Choosing your vocabulary
- 8–10 signs that look **visibly different** (different motion/position). Similar pairs will be confused.
- Take the movements from an official ISL source (ISLRTC dictionary), ideally checked by someone who knows ISL.
- Add the background class **NONE** (idle, random gestures) so the model can answer "no known sign".
- Add each label to `LEXICON` in `generation/text_generator.py` (otherwise the label is title-cased as-is).

### Recording protocol (what keeps the evaluation honest)
- At least **3 separate sessions** (different time or lighting). The newest session becomes the test set, the one before it validation.
- At least 25 clips per sign overall (~8 per session), same camera position and background as the demo, hands fully visible, start with hands down.
- Do not delete "bad takes" selectively from the test session — natural variation belongs in the test.

### Upgrade path
`training/train.py` reads `data/<LABEL>/*.{webm,mp4,mov}`. INCLUDE videos placed in that layout can be used, but the current pixel-motion features will not generalise across its 7 signers; that needs hand landmarks (see ML_CONTRACT, "Future work").

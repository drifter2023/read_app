# Predicted words — implementation plan

**Goal:** Words the reader probably does not know get their Chinese footnote before they are tapped. The prediction learns from the reader's lookups, undos, reading and a one-minute calibration test. Everything runs on the device; nothing goes online.

**Decided with the owner (2026-09-30):**
- Cold start: assume a CET-6 reader until evidence arrives; a one-minute calibration test on Home refines it.
- Predicted footnotes look exactly like looked-up ones.
- Settings: 预测生词 关 / 少 / 多, default 少.
- First version: several difficulty signals, a difficulty − ability model, exposure only from text read in the focus band, repeated exposure, hit/miss metrics.

## Model

**Word difficulty `d(w)`** (logit units; 0 ≈ the 50 % point of a CET-6 reader), from dict.db's new `level` table (ECDICT):

| Signal | Term |
|---|---|
| Frequency rank r = min(nonzero bnc, frq), missing → 60 000 | 0.72 · (ln r − ln 6000) |
| Easiest exam list the word is on (zk, gk, cet4, cet6, ky, toefl/ielts, gre, none) | −2.5, −1.8, −1.0, −0.3, 0, +0.3, +0.6, +0.6 |
| Oxford 3000 | −0.4 |
| Collins stars c | c > 0: −0.15 · (c − 2); none: +0.1 |
| Length | +0.04 · (letters − 7) |
| Word family: a derived word is at most a little harder than its base (hopeful ← hope) | d = min(d, d(base) + 1.0) |

**Reader ability θ:** P(unknown | w) = σ(d(w) − θ). θ is the MAP estimate under the prior N(0, 1) from weighted evidence:

| Evidence | y | Weight |
|---|---|---|
| Looked up (any book) | unknown | 1 |
| 撤回 in the word drawer | known | 2 |
| Calibration: 认识 | known | 1 − false-alarm rate on pseudowords |
| Calibration: 不认识 | unknown | 1 |
| Read in the focus band without a tap, n times | known | min(0.15 · n, 0.6) |

**Prediction:** a lemma in the open book is predicted when P ≥ 0.7 (少) or P ≥ 0.4 (多), it has not been looked up, it is not known (撤回, calibration 认识, or read ≥ 3 times without a tap), and the book uses it mostly as a common word (a capitalised form mid-sentence more often than a lower-case one means a name, such as Nick).

**Exposure:** at each scroll pause the reader remembers the sharp lines in the band. When the band moves on, those lines count as read if the band stayed at least 0.15 s per word (400 wpm). Each line counts once per session. Counts are flushed to user.db in batches.

## Data

- dict.db: `level (word PK, rank, tier, collins, oxford)`.
- user.db migration v6: `vocab (lemma PK, state 'known' | 'unknown' | NULL, source 'undo' | 'test' | NULL, weight, exposures, at)`. Settings key `vocab.calibrated`.
- A new lookup clears a `known` state (the reader tapped it on purpose).

## Modules

| File | Responsibility |
|---|---|
| `src/core/vocab/difficulty.ts` | Features → d, word family. |
| `src/core/vocab/ability.ts` | Evidence → θ (Newton on the log posterior); P(unknown). |
| `src/core/vocab/store.ts` | user.db evidence: read all, mark known/unknown, add exposures. |
| `src/core/vocab/predict.ts` | Scan a book once (sliced) → lemma stats; θ + level → predicted lemmas. |
| `src/core/vocab/calibrate.ts` | Pick 24 words across difficulty and 6 pseudowords; score answers. |
| `src/views/useWordLookup.tsx` | Footnotes for seen ∪ predicted; undo marks known; lookup clears known; metrics. |
| `src/views/useExposure.ts` | Band dwell → exposures. |
| `src/views/home/VocabCard.tsx`, `src/views/Calibration.tsx` | Home entry and the test. |
| `src/views/reader/SettingsSheet.tsx` | 预测生词 关 / 少 / 多. |

## Acceptance IDs

| ID | Check |
|---|---|
| **P-01** | Difficulty orders sanity words: the, hope, gesture ≪ vulnerable < gorgeous < levity; hopeful is no harder than hope + 1. |
| **P-02** | θ moves up with known evidence and down with lookups; with no evidence it is the prior (CET-6). |
| **P-03** | Predicted words get the same footnote as looked-up ones; line positions do not move. |
| **P-04** | 撤回 marks a word known: it is never predicted again; a later lookup clears that. |
| **P-05** | 关 / 少 / 多 change the predicted set live (关 shows none; 多 ⊇ 少). |
| **P-06** | Calibration: 30 items with 6 pseudowords; answers move θ; claiming pseudowords discounts 认识. |
| **P-07** | Metrics: lookups record whether the word was predicted; undo of predicted words; the summary shows misses and false alarms per 1k words. |
| **P-08** | The book scan never blocks a frame (sliced); reader scroll stays within the R-01 budget. |

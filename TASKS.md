# Tasks — in order

Status (2026-09-26): tasks 1–23, M5 (25–29) and M6 (30–35) are built; M6 still needs a real-key run to tune temperature, each with a test for its acceptance ID (see `DEVELOPING.md` → Tests and `docs/plans/2026-09-26-m2-m4-notes.md`). Task 24 needs real devices and the Apple Developer account.

Each task lists its acceptance ID from `design/MVP 设计与范围 · 聚焦阅读.dc.html` Part A (A3).

## M1 · Reader core
1. Scaffold: Vite + React + TS strict, Capacitor iOS + mobile web build (no Android), locally bundled fonts, SQLite plugin with `user.db` migrations.
2. Bundled sample book loaded into `Chapter` rows; the reader renders paragraphs with the exact 4a type (19.5 / 34, padding 45% 34px).
3. Line table: measure visual lines with a Range once per layout; rebuild on font size or viewport change. Virtualise to current chapter ± 1.
4. Focus band engine: passive scroll → rAF → lines within ±1 viewport → t formula → 0.5px blur quantisation → diff-write filter and opacity. **R-01**
5. Performance probe on first launch; set `Settings.tier`; fallback mode (two static backdrop layers + per-line opacity). **R-01**
6. Chapter eyebrow with live percentage; top and bottom fade masks.
7. Position save (first sentence in band, 1s debounce) and restore. **R-07**

## M2 · Lookup
8. `scripts/build-dict`: ECDICT → trimmed `dict.db` with `entry` and `forms` tables.
9. Hit test with caretRangeFromPoint → word + sentence; lemma resolution (forms table → rules → surface).
10. Dict service: LRU → dict.db; ≤ 100ms tap-to-open. **R-04**
11. WordDrawer: grid-rows animation, leather surface, notches, states loading / ready / not-found / closing, keep-on-screen scroll, all close rules, close-then-open. **R-05**
12. Lookup table write + `seen` set; 9px footnotes on mounted paragraphs; zero line-height change (write a test comparing line y positions). **R-06**
13. Save button → `Lookup.saved = true`, with a saved state. **R-09**
14. One light haptic on drawer open.

## M3 · Home, shelf, import
15. HomeView: date eyebrow, continue reading block, shelf with in-progress / finished filter, empty state. **H-01 H-02**
16. Import: file picker → Worker parse (EPUB 2/3 OPF / spine, TXT paragraphs and chapters) → first chapter written first → background parse. Errors shown in plain language. **H-03**
17. Generated colour covers (hash(title) % 8).
18. Open-book flight transition 220 / 460 / 300 / 320ms, and the reverse on back. **H-04**
19. Reader chrome: top bar + bottom capsule (目录, Aa); tap arbitration.
20. SettingsSheet: font size, focus band, blur, sentence mode; live apply; keep the anchor on font change. **S-01**

## M4 · Polish and beta
21. Table of contents sheet. **R-10** (P1)
22. Swipe-to-delete a book, also deleting its Lookup rows. **H-05** (P1)
23. Local metrics log + export via the share sheet.
24. Low-end device pass (oldest supported iPhone + mobile Safari); beta builds (TestFlight + hosted web).

## M5 · Owner requests after the MVP
25. 撤回 in the word drawer: the book forgets the lemma (its Lookup rows, saved state and footnotes), then the drawer closes. **R-11**
26. Grammar droplet after every sentence end, shown only on lines in the focus band; tapping it opens a grammar drawer (same tear-paper drawer, same close rules). Notes are hand-written for the opening sentences of the three bundled books; other sentences show a “coming soon” line. **R-12**
27. Drawers open only from sharp text in the focus band; a tap on blurred text counts as blank space (toggles the chrome). **R-13**
28. Footnote redraws (a new word joins `seen`, a chapter attaches) run nearest-first in 5 ms slices, so the drawer's open animation never drops a frame. **R-01**
29. Night mode: a 纸白 / 夜读 capsule on Home; one theme for Home and the reader (`MVP 设计与范围` B2 colour table: 1c for the reader, 7b colours on the 7a Home layout), stored in Settings and applied before first paint. Small text stays ≥ 4.5:1. **S-02**
30. 聚焦模糊 switch in the reader settings (owner request, 2026-10-14): off makes every line sharp (no blur, full opacity, no fallback blur layers, shorter edge masks) and lets a tap on any line open its word drawer; grammar droplets and exposure still follow the focus band. 清晰带, 模糊强度 and 整句模式 grey out while it is off. Stored with the other settings. **S-03**

## M6 · DeepSeek grammar analysis (plan: `docs/plans/2026-09-29-deepseek-grammar.md`)
30. Prompt v1 and the incremental line parser. **G-06**
31. DeepSeek client (key check, streaming SSE, typed errors) and key storage. **G-01 G-05**
32. Grammar history table (migration v4): stored per sentence, invalidated by text or prompt version. **G-03**
33. Grammar service: history → key → stream; one run per sentence; timeouts; a closed drawer still saves. **G-02 G-03 G-05**
34. Home key card: enter, check, show, clear the DeepSeek API key. **G-01**
35. Streaming grammar drawer: dots until the first token, caret while streaming, errors with 重试, ≤ 300 px on a 375 px screen; the hand-written samples go. **G-02 G-04 G-05**
36. Answers follow the sentence (prompt v2: pattern ≤ 24 字, 2–5 points, each ≤ 60 字; max_tokens 700). Every drawer is capped at `min(320px, 45vh)` and scrolls inside, with a bottom fade while more is below; a streaming answer follows its newest line until the reader scrolls up. A tap or scroll inside the drawer keeps it open; outside still closes it. **G-04 G-06 R-05**
37. The sentence's translation on top of the grammar drawer (prompt v3 = version E of the prompt lab: natural, faithful translation; each point quotes the matching translation in 「」; migration v5 adds `grammar.translation`; max_tokens 900). **G-02 G-03 G-06**

## M7 · Predicted words (plan: `docs/plans/2026-09-30-predicted-words.md`)
38. dict.db `level` table (rank, exam tier, Collins, Oxford); difficulty with word families. **P-01**
39. user.db v6 `vocab` evidence; ability estimate; book scan and prediction. **P-02 P-04 P-08**
40. Reader: footnotes for looked-up ∪ predicted words; 撤回 marks known; exposure from the focus band; 预测生词 关 / 少 / 多 in settings. **P-03 P-04 P-05**
41. One-minute calibration test from Home. **P-06**
42. Metrics: predicted lookups, misses and false alarms. **P-07**

## M8 · Agent drawer (plan: `docs/plans/2026-10-03-agent-drawer.md`, design `Agent 抽屉 · 聚焦阅读 v3`)
43. Swipe left to push the page aside into a rounded card and reveal the drawer (parallax, dim, flick snap); swipe right, a tap on the page strip, or Esc closes. Written straight to the DOM, no React render per frame. **A-01**
44. Drawer: sentence picker (middle line selects, tap selects), chat, suggestions that leave once used, composer (IME-safe Enter), history dropdown with new / switch conversation. Night colours follow the theme. **A-02 A-03**
45. Migration v7 (`agent_session`, `agent_message`, deleted with the book); an exchange is stored only when its answer is complete. **A-02**
46. `AgentService`: DeepSeek streaming with earlier turns, only the chapter text up to the page (no spoilers), answer + 出处 line, timeouts, typed errors with 重试. **A-04 A-05**

## M9 · Link import (plan: `docs/plans/2026-10-12-link-import.md`)
43. Cloudflare Worker `POST /api/fetch`: same-origin, public http(s) only (every redirect hop), 15 s, 3 MB, HTML or text, per-IP rate limit, no logging; the same handler on the Vite dev and preview servers. **L-01**
44. Article extraction in the import Worker: charset, Readability on linkedom, blocks → paragraphs → sentences. **L-02**
45. Import sheet: 文件 / 链接; link → fetch → parse → save as format `web` → open; duplicates and errors. **L-03 L-04**

## M11 · Select-to-ask and settings entry (plan: `docs/plans/2026-10-14-select-to-ask.md`, handoff `docs/handoff/2026-10-14/`)
47. Only a tap in the title area (top of the page to 22 px below the eyebrow) shows or hides the top bar and capsule (‹ 书架 · 目录 · Aa), even on a word, even with 聚焦模糊 off; a tap elsewhere only hides them (owner decisions 2026-10-15; first the top 30 % opened the settings sheet); tap order selection → close sheet / drawer → menu → word → hide chrome; the top bar and capsule stay (owner decision); no scroll indicator; the sheet has a transparent scrim, 44 %, radius 18. **N-01**
48. Settings sheet: the MVP layout and red switches (owner restored it on 2026-10-15, after a C6 restyle with 聚焦模糊 first and cream switches); dependent rows at .4 and inert; the masks shrink to a thin strip. **N-02 S-03**
49. Engine selection: nearest word (same line first), overlay rectangles from the line table, selected lines sharp. **N-03**
50. Long-press 380 ms on sharp text selects a word; drag extends it; two handles; a tap clears it; no system menu or callout; the Agent swipe stands down while selecting. **N-04**
51. 问旁注 button: 56 px above the selection (20 px below when it is near the top), clamped to [72, W − 72]; hidden while dragging. **N-05**
52. Agent drawer attachment: quote card with ×, selection chips, 就这段文字提问; 当前句 and the attachment share one slot right above the input (never both; 当前句 picker 132 px, radius 16); closing the drawer drops the attachment; sent as 「所选文字」 and stored as the question's quote. **N-06**
53. iOS: no edit menu, loupe or callout on a long-press (Safari, home-screen web app, Capacitor). **N-07**

## M10 · Account sync and one-time book transfer — planned, not started (its task numbers 46–53 in the plan will be renumbered when it starts)
Plan: `docs/plans/2026-10-13-sync-and-transfer.md`; checklist: `docs/todo/sync-and-transfer.md`. Needs the owner's decisions (plan §11) and a scope edit to `CLAUDE.md` before any code. Acceptance IDs C-01 to C-11.

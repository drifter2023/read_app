# Tasks — in order

Status (2026-09-26): tasks 1–23, M5 (25–29) and M6 (30–35) are built; M6 still needs a real-key run to tune temperature, each with a test for its acceptance ID (see `DEVELOPING.md` → Tests and `docs/plans/2026-09-26-m2-m4-notes.md`). Task 24 needs real devices and the Apple Developer account.

Each task lists its acceptance ID from `design/MVP 方案 · 聚焦阅读.dc.html` §3.

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
29. Night mode: a 纸白 / 夜读 capsule on Home; one theme for Home and the reader (设计文档 v2 §2 colour table: 1c for the reader, 7b colours on the 7a Home layout), stored in Settings and applied before first paint. Small text stays ≥ 4.5:1. **S-02**

## M6 · DeepSeek grammar analysis (plan: `docs/plans/2026-09-29-deepseek-grammar.md`)
30. Prompt v1 and the incremental line parser. **G-06**
31. DeepSeek client (key check, streaming SSE, typed errors) and key storage. **G-01 G-05**
32. Grammar history table (migration v4): stored per sentence, invalidated by text or prompt version. **G-03**
33. Grammar service: history → key → stream; one run per sentence; timeouts; a closed drawer still saves. **G-02 G-03 G-05**
34. Home key card: enter, check, show, clear the DeepSeek API key. **G-01**
35. Streaming grammar drawer: dots until the first token, caret while streaming, errors with 重试, ≤ 300 px on a 375 px screen; the hand-written samples go. **G-02 G-04 G-05**

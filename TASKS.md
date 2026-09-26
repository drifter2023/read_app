# Tasks — in order

Status (2026-09-26): tasks 1–23 are built, each with a test for its acceptance ID (see `DEVELOPING.md` → Tests and `docs/plans/2026-09-26-m2-m4-notes.md`). Task 24 needs real devices and the Apple Developer account.

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

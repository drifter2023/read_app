# 聚焦阅读 MVP — rules for Claude Code

Read `README.md` (in the handoff folder) before any work. It is the implementation spec.

## Scope guard
- Build only: Home (continue reading + shelf + import), Reader 4a, word drawer, 9px footnotes, settings sheet, open-book transition.
- Added by the owner after the MVP (TASKS.md → M5): 撤回 (undo a mistaken lookup) in the word drawer; a grammar droplet after each sentence in the focus band that opens a grammar drawer, analysed by DeepSeek (TASKS.md → M6, `docs/plans/2026-09-29-deepseek-grammar.md`); since 2026-09-30 the grammar drawer shows the sentence's translation on top (owner request, prompt v3). Drawers open only from the sharp text in the focus band. A 纸白 / 夜读 theme capsule on Home switches the whole app (1c colours in the reader, 7b colours on Home; layout unchanged). Where these lines disagree with README's out-of-scope list (night mode, LLM), these lines win.
- Do NOT build:
  - tabs 书房 / 生词 / 我 or a tab bar;
  - today stats or streak;
  - review cards or spaced repetition;
  - auto guided reading;
  - pronunciation / TTS, or the Examples button;
  - any LLM or agent other than the DeepSeek grammar analysis; sync, push, accounts, analytics SDKs;
  - long-press sentence translation (the only sentence translation is the one on top of the grammar drawer).
- **Zero network requests at runtime**, with one exception: the grammar drawer calls `https://api.deepseek.com` after a tap on a droplet, with the user's own key. Fonts, dictionary and books are all bundled; lookups, footnotes and everything else stay offline.
- If a design doc and the README disagree, the README wins. If the README is silent, follow `设计文档 v2` §3 (Reader 4a) exactly.

## Identity
- App display name: **Spotlight**. Bundle ID: `com.lin.spotlight`.
- Phonetics: American IPA (ipa-dict `en_US`).

## Stack
- React + TypeScript (strict) + Vite.
- Targets: **iOS (Capacitor) and a mobile web app.** No Android — this overrides any mention of Android in the README or design docs.
- SQLite, two files: `user.db` (read/write) and a read-only `dict.db`. `user.db` uses the Capacitor plugin on iOS and sql.js + IndexedDB on the web. `dict.db` is read into sql.js on both, so lookups are synchronous (see `docs/plans/2026-09-26-m2-m4-notes.md`).
- Haptics are iOS-only; iOS Safari has no vibration API, so the web build skips them.
- EPUB and TXT parsing in a Web Worker (JSZip + linkedom, since `DOMParser` is not available in workers).

## Architecture rules
- Keep domain modules framework-free TS under `src/core/`:
  - `library`, `ingest`, `reader`, `dict`, `annot`, `prefs`, `grammar`, `ai`.
  - React views live under `src/views/` and only call module APIs.
- The reader engine owns the scroll container and writes line styles directly (`style.filter`, `style.opacity`). Never re-render body-text lines through React on scroll.
- Build the line table once per layout. Do not call `getBoundingClientRect` per line per frame.
- One easing curve for the whole app: `cubic-bezier(.42,0,.58,1)`.
- Footnotes are `position:absolute` children of the word span. Line height must never change.

## Quality bar
- Every task in `TASKS.md` cites an acceptance ID (R-xx / H-xx / S-xx). Write a test or a measurable check for it.
- Performance: 60fps reader scroll on a mid-range device. Tap-to-drawer ≤ 100ms. A 300-page book is readable within 3s of import.
- Minimum hit target 44px. Small text contrast ≥ 4.5:1.

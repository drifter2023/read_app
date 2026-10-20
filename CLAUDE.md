# 聚焦阅读 MVP — rules for Claude Code

Read `README.md` (in the handoff folder) before any work. It is the implementation spec.

## Scope guard
- Build only: Home (continue reading + shelf + import), Reader 4a, word drawer, 9px footnotes, settings sheet, open-book transition.
- Added by the owner after the MVP (TASKS.md → M5): 撤回 (undo a mistaken lookup) in the word drawer; a grammar droplet after each sentence in the focus band that opens a grammar drawer, analysed by DeepSeek (TASKS.md → M6, `docs/plans/2026-09-29-deepseek-grammar.md`); since 2026-09-30 the grammar drawer shows the sentence's translation on top (owner request, prompt v3). Drawers open only from sharp text (the focus band, or every line while 聚焦模糊 is off) below the title area. Predicted words (TASKS.md → M7, `docs/plans/2026-09-30-predicted-words.md`): words the reader probably does not know get their footnote in advance, learned on the device from lookups, 撤回, reading and a one-minute calibration test on Home. A 纸白 / 夜读 theme capsule on Home switches the whole app (1c colours in the reader, 7b colours on Home; layout unchanged); it is the only switch. 夜读 1c and 带读 auto guided reading (TASKS.md → M12, `docs/handoff/2026-10-20/NIGHT_MODE_1c.md`, decisions in `docs/plans/2026-10-20-night-guide.md`): at night the reader colours its sharp lines, and a 带读 bar (夜读 only; the one persistent control, it steps aside while the top bar and capsule are up) steps through sentences until any touch pauses it. A 聚焦模糊 switch in the reader settings turns the focus blur off (TASKS.md → 30): the whole page is sharp and any word below the title area opens its drawer. A tap in the title area at the top of the reader (down to just below the eyebrow) shows or hides the top bar (‹ 书架) and capsule (目录 · Aa), even on a word (TASKS.md → M11, `docs/plans/2026-10-14-select-to-ask.md`; owner decision 2026-10-15); since 2026-10-20 so does a tap on blank space or the page edge that opens nothing, while a tap on text (blurred or sharp) only hides them (owner request). The Agent drawer (TASKS.md → M8, `docs/plans/2026-10-03-agent-drawer.md`, design `Agent 抽屉 · 聚焦阅读 v3`): a left swipe pushes the page aside into a card and reveals a per-book chat with a reading companion (“旁注”) backed by DeepSeek; sessions are stored on the device. Link import (TASKS.md → M9, `docs/plans/2026-10-12-link-import.md`): Import also takes a pasted link; our own Cloudflare Worker fetches the page, the app extracts the article (Readability) and stores it as a book (web build first, iOS later). Where these lines disagree with README's out-of-scope list (night mode, LLM, archivist agent), these lines win.
- Do NOT build:
  - tabs 书房 / 生词 / 我 or a tab bar;
  - today stats or streak;
  - review cards or spaced repetition;
  - pronunciation / TTS, or the Examples button;
  - any LLM or agent other than the DeepSeek grammar analysis and the DeepSeek Agent drawer (no tools, no memory across books, no background runs); sync, push, accounts, analytics SDKs;
  - long-press sentence translation (the only sentence translation is the one on top of the grammar drawer).
- **Zero network requests at runtime**, with two exceptions: `https://api.deepseek.com`, called with the user's own key only after a tap on a grammar droplet or after the reader sends a question in the Agent drawer; and our own Worker's `POST /api/fetch`, only after the reader submits a link in Import. The Worker fetches public http(s) pages for its own origin only and never logs or stores the URL. Fonts, dictionary and books are all bundled; lookups, footnotes and everything else stay offline.
- If a design doc and the README disagree, the README wins. If the README is silent, follow `MVP 设计与范围` Part B3 (Reader 4a) exactly. The 2026-10-14 changes are in `docs/handoff/2026-10-14/CHANGES_2026-10-14.md`, with the owner's decisions in `docs/plans/2026-10-14-select-to-ask.md`.

## Identity
- App display name: **Spotlight**. Bundle ID: `com.lin.spotlight`.
- Phonetics: American IPA (ipa-dict `en_US`).

## Stack
- React + TypeScript (strict) + Vite.
- Targets: **iOS (Capacitor) and a mobile web app.** No Android — this overrides any mention of Android in the README or design docs.
- SQLite, two files: `user.db` (read/write) and a read-only `dict.db`. `user.db` uses the Capacitor plugin on iOS and sql.js + IndexedDB on the web. `dict.db` is read into sql.js on both, so lookups are synchronous (see `docs/plans/2026-09-26-m2-m4-notes.md`).
- Haptics are iOS-only; iOS Safari has no vibration API, so the web build skips them.
- EPUB and TXT parsing in a Web Worker (JSZip + linkedom, since `DOMParser` is not available in workers).
- Storybook (dev only, `npm run storybook`): stories next to the components; fixtures in `src/views/_stories/`. Update a component's stories when you change it (DEVELOPING.md → Component stories).

## Architecture rules
- Keep domain modules framework-free TS under `src/core/`:
  - `library`, `ingest`, `reader`, `dict`, `annot`, `prefs`, `grammar`, `ai`, `vocab`, `agent`.
  - React views live under `src/views/` and only call module APIs.
- The reader engine owns the scroll container and writes line styles directly (`style.filter`, `style.opacity`). Never re-render body-text lines through React on scroll.
- Build the line table once per layout. Do not call `getBoundingClientRect` per line per frame.
- One easing curve for the whole app: `cubic-bezier(.42,0,.58,1)`.
- Footnotes are `position:absolute` children of the word span. Line height must never change.

## Quality bar
- Every task in `TASKS.md` cites an acceptance ID (R-xx / H-xx / S-xx). Write a test or a measurable check for it.
- Performance: 60fps reader scroll on a mid-range device. Tap-to-drawer ≤ 100ms. A 300-page book is readable within 3s of import.
- Minimum hit target 44px. Small text contrast ≥ 4.5:1.

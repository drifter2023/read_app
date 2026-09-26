# 聚焦阅读 MVP — rules for Claude Code

Read `README.md` (in the handoff folder) before any work. It is the implementation spec.

## Scope guard
- Build only: Home (continue reading + shelf + import), Reader 4a, word drawer, 9px footnotes, settings sheet, open-book transition.
- Do NOT build:
  - tabs 书房 / 生词 / 我 or a tab bar;
  - today stats or streak;
  - review cards or spaced repetition;
  - night mode 1c or auto guided reading;
  - pronunciation / TTS, or the Examples button;
  - any LLM or agent, sync, push, accounts, analytics SDKs;
  - long-press sentence translation.
- **Zero network requests at runtime.** Fonts, dictionary and books are all bundled.
- If a design doc and the README disagree, the README wins. If the README is silent, follow `设计文档 v2` §3 (Reader 4a) exactly.

## Identity
- App display name: **Spotlight**. Bundle ID: `com.lin.spotlight`.
- Phonetics: American IPA (ipa-dict `en_US`).

## Stack
- React + TypeScript (strict) + Vite.
- Targets: **iOS (Capacitor) and a mobile web app.** No Android — this overrides any mention of Android in the README or design docs.
- SQLite via the Capacitor plugin: separate `user.db` and a read-only `dict.db`. On the web build, use the plugin's web (WASM) backend.
- Haptics are iOS-only; iOS Safari has no vibration API, so the web build skips them.
- EPUB and TXT parsing in a Web Worker (JSZip + DOMParser).

## Architecture rules
- Keep domain modules framework-free TS under `src/core/`:
  - `library`, `ingest`, `reader`, `dict`, `annot`, `prefs`.
  - React views live under `src/views/` and only call module APIs.
- The reader engine owns the scroll container and writes line styles directly (`style.filter`, `style.opacity`). Never re-render body-text lines through React on scroll.
- Build the line table once per layout. Do not call `getBoundingClientRect` per line per frame.
- One easing curve for the whole app: `cubic-bezier(.42,0,.58,1)`.
- Footnotes are `position:absolute` children of the word span. Line height must never change.

## Quality bar
- Every task in `TASKS.md` cites an acceptance ID (R-xx / H-xx / S-xx). Write a test or a measurable check for it.
- Performance: 60fps reader scroll on a mid-range device. Tap-to-drawer ≤ 100ms. A 300-page book is readable within 3s of import.
- Minimum hit target 44px. Small text contrast ≥ 4.5:1.

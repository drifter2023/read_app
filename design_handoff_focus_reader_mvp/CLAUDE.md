# 聚焦阅读 — rules for this handoff

Read `README.md` first. The **As built (2026-10-25)** section is the product. Then the As built boxes in `CHANGES_2026-10-14.md`, `NIGHT_MODE_1c.md` and `AGENT_DRAWER.md`. The HTML files in `design/` are visual reference only.

This package describes the app that is already built, so a later Claude Design session can continue from the current product. Do not redesign the removed behaviours (tab bar, top-30% settings tap, 夜读 row inside reader settings, mock Agent replies, Android).

## Scope guard
- In the product: Home (continue reading, shelf, import of a file or a link, 纸白 / 夜读 capsule, predicted-vocabulary card, DeepSeek key card), Reader 4a, word drawer with 保存 and 撤回, 9px footnotes, grammar droplet and grammar drawer, settings sheet, open-book transition, 问旁注, Agent drawer (旁注), 夜读 1c and 带读.
- Do NOT add:
  - tabs 书房 / 生词 / 我 or a tab bar;
  - today stats or streak;
  - review cards or spaced repetition;
  - pronunciation / TTS, or the Examples button;
  - any LLM other than the DeepSeek grammar drawer and the DeepSeek 旁注 drawer (no tools, no memory across books);
  - sync, push, accounts, analytics SDKs;
  - long-press sentence translation (the only sentence translation is the one on top of the grammar drawer);
  - a second theme switch. The Home capsule is the only one, and it themes the whole app.
- **Network only for** `https://api.deepseek.com` after a grammar droplet or a 旁注 question, and our worker's `POST /api/fetch` after a pasted link. Fonts, dictionary and bundled books stay on the device.
- If a design file and the README disagree, the README's As built section wins.

## Stack
- React + TypeScript (strict) + Vite.
- Capacitor for **iOS and the mobile web. No Android.**
- SQLite: `user.db` read/write, `dict.db` read-only and bundled.
- EPUB and TXT parsing in a Web Worker (JSZip + linkedom).

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

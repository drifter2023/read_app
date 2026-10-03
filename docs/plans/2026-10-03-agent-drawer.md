# Agent drawer — implementation notes

**Decided with the owner (2026-10-03):** the Agent / LLM scope is now in (CLAUDE.md → Scope guard). The drawer is backed by DeepSeek through the same key and client as the grammar drawer (`src/core/ai/`), not by a mock. Design: `Agent 抽屉 · 聚焦阅读 v3` (9a); hand-off notes: `AGENT_DRAWER.md` in the design project.

## Where the app differs from the design file
- **One easing curve** (CLAUDE.md): the 420 ms open/close uses `cubic-bezier(.42,0,.58,1)`, not the design's `(.22,.8,.24,1)`.
- **Fonts are bundled**: no Google Fonts. Latin text uses Newsreader / IBM Plex Sans; Chinese uses the system PingFang SC / Songti SC.
- **Hit targets ≥ 44 px and small text ≥ 4.5:1**: suggestion chips and the send button are 44 px (design: 34 / 40); tertiary text is `rgba(ink, .62)` (design: .45).
- **"本页" text**: the reader scrolls continuously, so the sentence picker shows the paragraph at the reader's position and one on each side.
- **Conversations are created on the first question**, not when 新对话 is tapped, so no empty rows pile up.
- Night mode: the drawer takes the 7b colours (`--ag-*` tokens in `agent.css`).

## What the model sees
System prompt (`src/core/agent/prompt.ts`, never varies, so it is prefix-cached) + the last 8 messages of the conversation + one user message: book title, chapter, up to ~450 words of the chapter ending at the end of the picker's page, the selected sentence and the question. Nothing after the page is sent, and the prompt forbids hints about later plot. The answer ends with an optional `出处：…` line, shown as the citation pill. `max_tokens` 600, temperature 0.6, thinking off.

## Acceptance IDs
| ID | Check |
|---|---|
| **A-01** | A left drag over 8 px (more horizontal than vertical) moves the page and scales it into a card with a strip of page left; a flick or p > 0.45 snaps open; opening sends no request. Right drag / strip tap / Esc closes. |
| **A-02** | An exchange (question + selected sentence + answer + 出处) is stored once the answer is complete; the session is titled after the first question, listed newest first, and deleted with the book. After a reload the conversation is still there. |
| **A-03** | The picker shows the paragraph around the reader's position ±1; the sentence on its middle line is the selected one and is sent with the question. Used suggestions leave the list. |
| **A-04** | The prompt and message layout are snapshot-tested; the 出处 line is split off, and a half-written one is never shown while streaming. |
| **A-05** | No key → 「先在首页填写 DeepSeek API Key」; network / server / timeout / empty answer → reason + 重试; nothing is stored. |

Tests: `tests/unit/agent.test.ts`, `tests/e2e/agent.spec.ts`.

## Not done (open questions in AGENT_DRAWER.md §8)
Pausing the focus blur while the drawer is open; carrying a tapped word into the chat; highlighting the selected sentence in the reader.

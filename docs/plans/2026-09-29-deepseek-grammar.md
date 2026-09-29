# DeepSeek grammar analysis — implementation plan

**Goal:** The grammar drawer analyses the tapped sentence with DeepSeek V4.1 Flash, streams the answer into the drawer, and keeps every finished analysis so the sentence reopens instantly (also offline). The user enters their own API key on Home.

**Decided with the owner (2026-09-27 … 29):**
- Model `deepseek-flash` (= DeepSeek-V4.1-Flash), called straight from the app. CORS allows the web origin and `capacitor://localhost` (checked by preflight), so web and iOS share one `fetch`-based client and both can stream. No proxy.
- Loading dots until the first token, then streaming text with a caret.
- Length: one pattern line ≤ 16 字, 3 points (4 only when the sentence has more than 40 words), each point ≤ 36 字 (two English letters count as one), about two lines; drawer ≤ 300 px on a 375 px wide screen. (First agreed as 40 字; measured on a 375 px screen a 40-字 point wraps to three lines, so the prompt says 36 and the label column is 48 px. The longest allowed answer is 290 px.)
- **Superseded 2026-09-29 (prompt v2):** length follows the sentence: pattern ≤ 24 字, 2–3 points for short sentences and up to 5 for long or complex ones, each point as long as it needs, up to 60 字; `max_tokens` 700. The drawer caps the height instead: `min(320px, 45vh)`, scrolling inside with a bottom fade while more is below; a streaming answer follows its newest line until the reader scrolls up. A tap or scroll inside the drawer keeps it open; one outside closes it.
- One explanation for everyone (no reader level). No sentence translation.
- The 9 hand-written samples (`src/core/grammar/samples.ts`) are removed.

## Global constraints

- Runtime network: the grammar drawer is the **only** feature that goes online, only after a tap on a droplet, only with the user's own key, only to `https://api.deepseek.com`. Everything else stays offline.
- Framework-free modules under `src/core/`; views only call module APIs.
- The reader engine still owns the text; streaming re-renders only the drawer, at most once per frame.
- One easing curve; 44 px hit targets; small text ≥ 4.5:1 in both themes.
- Tap-to-drawer ≤ 100 ms still holds: the drawer opens with loading dots at once; only its content waits for the network.

## Acceptance IDs

| ID | Check |
|---|---|
| **G-01** | Key: 确认 calls `GET /models`; 200 saves it and shows `已连接 ····abcd`; 401 shows 「Key 无效」 and saves nothing; 清除 removes it. |
| **G-02** | Loading dots until the first content token; then points appear line by line with a caret; the caret goes when the stream ends. |
| **G-03** | A finished analysis is stored; reopening the sentence shows it with no request, also offline. |
| **G-04** | v2: the drawer is never taller than `min(320px, 45vh)`; the longest allowed analysis scrolls inside it with a bottom fade; gestures inside do not close it. (v1: ≤ 300 px on a 375 px screen.) |
| **G-05** | No key → 「先在首页填写 DeepSeek API Key」. No first token in 15 s, a network error, HTTP 4xx/5xx, or an empty/invalid answer → reason + 重试; nothing stored. |
| **G-06** | Prompt v1 is sent verbatim (snapshot); the parser accepts the line format, tolerates `|`, ignores junk lines, caps at 5 points (v1: 4). |

## Prompt v1

`PROMPT_VERSION = 2` since the length change (v1 answers are analysed again when reopened); the text lives in `src/core/grammar/prompt.ts`. The system prompt never changes between requests, so DeepSeek's prefix cache bills it at the cache-hit price after the first call. The user message carries 前一句 (≤ 60 words, else （无）), 目标句 and 单词数 (counted by the app).

Request: `{ model: 'deepseek-flash', stream: true, thinking: { type: 'disabled' }, max_tokens: 700, temperature: 0.5, messages }`. Temperature is a starting value, to tune on real sentences.

## Modules

| File | Responsibility |
|---|---|
| `src/core/ai/deepseek.ts` | `checkKey`: `GET /models` → ok / invalid / network. `streamChat`: POST with `stream: true`, parses SSE, yields `delta.content`, reports the finish reason; typed `AiError`; injectable `fetch`. |
| `src/core/ai/key.ts` | The key in the `settings` table under `deepseek.key` (not in `PrefsStore`, which broadcasts to React). |
| `src/core/grammar/prompt.ts` | `PROMPT_VERSION`, `SYSTEM_PROMPT`, `userMessage`. |
| `src/core/grammar/parse.ts` | Incremental parse of the line format; the unfinished last line is `partial`. |
| `src/core/grammar/history.ts` | Migration v4 `grammar` table (cascade on book delete); load only on matching text hash and prompt version. |
| `src/core/grammar/service.ts` | history → key → stream; one in-flight run per sentence; 15 s first-token and 20 s idle timeouts; a closed drawer still saves. |
| `src/views/home/AiKeyCard.tsx` | Home section below the shelf. |
| `src/views/WordDrawer.tsx`, `src/views/useWordLookup.tsx` | Drawer states and streaming, re-rendered at most once per frame; the gap follows the drawer's growth. |

## Tasks

1. Scope and rules (CLAUDE.md, README, TASKS.md).
2. Prompt and parser (G-06).
3. DeepSeek client and key storage (G-01, G-05).
4. History (G-03).
5. Service (G-02, G-03, G-05).
6. Home key card (G-01).
7. Streaming drawer (G-02, G-04, G-05); remove the samples; a real-key run to tune temperature and lengths.
8. Docs and deploy.

Each task: failing test first, then code, then the whole suite, then commit.

## Review focus

- A stream that stalls after some points: the partial text stays visible, the error says so, nothing is stored, 重试 starts over.
- The key never appears in logs, metrics, URLs or error messages.
- A relayout (font size) while a run streams: the drawer closes cleanly; the run still saves.
- Night mode: the key card and error lines keep 4.5:1.
- A sentence of 150+ words: still ≤ 4 points and within the height budget.

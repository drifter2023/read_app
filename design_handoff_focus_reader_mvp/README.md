# Handoff: 聚焦阅读 (Focus Reader)

> **For Claude Design (updated 2026-10-25).** This folder is the design handoff of the app as it is built. Read this README first. `CHANGES_2026-10-14.md`, `NIGHT_MODE_1c.md` and `AGENT_DRAWER.md` keep the original pixel notes; each file starts with an **As built** box. Where an older paragraph, an HTML prototype, or `spec.mvp.json` disagrees with **As built** below, **As built** wins.
>
> The files in `design/` are HTML prototypes, not the app. They still show removed ideas (a tab bar, today stats, a top-30% tap that opens settings, a 夜读 row inside the reader settings). Use them for colour, type and motion. Use this README for what the product does.

## As built (2026-10-25)

Two screens. Display name **Spotlight**. Targets: **iOS (Capacitor) and a mobile web app. No Android.**

1. **Home** — date, a 纸白 / 夜读 capsule, continue reading, a shelf (在读 / 读完, import), then a predicted-vocabulary card and a DeepSeek key card. No tab bar, no streak, no today stats, no review cards.
2. **Reader** — paper-white focus band (4a). At night the same layout uses 1c colours, and a 带读 bar can step through sentences. A sharp word opens a tear-paper drawer. Looked-up words, and words the device predicts the reader does not know, get a 9px Chinese footnote with **zero change to line height**.

**The only theme switch** is the 纸白 / 夜读 capsule on Home. It changes the whole app: 1c colours in the reader, night colours on the 7a Home layout. Layout, type size and padding do not change. There is no 夜读 row in the reader settings sheet, and no automatic switch by clock or system appearance.

**Reader chrome** stays: a top bar (`‹ 书架` and the title) and a capsule (`目录 · Aa`). They are hidden until a tap shows them. `Aa` opens the settings sheet from the bottom. There is no always-on button and no scroll indicator on the page edge.

**Tap order** on the reader:
1. A text selection exists → clear it.
2. A drawer or the settings sheet is open → close it.
3. The tap is in the title area (the top of the page down to 22px below the chapter eyebrow), even on a word → show or hide the top bar and capsule.
4. The tap hits a word on sharp text (the focus band, or any line while 聚焦模糊 is off) and the tap is below the title area → open the word drawer. Blurred text opens nothing.
5. Blank space or the page edge (side margins, gaps between paragraphs, after a short line, the faded bottom edge) → show or hide the top bar and capsule.
6. A tap on text, blurred or sharp, that did not open a drawer → hide the top bar and capsule if they are showing.

**Also on the reader**
- **聚焦模糊** in settings (default on). Off: every line sharp, fade masks shrink to a thin strip behind the eyebrow, and 清晰带 / 模糊强度 / 整句模式 are greyed out. Grammar droplets and predicted-word exposure still follow the focus band.
- **撤回** on the word drawer. The book forgets that lemma (lookup rows, saved state, footnotes) and the drawer closes.
- **Grammar droplet** after each sentence end, only on lines in the focus band. It opens a grammar drawer: the sentence's translation on top, then a short pattern and points. DeepSeek, with the reader's own key. The only sentence translation in the app.
- **Long-press** (380ms) on sharp text selects words. Two handles adjust the range. A 问旁注 pill sends the selection to the Agent drawer as an attachment. No system edit menu.
- **Agent drawer:** a left swipe pushes the page aside into a card (about 60px of the page stays visible) and reveals a per-book chat, 旁注. DeepSeek, the reader's own key. No tools, no memory across books. 当前句 and a 问旁注 attachment share one slot above the input.
- **带读** (夜读 only): the bar plays, pauses, shows chapter progress, and steps 0.6× / 1× / 1.6×. Any touch pauses it. Only Play resumes it. The bar steps aside while the top bar and capsule are up.

**Home, besides the shelf**
- **预测生词:** a one-minute calibration test, then footnotes ahead of time for words the reader probably does not know. Learned on the device from lookups, 撤回 and reading. Settings: 关 / 少 / 多. Default 少.
- **Import:** a file (EPUB 2/3 without DRM, or UTF-8 TXT) or a pasted link. A link is fetched by our own worker, then stored as a book.
- **DeepSeek key card:** enter, check, show, clear the key used by the grammar drawer and 旁注.

**Network.** Everything else is offline (fonts, dictionary, bundled books). The only requests are `https://api.deepseek.com` after a tap on a grammar droplet or a question in 旁注, and our worker's `POST /api/fetch` after a link is submitted. No accounts, sync, push or analytics SDK.

**Still out of scope:** tabs 书房 / 生词 / 我 and a tab bar; today stats and streak; review cards and spaced repetition; pronunciation / TTS; the Examples button; any LLM other than the grammar drawer and 旁注; theme editing; long-press sentence translation (translation lives only at the top of the grammar drawer); account sync and moving books between devices.

## Overview
A focus-first English reader for Chinese-speaking learners. The original MVP was Home plus Reader 4a. The sections below keep that pixel spec. The **As built** section above is what shipped on top of it.

## About the design files
Everything in `design/` is a **design reference built in HTML**. It is not production code. The app is React + TypeScript + Vite, wrapped with Capacitor for iOS and the mobile web (no Android). `user.db` is read/write; `dict.db` is read-only and bundled. EPUB and TXT parsing runs in a Web Worker.

## Fidelity
**High fidelity** for colour, type, spacing and the one easing curve `cubic-bezier(.42,0,.58,1)`. Match the 4a / 7a / 1c / drawer measurements in the sections below, then apply **As built** where the product moved on.

## Source-of-truth order
1. **As built**, at the top of this file.
2. The **As built** boxes in `CHANGES_2026-10-14.md`, `NIGHT_MODE_1c.md` and `AGENT_DRAWER.md`.
3. The rest of this README (4a type, drawer, footnotes, motion).
4. `design/MVP 设计与范围 · 聚焦阅读.dc.html` — Part B pixel spec (B2, B3 Reader 4a, B5 figure 5.1 Home, B6 motion). Ignore the tab bar, 书房, 生词, 我, and any behaviour **As built** replaces.
5. `design/聚焦阅读 App.dc.html` — prototype. Turn 4 is 4a, turn 7 is 7a, turn 1 option 1c is night reading, turn 10 is the Agent drawer. `reference/reader-prototype.ts` extracts the early reader logic.
6. `spec.mvp.json` — a machine-readable summary. Prefer this README if they differ.

Open the `.dc.html` files in a browser; `support.js` must sit next to them.

---

## Screens

### 1. Home (`HomeView`)
Artboard 402 × 812 @1x. Background `#fbfaf8`. Side padding 24px. Sections are separated by 1px rules in `#16150f` at 10% opacity, never by card borders. Reference image: `design/screens/fig-7a-read.png`. **Remove** the streak, today stats, review cards and tab bar shown there.

Top to bottom:
- **Date eyebrow**: IBM Plex Sans 11px, uppercase, letter-spacing .14em, `#16150f` at 62%, e.g. `TUE · 9月22日`. Left side; no streak. On the right, the 纸白 / 夜读 capsule (the only theme switch; see **As built**).
- **Continue reading** (the whole block is tappable and opens the book):
  - Label `CONTINUE`: 11px, uppercase, .14em, 62%.
  - Title: Newsreader 36px, line-height 1.1, `#16150f`.
  - Author · chapter: Noto Sans SC 12.5px, 62%.
  - Progress: 2px track (ink at 10%), `#c1452f` fill, then 11px/500 percentage on the right.
  - Below that: `还剩约 N 分钟`, 11px, 62%. N = remaining words ÷ 230.
- **Shelf header**: `SHELF`, 11px, uppercase, .14em, 62%. On the right, `+ 导入` in `#c1452f`, 12px, with a 44px hit target.
- **Filter**: `在读 / 读完`. Selected: 12.5px ink with a 2px `#c1452f` underline. Unselected: 62%. The row sits on a 1px rule. (`想读` is P1.)
- **Shelf row** (min height 44px): 46 × 64 flat cover; title Newsreader 18px; author 11px 62%; 2px progress bar plus `第 N 章 · 还剩 M 分`. Finished books show a grey bar and the finish date.
  - Cover: use the EPUB cover image if there is one. Otherwise a solid colour chosen as `hash(title) % 8` from an 8-colour palette, with no texture.
  - Sort by `openedAt`, newest first.
- **Empty state**: one line of copy, the import button, and the 3 bundled public-domain books listed.

### 2. Reader 4a (`ReaderView`)
References: `design/screens/fig-4a-focus.png` and `fig-4a-drawer.png`.

- **Page**: background `#faf8f3`.
  - Scroll container: `position:absolute; inset:0; overflow-y:auto; padding:45% 34px`. The top/bottom padding lets the first and last lines reach the centre.
- **Body text**: Newsreader 19.5px, line-height 34px, each line a fixed 34px tall, colour `#221f1b`. Paragraphs open with an em-space indent (`\u2003`).
- **Chapter eyebrow**:
  - Absolutely positioned, `top:58px`, horizontal padding 34px.
  - IBM Plex Sans 11px, letter-spacing .14em, `rgba(34,31,27,.38)`.
  - Left: chapter name in uppercase. Right: live percentage, minimum 1%.
- **Fade masks** (`pointer-events:none`):
  - Top: 150px, `linear-gradient(#faf8f3 22%, transparent)`.
  - Bottom: 130px, `linear-gradient(transparent, #faf8f3 72%)`.
- **Focus band**:
  - Fixed in screen coordinates (not document coordinates), centred vertically.
  - Height = viewport height × `focusPct` (default 30%, about 3 lines).
  - Lines inside the band are perfectly sharp. Formula in *Interactions*.
- **Top bar:** 44px, `‹ 书架` on the left, the book title in the middle. Hidden until a tap in the title area, on blank space, or on the page edge shows it (see **As built**). The same kind of tap hides it again; a tap on text only hides it. Fades after 3s idle or on scroll (220ms).
- **Capsule:** `目录` and `Aa`, shown and hidden with the top bar. `Aa` opens settings. There is no scroll indicator on the right edge.

**Word highlight while its drawer is open:** background `rgba(34,31,27,.09)`, radius 3px.

**9px footnote** (a child of the word span; the word span is `position:relative`):
```
position:absolute; left:0; top:23px;
font: 500 9px/1 'PingFang SC','Noto Sans SC','Hiragino Sans GB',sans-serif;
letter-spacing:.04em; color:rgba(34,31,27,.6);
white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;
pointer-events:none; -webkit-font-smoothing:antialiased;
```
The footnote is out of normal flow, so line height must not change. Acceptance R-06: each line's y position is identical before and after a footnote appears.

**Tear-paper drawer** (`WordDrawer`). It is inserted as a sibling directly after the tapped line, with margin `5px -34px 7px` so it bleeds to the screen edges.
- **Container**: `display:grid; grid-template-rows:0fr → 1fr` (keyframes `splitG` / `collapseG`); `overflow:hidden`; `padding:0 34px`.
- **Leather surface**:
  ```
  background:#2c2620;
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,.022) 0 2px, rgba(0,0,0,.028) 2px 4px),
    linear-gradient(#332c25, #241f1a);
  box-shadow:
    inset 0 10px 13px -8px rgba(0,0,0,.95),
    inset 0 -10px 13px -8px rgba(0,0,0,.95),
    inset 0 1px 0 rgba(0,0,0,.6),
    0 1px 0 rgba(255,255,255,.55);
  ```
- **Inner padding**: `26px 0 27px`.
- **Head row** (baseline-aligned, gap 8px):
  - Word: Newsreader 18px/500, `#f2ead9`, `text-shadow:0 1px 0 rgba(0,0,0,.75)`.
  - Phonetic: IBM Plex Sans 11px, `rgba(242,234,217,.5)`.
  - Part of speech: Newsreader italic 12px, 45% opacity.
- **Definition**: IBM Plex Sans 13px/20px, `rgba(242,234,217,.8)`. One sense, one line.
- **Buttons**: **保存** and **撤回**. 保存 switches to 已存. 撤回 forgets the lemma for this book and closes the drawer.
  - `padding:6px 12px; border-radius:5px`; IBM Plex Sans 11px, `#f2ead9`.
  - `background:linear-gradient(#574d42,#3b342c)`.
  - `box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 1px 2px rgba(0,0,0,.55)`.
  - After tapping it switches to a saved state, `已存`.
  - **Hidden in the MVP**: the Examples button, the pronunciation button and the example sentence line.
- **Notches**, which make the drawer look torn out of that line:
  - Top: a 16px strip in page colour `#faf8f3` at `top:-4px`.
    - `clip-path:polygon(0 0,100% 0,100% 16px,calc(X + 12px) 16px,X 4px,calc(X - 12px) 16px,0 16px)`.
    - `filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.5))`.
  - Bottom: the mirror image at `bottom:-4px`.
    - `clip-path:polygon(calc(X - 12px) 16px,X 0,calc(X + 12px) 16px)`.
    - `drop-shadow(0 -1px 1.4px rgba(0,0,0,.45))`.
  - `X` = centre x of the word, clamped to `[16, width − 16]`.
- **States**:
  - `loading`: show three pulsing dots (keyframe `dots`).
  - `ready`.
  - `not-found`: one line, "词典未收录这个词".
  - `closing`.

### 3. Settings sheet (`SettingsSheet`)
- Opened by `Aa` on the capsule (a tap in the title area shows the capsule). **Rises from the bottom**; closes on a tap outside (transparent scrim) or on the top handle. Leather surface, 330 / 250ms, the app easing curve.
- Max height 42% of the viewport, so the focus band stays visible above it. Radius 14. The owner restored this MVP look on 2026-10-15 (字号 first, red switches).
- Changes apply live.
- **聚焦模糊** (`focusBlur`, default on). Off → every line blur 0 and opacity 1, masks shrink to a thin strip behind the eyebrow, the page is sharp; 清晰带 / 模糊强度 / 整句模式 grey out. Hint: 关闭后整页清晰.

| Item | Control | Default | Mapping |
|---|---|---|---|
| Font size | 3 steps | M 19.5 / 34 | S 17.5 / 30 · L 22 / 38; keep the sentence anchor |
| 聚焦模糊 | switch | on | see above |
| Focus band | slider | 30% | `focusPct` 20–80, step 5 |
| Blur | slider | 7 | `blurMax` 2–14 px. At night, 9px until the reader moves this slider |
| 预测生词 | 关 / 少 / 多 | 少 | how many predicted footnotes |
| Sentence mode | toggle | off | non-current sentences get t += 0.18 |

Row order: 字号, 聚焦模糊, 清晰带, 模糊强度, 预测生词, 整句模式. No 夜读 row.

### 4. Import (`ImportSheet`)
文件 or 链接. File: EPUB 2/3 (no DRM) and UTF-8 TXT. Link: a pasted http(s) URL, fetched by our worker, stored as a book. Show progress and a readable failure reason.

---

## Interactions & behaviour

**Easing everywhere:** `cubic-bezier(.42,0,.58,1)` (the skeuomorphic iOS curve).

### Focus band (R-01)
```
half = H * focusPct / 200          // H = viewport height; clamp focusPct to 10–90 at runtime
ramp = max(1, H/2 - half)
d    = |lineCenterY - viewportCenterY|
t    = clamp((d - half) / ramp, 0, 1)
blur    = blurMax * t              // blurMax default 7
opacity = 1 - 0.85 * t
sentenceMode: t = min(1, t + 0.18) for lines outside the current sentence
```
**Performance** (budget ≤ 4ms per frame, 60fps on mid-range devices, < 2% dropped frames):
- Listen to scroll as `passive`, and merge updates into one `requestAnimationFrame`.
- Build a **line table** once, holding each line's `top` and `height`. Rebuild it only on font-size or viewport change. Never read layout during scroll.
- Only process lines within ±1 viewport of the screen.
- Round blur to 0.5px steps, and write a line's style only when its value changed.
- **Fallback for low-end devices**, decided by a probe on first launch and stored as `Settings.tier`: no per-line blur. Use two static `backdrop-filter` layers (top and bottom) plus per-line opacity.

### Word tap (R-04, R-05)
- Hit test: `caretRangeFromPoint` (or `caretPositionFromPoint`) finds the word boundaries and the sentence the word is in. The word is normalised with `/[^A-Za-z'’-]/g`.
- Lemma: look up `forms → lemma`, fall back to simple rules (-s, -es, -ed, -ing, -ies→y), then use the surface form.
- Lookup: in-memory LRU cache, then `dict.db`. Time from tap to drawer starting to open must be ≤ 100ms.
- Timing:
  - Open: 330ms (`splitG`). Content `riseIn` over 250ms, no delay.
  - Close: 250ms (`collapseG`). Content `fadeOut` over 138ms (= close × 0.55).
- **Keep on screen**: when the drawer's bottom edge goes past the container bottom − 70px by more than 8px, smooth-scroll the container by that overflow.
- **Close** on:
  - a tap on the drawer, or a tap anywhere else;
  - a user scroll, judged as a wheel or touchmove within the last 500ms.
- While a drawer is open, the first scroll gesture is cancelled (`preventDefault`) and closes the drawer. For 250ms after closing, scrolling stays locked to avoid a jump.
- **Tapping another word while one is open**: close first, then open the new one after the close duration. Tapping the same word just closes.
- **On open**:
  - Write a `Lookup` row.
  - Add the lemma to `seen`.
  - Fire one light haptic.

### Footnotes (R-06)
- On book open: `seen` = all distinct `lemma` values in `Lookup` for this `bookId`. Scope is **per book**.
- Every word whose lemma is in `seen`, and every word predicted for this reader (unless 预测生词 is 关), gets a footnote. 撤回 removes that lemma from `seen`.
- Text = the first sense of `gloss` for that part of speech, truncated with an ellipsis to the word's width.
- Only render footnotes for paragraphs currently mounted.

### Position and progress (R-07)
- Anchor = the first sentence inside the focus band, saved to `Position` with a 1s debounce.
- Restoring after an app kill or font-size change must put the same paragraph inside the band.
- Percentage = scrollTop ÷ (scrollHeight − clientHeight) across the whole book (use `wordStart`). Minimum shown is 1%.

### Open-book transition (H-04)
A flight layer takes off from the shelf row's cover rectangle. Shadow: `0 18px 40px rgba(0,0,0,.5)`.

1. Pull out, 220ms: `top − 30px`.
2. Expand, 460ms: `left / top / width / height → 0, 0, 402, 812` (full screen).
3. Cover fades out, 300ms.
4. Text fades in, 320ms.

Meanwhile, load `Position`, mount the chapter and build the line table. Going back reverses the flight to the original rectangle (300ms).

### Tap arbitration in the reader
The order in **As built** is the one to follow. The 2026-10-14 note that a tap in the top 30% opens settings is superseded.

---

## State

- **Reader**:
  - `pop: {word, lemma, lineIndex, caretX, phase: 'loading'|'ready'|'notfound'|'closing'} | null`
  - `seen: Set<lemma>`
  - `chromeVisible`
  - `settingsOpen`
  - `lineTable`
  - `anchor`
- **Home**:
  - `filter: 'reading'|'done'`
  - `fly: {rect, phase: 'out'|'full'|'page'|'back'} | null`
- **Settings store**: subscribable. Changes push to the reader engine directly, not through React re-render.
- The body-text lines are **not** React-rendered per frame. The reader engine writes `style.filter` and `style.opacity` directly.

## Local data model (SQLite `user.db`)

```
Book     (id, title, author, cover, color, format, wordCount, status['reading'|'done'], pct, addedAt, openedAt, finishedAt)
Chapter  (bookId, idx, title, paras JSON[[sentence...]...], wordStart)
Position (bookId PK, chapter, para, sentence, updatedAt)
Lookup   (id, bookId, surface, lemma, zh, phonetic, sentence, loc, at, saved BOOL)
Settings (key PK, value)         -- fontSize, focusPct, blurMax, sentenceMode, tier
```
`dict.db` (read-only): `entry(word PK, phonetic, pos, gloss)` and `forms(form PK, lemma)`.

`Lookup` is deliberately rich: later it becomes the data source for the vocabulary tab and agent memory. Do not trim its fields.

Deleting a book (P1) also deletes its `Lookup` rows.

Local log (for beta metrics, exported manually through the share sheet): session minutes, lookups per 1k words, whether the user scrolls again within 10s of closing a drawer.

## Design tokens

| Token | Value |
|---|---|
| Home background | `#fbfaf8` |
| Home ink | `#16150f` |
| Home secondary | `#16150f` at 62% |
| Accent | `#c1452f` |
| Rule | `#16150f` at 10% (7% for inner rules) |
| Reader paper | `#faf8f3` |
| Reader ink | `#221f1b` |
| Eyebrow | `#221f1b` at 38% |
| Footnote | `#221f1b` at 60% |
| Drawer leather | `#2c2620`, gradient `#332c25 → #241f1a` |
| Drawer text | `#f2ead9` (80% body, 50% meta) |
| Button gradient | `#574d42 → #3b342c` |
| Word highlight | `rgba(34,31,27,.09)`, radius 3 |

**Type**
| Font | Use | Weights |
|---|---|---|
| Newsreader | English body, titles | 400 / 500, italic for POS |
| IBM Plex Sans | Labels, numbers, phonetics | 400 / 500 |
| Noto Sans SC | All Chinese UI | 400 / 500 |
| PingFang SC | 9px footnote (fallback Noto Sans SC) | 500 |

**Spacing:** home side padding 24px; reader side padding 34px; minimum hit target 44px; body line-height 34px.

**Contrast:** small 10–13px text is at least 4.5:1. That is why 62% is used on light backgrounds and never less. The 9px footnote uses weight 500 to compensate for its size.

**Motion**
| Action | Duration | Property |
|---|---|---|
| Drawer open / close | 330 / 250ms | grid-template-rows 0fr↔1fr |
| Content in / out | 250 / 138ms | opacity + translateY(7px) |
| Book pull-out | 220ms | top −30px |
| Book expand | 460ms | rect → full screen |
| Cover out → text in | 300 / 320ms | opacity |
| Book back | 300ms | rect → origin |
| Chrome fade | 220ms | opacity |

Keyframes, copied from the prototype:
```css
@keyframes splitG   {from{grid-template-rows:0fr;opacity:.4} to{grid-template-rows:1fr;opacity:1}}
@keyframes collapseG{from{grid-template-rows:1fr;opacity:1}  to{grid-template-rows:0fr;opacity:.3}}
@keyframes riseIn   {from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none}}
@keyframes fadeOut  {from{opacity:1;transform:none} to{opacity:0;transform:translateY(4px)}}
@keyframes dots     {0%,80%{opacity:.25} 40%{opacity:1}}
```

## Assets
- **Fonts**: Newsreader, IBM Plex Sans, Noto Sans SC and IBM Plex Mono from Google Fonts. Bundle them locally, because the app is offline.
- **Covers**: from the EPUB, or generated colour blocks.
- **Icons**: only `‹`, a TOC icon and `Aa`. Use any consistent line-icon set; the design has no custom icons.
- **Dictionary**: ECDICT → `dict.db`, built at build time by `scripts/build-dict`.
- **Bundled books:** *A Farewell to Arms*, *The Maltese Falcon*, *The Great Gatsby*. Public domain in the US and China. Hemingway and Hammett are not public domain in the EU until 2032.

## Files

```
README.md                  this file — start here (As built, 2026-10-25)
CLAUDE.md                  scope rules that match the built app
TASKS.md                   original build order; status at the top
CHANGES_2026-10-14.md      select-to-ask, settings, 聚焦模糊 — As built box first
NIGHT_MODE_1c.md           夜读 and 带读 — As built box first
AGENT_DRAWER.md            旁注 drawer — As built box first
spec.mvp.json              machine-readable summary
reference/reader-prototype.ts   early prototype logic (focus band, drawer, footnotes)
design/                    HTML prototypes and screens. Visual reference; behaviour follows this README
```

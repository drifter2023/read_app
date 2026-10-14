# Select-to-ask, settings entry, 聚焦模糊 (M11)

Source: `design_handoff_focus_reader_mvp 2/` (2026-10-14).
- `CHANGES_2026-10-14.md` is the delta; it says it overrides anything older that conflicts.
- Specs:
  - `design/MVP 设计与范围 · 聚焦阅读.dc.html` Part C (C1–C3) and A2 「阅读设置面板」;
  - the prototype is `design/聚焦阅读 App.dc.html`, turn 10, option 10a.

**Status:** built 2026-10-14 (TASKS.md → M11, tasks 47–53). The owner's answers (2026-10-14) are recorded below; they win over the handoff.

**Owner decisions (2026-10-14):**
1. The top bar (`‹ 书架` + title) and the capsule (`目录 · Aa`) **stay**; only the rest of C4 is built (the top-30 % tap, the tap order, no right-edge scroll indicator). A blank tap below the top 30 % still toggles them.
2. A tap in the top 30 % **always** wins over a word, even with 聚焦模糊 off; to look a word up there, scroll it down. It first opened the settings sheet; **changed 2026-10-15** (owner): it shows or hides the top bar and capsule (‹ 书架 · 目录 · Aa) instead, and `Aa` opens settings. **Same day, second change:** the zone shrinks from the top 30 % to the title area (top of the page to 22 px below the eyebrow); a tap anywhere else no longer shows the menu, it only hides it. The settings sheet goes back to its MVP look (字号 first, red switches, radius 14, 42 %); the transparent scrim and the inert greyed rows stay.
3. Tap order: selection → close sheet / drawer → top 30 % → word → toggle the top bar and capsule.
4. Blur off keeps a thin mask strip behind the eyebrow (a little taller than S-03's first cut, so it looks natural).
5. a) every switch in the sheet uses the new cream style; b) **no new easing curves**: CLAUDE.md's one curve stays everywhere; c) a long-press starts a selection only on sharp lines; d) the Agent push keeps the fixed 60 px strip, and the design docs now say so.

The section below is the analysis that led to these questions.

## What is new, and what we already have

| Handoff task | What it asks | Where the app is today |
|---|---|---|
| **C1** Selection layer | Long-press 380 ms selects a word; drag extends word by word (nearest word, vertical distance ×4); two black handles; selection bg `rgba(34,31,27,.16)`; selected lines unblurred; no OS menu | Nothing. A tap opens the word drawer; a left swipe opens the Agent drawer |
| **C2** 问旁注 button | Black pill 56 px above the selection, clamped `[72, W−72]`, below it if top < 84 px; 180/240 ms in; hidden while dragging | Nothing |
| **C3** Attachment in the Agent drawer | Quote card in 当前句's slot right above the input, never both (× brings 当前句 back; closing the drawer drops it); selection chips; placeholder 就这段文字提问; send uses the attachment as the quote | Drawer asks about the picked sentence only; `agent_message.quote` already exists (no migration needed) |
| **C4** No chrome on the page | Remove the top bar, the `目录 · Aa` capsule and the right-edge scroll indicator; a tap in the top 30 % opens settings; new tap priority | `ReaderChrome` (‹ 书架 + title, 目录 / Aa) toggles on a blank tap |
| **C5** Sheet from the bottom | Leather; radius 18; padding `4px 22px 30px`; max 44 %; transparent scrim; handle; `cubic-bezier(.22,.9,.3,1)` 330/250 ms; page gestures off while open | Already a bottom sheet with a grip, max 42 %, app easing, closes on any page tap |
| **C6** 聚焦模糊 | First row; on/off subtitle; cream switch; off → no blur, no fade, **masks hidden**; dependent rows .32 and inert | **Shipped 2026-10-14 (S-03, `focusBlur`).** Deltas: row order, subtitles, switch colours, .32, masks (see §1-4) |

## 1. Owner decisions (before code)

1. **How to get back to the shelf, and where the table of contents goes.**
   - The new spec removes the top bar (`‹ 书架`) and the capsule (`目录`). Neither the spec nor the 10a prototype says what replaces them.
   - R-10 (目录) is still in the acceptance list.
   - **Recommendation:** a header line in the settings sheet, above 聚焦模糊: `‹ 书架` on the left and `目录` on the right. Everything stays one tap away from the top-30 % tap.
   - Alternatives:
     - An edge swipe right. On the web this clashes with Safari's back gesture and with the swipe that closes the Agent drawer.
     - Keep a hidden top bar.
2. **Words in the top 30 % while 聚焦模糊 is off.**
   - With blur on, that area is blurred, so it is not tappable anyway.
   - With blur off, today any word opens its drawer. Under the new priority, a tap in the top 30 % would open settings instead.
   - **Recommendation:** with blur off, a tap on a *word* still looks it up; only a tap on blank space in the top 30 % opens settings.
3. **Tap priority.** The two documents list it in a different order:
   - `CHANGES` closes an open sheet or drawer *before* checking the top 30 %;
   - Part C3 closes it *last*.
   - **Recommendation:** the `CHANGES` order (it overrides; closing first is also what a reader expects): selection → close sheet/drawer → top 30 % → word.
4. **Fade masks with blur off.**
   - The spec hides them completely, but the chapter eyebrow stays on screen.
   - Without a mask, text scrolls under 「CHAPTER I · 12%」. We saw this in the S-03 preview and kept a 104 px top / 40 px bottom strip.
   - **Recommendation:** keep the thin strip behind the eyebrow only.
5. **Switch style.**
   - The spec gives the new switch a cream track with a dark knob. 整句模式 still uses today's red switch.
   - **Recommendation:** the new style for every switch in the sheet.
6. **Easing.**
   - The sheet's `cubic-bezier(.22,.9,.3,1)` and the Agent drawer's `(.22,.8,.24,1)` break the CLAUDE.md rule of one easing curve for the whole app.
   - **Recommendation:** follow the design for these two motions, and write the exception into CLAUDE.md.
7. **Starting a selection on blurred text.**
   - R-13 says blurred text is blank space.
   - **Recommendation:** a long-press starts a selection only on sharp lines. Dragging may extend into blurred lines, which become sharp (the spec: 「选区所在行取消模糊」).
8. **Agent push distance.**
   - Part C1 still says `x = −p·W·0.8`.
   - **Keep the fixed 60 px strip** (commit `440a36e`). It is the same on a phone and stops the page covering the drawer on an iPad.

## 2. Architecture

- **Selection model (engine, `src/core/reader/engine.ts`).**
  - `wordNear(x, y)`: the nearest word using the line table. Choose the line by `|dy|·4 + |dx|`, then use `caretPositionFromPoint` clamped to that line's x range, so no layout reads happen per line.
  - `setSelection(sel | null)`, where `sel = { chapter, from: {para, offset}, to: {para, offset} }`.
  - The selection is drawn as an **overlay layer** of absolutely positioned rectangles: one `Range.getClientRects()` per changed selection, mapped to content coordinates like the droplet layer.
  - The lines themselves are not re-decorated while dragging, so line height never changes and React never renders body text.
  - `paintNow` forces `t = 0` for the lines the selection touches.
- **Gesture controller (`src/views/reader/useTextSelection.ts`, new).** Pointer events on the reader:
  - **Long-press:**
    - a 380 ms timer, cancelled by a move over 8 px (then it is a scroll or swipe);
    - on fire: select the word, an 8 ms haptic (iOS only), and from then on `preventDefault` on `touchmove`, with a non-passive listener so the page does not scroll.
  - **Drag:** `wordNear` → extend, keeping the anchor word fixed.
  - **Handles:** two DOM elements, each with a 28 px hit area, marked `data-noswipe` so the Agent swipe ignores them.
  - **Cancel:** any tap on the page. A left swipe cancels the selection and opens the drawer (useAgentSwipe already handles the swipe).
  - Blocks: `-webkit-touch-callout:none; user-select:none` on `.rd-page`, and `contextmenu` / `selectstart` `preventDefault`.
- **问旁注 button.**
  - Placement is a pure function, `askButtonAt(selTopLine, selBottomLine, centreX, W) → {x, y, below}`.
  - The button is written straight to the DOM; it is hidden while a drag is in progress.
- **Hand-off to the drawer.**
  - `ReaderView` keeps `attachment: { text, chapterLabel } | null`.
  - Tapping 问旁注 clears the selection, sets the attachment, calls `agentSwipe.setOpen(true)` and focuses the input after 460 ms.
- **Agent drawer and service.**
  - **Drawer:** an attachment card, `SELECTION_CHIPS` and the placeholder. Update of the same day (the second handoff): the 当前句 picker moved out of the message list into one slot right above the input, shared with the attachment card (never both); × brings 当前句 back and closing the drawer drops the attachment.
  - **Service:** `AgentService.ask` takes `quote` (the attachment, or else the picked sentence).
  - **Prompt:** `userMessage` says 「所选文字：」 for an attachment and keeps 「所选句：」 otherwise. That is a prompt version bump, and is covered by a unit test.
- **Tap router (`ReaderView.onTap`).** One function, `routeTap(state, x, y) → action`, made pure so it can be unit-tested. The order follows decision 3.

## 3. Tasks (M11) and acceptance

| # | Task | Acceptance |
|---|---|---|
| 0 | Housekeeping (see §5) and owner decisions; CLAUDE.md scope line for select-to-ask; TASKS.md M11 | — |
| 1 | **C4 + C5:** remove `ReaderChrome`; back / 目录 per decision 1; top-30 % tap; `routeTap`; hide the scroll indicator (`.rd-scroll` scrollbar none); sheet radius, padding, 44 %, scrim, easing; long-press and swipe off while the sheet is open | **N-01** No button or indicator on the page. A tap in the top 30 % raises the sheet; tapping outside it or on the handle closes it. You can still get back to the shelf and to the contents (R-10). |
| 2 | **C6 deltas:** row order (聚焦模糊 · 清晰带 · 模糊强度 · 整句模式 · 字号; 预测生词 after them), subtitles 中央清晰，上下渐隐模糊 / 已关闭 · 全文清晰, switch colours, .32 + inert, mask fade 300 ms per decision 4 | **N-02** With 聚焦模糊 off, a screenshot of the page shows no blurred or faded line (pixel check in e2e). |
| 3 | **C1a engine:** `wordNear`, `setSelection`, overlay, unblur the selected lines | **N-03** The nearest word prefers the same line; overlay rectangles match the words' rectangles; the selected lines paint at blur 0 and opacity 1; paint does no layout reads (extend the existing test). |
| 4 | **C1b gestures:** long-press, drag-extend, handles, cancel, no OS menu | **N-04** 380 ms selects one word; a move > 8 px before that scrolls instead; dragging extends word by word; the handles adjust either end; a tap cancels; `contextmenu` and `selectstart` are blocked. |
| 5 | **C2 button:** placement and motion | **N-05** `askButtonAt` unit table: above, below when top < 84, clamped at both edges; hidden while dragging. |
| 6 | **C3 drawer:** attachment card, chips, placeholder, picker state, quote on send, prompt 「所选文字」 | **N-06** 问旁注 → drawer open, card shows the text and 第 N 章, input focused; × removes it (当前句 returns, its sentence centred); closing the drawer drops it; the sent message and DeepSeek body carry the selection; the attachment clears after send. |
| 7 | **iOS check:** on the simulator and an iPad, a long-press shows no edit menu, loupe or callout. Add a native override (a `CAPBridgeViewController` subclass that turns the edit menu off) **only if** CSS is not enough | **N-07** No OS menu on iOS Safari, the home-screen web app or the Capacitor app. |

Order: 0 → 1 → 2 (small, shippable alone) → 3 → 4 → 5 → 6 → 7. Tasks 1–2 can go live before the selection work.

## 4. Risks

- **iOS long-press.**
  - Safari's text loupe and callout can still appear unless `user-select:none` is set on every text node before the touch starts.
  - Selecting has to stop the scroll mid-gesture. iOS ignores a `touch-action` change made during a gesture, so we must call `preventDefault` on `touchmove` from a non-passive listener.
  - Test this on a real device early (task 4), not last.
- **Gestures.** Long-press, tap, scroll and the Agent swipe all start on the same element. The state machine needs one owner (`useTextSelection` decides first, then the swipe, then the tap) and an e2e test for each pair.
- **Performance.** Extending the selection must not drop frames:
  - one `getClientRects` per change of the selected word, not per pointer move;
  - no React render of the page.
- **Drag to the screen edge.** Auto-scroll is not in the spec. In this version the selection is limited to the visible text (see below).

## 5. Housekeeping found while reading

- **The handoff folder.**
  - `design_handoff_focus_reader_mvp 2/` is untracked. In the working tree the old `design/` files show as deleted (not committed).
  - Proposal: copy the new `design/` files and `AGENT_DRAWER.md` / `CHANGES_2026-10-14.md` into the repo's `design/` and a `docs/handoff/` folder, then remove the copy with the space in its name.
  - Do **not** overwrite our `README.md`, `TASKS.md` or `CLAUDE.md`: ours carry M5–M10. Merge the handoff's README changes by hand (the reader chrome lines, the tap priority, the settings sheet).
- **`设计文档 v2` is gone.** It is now Part B of `MVP 设计与范围`. CLAUDE.md's rule "follow `设计文档 v2` §3" needs to become "Part B3".
- **A stale line in Part A2.** It still says a blank tap toggles 「顶部返回栏和底部工具条」. It conflicts with the 「MVP 新增」 notes just below it; follow `CHANGES`.
- **Android.** The handoff mentions Android `ActionMode`. Ignore it: CLAUDE.md says no Android.

## Not in this version

Auto-scroll while dragging a selection; selections across chapters; copy or share of the selection; more than one attachment.

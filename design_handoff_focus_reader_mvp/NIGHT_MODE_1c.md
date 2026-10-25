# Night reading 1c · 夜读聚光 — dev handoff (2026-10-20)

Adds the night theme and auto guided reading (带读) to Reader 4a. Implement **after** `TASKS.md` and `CHANGES_2026-10-14.md` (C1–C6).
This file **lifts** the "night mode 1c / auto guided reading" exclusion in `CLAUDE.md` and README *Out of scope*. Everything else in the scope guard stays.

References:
- Prototype: `design/聚焦阅读 App.dc.html` → turn 1, option **1c** (markup ~L476–541; play loop `loop()` at the end of the logic class).
- Spec: `design/MVP 设计与范围 · 聚焦阅读.dc.html` → **B2** colour table (1c column), **B4** "阅读页 1c".
- Screens: `design/screens/fig-1c-night.png` (guiding), `fig-1c-drawer.png` (word drawer in night).

Where the prototype and B4 disagree, **this file wins** (decisions marked ⚑).

---

## N1 · Theme switch

| | |
|---|---|
| Setting | `theme: 'paper' \| 'night'` in `Settings`, default `'paper'`. |
| Entry | New last row in the settings sheet: `夜读`, subtitle on `暗底 · 当前行着色 · 可带读`, off `纸白`. Same switch component as 聚焦模糊 (C3). Row order: 聚焦模糊 · 清晰带 · 模糊强度 · 整句模式 · 字号 · **夜读**. |
| Switch motion | Page background + ink cross-fade 300ms, `cubic-bezier(.42,0,.58,1)`. No reflow: font, size, line height, padding identical except horizontal padding (below). |
| Scope ⚑ | Reader only. Home/shelf stay paper in MVP. |

## N2 · Night tokens (reader)

| Role | Value |
|---|---|
| Page bg | `#0e0e10` |
| Body ink | `#f2ede4` |
| Secondary text | `#f2ede4` 60% |
| Chapter eyebrow | `#f2ede4` 32–38%, same position/size as 4a (top 56px, IBM Plex Sans 11px, `.14em`) |
| Accent (focus line, tapped word, drawer headword) | `#ffb4b4` |
| Tapped-word background | `#ffb4b4` 20% |
| Footnote (9px) | `rgba(242,237,228,.6)`, spec otherwise identical to 4a (R-06 holds) |
| Hairline | `#fff` 8% |
| Reader padding | `45% 32px` (4a is 34px) |
| Body text | Newsreader 18.5px / 34px line height, `.005em` (prototype values) |
| Vignette | full-screen overlay, `pointer-events:none`: `radial-gradient(120% 34% at 50% 50%, rgba(14,14,16,0) 38%, rgba(14,14,16,.78) 100%)`. Replaces the 4a top/bottom fade masks. Hidden when `blurOn = false`. |

**Drawer in night ⚑** — same mechanism, timings and notches as 4a, prototype material:
- background `#2a2630`, 45° stripes `rgba(255,255,255,.03) 0 2px, rgba(0,0,0,.035) 2px 4px`, vertical gradient `#332e3b → #221f2a`;
- shadow `inset 0 10px 14px -9px rgba(0,0,0,.85), inset 0 -10px 14px -9px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.07), 0 1px 0 rgba(255,255,255,.14)`;
- notch strips use page colour `#0e0e10`, `drop-shadow(0 1px 0 rgba(255,255,255,.18)) drop-shadow(0 2px 2px rgba(0,0,0,.9))`;
- headword `#ffb4b4` Newsreader 18/500; phonetic 11px 45%; def IBM Plex 13/20 82%; example italic 13/19 45%;
- Save button gradient `#3b3640 → #26222b`. (Examples + pronunciation stay hidden per scope.)

Settings sheet in night: keep its leather surface; no change.

## N3 · Focus band in night

Same formula as R-01 with two changes:
```
opacity = 1 − 0.92·t          // 4a: 1 − 0.85·t
blurMax default = 9px         // only when the user hasn't set blurMax
```
Accent colouring:
- **Not guiding:** lines with `t = 0` get `color:#ffb4b4`; others `#f2ede4`. Transition `color 240ms`.
- **Guiding:** only lines of the **current sentence** get the accent (see N4). Other lines inside the band stay `#f2ede4`.
- Colour is written by the reader engine with the filter/opacity pass (same "write only on change" rule). No React re-render.

`blurOn = false` → no blur, no vignette, no accent while not guiding; guiding still colours the current sentence.

## N4 · Auto guided reading (带读)

Night theme only. ⚑ Sentence-stepped (B4), not the prototype's continuous scroll — the prototype's `0.55px/frame × speed` is a visual stand-in.

| | |
|---|---|
| State | `guide: { playing: boolean, sentence: SentenceId }`, speed in `Settings.guideSpeed ∈ {0.6, 1, 1.6}`, default `1`. |
| Start | Play → current sentence = first sentence whose lines intersect the band centre (same anchor as R-07). |
| Dwell | `dwell = max(1200, words × 60000 / (200 × speed))` ms → ≈120 / 200 / 320 wpm. |
| Advance | After dwell: smooth-scroll so the next sentence's vertical centre sits at the viewport centre. 600ms, `cubic-bezier(.42,0,.58,1)`. Then start its dwell. |
| Depth | While guiding, lines **not** in the current sentence get `t = min(1, t + 0.18)`; current sentence lines forced `t = 0` (reuse `sentenceMode` path in `paintFocusBand`). |
| Chapter end | Stop at the last sentence of the chapter, set paused. Don't auto-turn chapters. |
| Pause on | any touch on the page; word drawer / settings sheet / Agent drawer open; text selection; app backgrounded; theme switched to paper. |
| Resume | Play button only. Never auto-resume. |
| Position | Saving `Position` continues as normal (1s debounce on the anchor). |

## N5 · Guide control bar

Floating capsule — the one exception to "no persistent buttons", night theme only.

| | |
|---|---|
| Frame | `left/right 24px, bottom 52px` (+ safe-area), height 46, radius 23, `rgba(255,255,255,.07)`, `backdrop-filter: blur(18px)`, border `1px rgba(255,255,255,.09)`, padding `0 8px 0 6px`. |
| Play | 34px circle (hit area 44). Paused: bg `rgba(255,255,255,.12)`, glyph `#f2ede4`. Playing: bg `#f2ede4`, glyph `#0e0e10`. Glyphs: SVG play / pause, not text characters. |
| Progress | 2px track `rgba(255,255,255,.14)`, fill `rgba(242,237,228,.8)`, margin `0 12px`; chapter progress, same source as the eyebrow %. Not draggable in MVP. |
| Speed | `0.6×` `1×` `1.6×`, 11px, padding `5px 9px`, radius 13, gap 4 (hit area 44 tall). Selected: bg `rgba(242,237,228,.92)`, text `#0e0e10`; others transparent, `rgba(242,237,228,.55)`. Change applies from the next dwell. |
| Visibility ⚑ | Shown while paused. While playing it fades to opacity 0 after 3s (400ms) and ignores input; the first touch on the page pauses (N4) and brings it back. |
| Tap arbitration | Bar taps are consumed by the bar and never reach the reader's tap rules. |

## N6 · Settings & data

`Settings` gains: `theme`, `guideSpeed`. No schema change elsewhere.
Settings store pushes `theme` straight to the reader engine (token swap + repaint), same path as `blurOn`.

## N7 · Low-end tier

`tier = 'low'`: no per-line blur (README fallback). Keep opacity, accent colour and vignette. Guided reading works unchanged.

---

## Acceptance

| ID | Check |
|---|---|
| N-01 | Toggling 夜读 changes no line's y position (same test as R-06). |
| N-02 | Night opacity at `t = 1` is 0.08 ± 0.005; blurMax defaults to 9px. |
| N-03 | Not guiding: exactly the `t = 0` lines are `#ffb4b4`. Guiding: exactly the current sentence's lines. |
| N-04 | At 1×, a 20-word sentence dwells 6000ms ± 50; at 1.6× 3750ms; min dwell 1200ms. |
| N-05 | Every pause trigger in N4 stops advancing within one frame; nothing resumes without Play. |
| N-06 | Guiding stops at chapter end, paused. |
| N-07 | Guiding at 1.6× holds 60fps on the mid-range test device; scroll animations don't stack. |
| N-08 | Bar controls ≥ 44px hit area; speed labels and paused glyph meet 4.5:1 on `#0e0e10`. |
| N-09 | Word drawer in night matches `fig-1c-drawer.png`; open/close timings identical to 4a. |
| N-10 | `theme` and `guideSpeed` persist across app kill. |

## Reference sketch (TS)

```ts
export const SPEEDS = [0.6, 1, 1.6] as const;
export const dwellMs = (words: number, speed: number) =>
  Math.max(1200, (words * 60000) / (200 * speed));

export function nightOpacity(t: number) { return 1 - 0.92 * t; }

// guide loop — owned by core/reader, not React
export function startGuide(r: ReaderEngine, s: Settings) {
  let timer = 0;
  const step = (id: SentenceId) => {
    r.setCurrentSentence(id);              // drives t-forcing + accent in the paint pass
    timer = window.setTimeout(() => {
      const next = r.nextSentence(id);
      if (!next) return r.pauseGuide();    // chapter end
      r.scrollSentenceToCentre(next, 600).then(() => step(next));
    }, dwellMs(r.wordCount(id), s.guideSpeed));
  };
  step(r.sentenceAtCentre());
  return () => clearTimeout(timer);         // call on every pause trigger
}
```

## Open (decide before shipping)
1. Should home/shelf follow the night theme? (Default here: no.)
2. Auto-switch to night by system dark mode or time of day? (Default: manual only.)
3. Should a word tap during guiding open the drawer immediately, or only pause on first tap? (Default: first touch pauses **and** normal tap rules run.)

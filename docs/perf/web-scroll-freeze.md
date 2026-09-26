# Mobile web scroll freezes (2026-09-26)

**Symptom.** iPhone 13 Pro, Safari: scrolling the reader dropped to about 4 fps at its worst, the same in the `full` and `fallback` tiers.

**Cause.** When the reader crossed into a new chapter, the engine laid out the next chapter ±1 in one go at the scroll pause: every word measured with a Range, then every line's `offsetTop` read. That work is proportional to the chapter's length and has nothing to do with blur, which is why both tiers froze the same.

Measured in WebKit, desktop Mac, reading pattern (swipe, pause, swipe):

| Book | Layout of the new chapter | Worst freeze |
|---|---|---|
| *Gatsby* ch. III (892 lines) | 124 ms | 147 ms |
| *Farewell* ch. IV (273 lines) | 56 ms | 77 ms |

A phone is slower still at this work, which is consistent with the 4 fps reading.

**Ruled out.**
- Per-frame JavaScript: about 0.3 ms per frame even with the CPU throttled 4×.
- Blur and compositing: no difference between tiers.
- Saving the web database: no freeze with a scroll-pause pattern in Chromium.

**Fix.**
1. `ChapterLayout` lays a chapter out a few paragraphs at a time, and the engine prepares missing neighbours in 5 ms slices in the background. At a scroll pause it only attaches finished chapters; it never lays one out there. Opening a book, font changes and contents jumps still lay out immediately.
2. Line positions are counted (every row is one line-height tall) instead of read with `offsetTop`, so attaching a chapter no longer forces a layout of it.
3. Chapter blocks use `content-visibility: auto` with their exact `contain-intrinsic-size`, so off-screen chapters are not rendered.

**After.** Worst freeze in the same runs: *Gatsby* 25 ms, *Farewell* 23 ms, none over 100 ms.

**Regression test.** `tests/browser/engine.test.ts`, "R-01: crossing into a long chapter never blocks a frame": in WebKit and Chromium, the worst frame must stay under 40 ms. It measured 198 ms before the fix.

**On a device.** Open `?dev=1`. The readout now shows the worst frame of each half-second (`worst Nms`).

**Confirmed on device (2026-09-26).** iPhone 13 Pro, Safari: scrolling is smooth after the fix.

**Side effect, fixed in 01c6205.** `content-visibility: auto` on `.rd-chapter` implies paint containment, which clipped the drawer's full-bleed margins. The chapter holding an open drawer now opts out until the drawer closes.

# 夜读 1c and 带读 (auto guided reading) — decisions and status

Handoff: `docs/handoff/2026-10-20/NIGHT_MODE_1c.md` (tasks N1–N7), screens `design/screens/fig-1c-night.png` and `fig-1c-drawer.png`.
Status: **built** (2026-10-20). TASKS.md → M12.

## Acceptance IDs

The handoff's N-01…N-10 collide with M11's N-01…N-07 (select-to-ask), so here they are **NM-01…NM-10**, same numbers and checks.

## Owner decisions (2026-10-20)

| Handoff says | Decision |
|---|---|
| N1: a 夜读 row last in the settings sheet; reader only, Home stays paper | **The Home capsule (纸白 / 夜读) stays the only switch, and it changes the whole app** (as since TASKS → 29). No row in the settings sheet. |
| N1: the row in the C3/C6 switch style | Moot (no row). The sheet keeps its MVP look (2026-10-15). |
| N2: padding `45% 32px`, Newsreader 18.5px | **Layout unchanged** (34 px sides, the reader's own font size): 夜读 changes colours only, so NM-01 (no line moves) holds. |
| N5: the bar at bottom 52 px; the 目录 · Aa capsule at 22 px overlaps it | **The bar steps aside while the top bar and capsule are up**; it comes back when they hide. |
| Open 3: a word tap while guiding | Handoff default: the first touch pauses **and** the normal tap rules run. |
| Open 1, 2 | Home follows the theme (decision above); manual switch only. |

## Notes on the build

- Accent `#ffb4b4` is `--reader-accent` (night only; in 纸白 it is the plain ink and the engine never writes it). The engine writes `style.color` with filter and opacity, only on change.
- Not guiding: the accent marks the lines with t = 0 (after the sentence-mode penalty), never headings; none while 聚焦模糊 is off. Guiding: only the lit sentence, sharp wherever it is; every other line t + 0.18.
- 9 px night blur applies until the reader moves 模糊强度 (`blurMaxSet`); the slider shows the blur in effect.
- The vignette replaces the fade masks while 聚焦模糊 is on; with it off the 4a thin strips stay.
- Speed buttons are 44 × 44 (the handoff asks 44 tall): the pills keep the design size; the space between them grows a little.
- Pause triggers: any pointer down or wheel on the reader shell outside the bar, a sheet or the Agent drawer, `visibilitychange` hidden, the theme leaving 夜读, leaving the reader. The selection and word drawers start with a touch, so they pause too.
- `tier = 'fallback'` (the handoff's `low`): no per-line blur; opacity, accent and vignette as usual (N7).

## Not verified here

- NM-07 asks for 60 fps at 1.6× on the mid-range test device. Checked: one rAF animation at a time, no layout reads while painting during a step (browser test), 60 fps in the dev FPS meter on a Mac. A real-device check is still due.

/** Focus-band maths from README → Interactions → Focus band (R-01). Pure; no DOM. */
export interface Band { half: number; ramp: number }

export const SENTENCE_PENALTY = 0.18;

export function bandFor(viewportH: number, focusPct: number): Band {
  const pct = Math.min(90, Math.max(10, focusPct));
  const half = (viewportH * pct) / 200;
  return { half, ramp: Math.max(1, viewportH / 2 - half) };
}

export function tFor(distance: number, band: Band): number {
  return Math.min(1, Math.max(0, (distance - band.half) / band.ramp));
}

export function withSentencePenalty(t: number): number {
  return Math.min(1, t + SENTENCE_PENALTY);
}

export function blurPx(t: number, blurMax: number): number {
  return Math.round(blurMax * t * 2) / 2;
}

/** Line opacity at depth t: 4a fades to .15; 夜读 (1c) fades further, to .08 (NIGHT_MODE_1c.md → N3). */
export function opacityFor(t: number, night = false): number {
  return Math.round((1 - (night ? 0.92 : 0.85) * t) * 100) / 100;
}

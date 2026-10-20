/** The single easing curve for the whole app. */
export const EASE = 'cubic-bezier(.42,0,.58,1)';

/** Durations in ms, from README → Motion. */
export const MOTION = {
  drawerOpen: 330, drawerClose: 250, contentIn: 250, contentOut: 138,
  bookOut: 220, bookExpand: 460, coverFade: 300, pageFade: 320, bookBack: 300, chrome: 220,
} as const;

/**
 * The same curve as EASE, as a function of progress (for motion the code drives itself, e.g. the
 * 带读 scroll): x(u) is solved for u by Newton steps, then y(u) is returned.
 */
export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = [0.42, 0, 0.58, 1];
  const bx = (u: number) => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3;
  const dx = (u: number) => 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u * u;
  let u = t;
  for (let k = 0; k < 8; k++) {
    const d = dx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= (bx(u) - t) / d;
  }
  u = Math.min(1, Math.max(0, u));
  return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
}

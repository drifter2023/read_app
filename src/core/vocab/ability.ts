/** One piece of evidence about the reader: a word's difficulty and whether they knew it. */
export interface Evidence { d: number; unknown: boolean; weight: number }

/** A CET-6 reader: difficulty 0 is where they know half the words (docs/plans/2026-09-30-predicted-words.md). */
export const PRIOR = { mean: 0, sd: 1 };

/** Chance the reader does not know a word of difficulty `d` (P-02). */
export function pUnknown(d: number, theta: number): number {
  return 1 / (1 + Math.exp(theta - d));
}

/**
 * The reader's ability θ: the MAP estimate of P(unknown) = σ(d − θ) under a normal prior, by Newton's
 * method (the log posterior is concave, so it converges in a few steps).
 */
export function estimateAbility(evidence: readonly Evidence[], prior = PRIOR): number {
  let theta = prior.mean;
  const precision = 1 / (prior.sd * prior.sd);
  for (let step = 0; step < 30; step++) {
    let g = -(theta - prior.mean) * precision;
    let h = -precision;
    for (const e of evidence) {
      const p = pUnknown(e.d, theta);
      g += e.weight * (p - (e.unknown ? 1 : 0));
      h -= e.weight * p * (1 - p);
    }
    const next = Math.max(-6, Math.min(6, theta - g / h));
    if (Math.abs(next - theta) < 1e-6) return next;
    theta = next;
  }
  return theta;
}

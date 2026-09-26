import { describe, expect, it } from 'vitest';
import { decideTier, summarise } from '../../src/core/reader/probe.ts';

describe('probe decisions (R-01)', () => {
  it('counts frames longer than 1.5 × the median as dropped (works at 60 and 120 Hz)', () => {
    expect(summarise([16.7, 16.6, 16.7, 40, 16.7], [1, 1, 1, 1, 1])).toMatchObject({ frames: 5, dropped: 1, ratio: 0.2 });
    expect(summarise([8.3, 8.4, 8.3, 8.3], [])).toMatchObject({ dropped: 0, ratio: 0 });
  });
  it('keeps full blur only under 2% drops and a 4ms paint budget', () => {
    expect(decideTier({ frames: 100, dropped: 1, ratio: 0.01, avgPaintMs: 2 })).toBe('full');
    expect(decideTier({ frames: 100, dropped: 2, ratio: 0.02, avgPaintMs: 2 })).toBe('fallback');
    expect(decideTier({ frames: 100, dropped: 0, ratio: 0, avgPaintMs: 4.5 })).toBe('fallback');
  });
  it('treats an empty run as a failure', () => expect(decideTier(summarise([], []))).toBe('fallback'));
});

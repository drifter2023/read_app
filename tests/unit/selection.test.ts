import { describe, expect, it } from 'vitest';
import { askButtonAt, spanOf } from '../../src/core/reader/selection.ts';

describe('spanOf (N-04)', () => {
  const a = { para: 3, start: 10, end: 15 };
  it('runs from the fixed word to the dragged word, whichever comes first', () => {
    expect(spanOf(2, a, { para: 3, start: 20, end: 24 })).toEqual({ chapter: 2, from: { para: 3, at: 10 }, to: { para: 3, at: 24 } });
    expect(spanOf(2, a, { para: 3, start: 1, end: 4 })).toEqual({ chapter: 2, from: { para: 3, at: 1 }, to: { para: 3, at: 15 } });
    expect(spanOf(2, a, { para: 1, start: 30, end: 33 })).toEqual({ chapter: 2, from: { para: 1, at: 30 }, to: { para: 3, at: 15 } });
    expect(spanOf(2, a, a)).toEqual({ chapter: 2, from: { para: 3, at: 10 }, to: { para: 3, at: 15 } });
  });
});

describe('askButtonAt (N-05)', () => {
  const W = 402;
  it('sits 56 px above the selection, centred on it', () => {
    expect(askButtonAt({ top: 300, bottom: 334, left: 100, right: 200 }, W)).toEqual({ x: 150, y: 244, below: false });
  });
  it('goes 20 px below the bottom line when the selection top is within 84 px of the page top', () => {
    expect(askButtonAt({ top: 83, bottom: 150, left: 100, right: 200 }, W)).toEqual({ x: 150, y: 170, below: true });
    expect(askButtonAt({ top: 84, bottom: 150, left: 100, right: 200 }, W).below).toBe(false);
  });
  it('is clamped to [72, W − 72]', () => {
    expect(askButtonAt({ top: 300, bottom: 334, left: 34, right: 60 }, W).x).toBe(72);
    expect(askButtonAt({ top: 300, bottom: 334, left: 340, right: 368 }, W).x).toBe(330);
  });
});

import { describe, expect, it } from 'vitest';
import { bandFor, blurPx, opacityFor, tFor, withSentencePenalty } from '../../src/core/reader/focus.ts';

describe('R-01 focus band formula', () => {
  it('half = H*pct/200 and ramp = H/2 - half', () => expect(bandFor(800, 30)).toEqual({ half: 120, ramp: 280 }));
  it('clamps focusPct to 10–90 at runtime', () => {
    expect(bandFor(800, 5).half).toBe(40);
    expect(bandFor(800, 95).half).toBe(360);
  });
  it('ramp is at least 1px', () => expect(bandFor(1, 90).ramp).toBe(1));
  it('t is 0 inside the band, linear on the ramp, 1 beyond', () => {
    const b = bandFor(800, 30);
    expect(tFor(0, b)).toBe(0);
    expect(tFor(120, b)).toBe(0);
    expect(tFor(260, b)).toBeCloseTo(0.5, 10);
    expect(tFor(400, b)).toBe(1);
    expect(tFor(2000, b)).toBe(1);
  });
  it('sentence mode adds 0.18, capped at 1', () => {
    expect(withSentencePenalty(0)).toBeCloseTo(0.18, 10);
    expect(withSentencePenalty(0.95)).toBe(1);
  });
  it('blur is blurMax*t quantised to 0.5px', () => {
    expect(blurPx(0, 7)).toBe(0);
    expect(blurPx(0.52, 7)).toBe(3.5);
    expect(blurPx(0.55, 7)).toBe(4);
    expect(blurPx(1, 7)).toBe(7);
  });
  it('opacity is 1 - 0.85t rounded to 0.01', () => {
    expect(opacityFor(0)).toBe(1);
    expect(opacityFor(0.2)).toBe(0.83);
    expect(opacityFor(1)).toBe(0.15);
  });
});

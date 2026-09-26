import { describe, expect, it } from 'vitest';
import { dateEyebrow, finishedLabel, minutesLeft } from '../../src/core/library/format.ts';

describe('home formatting (H-01)', () => {
  it('minutes left = remaining words ÷ 230, rounded up', () => {
    expect(minutesLeft(23000, 0)).toBe(100);
    expect(minutesLeft(23000, 50)).toBe(50);
    expect(minutesLeft(1000, 99)).toBe(1);
    expect(minutesLeft(1000, 100)).toBe(0);
  });
  it('date eyebrow and finish date', () => {
    expect(dateEyebrow(new Date(2026, 8, 22))).toBe('TUE · 9月22日');
    expect(finishedLabel(new Date(2026, 8, 26).getTime())).toBe('9月26日读完');
  });
});

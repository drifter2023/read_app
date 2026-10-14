import { describe, expect, it } from 'vitest';
import { routeTap } from '../../src/core/reader/tap.ts';

const base = { selection: false, sheet: false, drawer: false, pageTop: 0, pageH: 800 };

describe('routeTap (N-01)', () => {
  it('follows the order selection → sheet → drawer → top 30 % → word', () => {
    expect(routeTap({ ...base, selection: true, sheet: true, drawer: true, y: 10 })).toBe('clear-selection');
    expect(routeTap({ ...base, sheet: true, drawer: true, y: 10 })).toBe('close-sheet');
    expect(routeTap({ ...base, drawer: true, y: 10 })).toBe('drawer');
    expect(routeTap({ ...base, y: 10 })).toBe('menu');
    expect(routeTap({ ...base, y: 400 })).toBe('lookup');
  });

  it('the menu zone is the top 30 % of the page, measured from its top edge', () => {
    expect(routeTap({ ...base, y: 239 })).toBe('menu');
    expect(routeTap({ ...base, y: 240 })).toBe('lookup');
    expect(routeTap({ ...base, pageTop: 100, y: 330 })).toBe('menu');
    expect(routeTap({ ...base, pageTop: 100, y: 340 })).toBe('lookup');
  });
});

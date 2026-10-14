import { describe, expect, it } from 'vitest';
import { routeTap } from '../../src/core/reader/tap.ts';

const base = { selection: false, sheet: false, drawer: false, pageTop: 0, menuH: 91 };

describe('routeTap (N-01)', () => {
  it('follows the order selection → sheet → drawer → title area → word', () => {
    expect(routeTap({ ...base, selection: true, sheet: true, drawer: true, y: 10 })).toBe('clear-selection');
    expect(routeTap({ ...base, sheet: true, drawer: true, y: 10 })).toBe('close-sheet');
    expect(routeTap({ ...base, drawer: true, y: 10 })).toBe('drawer');
    expect(routeTap({ ...base, y: 10 })).toBe('menu');
    expect(routeTap({ ...base, y: 400 })).toBe('lookup');
  });

  it('the title area is menuH tall, measured from the top edge of the page', () => {
    expect(routeTap({ ...base, y: 90 })).toBe('menu');
    expect(routeTap({ ...base, y: 91 })).toBe('lookup');
    expect(routeTap({ ...base, y: 200 })).toBe('lookup'); // the old 30 % zone no longer counts
    expect(routeTap({ ...base, pageTop: 100, y: 190 })).toBe('menu');
    expect(routeTap({ ...base, pageTop: 100, y: 191 })).toBe('lookup');
  });
});

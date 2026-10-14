import { describe, expect, it } from 'vitest';
import { nearestWord } from '../../src/core/reader/words.ts';

describe('nearestWord (N-03)', () => {
  const t = ' The boats came back, one by one.';
  it('returns the word containing the offset', () => {
    expect(nearestWord(t, 6)).toEqual([5, 10]);
  });
  it('picks the closest word from a space or punctuation, ties to the left', () => {
    expect(nearestWord(t, 4)).toEqual([1, 4]); // the space after "The": 1 to the left, 1 to the right
    expect(nearestWord(t, 20)).toEqual([16, 20]); // the comma after "back"
    expect(nearestWord(t, 0)).toEqual([1, 4]);
  });
  it('stays inside [lo, hi)', () => {
    expect(nearestWord(t, 2, 11, 21)).toEqual([11, 15]);
    expect(nearestWord(t, 30, 11, 21)).toEqual([16, 20]);
    expect(nearestWord('  ,  ', 2)).toBeNull();
  });
});

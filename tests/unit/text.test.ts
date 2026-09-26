import { describe, expect, it } from 'vitest';
import { countWords, INDENT, normaliseText, paragraphText, sentenceStarts, splitSentences } from '../../src/core/ingest/text.ts';

describe('normaliseText', () => {
  it('collapses whitespace and trims', () => expect(normaliseText('  a\n\t b  ')).toBe('a b'));
  it('keeps no-break spaces', () => expect(normaliseText('Mr. Spade')).toBe('Mr. Spade'));
  it('turns Standard Ebooks U+FEFF into a word joiner', () => expect(normaliseText('down﻿—from')).toBe('down⁠—from'));
});

describe('splitSentences', () => {
  const p = '“Whenever you feel like criticizing anyone,” he told me, “just remember.” Mr. Gatsby said so. Then St. Louis was far. J. B. Smith came. He said: “Yes, sweetheart?” She left!';
  const s = splitSentences(p);
  it('merges splits after abbreviations and initials', () =>
    expect(s).toEqual([
      '“Whenever you feel like criticizing anyone,” he told me, “just remember.”',
      'Mr. Gatsby said so.',
      'Then St. Louis was far.',
      'J. B. Smith came.',
      'He said: “Yes, sweetheart?”',
      'She left!',
    ]));
  it('joins back to the input', () => expect(s.join(' ')).toBe(p));
  it('returns [] for empty text', () => expect(splitSentences('')).toEqual([]));
});

describe('countWords', () => {
  it('counts contractions and hyphenated words once', () => expect(countWords("I’ve a well-known v-shaped jaw, don't you?")).toBe(7));
  it('ignores punctuation-only tokens', () => expect(countWords('— … “ ”')).toBe(0));
});

describe('paragraph offsets', () => {
  it('opens with an em-space and records sentence starts', () => {
    const p = ['One two.', 'Three.'];
    expect(paragraphText(p)).toBe(`${INDENT}One two. Three.`);
    expect(sentenceStarts(p)).toEqual([1, 10]);
  });
});

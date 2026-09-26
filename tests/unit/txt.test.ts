import { describe, expect, it } from 'vitest';
import { parseTxt, TxtError } from '../../src/core/ingest/txt.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('parseTxt (H-03)', () => {
  it('splits chapters at headings and joins hard-wrapped paragraph lines', () => {
    const b = parseTxt(enc('CHAPTER I\n\nIt was a bright\ncold day. The clocks\nwere striking.\n\nHe went in.\n\nCHAPTER II\n\nNext day it rained.\n'), 'x', 'My Book.txt');
    expect(b.title).toBe('My Book');
    expect(b.chapters.map((c) => c.title)).toEqual(['CHAPTER I', 'CHAPTER II']);
    expect(b.chapters[0]!.paras).toEqual([['It was a bright cold day.', 'The clocks were striking.'], ['He went in.']]);
    expect(b.wordCount).toBe(17);
  });

  it('reads Project Gutenberg metadata and drops the licence header and footer', () => {
    const src = 'Title: The Test\nAuthor: Jane Roe\n\n*** START OF THE PROJECT GUTENBERG EBOOK THE TEST ***\n\nChapter 1\n\nHello there.\n\n*** END OF THE PROJECT GUTENBERG EBOOK THE TEST ***\n\nLicence text here.';
    const b = parseTxt(enc(src), 'x', 'pg123.txt');
    expect(b).toMatchObject({ title: 'The Test', author: 'Jane Roe' });
    expect(b.chapters).toHaveLength(1);
    expect(JSON.stringify(b)).not.toContain('Licence');
  });

  it('treats every line as a paragraph when there are no blank lines', () => {
    const b = parseTxt(enc('One line.\nTwo line.\nThree line.'), 'x', 'a.txt');
    expect(b.chapters[0]!.paras).toEqual([['One line.'], ['Two line.'], ['Three line.']]);
    expect(b.chapters[0]!.title).toBe('a');
  });

  it('cuts a long book with no headings into sections', () => {
    const para = Array.from({ length: 100 }, () => 'word').join(' ') + '.';
    const b = parseTxt(enc(Array.from({ length: 80 }, () => para).join('\n\n')), 'x', 'long.txt');
    expect(b.chapters.length).toBeGreaterThan(2);
    expect(b.chapters[1]!.title).toBe('Section 2');
    expect(b.wordCount).toBe(8000);
  });

  it('explains non-UTF-8 and empty files in plain language', () => {
    expect(() => parseTxt(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]), 'x', 'gbk.txt')).toThrow(TxtError);
    expect(() => parseTxt(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]), 'x', 'gbk.txt')).toThrow(/UTF-8/);
    expect(() => parseTxt(enc('\n\n  \n'), 'x', 'e.txt')).toThrow(/空/);
  });
});

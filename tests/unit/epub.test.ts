import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEpub } from '../../src/core/ingest/epub.ts';

const load = (f: string) => parseEpub(readFileSync(`books/${f}`), 'x');

describe('parseEpub (Standard Ebooks)', () => {
  it('reads The Great Gatsby body chapters only', async () => {
    const b = await load('f-scott-fitzgerald_the-great-gatsby.epub');
    expect(b.title).toBe('The Great Gatsby');
    expect(b.author).toBe('F. Scott Fitzgerald');
    expect(b.chapters).toHaveLength(9);
    expect(b.chapters[0]!.title).toBe('Chapter I');
    expect(b.chapters[0]!.paras[0]![0]).toMatch(/^In my younger and more vulnerable years/);
    expect(b.wordCount).toBeGreaterThan(45_000);
    expect(b.wordCount).toBeLessThan(50_000);
  });

  it('reads chapter subtitles (The Maltese Falcon)', async () => {
    const b = await load('dashiell-hammett_the-maltese-falcon.epub');
    expect(b.chapters).toHaveLength(20);
    expect(b.chapters[0]!.title).toBe('Chapter I · Spade\u00a0& Archer') // Standard Ebooks binds “&” with a no-break space;
  });

  it('skips part pages without paragraphs (A Farewell to Arms)', async () => {
    const b = await load('ernest-hemingway_a-farewell-to-arms.epub');
    expect(b.chapters).toHaveLength(41);
    expect(b.wordCount).toBeGreaterThan(80_000);
    expect(b.wordCount).toBeLessThan(92_000);
  });

  it('leaves no U+FEFF and no empty sentences', async () => {
    const b = await load('dashiell-hammett_the-maltese-falcon.epub');
    const json = JSON.stringify(b);
    expect(json).not.toContain('﻿');
    for (const c of b.chapters) for (const p of c.paras) for (const s of p) expect(s.trim().length).toBeGreaterThan(0);
  });

  it('rejects a file that is not an EPUB with a readable reason', async () => {
    await expect(parseEpub(new TextEncoder().encode('hello'), 'x')).rejects.toThrow(/EPUB/);
  });
});

describe('parseEpub cover', () => {
  it('extracts the declared cover image', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parseEpub } = await import('../../src/core/ingest/epub.ts');
    const b = await parseEpub(await readFile('books/f-scott-fitzgerald_the-great-gatsby.epub'), 'gatsby');
    expect(b.coverImage?.mime).toBe('image/jpeg');
    expect(b.coverImage!.bytes.length).toBeGreaterThan(10000);
  });
});

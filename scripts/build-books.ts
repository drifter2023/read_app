// Converts bundled EPUBs to public/books/<id>.json and their covers to public/covers/<id>.jpg
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEpub } from '../src/core/ingest/epub.ts';
import { BUNDLED } from '../src/core/library/bundled.ts';

/** Covers are shown at 46 × 64 on the shelf and briefly full-screen in the open-book flight. */
const COVER_WIDTH = 480;

await mkdir('public/books', { recursive: true });
await mkdir('public/covers', { recursive: true });
for (const b of BUNDLED) {
  const { coverImage, ...book } = await parseEpub(await readFile(b.epub), b.id);
  if (coverImage) {
    const out = `public/covers/${b.id}.jpg`;
    await writeFile(out, coverImage.bytes);
    try {
      // macOS: shrink the JPEG so the app bundle stays small. Elsewhere the original is kept.
      execFileSync('sips', ['--resampleWidth', String(COVER_WIDTH), '-s', 'formatOptions', '70', out], { stdio: 'ignore' });
    } catch { /* sips missing: keep the full-size cover */ }
    book.cover = `covers/${b.id}.jpg`;
  }
  await writeFile(`public/books/${b.id}.json`, JSON.stringify(book));
  console.log(`${b.id}: ${book.chapters.length} chapters, ${book.wordCount} words${coverImage ? ', cover' : ''}`);
}

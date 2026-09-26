// Converts bundled EPUBs to public/books/<id>.json
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEpub } from '../src/core/ingest/epub.ts';
import { BUNDLED } from '../src/core/library/bundled.ts';

await mkdir('public/books', { recursive: true });
for (const b of BUNDLED) {
  const book = await parseEpub(await readFile(b.epub), b.id);
  await writeFile(`public/books/${b.id}.json`, JSON.stringify(book));
  console.log(`${b.id}: ${book.chapters.length} chapters, ${book.wordCount} words`);
}

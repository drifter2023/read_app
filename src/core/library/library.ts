import type { Db } from '../db/types.ts';
import type { ChapterData, ParsedBook } from '../types.ts';

export interface BookRow {
  id: string; title: string; author: string; cover: string | null; color: number; format: 'epub' | 'txt';
  wordCount: number; status: 'reading' | 'done'; pct: number; addedAt: number; openedAt: number | null; finishedAt: number | null;
}

const BOOK_COLS = `id, title, author, cover, color, format, word_count AS wordCount, status, pct,
  added_at AS addedAt, opened_at AS openedAt, finished_at AS finishedAt`;

/** FNV-1a over UTF-16 code units → index into the 8-colour cover palette. */
export function colorIndex(title: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 8;
}

export async function saveParsedBook(db: Db, book: ParsedBook, format: 'epub' | 'txt', now: number): Promise<void> {
  await db.tx(async () => {
    await db.run(
      'INSERT INTO book (id, title, author, cover, color, format, word_count, added_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
      [book.id, book.title, book.author, colorIndex(book.title), format, book.wordCount, now],
    );
    let wordStart = 0;
    for (const [idx, ch] of book.chapters.entries()) {
      await db.run('INSERT INTO chapter (book_id, idx, title, paras, word_start) VALUES (?, ?, ?, ?, ?)',
        [book.id, idx, ch.title, JSON.stringify(ch.paras), wordStart]);
      wordStart += ch.wordCount;
    }
  });
}

/** Inserts bundled books not seeded before. A `seeded:<id>` flag stops a deleted book from coming back. */
export async function seedBundled(db: Db, ids: readonly string[], load: (id: string) => Promise<ParsedBook>, now = Date.now()): Promise<string[]> {
  const added: string[] = [];
  for (const id of ids) {
    const [flag] = await db.all<{ key: string }>('SELECT key FROM settings WHERE key = ?', [`seeded:${id}`]);
    if (flag) continue;
    await saveParsedBook(db, await load(id), 'epub', now);
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [`seeded:${id}`, '1']);
    added.push(id);
  }
  return added;
}

export async function getBook(db: Db, id: string): Promise<BookRow | null> {
  const [row] = await db.all<BookRow>(`SELECT ${BOOK_COLS} FROM book WHERE id = ?`, [id]);
  return row ? { ...row } : null;
}

export async function listBooks(db: Db): Promise<BookRow[]> {
  const rows = await db.all<BookRow>(`SELECT ${BOOK_COLS} FROM book ORDER BY opened_at IS NULL, opened_at DESC, added_at ASC`);
  return rows.map((r) => ({ ...r }));
}

export async function getChapters(db: Db, bookId: string): Promise<ChapterData[]> {
  const rows = await db.all<{ idx: number; title: string; paras: string; wordStart: number }>(
    'SELECT idx, title, paras, word_start AS wordStart FROM chapter WHERE book_id = ? ORDER BY idx', [bookId]);
  return rows.map((r) => ({ idx: r.idx, title: r.title, paras: JSON.parse(r.paras) as string[][], wordStart: r.wordStart }));
}

export async function markOpened(db: Db, id: string, now: number): Promise<void> {
  await db.run('UPDATE book SET opened_at = ? WHERE id = ?', [now, id]);
}

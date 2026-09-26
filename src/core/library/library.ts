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
      'INSERT INTO book (id, title, author, cover, color, format, word_count, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [book.id, book.title, book.author, book.cover ?? null, colorIndex(book.title), format, book.wordCount, now],
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

/** Bundled books seeded before covers existed get their build-time cover (public/covers/<id>.jpg). */
export async function backfillBundledCovers(db: Db, ids: readonly string[]): Promise<void> {
  for (const id of ids) await db.run("UPDATE book SET cover = ? WHERE id = ? AND cover IS NULL AND format = 'epub'", [`covers/${id}.jpg`, id]);
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

/** A shelf row: the book plus where the reader is, for "第 N 章 · 还剩 M 分" and the continue block. */
export interface ShelfBook extends BookRow { chapter: number; chapterTitle: string; chapters: number }

export async function listShelf(db: Db): Promise<ShelfBook[]> {
  const rows = await db.all<ShelfBook>(`
    SELECT b.id, b.title, b.author, b.cover, b.color, b.format, b.word_count AS wordCount, b.status, b.pct,
      b.added_at AS addedAt, b.opened_at AS openedAt, b.finished_at AS finishedAt,
      COALESCE(p.chapter, 0) AS chapter,
      COALESCE((SELECT title FROM chapter c WHERE c.book_id = b.id AND c.idx = COALESCE(p.chapter, 0)), '') AS chapterTitle,
      (SELECT count(*) FROM chapter c WHERE c.book_id = b.id) AS chapters
    FROM book b LEFT JOIN position p ON p.book_id = b.id
    ORDER BY b.opened_at IS NULL, b.opened_at DESC, b.added_at ASC`);
  return rows.map((r) => ({ ...r }));
}

/** H-05: removes the book; chapters, position and Lookup rows go with it (ON DELETE CASCADE). */
export async function deleteBook(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM book WHERE id = ?', [id]);
}

/** Empty-shelf state: put a bundled book back even though it was seeded (and deleted) before. */
export async function restoreBundled(db: Db, book: ParsedBook, now = Date.now()): Promise<void> {
  if (await getBook(db, book.id)) return;
  await saveParsedBook(db, book, 'epub', now);
}

/** An existing book with the same title and author, so importing a file twice opens the first copy. */
export async function findDuplicate(db: Db, title: string, author: string): Promise<string | null> {
  const [row] = await db.all<{ id: string }>('SELECT id FROM book WHERE lower(title) = lower(?) AND lower(author) = lower(?)', [title, author]);
  return row?.id ?? null;
}

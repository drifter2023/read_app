// Story fixtures (Storybook only; never imported by the app). Real text from the bundled Gatsby.
import { migrate } from '../../core/db/migrations.ts';
import { colorIndex, markOpened, saveParsedBook, type ShelfBook } from '../../core/library/library.ts';
import { loadSqlJs } from '../../core/db/sqljs.ts';
import type { Db, SqlValue } from '../../core/db/types.ts';
import { PrefsStore, type Prefs } from '../../core/prefs/prefs.ts';
import type { ChapterData } from '../../core/types.ts';

/** Chapter I's opening, broken into the lines the reader shows on a 402 px phone at size M. */
export const LINES = [
  ' In my younger and more vulnerable years',
  'my father gave me some advice that I’ve',
  'been turning over in my mind ever since.',
  '',
  ' “Whenever you feel like criticizing',
  'anyone,” he told me, “just remember that',
  'all the people in this world haven’t had the',
  'advantages that you’ve had.”',
  '',
  ' He didn’t say any more, but we’ve always',
  'been unusually communicative in a',
  'reserved way, and I understood that he',
  'meant a great deal more than that. In',
  'consequence, I’m inclined to reserve all',
  'judgements, a habit that has opened up',
  'many curious natures to me and also made',
];

export const PARAS: string[][] = [
  ['In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.'],
  ['“Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”'],
  ['He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.', 'In consequence, I’m inclined to reserve all judgements, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.'],
];

export const CHAPTERS: ChapterData[] = ['Chapter I', 'Chapter II', 'Chapter III', 'Chapter IV', 'Chapter V', 'Chapter VI', 'Chapter VII', 'Chapter VIII', 'Chapter IX']
  .map((title, idx) => ({ idx, title, paras: idx === 0 ? PARAS : [['…']], wordStart: idx * 5000 }));

export const BOOK = { id: 'gatsby', title: 'The Great Gatsby', wordCount: 47094, chapters: CHAPTERS };

/** An in-memory user.db (sql.js, never saved), migrated like the app's. */
export async function memDb(): Promise<Db> {
  const SQL = await loadSqlJs();
  const d = new SQL.Database();
  d.run('PRAGMA foreign_keys = ON');
  const db: Db = {
    async exec(sql) { d.exec(sql); },
    async run(sql, params: SqlValue[] = []) { d.run(sql, params); },
    async all<T>(sql: string, params: SqlValue[] = []) {
      const st = d.prepare(sql);
      try { st.bind(params); const rows: T[] = []; while (st.step()) rows.push(st.getAsObject() as T); return rows; } finally { st.free(); }
    },
    async tx(fn) { d.exec('BEGIN'); try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } },
  };
  await migrate(db);
  return db;
}

/** A settings store over a fresh in-memory db, with some values changed from the defaults. */
export async function prefsWith(patch: Partial<Prefs> = {}): Promise<PrefsStore> {
  const store = await PrefsStore.load(await memDb());
  for (const [k, v] of Object.entries(patch)) await store.set(k as keyof Prefs, v as never);
  return store;
}

/** An in-memory user.db that holds the Gatsby fixture as a book (conversations and lookups refer to it). */
export async function bookDb(): Promise<Db> {
  const db = await memDb();
  await saveParsedBook(db, {
    id: BOOK.id, title: BOOK.title, author: 'F. Scott Fitzgerald', wordCount: BOOK.wordCount,
    chapters: CHAPTERS.map((c) => ({ title: c.title, paras: c.paras, wordCount: 5000 })),
  }, 'epub', Date.now());
  return db;
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 1, 0); // fixed, so finished dates read the same in every story

/** Shelf rows as Home lists them. Covers are the bundled ones (Storybook serves public/, like the app). */
export const SHELF: Record<'reading' | 'fresh' | 'done' | 'web', ShelfBook> = {
  reading: {
    id: 'gatsby', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', cover: 'covers/gatsby.jpg', color: colorIndex('The Great Gatsby'),
    format: 'epub', wordCount: 47094, status: 'reading', pct: 23, addedAt: NOW - 9 * DAY, openedAt: NOW - DAY, finishedAt: null,
    chapter: 2, chapterTitle: 'Chapter III', chapters: 9,
  },
  fresh: {
    id: 'farewell', title: 'A Farewell to Arms', author: 'Ernest Hemingway', cover: 'covers/farewell.jpg', color: colorIndex('A Farewell to Arms'),
    format: 'epub', wordCount: 88792, status: 'reading', pct: 0, addedAt: NOW - 9 * DAY, openedAt: null, finishedAt: null,
    chapter: 0, chapterTitle: 'Chapter I', chapters: 41,
  },
  done: {
    id: 'falcon', title: 'The Maltese Falcon', author: 'Dashiell Hammett', cover: 'covers/falcon.jpg', color: colorIndex('The Maltese Falcon'),
    format: 'epub', wordCount: 65062, status: 'done', pct: 100, addedAt: NOW - 30 * DAY, openedAt: NOW - 20 * DAY, finishedAt: NOW - 20 * DAY,
    chapter: 19, chapterTitle: 'XX', chapters: 20,
  },
  web: {
    id: 'web-1', title: 'How to Read a Book Slowly', author: 'aeon.co', cover: null, color: colorIndex('How to Read a Book Slowly'),
    format: 'web', wordCount: 3200, status: 'reading', pct: 0, addedAt: NOW - 2 * DAY, openedAt: null, finishedAt: null,
    chapter: 0, chapterTitle: '', chapters: 1,
  },
};

/** user.db with the shelf above: Gatsby being read (the continue block), the others as listed. */
export async function shelfDb(): Promise<Db> {
  const db = await memDb();
  for (const b of Object.values(SHELF)) {
    await saveParsedBook(db, {
      id: b.id, title: b.title, author: b.author, cover: b.cover, wordCount: b.wordCount,
      chapters: Array.from({ length: b.chapters }, (_, i) => ({ title: i === b.chapter ? b.chapterTitle : `Chapter ${i + 1}`, paras: [['…']], wordCount: Math.round(b.wordCount / b.chapters) })),
    }, b.format, b.addedAt);
    await db.run('UPDATE book SET status = ?, pct = ?, finished_at = ? WHERE id = ?', [b.status, b.pct, b.finishedAt, b.id]);
    if (b.openedAt) await markOpened(db, b.id, b.openedAt);
    if (b.chapter) await db.run('INSERT INTO position (book_id, chapter, para, sentence, updated_at) VALUES (?, ?, 0, 0, ?)', [b.id, b.chapter, NOW]);
  }
  return db;
}

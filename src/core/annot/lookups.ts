import type { Db } from '../db/types.ts';

/** Where a lookup happened: sentence-level anchor plus the word's offset in the paragraph text. */
export interface LookupLoc { chapter: number; para: number; sentence: number; offset: number }

export interface LookupRow {
  id: number; bookId: string; surface: string; lemma: string; zh: string; phonetic: string;
  sentence: string; loc: LookupLoc; at: number; saved: boolean;
}

export type NewLookup = Omit<LookupRow, 'id' | 'saved'>;

/** Writes one Lookup row (README → Word tap → On open) and returns its id. */
export async function recordLookup(db: Db, l: NewLookup): Promise<number> {
  let id = 0;
  await db.tx(async () => {
    await db.run(
      'INSERT INTO lookup (book_id, surface, lemma, zh, phonetic, sentence, loc, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [l.bookId, l.surface, l.lemma, l.zh, l.phonetic, l.sentence, JSON.stringify(l.loc), l.at],
    );
    const [row] = await db.all<{ id: number }>('SELECT last_insert_rowid() AS id');
    id = row!.id;
  });
  return id;
}

/** Every lemma looked up in this book (R-06: `seen` is per book). */
export async function seenLemmas(db: Db, bookId: string): Promise<Set<string>> {
  const rows = await db.all<{ lemma: string }>('SELECT DISTINCT lemma FROM lookup WHERE book_id = ?', [bookId]);
  return new Set(rows.map((r) => r.lemma));
}

/** R-09: the drawer's Save button. */
export async function setSaved(db: Db, id: number, saved: boolean): Promise<void> {
  await db.run('UPDATE lookup SET saved = ? WHERE id = ?', [saved ? 1 : 0, id]);
}

/** True if this lemma was ever saved in this book, so a reopened drawer shows 已存. */
export async function isSaved(db: Db, bookId: string, lemma: string): Promise<boolean> {
  const [row] = await db.all<{ n: number }>('SELECT count(*) AS n FROM lookup WHERE book_id = ? AND lemma = ? AND saved = 1', [bookId, lemma]);
  return (row?.n ?? 0) > 0;
}

export async function listLookups(db: Db, bookId: string): Promise<LookupRow[]> {
  const rows = await db.all<Omit<LookupRow, 'loc' | 'saved'> & { loc: string; saved: number }>(
    `SELECT id, book_id AS bookId, surface, lemma, zh, phonetic, sentence, loc, at, saved
     FROM lookup WHERE book_id = ? ORDER BY at`, [bookId]);
  return rows.map((r) => ({ ...r, loc: JSON.parse(r.loc) as LookupLoc, saved: r.saved === 1 }));
}

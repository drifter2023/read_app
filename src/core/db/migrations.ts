import type { Db } from './types.ts';

/** Append-only. Never edit a shipped entry; add a new one. */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE book (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, cover TEXT, color INTEGER NOT NULL,
     format TEXT NOT NULL, word_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'reading',
     pct REAL NOT NULL DEFAULT 0, added_at INTEGER NOT NULL, opened_at INTEGER, finished_at INTEGER);
   CREATE TABLE chapter (
     book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE, idx INTEGER NOT NULL, title TEXT NOT NULL,
     paras TEXT NOT NULL, word_start INTEGER NOT NULL, PRIMARY KEY (book_id, idx));
   CREATE TABLE position (
     book_id TEXT PRIMARY KEY REFERENCES book(id) ON DELETE CASCADE, chapter INTEGER NOT NULL,
     para INTEGER NOT NULL, sentence INTEGER NOT NULL, updated_at INTEGER NOT NULL);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2 (M2): one row per drawer open. Kept rich on purpose (README → Local data model).
  `CREATE TABLE lookup (
     id INTEGER PRIMARY KEY AUTOINCREMENT, book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
     surface TEXT NOT NULL, lemma TEXT NOT NULL, zh TEXT NOT NULL, phonetic TEXT NOT NULL, sentence TEXT NOT NULL,
     loc TEXT NOT NULL, at INTEGER NOT NULL, saved INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX lookup_book_lemma ON lookup (book_id, lemma);`,
  // v3 (M4): local beta metrics log, exported by hand through the share sheet. Never sent anywhere.
  `CREATE TABLE metric (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL, book_id TEXT, data TEXT NOT NULL);`,
  // v4 (M6): finished DeepSeek grammar analyses, one per sentence, so a sentence reopens without the network.
  `CREATE TABLE grammar (
     book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE, chapter INTEGER NOT NULL, para INTEGER NOT NULL,
     sentence INTEGER NOT NULL, text_hash TEXT NOT NULL, prompt_version INTEGER NOT NULL,
     pattern TEXT NOT NULL, points TEXT NOT NULL, at INTEGER NOT NULL,
     PRIMARY KEY (book_id, chapter, para, sentence));`,
  // v5: the grammar drawer shows the sentence's translation on top (prompt v3).
  `ALTER TABLE grammar ADD COLUMN translation TEXT NOT NULL DEFAULT '';`,
  // v6 (M7): what the reader knows, for predicted words. Lookups live in `lookup`; this keeps the rest.
  `CREATE TABLE vocab (
     lemma TEXT PRIMARY KEY, state TEXT, source TEXT, weight REAL NOT NULL DEFAULT 1,
     exposures INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL);`,
];

export async function migrate(db: Db, migrations: readonly string[] = MIGRATIONS): Promise<number> {
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version]!;
    const next = version + 1;
    await db.tx(async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}

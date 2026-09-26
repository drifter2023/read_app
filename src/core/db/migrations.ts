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

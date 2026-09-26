import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Db, SqlValue } from './types.ts';

/** Opens `name` with the native SQLite plugin (iOS). The web build uses ./web.ts instead. */
export async function openCapacitorDb(name: string): Promise<Db> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency();
  const exists = (await sqlite.isConnection(name, false)).result === true;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;', false);

  return {
    async exec(sql) { await conn.execute(sql, false); },
    async run(sql, params: SqlValue[] = []) { await conn.run(sql, params, false); },
    async all<T>(sql: string, params: SqlValue[] = []) { return ((await conn.query(sql, params)).values ?? []) as T[]; },
    async tx(fn) {
      await conn.execute('BEGIN TRANSACTION;', false);
      try {
        await fn();
        await conn.execute('COMMIT;', false);
      } catch (e) {
        await conn.execute('ROLLBACK;', false);
        throw e;
      }
    },
  };
}

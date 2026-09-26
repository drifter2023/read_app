import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Db, SqlValue } from './types.ts';

/** Opens `name` with the native plugin on iOS, or jeep-sqlite (sql.js + IndexedDB) on web. */
export async function openCapacitorDb(name: string): Promise<Db> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const web = Capacitor.getPlatform() === 'web';
  if (web) await initWebStore(sqlite);
  await sqlite.checkConnectionsConsistency();
  const exists = (await sqlite.isConnection(name, false)).result === true;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;', false);

  let inTx = false;
  // On web, sql.js lives in memory; copy it to IndexedDB after every committed write.
  const persist = async (): Promise<void> => { if (web && !inTx) await sqlite.saveToStore(name); };

  return {
    async exec(sql) { await conn.execute(sql, false); await persist(); },
    async run(sql, params: SqlValue[] = []) { await conn.run(sql, params, false); await persist(); },
    async all<T>(sql: string, params: SqlValue[] = []) { return ((await conn.query(sql, params)).values ?? []) as T[]; },
    async tx(fn) {
      inTx = true;
      await conn.execute('BEGIN TRANSACTION;', false);
      try {
        await fn();
        await conn.execute('COMMIT;', false);
      } catch (e) {
        await conn.execute('ROLLBACK;', false);
        throw e;
      } finally {
        inTx = false;
      }
      await persist();
    },
  };
}

async function initWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  await defineCustomElements(window);
  if (!document.querySelector('jeep-sqlite')) document.body.append(document.createElement('jeep-sqlite'));
  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}

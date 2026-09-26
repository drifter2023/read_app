import type { Database } from 'sql.js';
import { loadSqlJs } from './sqljs.ts';
import type { Db, SqlValue } from './types.ts';

const IDB_NAME = 'spotlight';
const IDB_STORE = 'files';
const PERSIST_DELAY_MS = 300;

/**
 * Web build: SQLite (sql.js) in memory, with the whole file saved to IndexedDB after writes.
 * The wasm is bundled by Vite, so there are no network requests beyond the app's own origin.
 */
export async function openWebDb(name: string): Promise<Db> {
  const SQL = await loadSqlJs();
  const saved = await idbGet(name);
  const d: Database = saved ? new SQL.Database(saved) : new SQL.Database();
  d.run('PRAGMA foreign_keys = ON');

  let inTx = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = async (): Promise<void> => {
    clearTimeout(timer);
    const bytes = d.export();
    d.run('PRAGMA foreign_keys = ON'); // export() reopens the database, which resets pragmas
    await idbPut(name, bytes);
  };
  const persist = (): void => {
    if (inTx) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void save(); }, PERSIST_DELAY_MS);
  };
  // Hiding the page may be the last chance to write (iOS Safari can kill a backgrounded tab).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer !== undefined) void save();
  });
  window.addEventListener('pagehide', () => { if (timer !== undefined) void save(); });

  return {
    async exec(sql) { d.exec(sql); persist(); },
    async run(sql, params: SqlValue[] = []) { d.run(sql, params); persist(); },
    async all<T>(sql: string, params: SqlValue[] = []) {
      const st = d.prepare(sql);
      try {
        st.bind(params);
        const rows: T[] = [];
        while (st.step()) rows.push(st.getAsObject() as T);
        return rows;
      } finally {
        st.free();
      }
    },
    async tx(fn) {
      inTx = true;
      d.exec('BEGIN');
      try {
        await fn();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      } finally {
        inTx = false;
      }
      persist();
    },
  };
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | undefined> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, bytes: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

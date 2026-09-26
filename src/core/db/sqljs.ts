import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let loading: Promise<SqlJsStatic> | null = null;

/** sql.js with its wasm bundled by Vite (same origin, no network). Loaded once. */
export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= initSqlJs({ locateFile: () => wasmUrl });
  return loading;
}

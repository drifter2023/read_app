import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlValue } from '../../src/core/db/types.ts';

export function nodeDb(): Db {
  const d = new DatabaseSync(':memory:');
  d.exec('PRAGMA foreign_keys = ON');
  return {
    async exec(sql) { d.exec(sql); },
    async run(sql, params: SqlValue[] = []) { d.prepare(sql).run(...params); },
    async all<T>(sql: string, params: SqlValue[] = []) { return d.prepare(sql).all(...params) as T[]; },
    async tx(fn) {
      d.exec('BEGIN');
      try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
    },
  };
}

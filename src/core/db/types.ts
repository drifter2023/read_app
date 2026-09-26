export type SqlValue = string | number | null;

/** The storage seam: iOS uses the native plugin, web uses jeep-sqlite, tests use node:sqlite. */
export interface Db {
  /** One or more statements, no params. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Not re-entrant. */
  tx(fn: () => Promise<void>): Promise<void>;
}

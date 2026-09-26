import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/core/db/migrations.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('migrate', () => {
  it('creates schema v1 and records user_version', async () => {
    const db = nodeDb();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['book', 'chapter', 'position', 'settings']));
  });

  it('is idempotent', async () => {
    const db = nodeDb();
    await migrate(db);
    expect(await migrate(db)).toBe(MIGRATIONS.length);
  });

  it('rolls back a failing migration and keeps the old version', async () => {
    const db = nodeDb();
    await expect(migrate(db, ['CREATE TABLE a (x INTEGER);', 'CREATE TABLE broken ('])).rejects.toThrow();
    const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(1);
    expect(await db.all("SELECT name FROM sqlite_master WHERE name='broken'")).toEqual([]);
  });
});

import type { Db } from '../db/types.ts';

/**
 * The user's DeepSeek API key, in user.db's settings table. Kept out of PrefsStore, which
 * broadcasts every value to React views. It leaves the device only to api.deepseek.com.
 */
const KEY = 'deepseek.key';

export async function getKey(db: Db): Promise<string | null> {
  const [row] = await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY]);
  return row?.value || null;
}

export async function setKey(db: Db, key: string): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [KEY, key.trim()]);
}

export async function clearKey(db: Db): Promise<void> {
  await db.run('DELETE FROM settings WHERE key = ?', [KEY]);
}

/** What the Home card shows: the last four characters only. */
export function maskKey(key: string): string {
  return `····${key.slice(-4)}`;
}

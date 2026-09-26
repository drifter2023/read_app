// src/app/boot.ts
import { Capacitor } from '@capacitor/core';
import { openCapacitorDb } from '../core/db/capacitor.ts';
import { migrate } from '../core/db/migrations.ts';
import type { Db } from '../core/db/types.ts';
import { openWebDb } from '../core/db/web.ts';
import { BUNDLED } from '../core/library/bundled.ts';
import { backfillBundledCovers, seedBundled } from '../core/library/library.ts';
import { PrefsStore } from '../core/prefs/prefs.ts';
import type { ParsedBook } from '../core/types.ts';

export interface Session { db: Db; prefs: PrefsStore }

let booting: Promise<Session> | null = null;

/** Idempotent: React StrictMode runs effects twice in dev, and seeding must not run concurrently. */
export function boot(): Promise<Session> {
  booting ??= start();
  return booting;
}

async function start(): Promise<Session> {
  const db = Capacitor.isNativePlatform() ? await openCapacitorDb('user') : await openWebDb('user');
  await migrate(db);
  await seedBundled(db, BUNDLED.map((b) => b.id), async (id) => {
    const res = await fetch(`${import.meta.env.BASE_URL}books/${id}.json`);
    if (!res.ok) throw new Error(`内置书籍缺失：${id}`);
    return (await res.json()) as ParsedBook;
  });
  await backfillBundledCovers(db, BUNDLED.map((b) => b.id));
  return { db, prefs: await PrefsStore.load(db) };
}

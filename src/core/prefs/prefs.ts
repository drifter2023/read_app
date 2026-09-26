import type { Db } from '../db/types.ts';

export type FontSize = 'S' | 'M' | 'L';
export type Tier = 'full' | 'fallback';
/** 纸白 (4a, 7a) or 夜读 (1c reader, 7b colours on Home); one theme for the whole app. */
export type Theme = 'paper' | 'night';
export interface Prefs { fontSize: FontSize; focusPct: number; blurMax: number; sentenceMode: boolean; tier: Tier | null; theme: Theme }
export type PrefsListener = (prefs: Prefs, changed: keyof Prefs) => void;

export const DEFAULT_PREFS: Prefs = { fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: null, theme: 'paper' };

export const TYPE_SCALE: Record<FontSize, { size: number; line: number }> = {
  S: { size: 17.5, line: 30 },
  M: { size: 19.5, line: 34 },
  L: { size: 22, line: 38 },
};

const KEYS = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];

export function sanitise(p: Prefs): Prefs {
  return {
    fontSize: p.fontSize === 'S' || p.fontSize === 'L' ? p.fontSize : 'M',
    focusPct: clampStep(p.focusPct, 20, 80, 5, DEFAULT_PREFS.focusPct),
    blurMax: clampStep(p.blurMax, 2, 14, 1, DEFAULT_PREFS.blurMax),
    sentenceMode: p.sentenceMode === true,
    tier: p.tier === 'full' || p.tier === 'fallback' ? p.tier : null,
    theme: p.theme === 'night' ? 'night' : 'paper',
  };
}

function clampStep(v: unknown, lo: number, hi: number, step: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(v / step) * step));
}

/** Settings store. Changes notify subscribers synchronously (live apply), then persist. */
export class PrefsStore {
  #db: Db;
  #value: Prefs;
  #subs = new Set<PrefsListener>();

  private constructor(db: Db, value: Prefs) {
    this.#db = db;
    this.#value = value;
  }

  static async load(db: Db): Promise<PrefsStore> {
    const rows = await db.all<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => '?').join(',')})`, KEYS);
    const raw: Record<string, unknown> = { ...DEFAULT_PREFS };
    for (const r of rows) {
      try { raw[r.key] = JSON.parse(r.value); } catch { /* keep default */ }
    }
    return new PrefsStore(db, sanitise(raw as unknown as Prefs));
  }

  get(): Prefs {
    return this.#value;
  }

  async set<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
    const next = sanitise({ ...this.#value, [key]: value });
    if (next[key] === this.#value[key]) return;
    this.#value = next;
    for (const fn of this.#subs) fn(next, key);
    await this.#db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(next[key])],
    );
  }

  subscribe(fn: PrefsListener): () => void {
    this.#subs.add(fn);
    return () => { this.#subs.delete(fn); };
  }
}

import type { Db } from '../db/types.ts';
import type { PredictLevel } from '../vocab/predict.ts';

export type FontSize = 'S' | 'M' | 'L';
export type Tier = 'full' | 'fallback';
/** 纸白 (4a, 7a) or 夜读 (1c reader, 7b colours on Home); one theme for the whole app. */
export type Theme = 'paper' | 'night';
/** 带读 speeds (NIGHT_MODE_1c.md → N4): about 120 / 200 / 320 words a minute. */
export const GUIDE_SPEEDS = [0.6, 1, 1.6] as const;
export type GuideSpeed = (typeof GUIDE_SPEEDS)[number];
export interface Prefs {
  fontSize: FontSize; focusPct: number; blurMax: number; sentenceMode: boolean; tier: Tier | null; theme: Theme;
  /** 预测生词 关 / 少 / 多 (P-05). */
  predict: PredictLevel;
  /** 聚焦模糊 on/off: off makes the whole page sharp and lets any word open its drawer (S-03). */
  focusBlur: boolean;
  /** 带读 speed (N4). */
  guideSpeed: GuideSpeed;
  /** True once the reader has moved 模糊强度 themselves; until then 夜读 uses its own default (N3). */
  blurMaxSet: boolean;
}
export type PrefsListener = (prefs: Prefs, changed: keyof Prefs) => void;

export const DEFAULT_PREFS: Prefs = { fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: null, theme: 'paper', predict: 'few', focusBlur: true, guideSpeed: 1, blurMaxSet: false };

/** 夜读's 模糊强度 when the reader has not set one (NIGHT_MODE_1c.md → N3). */
export const NIGHT_BLUR_MAX = 9;

/** The blur at the band's edge that applies now: the reader's own, else the theme's default. */
export function blurMaxFor(p: Prefs): number {
  return p.theme === 'night' && !p.blurMaxSet ? NIGHT_BLUR_MAX : p.blurMax;
}

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
    predict: p.predict === 'off' || p.predict === 'many' ? p.predict : 'few',
    focusBlur: p.focusBlur !== false,
    guideSpeed: GUIDE_SPEEDS.includes(p.guideSpeed) ? p.guideSpeed : 1,
    blurMaxSet: p.blurMaxSet === true,
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
    // Moving 模糊强度 makes it the reader's own, in both themes (even onto the value already shown).
    const own = key === 'blurMax' && !this.#value.blurMaxSet;
    const next = sanitise({ ...this.#value, [key]: value, ...(own ? { blurMaxSet: true } : {}) });
    if (next[key] === this.#value[key] && !own) return;
    this.#value = next;
    for (const fn of this.#subs) fn(next, key);
    await this.#save(key, next);
    if (own) await this.#save('blurMaxSet', next);
  }

  async #save(key: keyof Prefs, p: Prefs): Promise<void> {
    await this.#db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(p[key])],
    );
  }

  subscribe(fn: PrefsListener): () => void {
    this.#subs.add(fn);
    return () => { this.#subs.delete(fn); };
  }
}

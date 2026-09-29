import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { DEFAULT_PREFS, PrefsStore, sanitise } from '../../src/core/prefs/prefs.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

let db: Db;
beforeEach(async () => { db = nodeDb(); await migrate(db); });

describe('PrefsStore', () => {
  it('starts from the spec defaults', async () => {
    expect((await PrefsStore.load(db)).get()).toEqual({ fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: null, theme: 'paper', predict: 'few' });
  });

  it('S-01: persists changes across reloads', async () => {
    const a = await PrefsStore.load(db);
    await a.set('fontSize', 'L');
    await a.set('tier', 'fallback');
    expect((await PrefsStore.load(db)).get()).toMatchObject({ fontSize: 'L', tier: 'fallback' });
  });

  it('notifies subscribers with the changed key, and not for no-op sets', async () => {
    const s = await PrefsStore.load(db);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    await s.set('focusPct', 40);
    await s.set('focusPct', 40);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ focusPct: 40 }), 'focusPct');
    off();
    await s.set('focusPct', 45);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clamps to the settings ranges', () => {
    expect(sanitise({ ...DEFAULT_PREFS, focusPct: 83, blurMax: 20 })).toMatchObject({ focusPct: 80, blurMax: 14 });
    expect(sanitise({ ...DEFAULT_PREFS, focusPct: 33, blurMax: 0 })).toMatchObject({ focusPct: 35, blurMax: 2 });
    expect(sanitise({ ...DEFAULT_PREFS, fontSize: 'XL' as never, tier: 'turbo' as never })).toMatchObject({ fontSize: 'M', tier: null });
    expect(sanitise({ ...DEFAULT_PREFS, theme: 'sepia' as never })).toMatchObject({ theme: 'paper' });
    expect(sanitise({ ...DEFAULT_PREFS, theme: 'night' })).toMatchObject({ theme: 'night' });
  });

  it('ignores corrupt stored values', async () => {
    await db.run("INSERT INTO settings (key, value) VALUES ('focusPct', 'not json')");
    expect((await PrefsStore.load(db)).get().focusPct).toBe(30);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { exportMetrics, logMetric, summarise } from '../../src/core/metrics/metrics.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

let db: Db;
beforeEach(async () => { db = nodeDb(); await migrate(db); });

describe('metrics log (task 23)', () => {
  it('summarises minutes, lookups per 1k words and the 10 s re-scroll ratio', async () => {
    await logMetric(db, { type: 'session', bookId: 'a', ms: 20 * 60000, words: 3000 });
    await logMetric(db, { type: 'session', bookId: 'a', ms: 10 * 60000, words: 1000 });
    for (let i = 0; i < 6; i++) await logMetric(db, { type: 'lookup', bookId: 'a' });
    await logMetric(db, { type: 'drawer_close', bookId: 'a', rescroll: true });
    await logMetric(db, { type: 'drawer_close', bookId: 'a', rescroll: true });
    await logMetric(db, { type: 'drawer_close', bookId: 'a', rescroll: false });
    await logMetric(db, { type: 'drawer_close', bookId: 'a', rescroll: false });
    expect(await summarise(db)).toEqual({
      sessions: 2, minutes: 30, wordsRead: 4000, lookups: 6, lookupsPer1k: 1.5,
      drawerCloses: 4, rescrollWithin10s: 2, rescrollRatio: 0.5,
      predictedLookups: 0, missesPer1k: 1.5, falseAlarmsPer1k: 0,
    });
  });

  it('P-07: counts predicted lookups, misses and false alarms per 1k words', async () => {
    await logMetric(db, { type: 'session', bookId: 'a', ms: 60000, words: 2000 });
    await logMetric(db, { type: 'lookup', bookId: 'a', predicted: true });
    await logMetric(db, { type: 'lookup', bookId: 'a', predicted: false });
    await logMetric(db, { type: 'lookup', bookId: 'a', predicted: false });
    await logMetric(db, { type: 'undo', bookId: 'a', predicted: true });
    await logMetric(db, { type: 'undo', bookId: 'a', predicted: false });
    expect(await summarise(db)).toMatchObject({ lookups: 3, predictedLookups: 1, missesPer1k: 1, falseAlarmsPer1k: 0.5 });
  });

  it('exports JSON with the summary and raw events', async () => {
    await logMetric(db, { type: 'lookup', bookId: 'a' }, Date.UTC(2026, 8, 26));
    const out = JSON.parse(await exportMetrics(db));
    expect(out.summary.lookups).toBe(1);
    expect(out.events[0]).toMatchObject({ type: 'lookup', bookId: 'a', at: '2026-09-26T00:00:00.000Z' });
  });
});

import type { Db } from '../db/types.ts';

/**
 * Beta metrics (README → Local log): session minutes, lookups per 1k words read, and whether the
 * reader scrolls again within 10 s of closing a drawer. Stored locally only.
 */
export type MetricEvent =
  | { type: 'session'; bookId: string; ms: number; words: number }
  /** `predicted`: the word already had a predicted footnote (P-07); a lookup of an unpredicted word is a miss. */
  | { type: 'lookup'; bookId: string; predicted?: boolean }
  /** 撤回; of a predicted word, a false alarm (P-07). */
  | { type: 'undo'; bookId: string; predicted: boolean }
  | { type: 'drawer_close'; bookId: string; rescroll: boolean };

export async function logMetric(db: Db, e: MetricEvent, at = Date.now()): Promise<void> {
  const { type, bookId, ...data } = e;
  await db.run('INSERT INTO metric (at, type, book_id, data) VALUES (?, ?, ?, ?)', [at, type, bookId, JSON.stringify(data)]);
}

export interface MetricSummary {
  sessions: number; minutes: number; wordsRead: number; lookups: number; lookupsPer1k: number;
  drawerCloses: number; rescrollWithin10s: number; rescrollRatio: number;
  /** Predicted words (P-07): lookups of predicted words, misses (lookups of unpredicted ones) and false alarms (撤回 of predicted ones). */
  predictedLookups: number; missesPer1k: number; falseAlarmsPer1k: number;
}

export async function summarise(db: Db): Promise<MetricSummary> {
  const rows = await db.all<{ type: string; data: string }>('SELECT type, data FROM metric');
  let sessions = 0, ms = 0, words = 0, lookups = 0, closes = 0, rescroll = 0, predicted = 0, falseAlarms = 0;
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, unknown>;
    if (r.type === 'session') { sessions++; ms += Number(d.ms) || 0; words += Number(d.words) || 0; }
    else if (r.type === 'lookup') { lookups++; if (d.predicted) predicted++; }
    else if (r.type === 'undo') { if (d.predicted) falseAlarms++; }
    else if (r.type === 'drawer_close') { closes++; if (d.rescroll) rescroll++; }
  }
  const round = (x: number, k = 100) => Math.round(x * k) / k;
  const per1k = (n: number) => (words ? round((n * 1000) / words) : 0);
  return {
    sessions, minutes: round(ms / 60000, 10), wordsRead: words, lookups,
    lookupsPer1k: per1k(lookups),
    drawerCloses: closes, rescrollWithin10s: rescroll, rescrollRatio: closes ? round(rescroll / closes) : 0,
    predictedLookups: predicted, missesPer1k: per1k(lookups - predicted), falseAlarmsPer1k: per1k(falseAlarms),
  };
}

/** The file the beta tester shares: a summary plus every raw event, as JSON. */
export async function exportMetrics(db: Db): Promise<string> {
  const events = await db.all<{ at: number; type: string; book_id: string | null; data: string }>(
    'SELECT at, type, book_id, data FROM metric ORDER BY at');
  return JSON.stringify({
    app: 'Spotlight', exportedAt: new Date().toISOString(), summary: await summarise(db),
    events: events.map((e) => ({ at: new Date(e.at).toISOString(), type: e.type, bookId: e.book_id, ...(JSON.parse(e.data) as object) })),
  }, null, 2);
}

import type { Db } from '../db/types.ts';

/**
 * Beta metrics (README → Local log): session minutes, lookups per 1k words read, and whether the
 * reader scrolls again within 10 s of closing a drawer. Stored locally only.
 */
export type MetricEvent =
  | { type: 'session'; bookId: string; ms: number; words: number }
  | { type: 'lookup'; bookId: string }
  | { type: 'drawer_close'; bookId: string; rescroll: boolean };

export async function logMetric(db: Db, e: MetricEvent, at = Date.now()): Promise<void> {
  const { type, bookId, ...data } = e;
  await db.run('INSERT INTO metric (at, type, book_id, data) VALUES (?, ?, ?, ?)', [at, type, bookId, JSON.stringify(data)]);
}

export interface MetricSummary {
  sessions: number; minutes: number; wordsRead: number; lookups: number; lookupsPer1k: number;
  drawerCloses: number; rescrollWithin10s: number; rescrollRatio: number;
}

export async function summarise(db: Db): Promise<MetricSummary> {
  const rows = await db.all<{ type: string; data: string }>('SELECT type, data FROM metric');
  let sessions = 0, ms = 0, words = 0, lookups = 0, closes = 0, rescroll = 0;
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, unknown>;
    if (r.type === 'session') { sessions++; ms += Number(d.ms) || 0; words += Number(d.words) || 0; }
    else if (r.type === 'lookup') lookups++;
    else if (r.type === 'drawer_close') { closes++; if (d.rescroll) rescroll++; }
  }
  const round = (x: number, k = 100) => Math.round(x * k) / k;
  return {
    sessions, minutes: round(ms / 60000, 10), wordsRead: words, lookups,
    lookupsPer1k: words ? round((lookups * 1000) / words) : 0,
    drawerCloses: closes, rescrollWithin10s: rescroll, rescrollRatio: closes ? round(rescroll / closes) : 0,
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

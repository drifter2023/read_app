import type { Db } from '../db/types.ts';
import type { Evidence } from './ability.ts';

/** What user.db knows about the reader's vocabulary: lookups in every book plus the `vocab` table. */
export interface KnownWords {
  lookedUp: Set<string>;
  rows: Map<string, { state: 'known' | 'unknown' | null; source: string | null; weight: number; exposures: number }>;
}

/** Undo is deliberate, so it weighs more than a calibration answer (docs/plans/2026-09-30-predicted-words.md). */
export const UNDO_WEIGHT = 2;
/** Each read without a tap is weak evidence; a few of them add up to a little more. */
const EXPOSURE_WEIGHT = 0.15;
const EXPOSURE_CAP = 0.6;
/** Read this often without a tap: known, never predicted. */
export const KNOWN_AFTER = 3;

export async function loadKnownWords(db: Db): Promise<KnownWords> {
  const [looked, rows] = await Promise.all([
    db.all<{ lemma: string }>('SELECT DISTINCT lemma FROM lookup'),
    db.all<{ lemma: string; state: string | null; source: string | null; weight: number; exposures: number }>(
      'SELECT lemma, state, source, weight, exposures FROM vocab'),
  ]);
  return {
    lookedUp: new Set(looked.map((r) => r.lemma)),
    rows: new Map(rows.map((r) => [r.lemma, {
      state: r.state === 'known' || r.state === 'unknown' ? r.state : null, source: r.source, weight: r.weight, exposures: r.exposures,
    }])),
  };
}

/** 撤回 (P-04) or a calibration answer. */
export async function markWord(db: Db, lemma: string, state: 'known' | 'unknown', source: 'undo' | 'test', weight = 1, at = Date.now()): Promise<void> {
  await db.run(
    `INSERT INTO vocab (lemma, state, source, weight, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (lemma) DO UPDATE SET state = excluded.state, source = excluded.source, weight = excluded.weight, at = excluded.at`,
    [lemma, state, source, weight, at]);
}

/** A deliberate lookup overrides an earlier "known" (P-04). */
export async function clearKnown(db: Db, lemma: string): Promise<void> {
  await db.run("UPDATE vocab SET state = NULL, source = NULL WHERE lemma = ? AND state = 'known'", [lemma]);
}

/** Adds read-without-a-tap counts in one transaction. */
export async function addExposures(db: Db, counts: ReadonlyMap<string, number>, at = Date.now()): Promise<void> {
  if (!counts.size) return;
  await db.tx(async () => {
    for (const [lemma, n] of counts) {
      await db.run(
        `INSERT INTO vocab (lemma, exposures, at) VALUES (?, ?, ?)
         ON CONFLICT (lemma) DO UPDATE SET exposures = exposures + excluded.exposures, at = excluded.at`,
        [lemma, n, at]);
    }
  });
}

/** Words never to predict: marked known, or read often enough without a tap. */
export function knownSet(k: KnownWords): Set<string> {
  const out = new Set<string>();
  for (const [lemma, r] of k.rows) {
    if (k.lookedUp.has(lemma) && r.state !== 'known') continue;
    if (r.state === 'known' || (r.state !== 'unknown' && r.exposures >= KNOWN_AFTER)) out.add(lemma);
  }
  return out;
}

/** The evidence for the ability estimate; `difficulty` returns null for words not in the dictionary. */
export function evidenceOf(k: KnownWords, difficulty: (lemma: string) => number | null): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  for (const [lemma, r] of k.rows) {
    const d = difficulty(lemma);
    if (d === null) continue;
    seen.add(lemma);
    if (r.state === 'known') out.push({ d, unknown: false, weight: r.weight });
    else if (k.lookedUp.has(lemma)) out.push({ d, unknown: true, weight: 1 });
    else if (r.state === 'unknown') out.push({ d, unknown: true, weight: r.weight });
    else if (r.exposures > 0) out.push({ d, unknown: false, weight: Math.min(EXPOSURE_WEIGHT * r.exposures, EXPOSURE_CAP) });
  }
  for (const lemma of k.lookedUp) {
    if (seen.has(lemma)) continue;
    const d = difficulty(lemma);
    if (d !== null) out.push({ d, unknown: true, weight: 1 });
  }
  return out;
}

const CALIBRATED = 'vocab.calibrated';

/** When the calibration test was taken or skipped (P-06); null before either. */
export async function calibrationState(db: Db): Promise<'done' | 'skipped' | null> {
  const [row] = await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CALIBRATED]);
  return row?.value === 'done' || row?.value === 'skipped' ? row.value : null;
}

export async function setCalibrationState(db: Db, v: 'done' | 'skipped'): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [CALIBRATED, v]);
}

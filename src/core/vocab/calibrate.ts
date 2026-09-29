import type { WordLevel } from '../dict/service.ts';

/** One test item: a real word, or a made-up one that catches guessing (P-06). */
export interface CalibrationItem { word: string; real: boolean }

/**
 * English-looking words that do not exist. Anyone who says they know one is guessing, so their
 * 认识 answers count for less. Any that turn out to be in dict.db are skipped.
 */
const PSEUDOWORDS = ['florbish', 'cradgeful', 'sponwick', 'trabbolt', 'glimber', 'preshment', 'druxile', 'vornish', 'scrandle', 'mofflet', 'quelvish', 'brastiny'];
const PSEUDO_COUNT = 6;
/** Difficulty bands from well known to rare; three words from each. */
const BANDS: [number, number][] = [[-2.5, -1.5], [-1.5, -0.75], [-0.75, 0], [0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2.2], [2.2, 3.5]];
const PER_BAND = 3;

/** 30 items: 24 real words spread over difficulty, 6 pseudowords, shuffled. */
export function pickItems(
  levels: readonly (WordLevel & { word: string })[], difficulty: (word: string) => number | null, has: (word: string) => boolean,
  rand: () => number = Math.random,
): CalibrationItem[] {
  const pools: string[][] = BANDS.map(() => []);
  for (const l of levels) {
    // Plain lower-case words on a frequency list: no names, abbreviations or phrases.
    if (!/^[a-z]{4,11}$/.test(l.word) || l.rank <= 0) continue;
    const d = difficulty(l.word);
    if (d === null) continue;
    const band = BANDS.findIndex(([lo, hi]) => d >= lo && d < hi);
    if (band >= 0) pools[band]!.push(l.word);
  }
  const items: CalibrationItem[] = [];
  for (const pool of pools) for (const w of sample(pool, PER_BAND, rand)) items.push({ word: w, real: true });
  for (const w of sample(PSEUDOWORDS.filter((p) => !has(p)), PSEUDO_COUNT, rand)) items.push({ word: w, real: false });
  return sample(items, items.length, rand);
}

/** The answers as evidence: 认识 weighs 1 − the false-alarm rate on pseudowords; 不认识 weighs 1. */
export function scoreCalibration(items: readonly CalibrationItem[], known: readonly boolean[]): {
  falseAlarmRate: number; answers: { word: string; state: 'known' | 'unknown'; weight: number }[];
} {
  const pseudo = items.filter((it) => !it.real).length;
  const falseAlarms = items.filter((it, i) => !it.real && known[i]).length;
  const falseAlarmRate = pseudo ? falseAlarms / pseudo : 0;
  const answers = items.flatMap((it, i) => {
    if (!it.real || known[i] === undefined) return [];
    return [known[i] ? { word: it.word, state: 'known' as const, weight: 1 - falseAlarmRate } : { word: it.word, state: 'unknown' as const, weight: 1 }];
  });
  return { falseAlarmRate, answers: answers.filter((a) => a.weight > 0) };
}

/** A rough name for an ability, for the result screen. */
export function levelLabel(theta: number): string {
  if (theta < -1.8) return '初中';
  if (theta < -1.1) return '高中';
  if (theta < -0.4) return '四级';
  if (theta < 0.4) return '六级';
  if (theta < 1.0) return '考研';
  if (theta < 1.6) return '托福 / 雅思';
  return 'GRE 及以上';
}

/** `n` distinct items from `pool` in random order (Fisher–Yates on a copy). */
function sample<T>(pool: readonly T[], n: number, rand: () => number): T[] {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

import type { WordLevel } from '../dict/service.ts';

/**
 * One multiple-choice item: pick the Chinese meaning of `word` from four, or say 不认识. The reader is
 * trusted: nothing in the test is made up, and a wrong answer counts the same as 不认识.
 */
export interface CalibrationItem { word: string; options: string[]; answer: number }

/** Difficulty bands from well known to rare; three words from each. */
const BANDS: [number, number][] = [[-2.5, -1.5], [-1.5, -0.75], [-0.75, 0], [0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2.2], [2.2, 3.5]];
const PER_BAND = 3;
const OPTIONS = 4;
const MAX_SENSE_CHARS = 8;
/** Dictionary lookups per band: enough to find targets and wrong meanings without reading all 50 000 entries. */
const SAMPLE_PER_BAND = 60;

/** The dictionary's reading of a word: its POS label and the full gloss ("离开，出发，留下"). */
export interface Sense { pos: string; gloss: string }

/** The first meaning of a gloss, short enough for a button. */
export function firstMeaning(gloss: string): string {
  return gloss.split(/[，,；;、]/)[0]!.trim();
}

/** A distractor must not be a meaning of the target word: no two characters in common with its gloss. */
function overlaps(meaning: string, targetGloss: string): boolean {
  if (meaning.length < 2) return targetGloss.includes(meaning);
  for (let i = 0; i + 2 <= meaning.length; i++) if (targetGloss.includes(meaning.slice(i, i + 2))) return true;
  return false;
}

interface Candidate { word: string; band: number; pos: string; gloss: string; meaning: string }

/** 24 items: three words from each of eight difficulty bands, each with the right meaning and three wrong ones, shuffled. */
export function pickItems(
  levels: readonly (WordLevel & { word: string })[], difficulty: (word: string) => number | null,
  senseOf: (word: string) => Sense | null, rand: () => number = Math.random,
): CalibrationItem[] {
  const words: string[][] = BANDS.map(() => []);
  for (const l of levels) {
    // Plain lower-case words on a frequency list: no names, abbreviations or phrases.
    if (!/^[a-z]{4,11}$/.test(l.word) || l.rank <= 0) continue;
    const d = difficulty(l.word);
    if (d === null) continue;
    const band = BANDS.findIndex(([lo, hi]) => d >= lo && d < hi);
    if (band >= 0) words[band]!.push(l.word);
  }
  const pools: Candidate[][] = words.map((list, band) => {
    const pool: Candidate[] = [];
    for (const word of sample(list, list.length, rand)) {
      if (pool.length === SAMPLE_PER_BAND) break;
      const sense = senseOf(word);
      const meaning = sense ? firstMeaning(sense.gloss) : '';
      if (sense && meaning && meaning.length <= MAX_SENSE_CHARS) pool.push({ word, band, pos: sense.pos, gloss: sense.gloss, meaning });
    }
    return pool;
  });
  const items: CalibrationItem[] = [];
  pools.forEach((pool, band) => {
    // Wrong meanings come from the same band and the one next to it, so difficulty gives nothing away.
    const near = [...pool, ...(pools[band + 1] ?? []), ...(pools[band - 1] ?? [])];
    let made = 0;
    for (const target of sample(pool, pool.length, rand)) {
      if (made === PER_BAND) break;
      const ok = (c: Candidate) => c.word !== target.word && c.meaning !== target.meaning && !overlaps(c.meaning, target.gloss);
      const samePos = near.filter((c) => c.pos === target.pos && ok(c));
      const wrong = uniqueMeanings(sample(samePos, samePos.length, rand), OPTIONS - 1);
      if (wrong.length < OPTIONS - 1) continue;
      const options = sample([target.meaning, ...wrong], OPTIONS, rand);
      items.push({ word: target.word, options, answer: options.indexOf(target.meaning) });
      made++;
    }
  });
  return sample(items, items.length, rand);
}

function uniqueMeanings(cands: readonly Candidate[], n: number): string[] {
  const out: string[] = [];
  for (const c of cands) {
    if (out.length === n) break;
    if (!out.includes(c.meaning)) out.push(c.meaning);
  }
  return out;
}

/** What the reader chose: an option's index, or `null` for 不认识. */
export type Pick = number | null;

/** The picks as evidence: the right meaning means known; a wrong one or 不认识 means unknown. Every answer weighs 1. */
export function scoreCalibration(items: readonly CalibrationItem[], picks: readonly Pick[]): {
  correct: number; answers: { word: string; state: 'known' | 'unknown'; weight: number }[];
} {
  const answers = items.flatMap((it, i) => {
    if (picks[i] === undefined) return [];
    return [{ word: it.word, state: picks[i] === it.answer ? 'known' as const : 'unknown' as const, weight: 1 }];
  });
  return { correct: answers.filter((a) => a.state === 'known').length, answers };
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

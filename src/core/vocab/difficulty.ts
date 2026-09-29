import type { DictSource, WordLevel } from '../dict/service.ts';

/** Ranks past this (and words on no frequency list) count as this rare. */
const RARE_RANK = 60000;
/** The rank a CET-6 reader knows about half the time: difficulty 0 (docs/plans/2026-09-30-predicted-words.md). */
const MID_RANK = 6000;
/** Easiest exam list → offset: 0 zk, 1 gk, 2 cet4, 3 cet6, 4 ky, 5 toefl/ielts, 6 gre, 7 none. */
const TIER = [-2.5, -1.8, -1.0, -0.3, 0, 0.3, 0.6, 0.6];
/** A derived word is at most this much harder than its base (hopeful ← hope). */
const FAMILY_STEP = 1.0;

/** Difficulty in logit units from ECDICT signals alone (P-01). */
export function levelDifficulty(l: WordLevel, letters: number): number {
  const rank = l.rank > 0 ? Math.min(l.rank, RARE_RANK) : RARE_RANK;
  let d = 0.72 * (Math.log(rank) - Math.log(MID_RANK));
  d += TIER[l.tier] ?? TIER[7]!;
  if (l.oxford) d -= 0.4;
  d += l.collins > 0 ? -0.15 * (l.collins - 2) : 0.1;
  d += 0.04 * (letters - 7);
  return d;
}

/** Productive suffixes and prefixes only: a false base (corner ← corn) would make a hard word look easy. */
const SUFFIXES = ['ingly', 'edly', 'fully', 'ously', 'ively', 'ation', 'ition', 'ness', 'less', 'ment', 'able', 'ible', 'ably', 'ibly', 'ful', 'ish', 'ism', 'ist', 'ize', 'ise', 'ity', 'ous', 'ive', 'ly'];
const PREFIXES = ['un', 'non', 'mis'];

/** Candidate bases of a derived word, before checking them against the dictionary. */
export function familyBases(word: string): string[] {
  const out: string[] = [];
  for (const s of SUFFIXES) {
    if (!word.endsWith(s) || word.length - s.length < 3) continue;
    const stem = word.slice(0, -s.length);
    out.push(stem, `${stem}e`);
    if (stem.endsWith('i')) out.push(`${stem.slice(0, -1)}y`); // happiness ← happy
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1)); // snobbish ← snob
  }
  for (const p of PREFIXES) if (word.startsWith(p) && word.length - p.length >= 4) out.push(word.slice(p.length));
  return out.filter((b) => b !== word);
}

/** Difficulty per lemma, with word families, cached. `null`: not in the dictionary. */
export class Difficulty {
  #src: Pick<DictSource, 'level'>;
  #cache = new Map<string, number | null>();

  constructor(src: Pick<DictSource, 'level'>) {
    this.#src = src;
  }

  of(lemma: string): number | null {
    if (this.#cache.has(lemma)) return this.#cache.get(lemma)!;
    const l = this.#src.level(lemma);
    let d: number | null = null;
    if (l) {
      d = levelDifficulty(l, lemma.length);
      for (const b of familyBases(lemma)) {
        const db = this.of(b); // bases are shorter, so this ends
        if (db !== null) d = Math.min(d, db + FAMILY_STEP);
      }
    }
    this.#cache.set(lemma, d);
    return d;
  }
}

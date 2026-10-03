import type { WordLevel } from '../dict/service.ts';
import { pUnknown } from './ability.ts';
import { inSlices } from './predict.ts';

/**
 * Only the 15 000 most frequent entries are counted: the logistic model gives every rare word a small
 * chance of being known, and adding up 45 000 of those would overstate the vocabulary.
 */
const MAX_RANK = 15000;

/**
 * Difficulties of the plain lower-case entries on the frequency lists, in slices so a frame is never
 * blocked (P-08). Computed once per dictionary and shared.
 */
const cache = new WeakMap<object, Promise<number[]>>();
export function sizeBasis(dict: { levels(): (WordLevel & { word: string })[] }, difficulty: (word: string) => number | null): Promise<number[]> {
  let p = cache.get(dict);
  if (!p) {
    p = (async () => {
      const out: number[] = [];
      await inSlices(dict.levels(), (l) => {
        if (l.rank <= 0 || l.rank > MAX_RANK || !/^[a-z]+$/.test(l.word)) return;
        const d = difficulty(l.word);
        if (d !== null) out.push(d);
      });
      return out;
    })();
    p.catch(() => cache.delete(dict));
    cache.set(dict, p);
  }
  return p;
}

/** How many of those words the reader is expected to know at ability `theta` (P-06). */
export function expectedKnown(difficulties: readonly number[], theta: number): number {
  let n = 0;
  for (const d of difficulties) n += 1 - pUnknown(d, theta);
  return n;
}

/** “约 8,500 词”: rounded to 500, because the test cannot tell better than that. */
export function formatVocabSize(n: number): string {
  const r = Math.max(500, Math.round(n / 500) * 500);
  return `约 ${r.toLocaleString('en-US')} 词`;
}

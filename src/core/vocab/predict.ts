import { words } from '../reader/words.ts';
import type { Paragraph } from '../types.ts';
import { pUnknown } from './ability.ts';

export type PredictLevel = 'off' | 'few' | 'many';

/** 少: only words the reader very likely does not know. 多: better too many than too few (P-05). */
export const THRESHOLD: Record<Exclude<PredictLevel, 'off'>, number> = { few: 0.7, many: 0.4 };

/** Background work runs in slices this long, so a frame is never blocked (P-08). */
const SLICE_MS = 5;

/**
 * Every lemma a book uses as a common word (P-03). A lemma whose capitalised form appears
 * mid-sentence more often than its lower-case form is a name (Nick, Daisy) and is left out.
 * Runs in slices; `lemmaOf` maps a surface form to its dictionary lemma (null if none).
 */
export async function scanBook(
  chapters: readonly { paras: readonly Paragraph[] }[], lemmaOf: (word: string) => string | null, signal?: AbortSignal,
): Promise<Set<string>> {
  const bySurface = new Map<string, string | null>();
  const counts = new Map<string, { lower: number; name: number }>();
  let deadline = performance.now() + SLICE_MS;
  for (const ch of chapters) {
    for (const p of ch.paras) {
      if (performance.now() > deadline) {
        await new Promise((r) => setTimeout(r, 0));
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        deadline = performance.now() + SLICE_MS;
      }
      for (const sentence of p) {
        let first = true;
        for (const w of words(sentence)) {
          let lemma = bySurface.get(w.word);
          if (lemma === undefined) { lemma = lemmaOf(w.word); bySurface.set(w.word, lemma); }
          const opens = first;
          first = false;
          if (!lemma) continue;
          const c = counts.get(lemma) ?? { lower: 0, name: 0 };
          if (w.word[0] !== w.word[0]!.toUpperCase()) c.lower++;
          else if (!opens) c.name++;
          counts.set(lemma, c);
        }
      }
    }
  }
  const out = new Set<string>();
  for (const [lemma, c] of counts) if (c.lower >= c.name) out.add(lemma);
  return out;
}

/** Runs `fn` over `items` in slices, yielding between them (P-08). */
export async function inSlices<T>(items: Iterable<T>, fn: (item: T) => void, signal?: AbortSignal): Promise<void> {
  let deadline = performance.now() + SLICE_MS;
  for (const item of items) {
    if (performance.now() > deadline) {
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      deadline = performance.now() + SLICE_MS;
    }
    fn(item);
  }
}

/** The book's lemmas the reader probably does not know, leaving out `exclude` (looked up or known). */
export function predictWords(
  lemmas: Iterable<string>, difficulty: (lemma: string) => number | null, theta: number, level: PredictLevel, exclude: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  if (level === 'off') return out;
  const min = THRESHOLD[level];
  for (const lemma of lemmas) {
    if (exclude.has(lemma)) continue;
    const d = difficulty(lemma);
    if (d !== null && pUnknown(d, theta) >= min) out.add(lemma);
  }
  return out;
}

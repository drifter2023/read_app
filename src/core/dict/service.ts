import { classOfLabel, contextClass, firstSense, type PosClass } from './gloss.ts';
import { normaliseWord, resolveLemma } from './lemma.ts';
import type { Lexicon } from './types.ts';

/** Row shapes of dict.db (README → Local data model, plus a `sense` table for other POS readings). */
export interface DictSource extends Lexicon {
  entry(word: string): { phonetic: string; pos: string; gloss: string } | undefined;
  sense(word: string, cls: PosClass): { pos: string; gloss: string } | undefined;
  /** Every stored form whose lemma is one of `lemmas`. */
  formsOfLemmas(lemmas: readonly string[]): string[];
  /** Difficulty signals of an entry (predicted words, P-01). */
  level(word: string): WordLevel | undefined;
  /** Every entry's signals, for picking calibration words (P-06). */
  levels(): (WordLevel & { word: string })[];
}

/**
 * ECDICT signals for one entry. `rank`: min(nonzero BNC, frq) rank, 0 when on no list. `tier`: the
 * easiest exam list it is on, 0 zk, 1 gk, 2 cet4, 3 cet6, 4 ky, 5 toefl/ielts, 6 gre, 7 none.
 * `collins`: 0–5 stars. `oxford`: 1 in the Oxford 3000.
 */
export interface WordLevel { rank: number; tier: number; collins: number; oxford: number }

export interface LookupContext { prevWord?: string; sentenceInitial?: boolean; part?: string }

export interface LookupResult { surface: string; lemma: string; phonetic: string; pos: string; gloss: string; footnote: string }

/** Tap → lemma → entry, with an in-memory LRU in front of dict.db (R-04). */
export class DictService {
  #src: DictSource;
  #cap: number;
  #cache = new Map<string, LookupResult | null>();

  constructor(src: DictSource, capacity = 512) {
    this.#src = src;
    this.#cap = capacity;
  }

  lookup(surface: string, ctx: LookupContext = {}): LookupResult | null {
    const key = `${surface}\u0000${ctx.prevWord?.toLowerCase() ?? ''}\u0000${ctx.sentenceInitial ? 1 : 0}\u0000${ctx.part ?? ''}`;
    if (this.#cache.has(key)) {
      const hit = this.#cache.get(key)!;
      this.#cache.delete(key);
      this.#cache.set(key, hit);
      return hit;
    }
    const res = this.#compute(surface, ctx);
    this.#cache.set(key, res);
    if (this.#cache.size > this.#cap) this.#cache.delete(this.#cache.keys().next().value!);
    return res;
  }

  /** Lower-cased surface forms that belong to `lemmas`, so footnotes can be matched with a Set lookup. */
  formsOf(lemmas: Iterable<string>): Set<string> {
    const list = [...lemmas];
    const out = new Set(list.map((l) => l.toLowerCase()));
    for (const f of this.#src.formsOfLemmas(list)) out.add(f.toLowerCase());
    return out;
  }

  #compute(surface: string, ctx: LookupContext): LookupResult | null {
    const r = resolveLemma(surface, this.#src, ctx);
    if (!r) return null;
    const e = this.#src.entry(r.lemma);
    if (!e) return null;
    const cls = classOfLabel(e.pos);
    const want = r.kind ?? contextClass(ctx.prevWord, { cls });
    let { pos, gloss } = e;
    // v and aux are one reading for this purpose: "could" must not become "装罐".
    if (want && want !== cls && !(want === 'v' && cls === 'aux')) {
      const alt = this.#src.sense(r.lemma, want) ?? (want === 'v' ? this.#src.sense(r.lemma, 'aux') : undefined);
      if (alt) ({ pos, gloss } = alt);
    }
    return { surface: normaliseWord(surface), lemma: r.lemma, phonetic: e.phonetic, pos, gloss, footnote: firstSense(gloss) };
  }
}

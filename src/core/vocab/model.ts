import type { Db } from '../db/types.ts';
import type { DictService } from '../dict/service.ts';
import { estimateAbility } from './ability.ts';
import { Difficulty } from './difficulty.ts';
import { inSlices, predictWords, scanBook, type PredictLevel } from './predict.ts';
import { addExposures, clearKnown, evidenceOf, knownSet, loadKnownWords, markWord, UNDO_WEIGHT, type KnownWords } from './store.ts';

/** A book's common-word lemmas, scanned once per app session (the text does not change). */
const scans = new Map<string, Promise<Set<string>>>();

export function bookLemmas(bookId: string, chapters: Parameters<typeof scanBook>[0], dict: DictService): Promise<Set<string>> {
  let p = scans.get(bookId);
  if (!p) {
    p = scanBook(chapters, (w) => dict.lookup(w)?.lemma ?? null);
    p.catch(() => scans.delete(bookId));
    scans.set(bookId, p);
  }
  return p;
}

/**
 * The reader's vocabulary on this device (docs/plans/2026-09-30-predicted-words.md): evidence from
 * user.db, the ability it implies, and what to predict. Lookups, 撤回 and reading update it.
 */
export class VocabModel {
  readonly difficulty: Difficulty;
  #db: Db;
  #known: KnownWords;
  #exclude = new Set<string>();
  #theta = 0;
  #reads = new Map<string, number>();

  private constructor(db: Db, dict: DictService, known: KnownWords) {
    this.#db = db;
    this.difficulty = new Difficulty(dict);
    this.#known = known;
  }

  /** Reads the evidence, works out its words' difficulty in slices (it grows with reading), then fits θ. */
  static async load(db: Db, dict: DictService): Promise<VocabModel> {
    const known = await loadKnownWords(db);
    const m = new VocabModel(db, dict, known);
    await m.warm([...known.rows.keys(), ...known.lookedUp]);
    m.#refit();
    return m;
  }

  get theta(): number {
    return this.#theta;
  }

  /** Works out every lemma's difficulty in background slices, so the first `predict` is quick (P-08). */
  warm(lemmas: Iterable<string>): Promise<void> {
    return inSlices(lemmas, (l) => { this.difficulty.of(l); });
  }

  /**
   * Lemmas in `lemmas` the reader probably does not know, at `level` (P-03, P-05). A word looked up
   * in another book is predicted whatever its difficulty; this book's own lookups already have footnotes.
   */
  predict(lemmas: Iterable<string>, level: PredictLevel): Set<string> {
    const out = predictWords(lemmas, (l) => this.difficulty.of(l), this.#theta, level, this.#exclude);
    if (level === 'off') return out;
    for (const l of lemmas) if (this.#known.lookedUp.has(l) && !this.#exclude.has(l)) out.add(l);
    return out;
  }

  /** A lookup: unknown evidence, and it overrides an earlier 撤回 (P-04). */
  async lookedUp(lemma: string): Promise<void> {
    this.#known.lookedUp.add(lemma);
    const row = this.#known.rows.get(lemma);
    if (row?.state === 'known') { row.state = null; row.source = null; }
    this.#refit();
    await clearKnown(this.#db, lemma);
  }

  /** 撤回: the reader knows this word; it is never predicted again (P-04). */
  async undone(lemma: string): Promise<void> {
    const row = this.#known.rows.get(lemma);
    this.#known.rows.set(lemma, { state: 'known', source: 'undo', weight: UNDO_WEIGHT, exposures: row?.exposures ?? 0 });
    this.#refit();
    await markWord(this.#db, lemma, 'known', 'undo', UNDO_WEIGHT);
  }

  /** Words read in the focus band without a tap; kept in memory until `flush`. */
  noteRead(lemmas: Iterable<string>): void {
    for (const l of lemmas) this.#reads.set(l, (this.#reads.get(l) ?? 0) + 1);
  }

  /** Writes the reads (they count from the next time the model loads). */
  async flush(): Promise<void> {
    if (!this.#reads.size) return;
    const reads = this.#reads;
    this.#reads = new Map();
    await addExposures(this.#db, reads);
  }

  #refit(): void {
    this.#theta = estimateAbility(evidenceOf(this.#known, (l) => this.difficulty.of(l)));
    this.#exclude = knownSet(this.#known);
  }
}

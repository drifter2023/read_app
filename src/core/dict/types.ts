import type { PosClass } from './gloss.ts';

/** One looked-up word as the drawer shows it. `gloss` is one POS line, e.g. "离开，出发，留下". */
export interface DictEntry { word: string; phonetic: string; pos: string; gloss: string }

/** A form → lemma link with the class the inflection implies (past tense → v, plural → n). */
export interface FormLink { lemma: string; kind: PosClass | null }

/**
 * Synchronous view of the dictionary. At runtime it is dict.db inside sql.js; at build time it is
 * the full ECDICT held in maps. Lemma resolution is written against this, so both agree.
 */
export interface Lexicon {
  has(word: string): boolean;
  /** Lemmas recorded for an inflected form, most likely first. */
  lemmasOf(form: string): FormLink[];
}

/** A resolved word: the lemma, and the class its inflection implies, if any. */
export interface Resolution { lemma: string; kind: PosClass | null }

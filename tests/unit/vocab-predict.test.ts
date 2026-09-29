import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { DictService } from '../../src/core/dict/service.ts';
import { recordLookup } from '../../src/core/annot/lookups.ts';
import { saveParsedBook } from '../../src/core/library/library.ts';
import { estimateAbility, PRIOR } from '../../src/core/vocab/ability.ts';
import { Difficulty } from '../../src/core/vocab/difficulty.ts';
import { predictWords, scanBook } from '../../src/core/vocab/predict.ts';
import {
  addExposures, calibrationState, clearKnown, evidenceOf, KNOWN_AFTER, knownSet, loadKnownWords, markWord, setCalibrationState, UNDO_WEIGHT,
} from '../../src/core/vocab/store.ts';
import { nodeDictSource } from '../helpers/nodeDict.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

const src = nodeDictSource(new DatabaseSync('public/dict.db', { readOnly: true }));
const dict = new DictService(src, 4096);
const diff = new Difficulty(src);
const lemmaOf = (w: string) => dict.lookup(w)?.lemma ?? null;
const of = (l: string) => diff.of(l);

let db: Db;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await saveParsedBook(db, { id: 'a', title: 'a', author: 'A', wordCount: 2, chapters: [{ title: 'I', paras: [['Hi there.']], wordCount: 2 }] }, 'epub', 0);
});
const lookUp = (lemma: string) => recordLookup(db, {
  bookId: 'a', surface: lemma, lemma, zh: '', phonetic: '', sentence: '', loc: { chapter: 0, para: 0, sentence: 0, offset: 0 }, at: 1,
});

describe('vocabulary evidence (P-02, P-04)', () => {
  it('turns lookups, undos, test answers and exposures into weighted evidence', async () => {
    await lookUp('levity');
    await markWord(db, 'gorgeous', 'known', 'undo', UNDO_WEIGHT);
    await markWord(db, 'intricate', 'unknown', 'test');
    await addExposures(db, new Map([['scorn', 2], ['decency', 1]]));
    await addExposures(db, new Map([['scorn', 2]]));
    const k = await loadKnownWords(db);
    const ev = new Map(evidenceOf(k, of).map((e, i) => [i, e]));
    expect([...ev.values()]).toHaveLength(5);
    expect(k.rows.get('scorn')!.exposures).toBe(4);
    expect(knownSet(k)).toEqual(new Set(['gorgeous', 'scorn'])); // undo, and 4 ≥ KNOWN_AFTER reads
    expect(KNOWN_AFTER).toBe(3);
    const byWeight = evidenceOf(k, of).map((e) => [e.unknown, e.weight]).sort();
    expect(byWeight).toEqual([[false, 0.15], [false, 0.6], [false, 2], [true, 1], [true, 1]].sort());
  });

  it('P-04: a later lookup clears an undo', async () => {
    await markWord(db, 'gorgeous', 'known', 'undo', UNDO_WEIGHT);
    await clearKnown(db, 'gorgeous');
    await lookUp('gorgeous');
    const k = await loadKnownWords(db);
    expect(knownSet(k).has('gorgeous')).toBe(false);
    expect(evidenceOf(k, of)).toEqual([{ d: of('gorgeous'), unknown: true, weight: 1 }]);
  });

  it('remembers whether the calibration test was taken', async () => {
    expect(await calibrationState(db)).toBeNull();
    await setCalibrationState(db, 'skipped');
    expect(await calibrationState(db)).toBe('skipped');
  });
});

describe('prediction (P-03, P-05)', () => {
  const book = JSON.parse(readFileSync('public/books/gatsby.json', 'utf8')) as { chapters: { paras: string[][] }[] };

  it('scans a whole novel in slices and leaves out names', async () => {
    const t0 = performance.now();
    const lemmas = await scanBook(book.chapters, lemmaOf);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(lemmas.size).toBeGreaterThan(3000);
    for (const w of ['gorgeous', 'turn', 'advice']) expect(lemmas.has(w)).toBe(true);
    expect(lemmas.has('nick')).toBe(false); // Nick Carraway, not a nick in wood
  });

  it('a CET-6 reader gets a handful of words per page; 多 ⊇ 少; 关 is empty; excluded words stay out', async () => {
    const lemmas = await scanBook(book.chapters, lemmaOf);
    const few = predictWords(lemmas, of, PRIOR.mean, 'few', new Set());
    const many = predictWords(lemmas, of, PRIOR.mean, 'many', new Set());
    expect(predictWords(lemmas, of, PRIOR.mean, 'off', new Set()).size).toBe(0);
    for (const w of few) expect(many.has(w)).toBe(true);
    expect(many.size).toBeGreaterThan(few.size);
    expect(few.has('levity')).toBe(true);
    for (const w of ['the', 'house', 'hope', 'turn', 'advice']) expect(many.has(w)).toBe(false);
    expect(predictWords(lemmas, of, PRIOR.mean, 'few', new Set(['levity'])).has('levity')).toBe(false);
    // A stronger reader gets fewer.
    expect(predictWords(lemmas, of, 1.5, 'few', new Set()).size).toBeLessThan(few.size);
    console.log(`gatsby: ${lemmas.size} lemmas; CET-6 reader: 少 ${few.size}, 多 ${many.size}`);
  });

  it('θ from evidence changes what is predicted', async () => {
    const lemmas = await scanBook(book.chapters, lemmaOf);
    for (const w of ['levity', 'decency', 'intricate', 'exempt', 'snobbish']) await markWord(db, w, 'known', 'test');
    const theta = estimateAbility(evidenceOf(await loadKnownWords(db), of));
    expect(theta).toBeGreaterThan(PRIOR.mean);
    expect(predictWords(lemmas, of, theta, 'few', new Set()).size)
      .toBeLessThan(predictWords(lemmas, of, PRIOR.mean, 'few', new Set()).size);
  });
});

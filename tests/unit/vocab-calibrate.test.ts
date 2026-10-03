import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DictService } from '../../src/core/dict/service.ts';
import { estimateAbility, PRIOR } from '../../src/core/vocab/ability.ts';
import { firstMeaning, pickItems, scoreCalibration } from '../../src/core/vocab/calibrate.ts';
import { expectedKnown, formatVocabSize, sizeBasis } from '../../src/core/vocab/size.ts';
import { Difficulty } from '../../src/core/vocab/difficulty.ts';
import { nodeDictSource } from '../helpers/nodeDict.ts';

const dict = new DictService(nodeDictSource(new DatabaseSync('public/dict.db', { readOnly: true })), 4096);
const diff = new Difficulty(dict);
const of = (w: string) => diff.of(w);
/** A seeded generator, so the picks are the same every run. */
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const senseOf = (w: string) => { const r = dict.lookup(w); return r && r.lemma === w ? { pos: r.pos, gloss: r.gloss } : null; };
const items = pickItems(dict.levels(), of, senseOf, seeded(7));

describe('calibration test (P-06)', () => {
  it('has 24 multiple-choice items across difficulty, with no made-up words', () => {
    expect(items).toHaveLength(24);
    expect(new Set(items.map((i) => i.word)).size).toBe(24);
    for (const i of items) {
      expect(i.word).toMatch(/^[a-z]{4,11}$/);
      expect(dict.lookup(i.word)?.lemma).toBe(i.word); // a real dictionary word
      expect(i.options).toHaveLength(4);
      expect(new Set(i.options).size).toBe(4);
      expect(i.options[i.answer]).toBe(firstMeaning(senseOf(i.word)!.gloss));
    }
    const ds = items.map((i) => of(i.word)!).sort((a, b) => a - b);
    expect(ds[0]).toBeLessThan(-1.5);
    expect(ds.at(-1)).toBeGreaterThan(2);
  });

  it('wrong options are not meanings of the word, and share its part of speech', () => {
    // meaning → parts of speech it is the first meaning of, over the words pickItems can draw from
    const owners = new Map<string, Set<string>>();
    for (const l of dict.levels()) {
      if (!/^[a-z]{4,11}$/.test(l.word) || l.rank <= 0) continue;
      const sense = senseOf(l.word);
      if (!sense) continue;
      const m = firstMeaning(sense.gloss);
      (owners.get(m) ?? owners.set(m, new Set()).get(m)!).add(sense.pos);
    }
    for (const i of items) {
      const target = senseOf(i.word)!;
      i.options.forEach((o, k) => {
        if (k === i.answer) return;
        expect(target.gloss).not.toContain(o);
        expect(owners.get(o)?.has(target.pos)).toBe(true);
      });
    }
  }, 120_000);

  it('always finds 24 items, whatever the draw', () => {
    for (let seed = 1; seed <= 25; seed++) expect(pickItems(dict.levels(), of, senseOf, seeded(seed))).toHaveLength(24);
  });

  it('the right answer lands in different places', () => {
    expect(new Set(items.map((i) => i.answer)).size).toBe(4);
  });

  it('right answers count as known, wrong ones and 不认识 as unknown, all with weight 1', () => {
    const r = scoreCalibration(items, [items[0]!.answer, (items[1]!.answer + 1) % 4, null]);
    expect(r.answers).toEqual([
      { word: items[0]!.word, state: 'known', weight: 1 },
      { word: items[1]!.word, state: 'unknown', weight: 1 },
      { word: items[2]!.word, state: 'unknown', weight: 1 },
    ]);
    expect(r.correct).toBe(1);
  });

  it('honest answers move θ the right way', () => {
    const picksUpTo = (limit: number) => items.map((i) => (of(i.word)! < limit ? i.answer : null));
    const θ = (picks: (number | null)[]) => estimateAbility(scoreCalibration(items, picks).answers.map((a) => ({
      d: of(a.word)!, unknown: a.state === 'unknown', weight: a.weight,
    })));
    const weak = θ(picksUpTo(-0.75));
    const strong = θ(picksUpTo(1.5));
    expect(weak).toBeLessThan(PRIOR.mean);
    expect(strong).toBeGreaterThan(PRIOR.mean);
  });

  it('turns θ into a vocabulary size that grows with ability and stays plausible', async () => {
    const basis = await sizeBasis(dict, of);
    const at = (θ: number) => expectedKnown(basis, θ);
    expect(at(-2)).toBeLessThan(at(PRIOR.mean));
    expect(at(PRIOR.mean)).toBeLessThan(at(2));
    expect(at(-2)).toBeGreaterThan(2500);
    expect(at(2)).toBeLessThan(16000);
    expect(at(PRIOR.mean)).toBeGreaterThan(6000);
    expect(at(PRIOR.mean)).toBeLessThan(11000);
  }, 60_000);

  it('shows the size as a rounded “约 N 词”, never a grade', () => {
    expect(formatVocabSize(8537)).toBe('约 8,500 词');
    expect(formatVocabSize(8760)).toBe('约 9,000 词');
    expect(formatVocabSize(120)).toBe('约 500 词');
  });
});

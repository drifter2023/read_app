import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DictService } from '../../src/core/dict/service.ts';
import { estimateAbility, PRIOR } from '../../src/core/vocab/ability.ts';
import { levelLabel, pickItems, scoreCalibration } from '../../src/core/vocab/calibrate.ts';
import { Difficulty } from '../../src/core/vocab/difficulty.ts';
import { nodeDictSource } from '../helpers/nodeDict.ts';

const dict = new DictService(nodeDictSource(new DatabaseSync('public/dict.db', { readOnly: true })), 4096);
const diff = new Difficulty(dict);
const of = (w: string) => diff.of(w);
/** A seeded generator, so the picks are the same every run. */
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const items = pickItems(dict.levels(), of, (w) => dict.lookup(w) !== null, seeded(7));

describe('calibration test (P-06)', () => {
  it('has 30 items: 24 real words across difficulty and 6 pseudowords', () => {
    expect(items).toHaveLength(30);
    const real = items.filter((i) => i.real);
    expect(real).toHaveLength(24);
    expect(new Set(items.map((i) => i.word)).size).toBe(30);
    for (const i of items) expect(i.word).toMatch(/^[a-z]{4,11}$/);
    const ds = real.map((i) => of(i.word)!).sort((a, b) => a - b);
    expect(ds[0]).toBeLessThan(-1.5);
    expect(ds.at(-1)).toBeGreaterThan(2);
    for (const p of items.filter((i) => !i.real)) expect(dict.lookup(p.word)).toBeNull();
  });

  it('honest answers move θ the right way', () => {
    const knowsUpTo = (limit: number) => items.map((i) => i.real && of(i.word)! < limit);
    const θ = (known: boolean[]) => estimateAbility(scoreCalibration(items, known).answers.map((a) => ({
      d: of(a.word)!, unknown: a.state === 'unknown', weight: a.weight,
    })));
    const weak = θ(knowsUpTo(-0.75));
    const strong = θ(knowsUpTo(1.5));
    expect(weak).toBeLessThan(PRIOR.mean);
    expect(strong).toBeGreaterThan(PRIOR.mean);
    expect(levelLabel(weak)).not.toBe(levelLabel(strong));
  });

  it('claiming pseudowords makes 认识 count for less', () => {
    const honest = scoreCalibration(items, items.map((i) => i.real));
    const bluffer = scoreCalibration(items, items.map(() => true));
    expect(honest.falseAlarmRate).toBe(0);
    expect(bluffer.falseAlarmRate).toBe(1);
    expect(honest.answers.every((a) => a.weight === 1)).toBe(true);
    expect(bluffer.answers).toHaveLength(0); // all 认识, all discounted to nothing
    const half = scoreCalibration(items, items.map((i, k) => i.real || k % 2 === 0));
    expect(half.answers.filter((a) => a.state === 'known').every((a) => a.weight < 1 && a.weight > 0)).toBe(true);
  });

  it('labels the prior as CET-6', () => {
    expect(levelLabel(PRIOR.mean)).toBe('六级');
  });
});

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { estimateAbility, pUnknown, PRIOR, type Evidence } from '../../src/core/vocab/ability.ts';
import { Difficulty, familyBases } from '../../src/core/vocab/difficulty.ts';
import { nodeDictSource } from '../helpers/nodeDict.ts';

const diff = new Difficulty(nodeDictSource(new DatabaseSync('public/dict.db', { readOnly: true })));
const d = (w: string) => {
  const v = diff.of(w);
  if (v === null) throw new Error(`${w} is not in dict.db`);
  return v;
};

describe('word difficulty (P-01)', () => {
  it('orders common, exam-list and rare words', () => {
    for (const easy of ['the', 'house', 'hope', 'gesture']) expect(d(easy)).toBeLessThan(-2);
    expect(d('gesture')).toBeLessThan(d('vulnerable'));
    expect(d('vulnerable')).toBeLessThan(d('gorgeous'));
    expect(d('gorgeous')).toBeLessThan(d('levity'));
    expect(d('decency')).toBeGreaterThan(0.5); // GRE list, rare
  });

  it('a CET-6 reader: common and CET-4 words are known, rare GRE words are not', () => {
    const p = (w: string) => pUnknown(d(w), PRIOR.mean);
    expect(p('criticize')).toBeLessThan(0.3);
    expect(p('vulnerable')).toBeLessThan(0.4);
    expect(p('levity')).toBeGreaterThan(0.7);
  });

  it('a derived word is at most a little harder than its base', () => {
    expect(familyBases('hopeful')).toContain('hope');
    expect(familyBases('happiness')).toContain('happy');
    expect(familyBases('snobbish')).toContain('snob');
    expect(familyBases('unhappy')).toContain('happy');
    expect(familyBases('corner')).toEqual([]); // -er is not a family suffix: corn is not its base
    expect(d('hopeful')).toBeLessThanOrEqual(d('hope') + 1);
    expect(diff.of('qwxzv')).toBeNull();
  });
});

describe('reader ability (P-02)', () => {
  const at = (dv: number, unknown: boolean, weight = 1): Evidence => ({ d: dv, unknown, weight });

  it('is the prior with no evidence', () => {
    expect(estimateAbility([])).toBeCloseTo(PRIOR.mean, 6);
  });

  it('rises with known hard words and falls with looked-up easy ones', () => {
    const strong = estimateAbility([at(1, false), at(1.5, false), at(2, false), at(1.2, false)]);
    const weak = estimateAbility([at(-1, true), at(-1.5, true), at(-0.5, true)]);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(-0.5);
  });

  it('weights count: a light exposure moves θ less than an undo', () => {
    const light = estimateAbility([at(1, false, 0.15)]);
    const heavy = estimateAbility([at(1, false, 2)]);
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
  });

  it('stays finite with lopsided evidence', () => {
    const t = estimateAbility(Array.from({ length: 500 }, () => at(-3, false)));
    expect(Number.isFinite(t)).toBe(true);
  });
});

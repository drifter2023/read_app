import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DictService } from '../../src/core/dict/service.ts';
import { nodeDictSource } from '../helpers/nodeDict.ts';

const PATH = 'public/dict.db';

/** Checks on the real built dict.db (npm run dict). Skipped on a fresh clone before the first build. */
describe.skipIf(!existsSync(PATH))('dict.db (built)', () => {
  const d = new DictService(nodeDictSource(new DatabaseSync(PATH, { readOnly: true })));

  it('has roughly 60k entries and the licence notices', () => {
    const db = new DatabaseSync(PATH, { readOnly: true });
    const n = (db.prepare('SELECT count(*) AS n FROM entry').get() as { n: number }).n;
    expect(n).toBeGreaterThan(45000);
    expect(n).toBeLessThan(80000);
    const keys = (db.prepare('SELECT key FROM meta').all() as { key: string }[]).map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['license.ecdict', 'license.ipa-dict', 'license.wordnet']));
  });

  it.each([
    ['went', 'go'], ['was', 'be'], ['carried', 'carry'], ['children', 'child'], ['stopped', 'stop'],
    ['wound', 'wound'], ['ground', 'ground'], ['quay', 'quay'], ['wistful', 'wistful'], ['couldn’t', 'can'],
  ])('%s → %s', (w, lemma) => {
    expect(d.lookup(w)?.lemma).toBe(lemma);
  });

  it('picks verb senses for verb forms', () => {
    expect(d.lookup('carried')?.pos).toMatch(/^v/);
    expect(d.lookup('looked')?.pos).toMatch(/^v/);
    expect(d.lookup('couldn’t')?.pos).toBe('aux.');
  });

  it('gives American IPA', () => {
    expect(d.lookup('run')?.phonetic).toBe('/rʌn/');
  });

  it('looks up in well under the 100ms tap budget (R-04)', () => {
    const words = 'The quick brown fox jumped over the lazy dogs while their owners were sleeping soundly'.split(' ');
    const t0 = performance.now();
    for (const w of words) new DictService(nodeDictSource(new DatabaseSync(PATH, { readOnly: true }))).lookup(w);
    expect((performance.now() - t0) / words.length).toBeLessThan(20);
  });
});

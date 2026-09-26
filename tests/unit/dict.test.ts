import { describe, expect, it } from 'vitest';
import { americanIpa, contextClass, defaultSense, firstSense, parseSenses } from '../../src/core/dict/gloss.ts';
import { normaliseWord, resolveLemma } from '../../src/core/dict/lemma.ts';
import { DictService } from '../../src/core/dict/service.ts';
import { fixtureDict } from '../helpers/nodeDict.ts';

describe('normaliseWord (README → Word tap)', () => {
  it('keeps letters, apostrophes and hyphens and trims edge punctuation', () => {
    expect(normaliseWord('“Well,')).toBe('Well');
    expect(normaliseWord('don’t')).toBe("don't");
    expect(normaliseWord('well‑dressed—')).toBe('well-dressed');
    expect(normaliseWord('boys’')).toBe("boys");
    expect(normaliseWord('…')).toBe('');
  });
});

describe('resolveLemma (R-04)', () => {
  const lex = fixtureDict();
  const lemma = (w: string, opts = {}) => resolveLemma(w, lex, opts)?.lemma ?? null;

  it('resolves irregular and regular inflections through the forms table and suffix rules', () => {
    expect(lemma('went')).toBe('go');
    expect(lemma('was')).toBe('be');
    expect(lemma('carried')).toBe('carry');
    expect(lemma('boats')).toBe('boat');
    expect(lemma('eyes')).toBe('eye'); // not in forms: suffix rule
    expect(lemma('looking')).toBe('look');
  });
  it('reports the class an inflection implies', () => {
    expect(resolveLemma('carried', lex)?.kind).toBe('v');
    expect(resolveLemma('boats', lex)?.kind).toBe('n');
    expect(resolveLemma('looks', lex)?.kind).toBeNull();
  });
  it('strips clitics', () => {
    expect(lemma('couldn’t')).toBe('can');
    expect(lemma("don't")).toBe('do');
    expect(lemma('I’m', { sentenceInitial: true })).toBe('I');
  });
  it('lower-cases a capital only at the start of a sentence', () => {
    expect(lemma('Running', { sentenceInitial: true })).toBe('run');
    expect(lemma('Running')).toBeNull(); // mid-sentence capital = a name
  });
  it('falls back to a capitalised headword for lowercase words ECDICT only files capitalised', () => {
    expect(lemma('north')).toBe('North');
  });
  it('tries a hyphenated word whole, then the tapped part, then its parts', () => {
    expect(lemma('well-dressed')).toBe('well-dressed');
    expect(lemma('bright-eyed', { part: 'bright' })).toBe('bright');
    expect(lemma('bright-eyes')).toBe('eye');
  });
  it('returns null for non-words', () => {
    expect(lemma('—')).toBeNull();
    expect(lemma('zzzq')).toBeNull();
  });
});

describe('parseSenses / defaultSense', () => {
  const carry = 'n. 进位, 射程, 运载\\nvt. 携带, 运送, 支持, 传送, 包含\\nvi. 被携带, 能达到\\n[计] 进位; 进位数';
  it('keeps one line per class, the fullest, and drops domain tags', () => {
    const s = parseSenses(carry);
    expect(s.map((x) => x.cls)).toEqual(['n', 'v']);
    expect(s.find((x) => x.cls === 'v')?.gloss).toBe('携带，运送，支持，传送');
  });
  it('picks the fullest class by default and preferred classes for function words', () => {
    expect(defaultSense('carry', parseSenses(carry))?.pos).toBe('vt.');
    expect(defaultSense('can', parseSenses('vt. 装罐\\nn. 罐头, 容器\\naux. 能, 可以'))?.cls).toBe('aux');
  });
  it('drops bare inflection notes and bracketed inflection remarks', () => {
    expect(parseSenses('run的过去式')).toEqual([]);
    expect(parseSenses('v. 看, 瞧( look的过去式和过去分词 ); 注意')[0]?.gloss).toBe('看，瞧，注意');
  });
});

describe('contextClass', () => {
  it('reads a verb after to/modals/pronouns and a noun after a determiner only against a verb default', () => {
    expect(contextClass('to', { cls: 'n' })).toBe('v');
    expect(contextClass('the', { cls: 'v' })).toBe('n');
    expect(contextClass('a', { cls: 'adj' })).toBeNull();
    expect(contextClass(undefined, { cls: 'v' })).toBeNull();
  });
});

describe('firstSense / americanIpa', () => {
  it('footnote is the first sense without brackets', () => {
    expect(firstSense('离开（去…），出发')).toBe('离开');
  });
  it('normalises ipa-dict to learner-dictionary American IPA', () => {
    expect(americanIpa('/ˈɹən/')).toBe('/rʌn/');
    expect(americanIpa('/ˈɫʊk/')).toBe('/lʊk/');
    expect(americanIpa('/əˈbəv/, /əˈbʌv/')).toBe('/əˈbʌv/');
    expect(americanIpa('/ˈkæɹi/')).toBe('/ˈkæri/');
  });
});

describe('DictService (R-04)', () => {
  it('uses the inflection class to choose the sense', () => {
    const d = new DictService(fixtureDict());
    expect(d.lookup('carried')).toMatchObject({ lemma: 'carry', pos: 'vt.', footnote: '携带' });
    expect(d.lookup('could')).toMatchObject({ lemma: 'can', pos: 'aux.' });
  });
  it('uses the previous word when the form says nothing', () => {
    const d = new DictService(fixtureDict());
    expect(d.lookup('look')?.pos).toBe('vi.');
    expect(d.lookup('look', { prevWord: 'the' })?.pos).toBe('n.');
  });
  it('returns null for a word it cannot find', () => {
    expect(new DictService(fixtureDict()).lookup('Gatsby')).toBeNull();
  });
  it('caches results (LRU) and evicts the oldest', () => {
    const src = fixtureDict();
    let calls = 0;
    const counting = { ...src, entry: (w: string) => { calls++; return src.entry(w); } };
    const d = new DictService(counting, 2);
    d.lookup('went'); d.lookup('went');
    expect(calls).toBe(1);
    d.lookup('carried'); d.lookup('boats'); d.lookup('went');
    expect(calls).toBe(4);
  });
  it('formsOf returns every surface form of the given lemmas, lower-cased', () => {
    const d = new DictService(fixtureDict());
    expect([...d.formsOf(['run', 'North'])].sort()).toEqual(['north', 'ran', 'run', 'running']);
  });
});

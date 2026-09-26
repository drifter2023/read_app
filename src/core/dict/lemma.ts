import type { PosClass } from './gloss.ts';
import type { Lexicon, Resolution } from './types.ts';

/** README → Word tap: keep letters, apostrophes and hyphens; also unify curly apostrophes. */
export function normaliseWord(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐‑]/g, '-')
    .replace(/[^A-Za-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

const CLITIC_WHOLE: Record<string, string> = {
  "won't": 'will', "can't": 'can', "shan't": 'shall', "ain't": 'be', "i'm": 'I', "let's": 'let',
};
const CLITIC_SUFFIX = /(n't|'s|'re|'ve|'ll|'d|'m)$/;

/** WordNet morphy detachment rules (suffix → replacement → implied class), then a few English extras. */
const RULES: readonly [string, string, PosClass | null][] = [
  ['ies', 'y', null], ['ied', 'y', 'v'], ['ier', 'y', 'adj'], ['iest', 'y', 'adj'],
  ['ses', 's', 'n'], ['ves', 'f', 'n'], ['xes', 'x', null], ['zes', 'z', null], ['ches', 'ch', null], ['shes', 'sh', null],
  ['men', 'man', 'n'], ['es', 'e', null], ['es', '', null], ['s', '', null],
  ['ed', 'e', 'v'], ['ed', '', 'v'], ['ing', 'e', 'v'], ['ing', '', 'v'],
  ['er', 'e', 'adj'], ['er', '', 'adj'], ['est', 'e', 'adj'], ['est', '', 'adj'],
];

export function* ruleCandidates(w: string): Generator<Resolution> {
  for (const [suf, rep, kind] of RULES) {
    if (w.length <= suf.length + 1 || !w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    yield { lemma: stem + rep, kind };
    // running → runn → run, stopped → stopp → stop
    if (rep === '' && stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) yield { lemma: stem.slice(0, -1), kind };
  }
}

/** Lemma for one word with no clitics, or null. Inflections resolve to their lemma first. */
function lemmaOf(w: string, lex: Lexicon): Resolution | null {
  for (const l of lex.lemmasOf(w)) if (lex.has(l.lemma)) return l;
  if (lex.has(w)) return { lemma: w, kind: null };
  for (const c of ruleCandidates(w)) if (lex.has(c.lemma)) return c;
  return null;
}

export function stripClitic(w: string): string {
  const lower = w.toLowerCase();
  if (CLITIC_WHOLE[lower]) return CLITIC_WHOLE[lower];
  if (/s'$/.test(w)) return w.slice(0, -1);
  return w.replace(CLITIC_SUFFIX, '');
}

export interface ResolveOpts {
  /** The word opens its sentence, so a capital letter says nothing about it being a name. */
  sentenceInitial?: boolean;
  /** For hyphenated words: the part the reader actually tapped. */
  part?: string;
}

/**
 * Surface form → lemma (research doc §3): clitics, forms table, exact entry, suffix rules, hyphens.
 * A capitalised word inside a sentence is treated as a name and only matched as written.
 */
export function resolveLemma(surface: string, lex: Lexicon, opts: ResolveOpts = {}): Resolution | null {
  const w = normaliseWord(surface);
  if (!w) return null;
  const core = stripClitic(w);
  if (!core) return null;

  const capital = /^[A-Z]/.test(core);
  const allCaps = core.length > 1 && core === core.toUpperCase();
  const lowerOk = !capital || opts.sentenceInitial || allCaps || core === 'I';
  const variants = lowerOk && core !== core.toLowerCase() ? [core, core.toLowerCase()] : [core];

  // ECDICT files a few common words only under a capital ("North", "I").
  if (core === core.toLowerCase()) variants.push(core[0]!.toUpperCase() + core.slice(1));
  for (const v of variants) {
    const hit = lemmaOf(v, lex);
    if (hit) return hit;
  }
  if (core.includes('-')) {
    const parts = core.split('-').filter(Boolean);
    const joined = parts.join('');
    const tries = [joined, ...(opts.part ? [normaliseWord(opts.part)] : []), ...parts.slice().reverse()];
    for (const t of tries) {
      const hit = resolveLemma(t, lex, { sentenceInitial: lowerOk });
      if (hit) return hit;
    }
  }
  return null;
}

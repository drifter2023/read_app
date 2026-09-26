/** Part-of-speech classes the lookup reasons about. `vt.`/`vi.` are both `v`. */
export type PosClass = 'n' | 'v' | 'aux' | 'adj' | 'adv' | 'prep' | 'conj' | 'pron' | 'int' | 'num' | 'art' | 'other';

/** One POS line of an ECDICT translation: its label as shown ("vt."), its class and up to four senses. */
export interface Sense { pos: string; cls: PosClass; gloss: string; count: number }

const LABEL: Record<string, string> = { a: 'adj.', ad: 'adv.', s: 'adj.', r: 'adv.', j: 'adj.', interj: 'int.' };
const CLASS: Record<string, PosClass> = {
  n: 'n', v: 'v', vt: 'v', vi: 'v', aux: 'aux', a: 'adj', adj: 'adj', s: 'adj', j: 'adj', ad: 'adv', adv: 'adv',
  r: 'adv', prep: 'prep', conj: 'conj', pron: 'pron', int: 'int', interj: 'int', num: 'num', art: 'art',
};
/** Function words whose most useful reading is not the one with the most senses. */
const PREFERRED: Record<string, PosClass> = {
  can: 'aux', may: 'aux', must: 'aux', will: 'aux', shall: 'aux', like: 'prep', back: 'adv', well: 'adv',
  still: 'adv', just: 'adv', down: 'adv', up: 'adv', out: 'adv', off: 'adv', over: 'prep', round: 'adv',
  since: 'conj', as: 'conj', so: 'adv', that: 'pron', right: 'adj', last: 'adj', only: 'adv', even: 'adv',
  very: 'adv', about: 'prep', after: 'prep', before: 'prep', near: 'prep', past: 'prep', through: 'prep',
};

const INFLECTION_NOTE = /的(过去式|过去分词|现在分词|复数|第三人称单数|比较级|最高级)/;
const MAX_SENSES = 4;

/**
 * All POS lines from an ECDICT `translation` field, one per class (the fullest line wins).
 * Skips domain tags ("[网络]", "[医]") and bare inflection notes ("find的过去式").
 */
export function parseSenses(translation: string): Sense[] {
  const byClass = new Map<PosClass, Sense>();
  let bare: Sense | null = null;
  for (const raw of translation.split(/\\n|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('[')) continue;
    const m = /^([a-z]{1,6})\.\s*(.+)$/.exec(line);
    if (!m) {
      if (!bare && !INFLECTION_NOTE.test(line)) bare = toSense('', 'other', line);
      continue;
    }
    const s = toSense(LABEL[m[1]!] ?? `${m[1]}.`, CLASS[m[1]!] ?? 'other', m[2]!);
    if (!s.gloss) continue;
    const prev = byClass.get(s.cls);
    if (!prev || s.count > prev.count) byClass.set(s.cls, s);
  }
  const out = [...byClass.values()];
  if (!out.length && bare?.gloss) out.push(bare);
  return out;
}

function toSense(pos: string, cls: PosClass, text: string): Sense {
  const all = text
    .replace(/[(（][^()（）]*的(过去式|过去分词|现在分词|复数|第三人称单数|比较级|最高级)[^()（）]*[)）]/g, '')
    .split(/\s*[,，;；]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  return { pos, cls, gloss: all.slice(0, MAX_SENSES).join('，'), count: all.length };
}

/** Part-of-speech evidence for one lemma, counted over real text (see `posVote`). */
export type PosVotes = Partial<Record<PosClass, number>>;

/**
 * The reading shown when context says nothing: a preferred class for function words; else the class
 * the evidence clearly favours (≥ 3 votes and 1.5× the runner-up); else the fullest line, with
 * ECDICT's own line order breaking ties ("summer": n. before vi.).
 */
export function defaultSense(word: string, senses: Sense[], votes: PosVotes = {}): Sense | undefined {
  const pref = PREFERRED[word.toLowerCase()];
  const hit = pref && senses.find((s) => s.cls === pref);
  if (hit) return hit;
  const ranked = senses.map((s) => ({ s, v: votes[s.cls] ?? 0 })).sort((a, b) => b.v - a.v);
  if (ranked[0] && ranked[0].v >= 3 && ranked[0].v >= 1.5 * (ranked[1]?.v ?? 0)) return ranked[0].s;
  return senses.reduce<Sense | undefined>((best, s) => (!best || s.count > best.count ? s : best), undefined);
}

const NOUN_AFTER = new Set(['of', 'in', 'on', 'at', 'to', 'with', 'and', 'or', 'was', 'is', 'had', 'that', 'from', 'for', 'by', 'were', 'came']);

/**
 * One vote from one occurrence: the inflection's class, or a context cue ("to look" → v;
 * "the summer of" / "the summer." → n). A determiner alone is not enough ("a good man").
 */
export function posVote(kind: PosClass | null, prev: string | undefined, next: string | undefined): PosClass | null {
  if (kind) return kind;
  const p = prev?.toLowerCase().replace(/[‘’]/g, "'");
  if (p && VERB_CUES.has(p)) return 'v';
  if (p && NOUN_CUES.has(p) && (next === undefined || NOUN_AFTER.has(next.toLowerCase()))) return 'n';
  return null;
}

/** Choose a sense for a wanted class; `v` also accepts `aux` and the reverse. */
export function senseFor(senses: Sense[], want: PosClass | null, fallback: Sense): Sense {
  if (!want) return fallback;
  return senses.find((s) => s.cls === want)
    ?? (want === 'v' ? senses.find((s) => s.cls === 'aux') : want === 'aux' ? senses.find((s) => s.cls === 'v') : undefined)
    ?? fallback;
}

const VERB_CUES = new Set(['to', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must', 'did',
  'do', 'does', "don't", "didn't", "doesn't", "won't", "wouldn't", "couldn't", "shouldn't", "can't", 'let', 'please',
  'i', 'you', 'we', 'they', 'he', 'she']);
const NOUN_CUES = new Set(['a', 'an', 'the', 'this', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our',
  'their', 'some', 'any', 'no', 'every', 'each']);

/** A one-word context cue: after "to"/a modal/a subject pronoun a verb; after a determiner a noun. */
export function contextClass(prevWord: string | undefined, def: Pick<Sense, 'cls'> | undefined): PosClass | null {
  const p = prevWord?.toLowerCase().replace(/[‘’]/g, "'");
  if (!p) return null;
  if (VERB_CUES.has(p)) return 'v';
  // After a determiner, only override a verb default ("the look"); "a good man" keeps its adjective.
  if (NOUN_CUES.has(p) && (def?.cls === 'v' || def?.cls === 'aux')) return 'n';
  return null;
}

/** The footnote text: the first sense without bracketed notes, e.g. "离开" from "离开，出发（去…）". */
export function firstSense(gloss: string): string {
  const first = gloss.split('，')[0] ?? '';
  return first.replace(/[(（][^()（）]*[)）]/g, '').trim() || first.trim();
}

const VOWEL = 'aeiouæɑɒɔəɛɪʊʌɝɚ';
/**
 * ipa-dict en_US → the style of American learner dictionaries: first variant only, r/l instead of
 * ɹ/ɫ, ʌ for a stressed ə, and no stress mark on one-syllable words ("/ˈɹən/" → "/rʌn/").
 */
export function americanIpa(field: string): string {
  let s = (field.split(',')[0] ?? '').trim().replace(/^\/|\/$/g, '');
  if (!s) return '';
  s = s.replace(/ɹ/g, 'r').replace(/ɫ/g, 'l');
  s = s.replace(new RegExp(`([ˈˌ][^${VOWEL}]*)ə`, 'g'), '$1ʌ');
  // ɝ is the stressed r-vowel; after another vowel or outside the stressed syllable it is ɚ ("fire", "summer").
  s = s.replace(new RegExp(`([${VOWEL}])ɝ`, 'g'), '$1ɚ');
  let stressed = false;
  let out = '';
  for (const ch of s) {
    if (ch === 'ˈ' || ch === 'ˌ') stressed = true;
    else if (VOWEL.includes(ch)) {
      out += ch === 'ɝ' && !stressed ? 'ɚ' : ch;
      stressed = false;
      continue;
    }
    out += ch;
  }
  s = out;
  const nuclei = s.match(new RegExp(`[${VOWEL}]+`, 'g'))?.length ?? 0;
  if (nuclei <= 1) s = s.replace(/[ˈˌ]/g, '');
  return `/${s}/`;
}

/** Class of a stored POS label ("vt." → v). */
export function classOfLabel(label: string): PosClass {
  return CLASS[label.replace(/\.$/, '')] ?? (label === 'adj.' ? 'adj' : label === 'adv.' ? 'adv' : label === 'int.' ? 'int' : 'other');
}

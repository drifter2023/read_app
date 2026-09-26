import { normaliseWord, ruleCandidates, stripClitic } from '../dict/lemma.ts';
import type { DictService } from '../dict/service.ts';
import type { Footnote } from '../reader/decorate.ts';
import type { Annotator } from '../reader/engine.ts';
import { wordContext, words } from '../reader/words.ts';

/**
 * R-06: every word whose lemma is in `seen` gets its first sense as a footnote. A Set of the seen
 * lemmas' surface forms filters words cheaply; only candidates go through the full lookup.
 */
export function footnoteAnnotator(dict: DictService, seen: ReadonlySet<string>): Annotator {
  if (!seen.size) return () => [];
  const forms = dict.formsOf(seen);
  const lowerSeen = new Set([...seen].map((l) => l.toLowerCase()));
  const candidate = (w: string): boolean => {
    const core = stripClitic(normaliseWord(w)).toLowerCase();
    if (forms.has(core)) return true;
    for (const c of ruleCandidates(core)) if (lowerSeen.has(c.lemma)) return true;
    return false;
  };
  return (_chapter, _para, p, text) => {
    const out: Footnote[] = [];
    for (const w of words(text)) {
      if (!candidate(w.word)) continue;
      const r = dict.lookup(w.word, wordContext(p, w.start));
      if (r && seen.has(r.lemma)) out.push({ start: w.start, end: w.end, text: r.footnote });
    }
    return out;
  };
}

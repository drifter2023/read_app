import { countWords } from '../ingest/text.ts';
import type { Anchor, ChapterData } from '../types.ts';

export interface PageSentence { para: number; sentence: number; text: string }
/** The text around the reader's position, as the Agent drawer's sentence picker shows it. */
export interface Page { chapter: number; chapterTitle: string; paras: { para: number; sentences: PageSentence[] }[] }

/** The anchor's paragraph with one paragraph on each side (clipped to the chapter). */
export function pageAround(chapters: ChapterData[], a: Anchor): Page {
  const ch = chapters[Math.min(Math.max(a.chapter, 0), chapters.length - 1)];
  if (!ch) return { chapter: a.chapter, chapterTitle: '', paras: [] };
  const mid = Math.min(Math.max(a.para, 0), Math.max(0, ch.paras.length - 1));
  const paras: Page['paras'] = [];
  for (let p = Math.max(0, mid - 1); p <= Math.min(ch.paras.length - 1, mid + 1); p++) {
    const sentences = (ch.paras[p] ?? []).map((text, sentence) => ({ para: p, sentence, text }));
    if (sentences.length) paras.push({ para: p, sentences });
  }
  return { chapter: ch.idx, chapterTitle: ch.title, paras };
}

export function flatten(page: Page): PageSentence[] {
  return page.paras.flatMap((p) => p.sentences);
}

/** The sentence of the page nearest to the anchor (the anchor itself when it is on the page). */
export function defaultIndex(page: Page, a: Anchor): number {
  const flat = flatten(page);
  const exact = flat.findIndex((s) => s.para === a.para && s.sentence === a.sentence);
  if (exact >= 0) return exact;
  const inPara = flat.findIndex((s) => s.para === a.para);
  return inPara >= 0 ? inPara : 0;
}

/** Newest words of the chapter up to the end of the page: all the agent may use (no spoilers). */
export function readingContext(chapters: ChapterData[], page: Page, maxWords = 450): string {
  const ch = chapters[page.chapter];
  const last = page.paras[page.paras.length - 1];
  if (!ch || !last) return '';
  const out: string[] = [];
  let words = 0;
  for (let p = last.para; p >= 0 && words < maxWords; p--) {
    const text = (ch.paras[p] ?? []).join(' ');
    out.unshift(text);
    words += countWords(text);
  }
  return out.join('\n');
}

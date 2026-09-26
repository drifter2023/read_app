import { countWords, paragraphText, sentenceStarts } from '../ingest/text.ts';
import type { ChapterData } from '../types.ts';

export interface LineMeta {
  el: HTMLElement;
  chapter: number;
  /** -1 for the chapter heading line. */
  para: number;
  /** First and last sentence index (within `para`) this line touches. */
  sFirst: number;
  sLast: number;
  /** Book-level word count up to the end of this line. */
  wordEnd: number;
}

/**
 * Words the browser may break inside: long ones (overflow-wrap:anywhere) and ones with a dash,
 * hyphen or slash, where engines break even next to a word joiner.
 */
const LONG_WORD = 24;
const BREAKABLE = /[-‐‑–—/]/;

/**
 * Offsets where each visual line of `text` starts when laid out in `probe`
 * (same font and width as the column). One Range read per word, once per layout.
 */
export function breakLines(probe: HTMLElement, text: string): number[] {
  probe.textContent = text;
  const node = probe.firstChild;
  if (!(node instanceof Text) || text.length === 0) return [0];
  const range = probe.ownerDocument.createRange();
  const topAt = (i: number): number | null => {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    return range.getClientRects()[0]?.top ?? null;
  };

  const starts = [0];
  let lineTop = topAt(0) ?? 0;
  const word = /\S+/g;
  for (let m = word.exec(text); m; m = word.exec(text)) {
    const first = m.index;
    const t = topAt(first);
    if (t !== null && t > lineTop + 1) {
      if (first > 0) starts.push(first);
      lineTop = t;
    }
    if (m[0].length >= LONG_WORD || BREAKABLE.test(m[0])) {
      const last = first + m[0].length - 1;
      const tl = topAt(last);
      if (tl !== null && tl > lineTop + 1) {
        for (let i = first + 1; i <= last; i++) {
          const ti = topAt(i);
          if (ti !== null && ti > lineTop + 1) {
            starts.push(i);
            lineTop = ti;
          }
        }
      }
    }
  }
  return starts;
}

/** Lays out one chapter into fixed-height line elements. Nothing is attached to the document. */
export function layoutChapter(probe: HTMLElement, ch: ChapterData): { block: HTMLElement; lines: LineMeta[] } {
  const doc = probe.ownerDocument;
  const block = doc.createElement('div');
  block.className = 'rd-chapter';
  block.dataset.ch = String(ch.idx);
  const add = (text: string, cls: string): HTMLElement => {
    const el = doc.createElement('div');
    el.className = cls;
    el.textContent = text;
    block.append(el);
    return el;
  };

  const lines: LineMeta[] = [];
  add('', 'rd-blank');
  lines.push({ el: add(ch.title, 'rd-line rd-head'), chapter: ch.idx, para: -1, sFirst: 0, sLast: 0, wordEnd: ch.wordStart });
  add('', 'rd-blank');

  let words = ch.wordStart;
  ch.paras.forEach((p, pi) => {
    if (pi > 0) add('', 'rd-blank');
    const text = paragraphText(p);
    const starts = breakLines(probe, text);
    const sStarts = sentenceStarts(p);
    let s = 0;
    starts.forEach((a, li) => {
      const b = starts[li + 1] ?? text.length;
      const slice = text.slice(a, b).trimEnd();
      while (s + 1 < sStarts.length && sStarts[s + 1]! <= a) s++;
      let sLast = s;
      while (sLast + 1 < sStarts.length && sStarts[sLast + 1]! < b) sLast++;
      words += countWords(slice);
      const el = add(slice, 'rd-line');
      el.dataset.p = String(pi);
      lines.push({ el, chapter: ch.idx, para: pi, sFirst: s, sLast, wordEnd: words });
    });
  });
  add('', 'rd-blank');
  probe.textContent = '';
  return { block, lines };
}

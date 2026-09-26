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
  /** Offset of the line's first character in the paragraph text (0 for the heading). */
  start: number;
  /** Row of this line in its chapter block. Every row is one line-height tall, so top = rows × lh. */
  row: number;
  /** Book-level word count up to the end of this line. */
  wordEnd: number;
  /** Paragraph offsets just past each sentence that ends on this line (where its grammar droplet goes). */
  ends: number[];
  /** x of each of those ends from the line's left edge, measured once in the probe. */
  endX: number[];
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

/**
 * Lays out one chapter into fixed-height line elements, a few paragraphs at a time, so a long
 * chapter can be prepared in the background without blocking a frame. Nothing is attached to the
 * document; the probe is only borrowed during `step`.
 */
export class ChapterLayout {
  readonly block: HTMLElement;
  readonly lines: LineMeta[] = [];
  #probe: HTMLElement;
  #ch: ChapterData;
  #para = 0;
  #words: number;
  #done = false;

  constructor(probe: HTMLElement, ch: ChapterData) {
    this.#probe = probe;
    this.#ch = ch;
    this.#words = ch.wordStart;
    this.block = probe.ownerDocument.createElement('div');
    this.block.className = 'rd-chapter';
    this.block.dataset.ch = String(ch.idx);
    this.#add('', 'rd-blank');
    this.lines.push({ el: this.#add(ch.title, 'rd-line rd-head'), chapter: ch.idx, para: -1, sFirst: 0, sLast: 0, start: 0, row: 1, wordEnd: ch.wordStart, ends: [], endX: [] });
    this.#add('', 'rd-blank');
  }

  get done(): boolean {
    return this.#done;
  }

  /** Lays out paragraphs until `deadline` (a `performance.now()` time) passes. Returns true when the chapter is complete. */
  step(deadline = Infinity): boolean {
    const paras = this.#ch.paras;
    while (!this.#done && this.#para < paras.length) {
      this.#layoutPara(this.#para++);
      if (performance.now() >= deadline) break;
    }
    if (!this.#done && this.#para >= paras.length) {
      this.#add('', 'rd-blank');
      this.#probe.textContent = '';
      this.#done = true;
    }
    return this.#done;
  }

  #add(text: string, cls: string): HTMLElement {
    const el = this.block.ownerDocument.createElement('div');
    el.className = cls;
    el.textContent = text;
    this.block.append(el);
    return el;
  }

  #layoutPara(pi: number): void {
    const p = this.#ch.paras[pi]!;
    if (pi > 0) this.#add('', 'rd-blank');
    const text = paragraphText(p);
    const starts = breakLines(this.#probe, text);
    const endX = sentenceEndX(this.#probe, p);
    const sStarts = sentenceStarts(p);
    const sEnds = sStarts.map((x, i) => x + p[i]!.length);
    let s = 0;
    starts.forEach((a, li) => {
      const b = starts[li + 1] ?? text.length;
      const slice = text.slice(a, b).trimEnd();
      while (s + 1 < sStarts.length && sStarts[s + 1]! <= a) s++;
      let sLast = s;
      while (sLast + 1 < sStarts.length && sStarts[sLast + 1]! < b) sLast++;
      this.#words += countWords(slice);
      const row = this.block.childElementCount;
      const el = this.#add(slice, 'rd-line');
      el.dataset.p = String(pi);
      const mine = sEnds.map((e, k) => [e, k] as const).filter(([e]) => e > a && e <= a + slice.length);
      this.lines.push({
        el, chapter: this.#ch.idx, para: pi, sFirst: s, sLast, start: a, row, wordEnd: this.#words,
        ends: mine.map(([e]) => e), endX: mine.map(([, k]) => endX[k]!),
      });
    });
  }
}

/**
 * x of each sentence's last character's right edge, from the left of its visual line, while the
 * probe still holds the paragraph (`breakLines` just laid it out). One Range read per sentence.
 */
function sentenceEndX(probe: HTMLElement, p: string[]): number[] {
  const node = probe.firstChild;
  if (!(node instanceof Text)) return p.map(() => 0);
  const left = probe.getBoundingClientRect().left;
  const range = probe.ownerDocument.createRange();
  return sentenceStarts(p).map((st, k) => {
    const e = st + p[k]!.length;
    range.setStart(node, e - 1);
    range.setEnd(node, e);
    const rects = range.getClientRects();
    const r = rects[rects.length - 1];
    return r ? r.right - left : 0;
  });
}

/** Lays out a whole chapter at once (opening a book, font-size change, jumps). */
export function layoutChapter(probe: HTMLElement, ch: ChapterData): { block: HTMLElement; lines: LineMeta[] } {
  const job = new ChapterLayout(probe, ch);
  job.step();
  return job;
}

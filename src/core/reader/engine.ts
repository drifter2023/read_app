import type { Prefs } from '../prefs/prefs.ts';
import { TYPE_SCALE } from '../prefs/prefs.ts';
import { paragraphText } from '../ingest/text.ts';
import type { Anchor, ChapterData, Paragraph } from '../types.ts';
import { lineOffset, lineRange, renderLine, type Footnote } from './decorate.ts';
import { bandFor, blurPx, opacityFor, tFor, withSentencePenalty } from './focus.ts';
import { layoutChapter, type LineMeta } from './layout.ts';
import { wordBounds, wordContext } from './words.ts';

export interface EngineBook { id: string; wordCount: number; chapters: ChapterData[] }
/** `words` is the book-level word index at the band centre, for session metrics. */
export interface Progress { chapter: number; chapterTitle: string; pct: number; words: number }
export interface EngineCallbacks {
  onProgress?: (p: Progress) => void;
  onAnchor?: (a: Anchor) => void;
  /** Lines were rebuilt (font size or width change); anything attached to old lines is gone. */
  onRelayout?: () => void;
}

/** Footnotes for one paragraph; the engine calls it for mounted paragraphs only (R-06). */
export type Annotator = (chapter: number, para: number, p: Paragraph, text: string) => Footnote[];

/** A tapped word (README → Word tap). Offsets are in the paragraph text. */
export interface WordHit {
  chapter: number; para: number; sentence: number; start: number; end: number; word: string;
  sentenceText: string; sentenceInitial: boolean; prevWord?: string;
  lineIndex: number; rect: DOMRect;
}
export interface Highlight { chapter: number; para: number; start: number; end: number }

const SIDE = 34;
const IDLE_MS = 180;

/** First index i with arr[i] >= x. */
function lowerBound(arr: Float64Array, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m]! < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Owns the reader's scroll container. Lays chapters out once into fixed-height lines,
 * then on scroll writes filter/opacity directly to lines within ±1 viewport.
 */
export class ReaderEngine {
  readonly stats = { paints: 0, styleWrites: 0, lastPaintMs: 0 };
  #scroller: HTMLElement;
  #content: HTMLElement;
  #probe: HTMLElement;
  #book: EngineBook;
  #prefs: Prefs;
  #cb: EngineCallbacks;
  #blocks = new Map<number, { block: HTMLElement; lines: LineMeta[] }>();
  #lines: LineMeta[] = [];
  #top = new Float64Array(0);
  #blur = new Float64Array(0);
  #opa = new Float64Array(0);
  #win: [number, number] = [0, 0];
  #H = 0;
  #W = 0;
  #lh = 34;
  #raf = 0;
  #idle = 0;
  #progressKey = '';
  #mounted = false;
  #destroyed = false;
  #ro: ResizeObserver;
  #index = new WeakMap<HTMLElement, number>();
  #annotate: Annotator | null = null;
  #decorated = new Set<HTMLElement>();
  #hl: Highlight | null = null;
  /** The drawer host after line `#gapLine`, and its current height; lines below shift by `#gap`. */
  #gapHost: HTMLElement | null = null;
  #gapLine = -1;
  #gap = 0;

  constructor(scroller: HTMLElement, book: EngineBook, prefs: Prefs, cb: EngineCallbacks = {}) {
    this.#scroller = scroller;
    this.#book = book;
    this.#prefs = prefs;
    this.#cb = cb;
    scroller.classList.add('rd-scroll');
    this.#content = document.createElement('div');
    this.#content.className = 'rd-content';
    this.#probe = document.createElement('div');
    this.#probe.className = 'rd-probe';
    scroller.append(this.#content, this.#probe);
    scroller.addEventListener('scroll', this.#onScroll, { passive: true });
    this.#ro = new ResizeObserver(this.#onResize);
  }

  get scroller(): HTMLElement {
    return this.#scroller;
  }

  async mount(anchor: Anchor | null): Promise<void> {
    this.#applyTypography();
    const { size } = TYPE_SCALE[this.#prefs.fontSize];
    await Promise.all([
      document.fonts.load(`${size}px "Newsreader Variable"`),
      document.fonts.load('11px "IBM Plex Sans"'),
    ]);
    if (this.#destroyed) return; // destroyed while waiting for fonts (e.g. StrictMode remount)
    this.#measureViewport();
    const a = anchor ?? { chapter: 0, para: 0, sentence: 0 };
    this.#setWindow(this.#clampChapter(a.chapter));
    this.scrollToAnchor(a);
    this.#mounted = true;
    this.#ro.observe(this.#scroller);
    this.paintNow();
  }

  paintNow(): void {
    const n = this.#lines.length;
    if (!n) return;
    const t0 = performance.now();
    const st = this.#scroller.scrollTop;
    const H = this.#H;
    const lh = this.#lh;
    const band = bandFor(H, this.#prefs.focusPct);
    const mid = st + H / 2;
    const gap = this.#gap;
    const gl = this.#gapLine;
    const lo = lowerBound(this.#top, st - H - gap);
    const hi = lowerBound(this.#top, st + 2 * H);
    this.#moveWindow(lo, hi);
    const full = this.#prefs.tier !== 'fallback';
    const bmax = this.#prefs.blurMax;
    const cur = this.#prefs.sentenceMode ? this.#lines[this.#lineAtY(mid)] : undefined;

    for (let i = lo; i < hi; i++) {
      const line = this.#lines[i]!;
      const top = gap && gl >= 0 && i > gl ? this.#top[i]! + gap : this.#top[i]!;
      let t = tFor(Math.abs(top + lh / 2 - mid), band);
      if (cur && !(line.chapter === cur.chapter && line.para === cur.para && line.sFirst <= cur.sFirst && cur.sFirst <= line.sLast)) {
        t = withSentencePenalty(t);
      }
      const b = full ? blurPx(t, bmax) : 0;
      const o = opacityFor(t);
      if (b !== this.#blur[i]) {
        line.el.style.filter = b > 0 ? `blur(${b}px)` : 'none';
        this.#blur[i] = b;
        this.stats.styleWrites++;
      }
      if (o !== this.#opa[i]) {
        line.el.style.opacity = String(o);
        this.#opa[i] = o;
        this.stats.styleWrites++;
      }
    }
    this.#emitProgress(mid);
    this.stats.paints++;
    this.stats.lastPaintMs = performance.now() - t0;
  }

  setPrefs(p: Prefs): void {
    const prev = this.#prefs;
    this.#prefs = p;
    if (!this.#mounted) return;
    if (p.fontSize !== prev.fontSize) {
      const a = this.currentAnchor();
      this.#relayout(a);
      return;
    }
    if (p.tier !== prev.tier) {
      for (const l of this.#lines) l.el.style.filter = '';
      this.#blur.fill(Number.NaN);
      this.#win = [0, 0];
    }
    this.paintNow();
  }

  currentAnchor(): Anchor {
    const lines = this.#lines;
    if (!lines.length) return { chapter: 0, para: 0, sentence: 0 };
    const half = bandFor(this.#H, this.#prefs.focusPct).half;
    const bandTop = this.#scroller.scrollTop + this.#H / 2 - half;
    let i = this.#gap && this.#gapLine >= 0 && bandTop > this.#top[this.#gapLine]! + this.#lh
      ? lowerBound(this.#top, bandTop - this.#gap - this.#lh / 2)
      : lowerBound(this.#top, bandTop - this.#lh / 2);
    while (i < lines.length - 1 && lines[i]!.para < 0) i++;
    const l = lines[Math.min(i, lines.length - 1)]!;
    return { chapter: l.chapter, para: Math.max(0, l.para), sentence: l.sFirst };
  }

  scrollToAnchor(a: Anchor): void {
    if (!this.#blocks.has(a.chapter)) this.#setWindow(this.#clampChapter(a.chapter));
    this.#scrollToLine(this.#findLine(a));
  }

  /** R-10: jump to a chapter and put its heading line in the focus band. */
  scrollToChapter(idx: number): void {
    const c = this.#clampChapter(idx);
    if (!this.#blocks.has(c)) this.#setWindow(c);
    this.#scrollToLine(this.#lines.findIndex((l) => l.chapter === c && l.para < 0));
    this.paintNow();
  }

  #scrollToLine(i: number): void {
    if (i < 0) return;
    const half = bandFor(this.#H, this.#prefs.focusPct).half;
    // Put the anchor line at the top of the band (or at the centre if the band is thinner than a line).
    const centre = this.#H / 2 - Math.max(0, half - this.#lh / 2);
    this.#scroller.scrollTop = this.#top[i]! + this.#lh / 2 - centre;
  }

  /** Sets the footnote source and re-decorates mounted chapters. */
  setAnnotator(fn: Annotator | null): void {
    this.#annotate = fn;
    this.refreshAnnotations();
  }

  /** Re-runs the annotator over mounted paragraphs, e.g. after a new lookup joins `seen`. */
  refreshAnnotations(): void {
    for (const [idx, { lines }] of this.#blocks) this.#decorate(idx, lines);
  }

  /** The word-highlight while its drawer is open (README → Reader 4a). */
  setHighlight(h: Highlight | null): void {
    const prev = this.#hl;
    this.#hl = h;
    for (const x of [prev, h]) {
      if (!x) continue;
      const block = this.#blocks.get(x.chapter);
      if (block) this.#decorate(x.chapter, block.lines, x.para);
    }
  }

  /** Word under a viewport point, or null for blank space, punctuation or the chapter heading. */
  hitTest(x: number, y: number): WordHit | null {
    const doc = this.#scroller.ownerDocument;
    let node: Node | null = null;
    let offset = 0;
    const d = doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    if (typeof doc.caretRangeFromPoint === 'function') {
      const r = doc.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    } else if (d.caretPositionFromPoint) {
      const p = d.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    }
    const el = (node instanceof HTMLElement ? node : node?.parentElement)?.closest<HTMLElement>('.rd-line');
    if (!node || !el || el.classList.contains('rd-head')) return null;
    const lineIndex = this.#index.get(el);
    const line = lineIndex === undefined ? undefined : this.#lines[lineIndex];
    if (!line || line.para < 0) return null;
    const p = this.#book.chapters[line.chapter]!.paras[line.para]!;
    const text = paragraphText(p);
    const lineText = el.firstChild ? this.#lineText(el) : '';
    const at = line.start + Math.min(lineOffset(el, node, offset), lineText.length);
    const b = wordBounds(text, at);
    if (!b) return null;
    const a = Math.max(b[0], line.start);
    const e = Math.min(b[1], line.start + lineText.length);
    if (e <= a) return null;
    const rect = lineRange(el, a - line.start, e - line.start).getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (x < rect.left - 4 || x > rect.right + 4 || y < box.top || y > box.bottom) return null;
    const ctx = wordContext(p, b[0]);
    return {
      chapter: line.chapter, para: line.para, start: b[0], end: b[1], word: text.slice(b[0], b[1]),
      lineIndex, rect, ...ctx,
    } as WordHit;
  }

  /** Inserts an empty element right after line `lineIndex` (the drawer host) and holds virtualisation. */
  openGap(lineIndex: number): HTMLElement {
    this.closeGap();
    const line = this.#lines[lineIndex]!;
    const host = this.#scroller.ownerDocument.createElement('div');
    host.className = 'rd-gap';
    line.el.after(host);
    this.#gapHost = host;
    this.#gapLine = lineIndex;
    this.#gap = 0;
    return host;
  }

  /** Current height of the gap; call every frame while the drawer animates. */
  setGap(px: number): void {
    if (!this.#gapHost || px === this.#gap) return;
    this.#gap = px;
    this.paintNow();
  }

  closeGap(): void {
    if (!this.#gapHost) return;
    this.#gapHost.remove();
    this.#gapHost = null;
    this.#gapLine = -1;
    this.#gap = 0;
    this.paintNow();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#mounted = false;
    this.#scroller.removeEventListener('scroll', this.#onScroll);
    this.#ro.disconnect();
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#idle);
    this.#content.remove();
    this.#probe.remove();
    this.#blocks.clear();
    this.#lines = [];
    this.#gapHost = null;
  }

  // ---- internals ----

  /** A line's own text, without footnotes. */
  #lineText(el: HTMLElement): string {
    if (!el.childElementCount) return el.textContent ?? '';
    let s = '';
    for (const c of Array.from(el.childNodes)) s += c instanceof HTMLElement ? (c.firstChild?.textContent ?? '') : (c.textContent ?? '');
    return s;
  }

  /** Applies footnotes and the highlight to one mounted chapter (or one paragraph of it). */
  #decorate(chapter: number, lines: LineMeta[], onlyPara?: number): void {
    const ch = this.#book.chapters[chapter];
    if (!ch) return;
    let i = 0;
    while (i < lines.length) {
      const para = lines[i]!.para;
      let j = i;
      while (j < lines.length && lines[j]!.para === para) j++;
      if (para >= 0 && (onlyPara === undefined || onlyPara === para)) {
        const p = ch.paras[para]!;
        const text = paragraphText(p);
        const notes = this.#annotate ? this.#annotate(chapter, para, p, text) : [];
        const hl = this.#hl && this.#hl.chapter === chapter && this.#hl.para === para ? this.#hl : null;
        for (let k = i; k < j; k++) {
          const l = lines[k]!;
          const lineText = this.#lineText(l.el);
          const touches = (x: { start: number; end: number }) => x.end > l.start && x.start < l.start + lineText.length;
          const mine = notes.filter(touches);
          const myHl = hl && touches(hl) ? hl : null;
          if (!mine.length && !myHl && !this.#decorated.has(l.el)) continue;
          renderLine(l.el, lineText, l.start, mine, myHl);
          if (mine.length || myHl) this.#decorated.add(l.el);
          else this.#decorated.delete(l.el);
        }
      }
      i = j;
    }
  }

  #onScroll = (): void => {
    if (!this.#raf) this.#raf = requestAnimationFrame(() => { this.#raf = 0; this.paintNow(); });
    clearTimeout(this.#idle);
    this.#idle = window.setTimeout(this.#onIdle, IDLE_MS);
  };

  #onIdle = (): void => {
    if (this.#gapHost) return; // the drawer is open: keep the DOM still until it closes
    const centreLine = this.#lines[this.#lineAt(this.#scroller.scrollTop + this.#H / 2)];
    if (centreLine) {
      const c = centreLine.chapter;
      const want = [c - 1, c, c + 1].filter((x) => x >= 0 && x < this.#book.chapters.length);
      if (want.some((x) => !this.#blocks.has(x)) || this.#blocks.size !== want.length) {
        this.#setWindow(c);
        this.paintNow();
      }
    }
    this.#cb.onAnchor?.(this.currentAnchor());
  };

  #onResize = (): void => {
    if (!this.#mounted) return;
    const w = this.#scroller.clientWidth;
    const h = this.#scroller.clientHeight;
    if (w === this.#W && h === this.#H) return;
    if (this.#gapHost) { // the table is measured without the drawer; close it rather than mis-measure
      this.closeGap();
      this.#cb.onRelayout?.();
    }
    const a = this.currentAnchor();
    if (w !== this.#W) {
      this.#relayout(a);
      return;
    }
    this.#measureViewport();
    this.#rebuildTable();
    this.scrollToAnchor(a);
    this.paintNow();
  };

  #applyTypography(): void {
    const { size, line } = TYPE_SCALE[this.#prefs.fontSize];
    this.#lh = line;
    this.#scroller.style.setProperty('--fs', `${size}px`);
    this.#scroller.style.setProperty('--lh', `${line}px`);
  }

  #measureViewport(): void {
    this.#H = this.#scroller.clientHeight;
    this.#W = this.#scroller.clientWidth;
    const pad = Math.max(0, this.#H / 2 - this.#lh / 2);
    this.#scroller.style.paddingTop = `${pad}px`;
    this.#scroller.style.paddingBottom = `${pad}px`;
    this.#probe.style.width = `${this.#W - 2 * SIDE}px`;
  }

  #relayout(a: Anchor): void {
    this.#gapHost = null;
    this.#gapLine = -1;
    this.#gap = 0;
    this.#decorated.clear();
    this.#applyTypography();
    this.#measureViewport();
    for (const { block } of this.#blocks.values()) block.remove();
    this.#blocks.clear();
    this.#lines = [];
    this.#setWindow(this.#clampChapter(a.chapter));
    this.scrollToAnchor(a);
    this.paintNow();
    this.#cb.onRelayout?.();
  }

  /** Mounts chapters centre±1, removes the rest, and keeps the text under the reader still. */
  #setWindow(centre: number): void {
    const want = new Set([centre - 1, centre, centre + 1].filter((x) => x >= 0 && x < this.#book.chapters.length));
    const refIdx = this.#lines.length ? this.#lineAt(this.#scroller.scrollTop + this.#H / 2) : -1;
    const ref = refIdx >= 0 ? this.#lines[refIdx] : undefined;
    const refTop = ref ? this.#top[refIdx]! : 0;
    // Save before mutating: removing content above can clamp scrollTop at the next layout.
    const scrollTop = this.#scroller.scrollTop;

    for (const [idx, { block }] of this.#blocks) {
      if (!want.has(idx) && block !== ref?.el.parentElement) {
        block.remove();
        this.#blocks.delete(idx);
      }
    }
    for (const idx of [...want].sort((x, y) => x - y)) {
      if (this.#blocks.has(idx)) continue;
      const laid = layoutChapter(this.#probe, this.#book.chapters[idx]!);
      this.#decorate(idx, laid.lines);
      const next = [...this.#blocks.keys()].sort((x, y) => x - y).find((k) => k > idx);
      this.#content.insertBefore(laid.block, next === undefined ? null : this.#blocks.get(next)!.block);
      this.#blocks.set(idx, laid);
    }
    this.#rebuildTable();
    if (ref?.el.isConnected) this.#scroller.scrollTop = scrollTop + ref.el.offsetTop - refTop;
  }

  /** The only place line positions are read: once per layout change. */
  #rebuildTable(): void {
    for (let i = this.#win[0]; i < this.#win[1]; i++) {
      const l = this.#lines[i];
      if (l) l.el.style.willChange = '';
    }
    this.#lines = [...this.#blocks.keys()].sort((x, y) => x - y).flatMap((k) => this.#blocks.get(k)!.lines);
    const n = this.#lines.length;
    this.#top = new Float64Array(n);
    this.#index = new WeakMap();
    for (let i = 0; i < n; i++) {
      this.#top[i] = this.#lines[i]!.el.offsetTop;
      this.#index.set(this.#lines[i]!.el, i);
    }
    this.#blur = new Float64Array(n).fill(Number.NaN);
    this.#opa = new Float64Array(n).fill(Number.NaN);
    this.#win = [0, 0];
  }

  #moveWindow(lo: number, hi: number): void {
    const [plo, phi] = this.#win;
    if (lo === plo && hi === phi) return;
    const wc = this.#prefs.tier === 'fallback' ? 'opacity' : 'filter, opacity';
    for (let i = plo; i < phi; i++) if (i < lo || i >= hi) this.#lines[i]!.el.style.willChange = '';
    for (let i = lo; i < hi; i++) if (i < plo || i >= phi) this.#lines[i]!.el.style.willChange = wc;
    this.#win = [lo, hi];
  }

  /** Index of the line whose box contains content-y `y`, else the nearest one. */
  #lineAt(y: number): number {
    const i = lowerBound(this.#top, y - this.#lh + 0.001);
    return Math.min(Math.max(0, i), this.#lines.length - 1);
  }

  /** Like #lineAt, but aware of the drawer gap. */
  #lineAtY(y: number): number {
    const gl = this.#gapLine;
    if (!this.#gap || gl < 0) return this.#lineAt(y);
    const gapTop = this.#top[gl]! + this.#lh;
    if (y < gapTop) return this.#lineAt(y);
    if (y < gapTop + this.#gap) return gl;
    return this.#lineAt(y - this.#gap);
  }

  #findLine(a: Anchor): number {
    let firstOfPara = -1;
    let firstOfChapter = -1;
    for (let i = 0; i < this.#lines.length; i++) {
      const l = this.#lines[i]!;
      if (l.chapter !== a.chapter) continue;
      if (firstOfChapter < 0) firstOfChapter = i;
      if (l.para !== a.para) continue;
      if (firstOfPara < 0) firstOfPara = i;
      if (l.sFirst <= a.sentence && a.sentence <= l.sLast) return i;
    }
    return firstOfPara >= 0 ? firstOfPara : firstOfChapter;
  }

  #clampChapter(c: number): number {
    return Math.min(Math.max(0, c), this.#book.chapters.length - 1);
  }

  #emitProgress(mid: number): void {
    const line = this.#lines[this.#lineAtY(mid)];
    if (!line || !this.#cb.onProgress) return;
    const pct = Math.max(1, Math.min(100, Math.round((100 * line.wordEnd) / Math.max(1, this.#book.wordCount))));
    const chapterTitle = this.#book.chapters[line.chapter]?.title ?? '';
    const key = `${line.chapter}|${pct}`;
    if (key === this.#progressKey) return;
    this.#progressKey = key;
    this.#cb.onProgress({ chapter: line.chapter, chapterTitle, pct, words: line.wordEnd });
  }
}

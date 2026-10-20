import type { Prefs } from '../prefs/prefs.ts';
import { blurMaxFor, TYPE_SCALE } from '../prefs/prefs.ts';
import { countWords, paragraphText, sentenceStarts } from '../ingest/text.ts';
import { ease } from '../motion.ts';
import type { Anchor, ChapterData, Paragraph } from '../types.ts';
import { lineOffset, lineRange, renderLine, type Footnote } from './decorate.ts';
import { bandFor, blurPx, opacityFor, tFor, withSentencePenalty } from './focus.ts';
import type { GuideHost, SentenceId } from './guide.ts';
import { ChapterLayout, type LineMeta } from './layout.ts';
import { nearestWord, wordBounds, wordContext } from './words.ts';

export interface EngineBook { id: string; wordCount: number; chapters: ChapterData[] }
/** `words` is the book-level word index at the band centre, for session metrics. */
export interface Progress { chapter: number; chapterTitle: string; pct: number; words: number }
export interface EngineCallbacks {
  onProgress?: (p: Progress) => void;
  onAnchor?: (a: Anchor) => void;
  /** Lines were rebuilt (font size or width change); anything attached to old lines is gone. */
  onRelayout?: () => void;
  /** The selection was redrawn (it changed, or chapters mounted above it moved it). */
  onSelection?: () => void;
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
/** A word on a mounted line (select-to-ask). Offsets are in the paragraph text. */
export interface WordRef { chapter: number; para: number; start: number; end: number; lineIndex: number }
/** A text selection inside one chapter, from a word start to a word end (CHANGES 2026-10-14 · C1). */
export interface TextSelection { chapter: number; from: { para: number; at: number }; to: { para: number; at: number } }
/** The selection's first and last line boxes, in viewport coordinates (handles and the 问旁注 button). */
export interface SelectionBox { startX: number; startTop: number; startBottom: number; endX: number; endTop: number; endBottom: number; left: number; right: number }
/**
 * A tapped grammar droplet: the sentence that ends there, the sentence before it (for pronouns;
 * the last one of the previous paragraph when this one opens a paragraph), and the droplet's centre x.
 */
export interface SentenceHit {
  chapter: number; para: number; sentence: number; sentenceText: string; prevText: string | null; lineIndex: number; x: number;
}

const SIDE = 34;
/** A droplet counts as tapped within this distance of its centre (a 44 px target). */
const DROP_REACH = 22;
const IDLE_MS = 180;
/** Background layout works in slices this long, so a frame is never blocked (R-01). */
const SLICE_MS = 5;

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

/** True if `line` shows part of sentence `id`. */
function inSentence(line: LineMeta, id: SentenceId): boolean {
  return line.chapter === id.chapter && line.para === id.para && line.sFirst <= id.sentence && id.sentence <= line.sLast;
}

/**
 * Owns the reader's scroll container. Lays chapters out once into fixed-height lines,
 * then on scroll writes filter/opacity directly to lines within ±1 viewport.
 */
export class ReaderEngine implements GuideHost {
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
  /** Per line: 1 while it carries the 夜读 accent colour, 0 when not, -1 unknown (write on next paint). */
  #acc = new Int8Array(0);
  /** 带读: the lit sentence (N4), or null. */
  #guide: SentenceId | null = null;
  /** The running 带读 scroll; a new one cancels it, so scrolls never stack (N-07). */
  #anim = 0;
  /**
   * Grammar droplets for the sentences that end inside the focus band, in one overlay layer above
   * the lines (never inside them), placed by transform from the line table. Keyed chapter:para:end.
   */
  #dropLayer: HTMLElement;
  #drops = new Map<string, { el: HTMLElement; i: number; e: number; t: string }>();
  /**
   * Select-to-ask: the selection, drawn as rectangles in an overlay layer above the lines (never
   * inside them, so line height never changes). Each rectangle keeps its line and horizontal extent;
   * the vertical position comes from the line table, so a window change re-places it without reading layout.
   */
  #sel: TextSelection | null = null;
  #selLayer: HTMLElement;
  #selRects: { line: HTMLElement; left: number; width: number; h: number; el: HTMLElement }[] = [];
  /** React renders the handles and the 问旁注 button in here, in the same content coordinates. */
  readonly selectionUi: HTMLElement;
  #dropTop = 0;
  #win: [number, number] = [0, 0];
  #H = 0;
  #W = 0;
  #pad = 0;
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
  /** Chapters being laid out in the background, ahead of need. */
  #prepared = new Map<number, ChapterLayout>();
  #jobTimer = 0;
  #lastScroll = 0;
  /** Paragraphs waiting for their footnotes to be redrawn, nearest to the band first. */
  #annQueue: { chapter: number; lines: LineMeta[]; i: number; j: number }[] = [];
  #annTimer = 0;

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
    this.#dropLayer = document.createElement('div');
    this.#dropLayer.className = 'rd-drops';
    this.#selLayer = document.createElement('div');
    this.#selLayer.className = 'rd-sel';
    this.selectionUi = document.createElement('div');
    this.selectionUi.className = 'rd-sel-ui';
    scroller.append(this.#content, this.#selLayer, this.#dropLayer, this.selectionUi, this.#probe);
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
    const focus = this.#prefs.focusBlur;
    const night = this.#prefs.theme === 'night';
    const bmax = blurMaxFor(this.#prefs);
    const g = this.#guide;
    const cur = !g && this.#prefs.sentenceMode ? this.#lines[this.#lineAtY(mid)] : undefined;
    const sharp: number[] = [];

    for (let i = lo; i < hi; i++) {
      const line = this.#lines[i]!;
      const top = gap && gl >= 0 && i > gl ? this.#top[i]! + gap : this.#top[i]!;
      let t = tFor(Math.abs(top + lh / 2 - mid), band);
      // 带读: the lit sentence is sharp wherever it is, everything else one step deeper (N4 → Depth).
      const lit = g !== null && inSentence(line, g);
      if (g) t = lit ? 0 : withSentencePenalty(t);
      else if (cur && !(line.chapter === cur.chapter && line.para === cur.para && line.sFirst <= cur.sFirst && cur.sFirst <= line.sLast)) {
        t = withSentencePenalty(t);
      }
      const shown = t; // droplets follow the band, not the selection
      if (this.#sel && this.#inSelection(i)) t = 0; // selected lines are sharp (C1)
      // With 聚焦模糊 off every line is sharp; droplets still mark the sentences in the band.
      const b = full && focus ? blurPx(t, bmax) : 0;
      const o = focus ? opacityFor(t, night) : 1;
      // 夜读 accent (N3): the sharp lines of the band, or only the lit sentence while guiding.
      const a = night && line.para >= 0 && (g ? lit : focus && shown === 0) ? 1 : 0;
      if (a !== this.#acc[i]) {
        line.el.style.color = a ? 'var(--reader-accent)' : '';
        this.#acc[i] = a;
        this.stats.styleWrites++;
      }
      if (shown === 0 && line.ends.length) sharp.push(i);
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
    this.#placeDrops(sharp);
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
    if (p.tier !== prev.tier || p.focusBlur !== prev.focusBlur) {
      for (const l of this.#lines) { l.el.style.filter = ''; l.el.style.willChange = ''; }
      this.#blur.fill(Number.NaN);
      this.#win = [0, 0];
    }
    // 夜读 ↔ 纸白: the colours come from CSS; the opacity curve and the accent are repainted here (N6).
    if (p.theme !== prev.theme) {
      for (const l of this.#lines) l.el.style.color = '';
      this.#acc.fill(0);
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

  /**
   * Re-runs the annotator over mounted paragraphs, e.g. after a new lookup joins `seen`. Paragraphs
   * nearest the band go first; the rest follow in background slices, so no frame is blocked (R-01).
   */
  refreshAnnotations(): void {
    this.#queueDecorate([...this.#blocks.keys()], true);
  }

  /** The word-highlight while its drawer is open (README → Reader 4a). */
  setHighlight(h: Highlight | null): void {
    const prev = this.#hl;
    this.#hl = h;
    for (const x of [prev, h]) {
      if (!x) continue;
      const block = this.#blocks.get(x.chapter);
      if (block) this.#decoratePara(x.chapter, x.para);
    }
  }

  /** Word under a viewport point, or null for blank space, punctuation or the chapter heading. */
  hitTest(x: number, y: number): WordHit | null {
    const { node, offset } = this.#caretAt(x, y);
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

  /** True if a tap on line `i` may open a drawer: any line with 聚焦模糊 off, else only the band (isInBand). */
  isTappable(i: number): boolean {
    return !this.#prefs.focusBlur ? i >= 0 && i < this.#lines.length : this.isInBand(i);
  }

  /**
   * True while line `i` is sharp: inside the focus band (and, in sentence mode, in the current
   * sentence). Only sharp lines open drawers; the blurred text around the band does not.
   */
  isInBand(i: number): boolean {
    const line = this.#lines[i];
    if (!line) return false;
    const mid = this.#scroller.scrollTop + this.#H / 2;
    const top = this.#gap && this.#gapLine >= 0 && i > this.#gapLine ? this.#top[i]! + this.#gap : this.#top[i]!;
    if (tFor(Math.abs(top + this.#lh / 2 - mid), bandFor(this.#H, this.#prefs.focusPct)) > 0) return false;
    const cur = this.#prefs.sentenceMode ? this.#lines[this.#lineAtY(mid)] : undefined;
    return !cur || (line.chapter === cur.chapter && line.para === cur.para && line.sFirst <= cur.sFirst && cur.sFirst <= line.sLast);
  }

  /**
   * The text of the sharp lines right now, as paragraph offsets [start, end) (predicted words: what
   * the reader is reading, P-02). Called at scroll pauses, not per frame.
   */
  sharpText(): { chapter: number; para: number; start: number; end: number }[] {
    const out: { chapter: number; para: number; start: number; end: number }[] = [];
    if (!this.#lines.length) return out;
    const mid = this.#scroller.scrollTop + this.#H / 2;
    const half = bandFor(this.#H, this.#prefs.focusPct).half + this.#lh + this.#gap;
    for (let i = Math.max(0, this.#lineAtY(mid - half)); i < this.#lines.length; i++) {
      const line = this.#lines[i]!;
      if (this.#top[i]! > mid + half) break;
      if (line.para < 0 || !this.isInBand(i)) continue;
      const next = this.#lines[i + 1];
      const end = next && next.chapter === line.chapter && next.para === line.para ? next.start : Number.MAX_SAFE_INTEGER;
      out.push({ chapter: line.chapter, para: line.para, start: line.start, end });
    }
    return out;
  }

  /** The text position under a viewport point (WebKit: caretRangeFromPoint; others: caretPositionFromPoint). */
  #caretAt(x: number, y: number): { node: Node | null; offset: number } {
    const doc = this.#scroller.ownerDocument;
    const d = doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    if (typeof doc.caretRangeFromPoint === 'function') {
      const r = doc.caretRangeFromPoint(x, y);
      if (r) return { node: r.startContainer, offset: r.startOffset };
    } else if (d.caretPositionFromPoint) {
      const p = d.caretPositionFromPoint(x, y);
      if (p) return { node: p.offsetNode, offset: p.offset };
    }
    return { node: null, offset: 0 };
  }

  /**
   * The word nearest to a viewport point (C1 drag-extend): the line by vertical distance ×4 plus
   * horizontal distance to its text (so the same line wins), then the nearest word on that line.
   * Only lines of `chapter` when given; never the chapter heading.
   */
  wordNear(x: number, y: number, chapter?: number): WordRef | null {
    if (!this.#lines.length) return null;
    const box = this.#scroller.getBoundingClientRect();
    const i0 = this.#lineAtY(y - box.top + this.#scroller.scrollTop);
    let best: { i: number; r: DOMRect; len: number } | null = null;
    let bestD = Infinity;
    for (let i = i0 - 2; i <= i0 + 2; i++) {
      const line = this.#lines[i];
      if (!line || line.para < 0 || (chapter !== undefined && line.chapter !== chapter)) continue;
      const len = this.#lineText(line.el).length;
      if (!len) continue;
      const r = lineRange(line.el, 0, len).getBoundingClientRect();
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (dy * 4 + dx < bestD) { bestD = dy * 4 + dx; best = { i, r, len }; }
    }
    if (!best) return null;
    const line = this.#lines[best.i]!;
    const cx = Math.min(best.r.right - 1, Math.max(best.r.left + 1, x));
    const { node, offset } = this.#caretAt(cx, (best.r.top + best.r.bottom) / 2);
    const at = node && line.el.contains(node) ? line.start + lineOffset(line.el, node, offset) : (cx > (best.r.left + best.r.right) / 2 ? line.start + best.len : line.start);
    const text = paragraphText(this.#book.chapters[line.chapter]!.paras[line.para]!);
    const w = nearestWord(text, at, line.start, line.start + best.len);
    if (!w) return null;
    // A word broken across lines (a hyphenated break) still selects whole.
    const whole = wordBounds(text, w[0]) ?? w;
    return { chapter: line.chapter, para: line.para, start: whole[0], end: whole[1], lineIndex: best.i };
  }

  /** The selection, or null. */
  get selection(): TextSelection | null {
    return this.#sel;
  }

  /** Shows a selection (or clears it with null): overlay rectangles, and its lines painted sharp. */
  setSelection(sel: TextSelection | null): void {
    const same = sel && this.#sel && sel.chapter === this.#sel.chapter && sel.from.para === this.#sel.from.para
      && sel.from.at === this.#sel.from.at && sel.to.para === this.#sel.to.para && sel.to.at === this.#sel.to.at;
    if (same || (!sel && !this.#sel)) return;
    this.#sel = sel;
    this.#measureSelection();
    this.#placeSelection();
    this.paintNow();
  }

  /** The selected text, paragraphs joined by a newline. */
  selectionText(): string {
    const s = this.#sel;
    if (!s) return '';
    const paras = this.#book.chapters[s.chapter]!.paras;
    const out: string[] = [];
    for (let p = s.from.para; p <= s.to.para; p++) {
      const text = paragraphText(paras[p]!);
      out.push(text.slice(p === s.from.para ? s.from.at : 0, p === s.to.para ? s.to.at : text.length).trim());
    }
    return out.filter(Boolean).join('\n');
  }

  /** Where the selection's first and last rectangles are on screen, or null. */
  selectionBox(): SelectionBox | null {
    const rects = this.#selRects.filter((r) => r.el.isConnected && r.el.style.display !== 'none');
    if (!rects.length) return null;
    const box = this.#scroller.getBoundingClientRect();
    const st = this.#scroller.scrollTop;
    const at = (r: (typeof rects)[number]) => {
      const i = this.#index.get(r.line)!;
      const top = box.top + this.#top[i]! - st + (this.#lh - r.h) / 2;
      return { left: box.left + r.left, right: box.left + r.left + r.width, top, bottom: top + r.h };
    };
    const a = at(rects[0]!);
    const b = at(rects.at(-1)!);
    const all = rects.map(at);
    return {
      startX: a.left, startTop: a.top, startBottom: a.bottom, endX: b.right, endTop: b.top, endBottom: b.bottom,
      left: Math.min(...all.map((r) => r.left)), right: Math.max(...all.map((r) => r.right)),
    };
  }

  /** True if line `i` holds part of the selection. */
  #inSelection(i: number): boolean {
    const s = this.#sel!;
    const line = this.#lines[i]!;
    if (line.chapter !== s.chapter || line.para < 0) return false;
    const next = this.#lines[i + 1];
    const end = next && next.chapter === line.chapter && next.para === line.para ? next.start : Number.MAX_SAFE_INTEGER;
    const before = (p: number, at: number, q: number, bt: number) => p < q || (p === q && at < bt);
    return before(line.para, line.start, s.to.para, s.to.at) && before(s.from.para, s.from.at, line.para, end);
  }

  /** Measures the selection's rectangles once per change (one range read per selected line). */
  #measureSelection(): void {
    for (const r of this.#selRects) r.el.remove();
    this.#selRects = [];
    const s = this.#sel;
    if (!s) return;
    const box = this.#scroller.getBoundingClientRect();
    for (let i = 0; i < this.#lines.length; i++) {
      if (!this.#inSelection(i)) continue;
      const line = this.#lines[i]!;
      const len = this.#lineText(line.el).length;
      const a = line.para === s.from.para ? Math.max(0, s.from.at - line.start) : 0;
      const b = line.para === s.to.para ? Math.min(len, s.to.at - line.start) : len;
      const text = this.#lineText(line.el);
      let a2 = a;
      let b2 = b;
      while (a2 < b2 && text[a2] === ' ') a2++;
      while (b2 > a2 && text[b2 - 1] === ' ') b2--;
      if (b2 <= a2) continue;
      const r = lineRange(line.el, a2, b2).getBoundingClientRect();
      const el = this.#scroller.ownerDocument.createElement('span');
      el.className = 'rd-sel-rect';
      this.#selLayer.append(el);
      this.#selRects.push({ line: line.el, left: r.left - box.left, width: r.width, h: r.height, el });
    }
  }

  /** Places the rectangles from the line table (no layout reads); hides those whose line is unmounted. */
  #placeSelection(): void {
    for (const r of this.#selRects) {
      const i = this.#index.get(r.line);
      if (i === undefined || !r.line.isConnected) { r.el.style.display = 'none'; continue; }
      r.el.style.display = '';
      const top = this.#top[i]! + (this.#lh - r.h) / 2 - 2;
      r.el.style.transform = `translate(${r.left - 2}px, ${top}px)`;
      r.el.style.width = `${r.width + 4}px`;
      r.el.style.height = `${r.h + 4}px`;
    }
    this.#cb.onSelection?.();
  }

  /** The grammar droplet under a viewport point, if one is showing there (sentences in the focus band only). */
  dropAt(x: number, y: number): SentenceHit | null {
    let best: SentenceHit | null = null;
    let bestD = Infinity;
    for (const { el, i, e } of this.#drops.values()) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const dist = Math.max(Math.abs(x - cx), Math.abs(y - (r.top + r.height / 2)));
      if (dist > DROP_REACH || dist >= bestD) continue;
      const line = this.#lines[i]!;
      const p = this.#book.chapters[line.chapter]!.paras[line.para]!;
      const sentence = sentenceStarts(p).findIndex((st, k) => st + p[k]!.length === e);
      if (sentence < 0) continue;
      bestD = dist;
      const prevText = sentence > 0 ? p[sentence - 1]! : this.#book.chapters[line.chapter]!.paras[line.para - 1]?.at(-1) ?? null;
      best = { chapter: line.chapter, para: line.para, sentence, sentenceText: p[sentence]!, prevText, lineIndex: i, x: cx };
    }
    return best;
  }

  /** Inserts an empty element right after line `lineIndex` (the drawer host) and holds virtualisation. */
  openGap(lineIndex: number): HTMLElement {
    this.closeGap();
    const line = this.#lines[lineIndex]!;
    const host = this.#scroller.ownerDocument.createElement('div');
    host.className = 'rd-gap';
    line.el.after(host);
    line.el.classList.add('rd-gapline'); // above the drawer: its footnotes hang into the notch
    // content-visibility implies paint containment, which would clip the drawer's full-bleed margins.
    host.closest<HTMLElement>('.rd-chapter')?.style.setProperty('content-visibility', 'visible');
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
    this.#gapHost.closest<HTMLElement>('.rd-chapter')?.style.removeProperty('content-visibility');
    this.#gapHost.previousElementSibling?.classList.remove('rd-gapline');
    this.#gapHost.remove();
    this.#gapHost = null;
    this.#gapLine = -1;
    this.#gap = 0;
    this.paintNow();
  }

  // ---- 带读 (NIGHT_MODE_1c.md → N4) ----

  sentenceAtCentre(): SentenceId | null {
    if (!this.#lines.length) return null;
    let i = this.#lineAtY(this.#scroller.scrollTop + this.#H / 2);
    while (i < this.#lines.length - 1 && this.#lines[i]!.para < 0) i++; // past a chapter heading
    const l = this.#lines[i];
    return l && l.para >= 0 ? { chapter: l.chapter, para: l.para, sentence: l.sFirst } : null;
  }

  nextSentence(id: SentenceId): SentenceId | null {
    const paras = this.#book.chapters[id.chapter]?.paras;
    if (!paras) return null;
    if (id.sentence + 1 < (paras[id.para]?.length ?? 0)) return { ...id, sentence: id.sentence + 1 };
    for (let p = id.para + 1; p < paras.length; p++) if (paras[p]!.length) return { chapter: id.chapter, para: p, sentence: 0 };
    return null;
  }

  sentenceWords(id: SentenceId): number {
    return countWords(this.#book.chapters[id.chapter]?.paras[id.para]?.[id.sentence] ?? '');
  }

  setGuideSentence(id: SentenceId | null): void {
    const g = this.#guide;
    if (g === id || (g && id && g.chapter === id.chapter && g.para === id.para && g.sentence === id.sentence)) return;
    this.#guide = id;
    this.paintNow();
  }

  /** The lit sentence, if guiding. */
  get guideSentence(): SentenceId | null {
    return this.#guide;
  }

  scrollSentenceToCentre(id: SentenceId, ms: number, done: () => void): () => void {
    cancelAnimationFrame(this.#anim);
    this.#anim = 0;
    const first = this.#lines.findIndex((l) => inSentence(l, id));
    if (first < 0) { done(); return () => {}; }
    let last = first;
    while (last + 1 < this.#lines.length && inSentence(this.#lines[last + 1]!, id)) last++;
    const centre = (this.#top[first]! + this.#top[last]! + this.#lh) / 2;
    const from = this.#scroller.scrollTop;
    const to = Math.max(0, centre - this.#H / 2);
    const t0 = performance.now();
    const frame = (now: number): void => {
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      this.#scroller.scrollTop = from + (to - from) * ease(k);
      if (k < 1) { this.#anim = requestAnimationFrame(frame); return; }
      this.#anim = 0;
      done();
    };
    this.#anim = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(this.#anim); this.#anim = 0; };
  }

  destroy(): void {
    cancelAnimationFrame(this.#anim);
    this.#destroyed = true;
    this.#mounted = false;
    this.#scroller.removeEventListener('scroll', this.#onScroll);
    this.#ro.disconnect();
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#idle);
    clearTimeout(this.#jobTimer);
    clearTimeout(this.#annTimer);
    this.#annQueue = [];
    this.#prepared.clear();
    this.#content.remove();
    this.#dropLayer.remove();
    this.#drops.clear();
    this.#selLayer.remove();
    this.selectionUi.remove();
    this.#selRects = [];
    this.#sel = null;
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

  /** Applies footnotes and the highlight to one paragraph of a mounted chapter (by its line index). */
  #decoratePara(chapter: number, para: number): void {
    const lines = this.#blocks.get(chapter)?.lines;
    if (!lines) return;
    const i = lines.findIndex((l) => l.para === para);
    if (i < 0) return;
    let j = i;
    while (j < lines.length && lines[j]!.para === para) j++;
    this.#decorateLines(chapter, lines, i, j);
  }

  /** Footnotes and highlight for `lines[i..j)`, which are all the lines of one paragraph. */
  #decorateLines(chapter: number, lines: LineMeta[], i: number, j: number): void {
    const para = lines[i]!.para;
    const ch = this.#book.chapters[chapter];
    if (!ch || para < 0) return;
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

  /**
   * Queues every paragraph of `chapters` for decoration, nearest to the band centre first, and
   * runs the first slice now (what is on screen). `replace` drops what was queued before.
   */
  #queueDecorate(chapters: number[], replace: boolean): void {
    const centre = this.#lines.length ? this.#lineAt(this.#scroller.scrollTop + this.#H / 2) : 0;
    const items: { chapter: number; lines: LineMeta[]; i: number; j: number; d: number }[] = [];
    for (const chapter of chapters) {
      const lines = this.#blocks.get(chapter)?.lines;
      if (!lines) continue;
      for (let i = 0; i < lines.length;) {
        let j = i + 1;
        while (j < lines.length && lines[j]!.para === lines[i]!.para) j++;
        if (lines[i]!.para >= 0) items.push({ chapter, lines, i, j, d: Math.abs((this.#index.get(lines[i]!.el) ?? 1e9) - centre) });
        i = j;
      }
    }
    const keep = replace ? [] : this.#annQueue.filter((q) => !chapters.includes(q.chapter));
    this.#annQueue = [...items.sort((a, b) => a.d - b.d), ...keep];
    clearTimeout(this.#annTimer);
    this.#annTimer = 0;
    this.#decorateSlice();
  }

  #decorateSlice = (): void => {
    this.#annTimer = 0;
    const deadline = performance.now() + SLICE_MS;
    while (this.#annQueue.length) {
      const q = this.#annQueue.shift()!;
      if (this.#blocks.get(q.chapter)?.lines !== q.lines) continue; // unmounted or relaid since queued
      this.#decorateLines(q.chapter, q.lines, q.i, q.j);
      if (performance.now() >= deadline) break;
    }
    if (this.#annQueue.length && !this.#destroyed) this.#annTimer = window.setTimeout(this.#decorateSlice, 0);
  };

  #onScroll = (): void => {
    this.#lastScroll = performance.now();
    if (!this.#raf) this.#raf = requestAnimationFrame(() => { this.#raf = 0; this.paintNow(); });
    clearTimeout(this.#idle);
    this.#idle = window.setTimeout(this.#onIdle, IDLE_MS);
  };

  #onIdle = (): void => {
    if (this.#gapHost) return; // the drawer is open: keep the DOM still until it closes
    this.#syncWindow();
    this.#cb.onAnchor?.(this.currentAnchor());
  };

  /**
   * At a scroll pause: attach chapters that are ready and drop far ones (cheap), then keep laying
   * out missing neighbours in the background. Never lays out a whole chapter here.
   */
  #syncWindow(): void {
    const centreLine = this.#lines[this.#lineAt(this.#scroller.scrollTop + this.#H / 2)];
    if (!centreLine) return;
    const c = centreLine.chapter;
    const want = this.#wanted(c);
    if (want.some((x) => !this.#blocks.has(x)) || this.#blocks.size !== want.length) {
      this.#setWindow(c, false);
      this.paintNow();
    }
    for (const idx of this.#prepared.keys()) if (!want.includes(idx)) this.#prepared.delete(idx);
    this.#scheduleLayout(c);
  }

  #wanted(c: number): number[] {
    return [c - 1, c, c + 1].filter((x) => x >= 0 && x < this.#book.chapters.length);
  }

  /** Lays out the next missing neighbour of chapter `c` a slice at a time, yielding between slices. */
  #scheduleLayout(c: number): void {
    if (this.#jobTimer) return;
    const idx = [c + 1, c - 1, c].find((x) => x >= 0 && x < this.#book.chapters.length && !this.#blocks.has(x) && !this.#prepared.get(x)?.done);
    if (idx === undefined) return;
    let job = this.#prepared.get(idx);
    if (!job) this.#prepared.set(idx, (job = new ChapterLayout(this.#probe, this.#book.chapters[idx]!)));
    const slice = (): void => {
      this.#jobTimer = 0;
      if (this.#destroyed || this.#prepared.get(idx) !== job) return;
      if (!job.step(performance.now() + SLICE_MS)) {
        this.#jobTimer = window.setTimeout(slice, 0);
        return;
      }
      // Attach now if the reader is paused; otherwise the next scroll pause attaches it.
      if (performance.now() - this.#lastScroll >= IDLE_MS && !this.#gapHost) this.#syncWindow();
      else this.#scheduleLayout(c);
    };
    this.#jobTimer = window.setTimeout(slice, 0);
  }

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
    this.#dropTop = size * 1.18 + 2; // just under the baseline, like a footnote
    this.#scroller.style.setProperty('--fs', `${size}px`);
    this.#scroller.style.setProperty('--lh', `${line}px`);
  }

  #measureViewport(): void {
    this.#H = this.#scroller.clientHeight;
    this.#W = this.#scroller.clientWidth;
    const pad = Math.max(0, this.#H / 2 - this.#lh / 2);
    this.#pad = pad;
    this.#scroller.style.paddingTop = `${pad}px`;
    this.#scroller.style.paddingBottom = `${pad}px`;
    this.#probe.style.width = `${this.#W - 2 * SIDE}px`;
  }

  #relayout(a: Anchor): void {
    clearTimeout(this.#jobTimer);
    this.#jobTimer = 0;
    this.#prepared.clear(); // measured at the old font size or width
    this.#gapHost = null;
    this.#gapLine = -1;
    this.#gap = 0;
    this.#decorated.clear();
    this.#sel = null; // its rectangles belonged to the old lines
    this.#measureSelection();
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

  /**
   * Mounts chapters centre±1, removes the rest, and keeps the text under the reader still.
   * `sync` lays out missing chapters on the spot (opening a book, jumps); otherwise only chapters
   * already prepared in the background are attached.
   */
  #setWindow(centre: number, sync = true): void {
    const want = new Set(this.#wanted(centre));
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
    const attached: number[] = [];
    for (const idx of [...want].sort((x, y) => x - y)) {
      if (this.#blocks.has(idx)) continue;
      const laid = this.#prepared.get(idx) ?? new ChapterLayout(this.#probe, this.#book.chapters[idx]!);
      if (!laid.done) {
        if (!sync) continue;
        laid.step();
      }
      this.#prepared.delete(idx);
      attached.push(idx);
      const next = [...this.#blocks.keys()].sort((x, y) => x - y).find((k) => k > idx);
      this.#content.insertBefore(laid.block, next === undefined ? null : this.#blocks.get(next)!.block);
      this.#blocks.set(idx, laid);
    }
    this.#rebuildTable();
    const refNow = ref ? this.#index.get(ref.el) : undefined;
    if (refNow !== undefined) this.#scroller.scrollTop = scrollTop + this.#top[refNow]! - refTop;
    if (attached.length && (this.#annotate || this.#hl)) this.#queueDecorate(attached, false);
  }

  /**
   * Line positions, once per layout change. Every row (line or blank) is exactly one line-height
   * tall, so positions are counted rather than read: no forced layout of a freshly attached
   * chapter. (Never called while the drawer gap is open.)
   */
  #rebuildTable(): void {
    for (let i = this.#win[0]; i < this.#win[1]; i++) {
      const l = this.#lines[i];
      if (l) l.el.style.willChange = '';
    }
    const order = [...this.#blocks.keys()].sort((x, y) => x - y);
    this.#lines = order.flatMap((k) => this.#blocks.get(k)!.lines);
    const n = this.#lines.length;
    this.#top = new Float64Array(n);
    this.#index = new WeakMap();
    const lh = this.#lh;
    let i = 0;
    let base = this.#pad;
    for (const k of order) {
      const { block, lines } = this.#blocks.get(k)!;
      for (const l of lines) {
        this.#top[i] = base + l.row * lh;
        this.#index.set(l.el, i++);
      }
      base += block.childElementCount * lh;
      block.style.containIntrinsicSize = `auto ${block.childElementCount * lh}px`;
    }
    this.#blur = new Float64Array(n).fill(Number.NaN);
    this.#opa = new Float64Array(n).fill(Number.NaN);
    this.#acc = new Int8Array(n).fill(-1);
    this.#win = [0, 0];
    if (this.#selRects.length) this.#placeSelection();
  }

  /** Shows a droplet for each sentence ending on the sharp lines `sharp`; others fade out and go. */
  #placeDrops(sharp: number[]): void {
    const seen = new Set<string>();
    const gap = this.#gap;
    const gl = this.#gapLine;
    for (const i of sharp) {
      const line = this.#lines[i]!;
      const y = (gap && gl >= 0 && i > gl ? this.#top[i]! + gap : this.#top[i]!) + this.#dropTop;
      line.ends.forEach((e, k) => {
        const key = `${line.chapter}:${line.para}:${e}`;
        seen.add(key);
        const t = `translate(${SIDE + line.endX[k]! - 4}px, ${y}px) rotate(45deg)`;
        const d = this.#drops.get(key);
        if (d) {
          d.i = i;
          if (d.t !== t) { d.el.style.transform = t; d.t = t; }
          return;
        }
        const el = document.createElement('span');
        el.className = 'rd-drop';
        el.style.transform = t;
        el.dataset.ch = String(line.chapter);
        el.dataset.p = String(line.para);
        el.dataset.at = String(e);
        this.#dropLayer.append(el);
        this.#drops.set(key, { el, i, e, t });
      });
    }
    for (const [key, d] of this.#drops) {
      if (seen.has(key)) continue;
      this.#drops.delete(key);
      d.el.classList.add('rd-drop-off');
      window.setTimeout(() => d.el.remove(), 250);
    }
  }

  #moveWindow(lo: number, hi: number): void {
    const [plo, phi] = this.#win;
    if (lo === plo && hi === phi) return;
    const wc = !this.#prefs.focusBlur ? '' : this.#prefs.tier === 'fallback' ? 'opacity' : 'filter, opacity';
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

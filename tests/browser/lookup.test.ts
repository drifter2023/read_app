import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../src/core/prefs/prefs.ts';
import type { Footnote } from '../../src/core/reader/decorate.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { words } from '../../src/core/reader/words.ts';
import { host, lineAt, makeBook } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; });

async function open() {
  const el = host(402, 874);
  const e = new ReaderEngine(el, makeBook(3), { ...DEFAULT_PREFS, tier: 'full' });
  engine = e;
  await e.mount(null);
  el.scrollTop = 1200;
  e.paintNow();
  return { el, e };
}
const centreY = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };
const tops = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.rd-line, .rd-blank')).map((l) => [l.offsetTop, l.offsetHeight]);

/** Viewport point in the middle of the n-th word of a line. */
function wordPoint(line: HTMLElement, n: number): { x: number; y: number; word: string } {
  const text = line.textContent!;
  const w = [...words(text)][n]!;
  const r = document.createRange();
  r.setStart(line.firstChild!, w.start);
  r.setEnd(line.firstChild!, w.end);
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, word: w.word };
}

describe('hit test (R-04)', () => {
  it('finds the tapped word, its sentence and context', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const p = wordPoint(line, 1);
    const hit = e.hitTest(p.x, p.y)!;
    expect(hit.word).toBe(p.word);
    expect(hit.sentenceText).toContain(p.word);
    expect(hit.rect.width).toBeGreaterThan(0);
    expect(hit.prevWord ?? hit.sentenceInitial).toBeTruthy();
  });

  it('returns null for blank space right of a short last line and for the gutter', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const b = line.getBoundingClientRect();
    expect(e.hitTest(b.left - 20, b.top + b.height / 2)).toBeNull();
    const blank = el.querySelector<HTMLElement>('.rd-blank')!.getBoundingClientRect();
    expect(e.hitTest(blank.left + 100, blank.top + blank.height / 2)).toBeNull();
  });
});

describe('footnotes (R-06)', () => {
  it('every line keeps its y position and height when footnotes appear', async () => {
    const { el, e } = await open();
    const before = tops(el);
    e.setAnnotator((_c, _p, _para, text) => {
      const out: Footnote[] = [];
      for (const w of words(text)) if (w.word === 'river' || w.word === 'soldiers' || w.word === 'the') out.push({ start: w.start, end: w.end, text: '河流' });
      return out;
    });
    const notes = el.querySelectorAll('.rd-fn');
    expect(notes.length).toBeGreaterThan(50);
    expect(tops(el)).toEqual(before);
    // and the footnote really sits under its word, inside the word's width
    const fn = notes[0] as HTMLElement;
    const w = fn.parentElement!.getBoundingClientRect();
    expect(fn.getBoundingClientRect().top).toBeGreaterThan(w.top);
    expect(fn.getBoundingClientRect().width).toBeLessThanOrEqual(w.width + 0.5);
  });

  it('keeps hit testing correct on decorated lines', async () => {
    const { el, e } = await open();
    e.setAnnotator((_c, _p, _para, text) => [...words(text)].slice(0, 3).map((w) => ({ start: w.start, end: w.end, text: '注' })));
    const line = lineAt(el, centreY(el));
    const spans = line.querySelectorAll('.rd-w');
    if (!spans.length) return; // centre line may not start a paragraph
    const r = spans[0]!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(r);
    const b = range.getBoundingClientRect();
    expect(e.hitTest(b.left + b.width / 2, b.top + b.height / 2)?.word).toBe(r.textContent);
  });

  it('removing all footnotes restores plain lines', async () => {
    const { el, e } = await open();
    e.setAnnotator((_c, _p, _para, text) => [...words(text)].map((w) => ({ start: w.start, end: w.end, text: '注' })));
    e.setAnnotator(null);
    expect(el.querySelectorAll('.rd-w').length).toBe(0);
  });
});

describe('highlight and drawer gap (R-05)', () => {
  it('highlights exactly the tapped word and clears it', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const p = wordPoint(line, 2);
    const hit = e.hitTest(p.x, p.y)!;
    e.setHighlight(hit);
    expect(el.querySelector('.rd-hl')?.textContent).toBe(p.word);
    e.setHighlight(null);
    expect(el.querySelector('.rd-hl')).toBeNull();
  });

  it('paints lines below the gap at their shifted position', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el) - 120);
    const p = wordPoint(line, 0);
    const hit = e.hitTest(p.x, p.y)!;
    const hostEl = e.openGap(hit.lineIndex);
    hostEl.style.height = '240px';
    e.setGap(240);
    // The line now at the viewport centre must be the sharp one.
    const sharp = lineAt(el, centreY(el));
    expect(sharp.style.filter).toBe('none');
    e.closeGap();
    expect(el.querySelector('.rd-gap')).toBeNull();
  });
});

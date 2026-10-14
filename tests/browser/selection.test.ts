import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { paragraphText } from '../../src/core/ingest/text.ts';
import { DEFAULT_PREFS } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine, type WordRef } from '../../src/core/reader/engine.ts';
import { words } from '../../src/core/reader/words.ts';
import { frames, host, lineAt, makeBook } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; });

async function open() {
  const el = host(402, 874);
  const e = new ReaderEngine(el, makeBook(3), { ...DEFAULT_PREFS, tier: 'full' });
  engine = e;
  await e.mount(null);
  el.scrollTop = 1200;
  e.paintNow();
  await frames(2);
  return { el, e };
}
const centreY = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };

/** Viewport rectangle of the n-th word of a plain (undecorated) line. */
function wordRect(line: HTMLElement, n: number): DOMRect {
  const w = [...words(line.textContent!)].at(n)!;
  const r = document.createRange();
  r.setStart(line.firstChild!, w.start);
  r.setEnd(line.firstChild!, w.end);
  return r.getBoundingClientRect();
}
const sel = (a: WordRef, b: WordRef) => ({ chapter: a.chapter, from: { para: a.para, at: a.start }, to: { para: b.para, at: b.end } });

describe('select-to-ask selection (N-03)', () => {
  it('wordNear finds the word under the point, and prefers the same line over a closer line above or below', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const r = wordRect(line, 1);
    const w = e.wordNear(r.left + r.width / 2, r.top + r.height / 2)!;
    expect(line.textContent!.includes(word(w))).toBe(true);
    // Far right of the line, a little below its text: still this line's last word, not the next line.
    const box = line.getBoundingClientRect();
    const last = e.wordNear(box.right + 30, box.top + box.height * 0.8)!;
    const lastRect = wordRect(line, -1);
    expect(last.lineIndex).toBe(w.lineIndex);
    expect(word(last)).toBe([...words(line.textContent!)].at(-1)!.word);
    expect(lastRect.width).toBeGreaterThan(0);
  });

  it('draws one rectangle per selected line over the words, and the selected lines paint sharp', async () => {
    const { el, e } = await open();
    const band = lineAt(el, centreY(el));
    // A text line at least six rows up: outside the band, blurred.
    const first = [...el.querySelectorAll<HTMLElement>('.rd-line[data-p]')].filter((l) => l.getBoundingClientRect().top <= band.getBoundingClientRect().top - 6 * 34 && [...words(l.textContent!)].length >= 3).at(-1)!;
    expect(first.style.filter).toMatch(/^blur/);
    const fr = wordRect(first, 2);
    const lr = wordRect(band, 1);
    const a = e.wordNear(fr.left + 2, fr.top + fr.height / 2)!;
    const b = e.wordNear(lr.left + 2, lr.top + lr.height / 2)!;
    e.setSelection(sel(a, b));

    const rects = [...el.querySelectorAll<HTMLElement>('.rd-sel-rect')].filter((r) => r.style.display !== 'none').map((r) => r.getBoundingClientRect());
    const ft = first.getBoundingClientRect().top;
    const bt = band.getBoundingClientRect().top;
    const textLines = [...el.querySelectorAll<HTMLElement>('.rd-line[data-p]')].filter((l) => { const t = l.getBoundingClientRect().top; return t >= ft - 1 && t <= bt + 1; });
    expect(textLines.length).toBeGreaterThan(3);
    expect(rects.length).toBe(textLines.length);
    expect(rects[0]!.left).toBeCloseTo(fr.left - 2, 0);
    expect(rects.at(-1)!.right).toBeCloseTo(lr.right + 2, 0);
    for (const r of rects) expect(r.height).toBeGreaterThan(10);
    expect(first.style.filter).toBe('none');
    expect(first.style.opacity).toBe('1');
    expect(e.selectionText().split(/\s+/)[0]).toBe(word(a));

    const box = e.selectionBox()!;
    expect(box.startX).toBeCloseTo(fr.left, 0);
    expect(box.endX).toBeCloseTo(lr.right, 0);

    e.setSelection(null);
    expect(el.querySelectorAll('.rd-sel-rect')).toHaveLength(0);
    e.paintNow();
    expect(first.style.filter).toMatch(/^blur/);
  });

  it('rectangles scroll with the text and painting reads no layout while a selection is shown', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const r = wordRect(line, 0);
    const w = e.wordNear(r.left + 1, r.top + r.height / 2)!;
    e.setSelection(sel(w, w));
    const rect = el.querySelector<HTMLElement>('.rd-sel-rect')!;
    const before = rect.getBoundingClientRect().top - line.getBoundingClientRect().top;
    let reads = 0;
    const gbcr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) { reads++; return gbcr.call(this); };
    try {
      for (let i = 0; i < 10; i++) { el.scrollTop += 13; e.paintNow(); }
    } finally {
      Element.prototype.getBoundingClientRect = gbcr;
    }
    expect(reads).toBe(0);
    expect(rect.getBoundingClientRect().top - line.getBoundingClientRect().top).toBeCloseTo(before, 0);
  });
});

const book = makeBook(3);
/** The text of a word the engine returned (same synthetic book as the engine's). */
function word(w: WordRef): string {
  return paragraphText(book.chapters[w.chapter]!.paras[w.para]!).slice(w.start, w.end);
}

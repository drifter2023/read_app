import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { paragraphText, sentenceStarts } from '../../src/core/ingest/text.ts';
import { DEFAULT_PREFS } from '../../src/core/prefs/prefs.ts';
import type { Footnote } from '../../src/core/reader/decorate.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { words } from '../../src/core/reader/words.ts';
import { frames, host, makeBook } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; });

const book = makeBook(3);
async function open() {
  const el = host(402, 874);
  const e = new ReaderEngine(el, book, { ...DEFAULT_PREFS, tier: 'full' });
  engine = e;
  await e.mount(null);
  el.scrollTop = 1200;
  e.paintNow();
  await frames(2);
  return { el, e };
}
const centre = (el: Element) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
const tops = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.rd-line, .rd-blank')).map((l) => [l.offsetTop, l.offsetHeight]);

describe('grammar droplets', () => {
  const shown = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.rd-drop:not(.rd-drop-off)'));
  /** The sentence ends on a body line, and whether that line is sharp. */
  const endsOn = (line: HTMLElement) => {
    const ch = Number(line.closest<HTMLElement>('.rd-chapter')!.dataset.ch);
    const pi = Number(line.dataset.p);
    const p = book.chapters[ch]!.paras[pi]!;
    const text = paragraphText(p);
    const start = text.indexOf(line.textContent!);
    return sentenceStarts(p).map((st, k) => st + p[k]!.length).filter((e) => e > start && e <= start + line.textContent!.length)
      .map((e) => ({ key: `${ch}:${pi}:${e}`, off: e - start }));
  };

  it('each sentence ending on a sharp line has a droplet just under its last mark, and no other sentence does', async () => {
    const { el } = await open();
    const sharpLines = Array.from(el.querySelectorAll<HTMLElement>('.rd-line[data-p]')).filter((l) => l.style.filter === 'none');
    const want = sharpLines.flatMap((l) => endsOn(l).map((x) => ({ ...x, line: l })));
    expect(want.length).toBeGreaterThan(0);
    const got = shown(el);
    expect(got.map((d) => `${d.dataset.ch}:${d.dataset.p}:${d.dataset.at}`).sort()).toEqual(want.map((w) => w.key).sort());
    for (const w of want) {
      const d = got.find((x) => `${x.dataset.ch}:${x.dataset.p}:${x.dataset.at}` === w.key)!;
      const mark = document.createRange();
      mark.setStart(w.line.firstChild!, w.off - 1);
      mark.setEnd(w.line.firstChild!, w.off);
      const m = mark.getBoundingClientRect();
      const c = centre(d);
      const box = w.line.getBoundingClientRect();
      expect(Math.abs(c.x - m.right)).toBeLessThan(4);
      expect(c.y).toBeGreaterThan(m.bottom - 6);
      expect(c.y).toBeLessThan(box.bottom);
    }
  });

  it('droplets follow the band as the text scrolls, and lines are never touched', async () => {
    const { el, e } = await open();
    const before = shown(el).map((d) => d.dataset.at).join();
    el.scrollTop += 300;
    e.paintNow();
    await frames(2);
    expect(shown(el).map((d) => d.dataset.at).join()).not.toBe(before);
    expect(el.querySelectorAll('.rd-drop-off').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.rd-line .rd-drop').length).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(el.querySelectorAll('.rd-drop-off').length).toBe(0); // faded ones are removed
  });

  it('dropAt finds the sentence of a droplet in the band (44 px reach), and nothing elsewhere', async () => {
    const { el, e } = await open();
    const d = shown(el)[0]!;
    const c = centre(d);
    const hit = e.dropAt(c.x + 10, c.y + 12)!;
    expect(hit).toMatchObject({ chapter: Number(d.dataset.ch), para: Number(d.dataset.p) });
    const p = book.chapters[hit.chapter]!.paras[hit.para]!;
    expect(sentenceStarts(p)[hit.sentence]! + hit.sentenceText.length).toBe(Number(d.dataset.at));
    expect(e.dropAt(c.x + 30, c.y)).toBeNull();
    const box = el.getBoundingClientRect();
    expect(e.dropAt(box.left + 60, box.top + 120)).toBeNull(); // blurred text above the band
  });

  it('footnotes coming and going move no line and no droplet', async () => {
    const { el, e } = await open();
    const before = tops(el);
    const drops = shown(el).map((d) => d.style.transform).join();
    e.setAnnotator((_c, _p, _para, text) => [...words(text)].filter((w) => w.word === 'river').map((w): Footnote => ({ start: w.start, end: w.end, text: '河' })));
    await frames(2);
    expect(el.querySelectorAll('.rd-fn').length).toBeGreaterThan(0);
    expect(tops(el)).toEqual(before);
    expect(shown(el).map((d) => d.style.transform).join()).toBe(drops);
    e.setAnnotator(null);
    await frames(2);
    expect(el.querySelectorAll('.rd-fn').length).toBe(0);
  });

  it('only sharp lines count as in the band (drawers open there only)', async () => {
    const { el, e } = await open();
    const box = el.getBoundingClientRect();
    const index = (y: number) => {
      const hit = Array.from(el.querySelectorAll<HTMLElement>('.rd-line[data-p]')).find((l) => { const b = l.getBoundingClientRect(); return b.top <= y && b.bottom > y; })!;
      const r = document.createRange();
      r.setStart(hit.firstChild!, 2); r.setEnd(hit.firstChild!, 3);
      const c = r.getBoundingClientRect();
      return { line: hit, i: e.hitTest(c.left + c.width / 2, c.top + c.height / 2)?.lineIndex };
    };
    const centreLine = index(box.top + box.height / 2);
    expect(centreLine.line.style.filter).toBe('none');
    expect(e.isInBand(centreLine.i!)).toBe(true);
    const topLine = index(box.top + 120);
    expect(topLine.line.style.filter).not.toBe('none');
    expect(e.isInBand(topLine.i!)).toBe(false);
  });
});

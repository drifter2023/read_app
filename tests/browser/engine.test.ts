import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, type Prefs } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine, type Progress } from '../../src/core/reader/engine.ts';
import { bandFor, blurPx, opacityFor, tFor } from '../../src/core/reader/focus.ts';
import { frames, host, lineAt, makeBook, sleep } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; });

async function open(prefs: Partial<Prefs> = {}, opts: { chapters?: number; paras?: number; h?: number; progress?: Progress[] } = {}) {
  const el = host(402, opts.h ?? 874);
  const e = new ReaderEngine(el, makeBook(opts.chapters ?? 3, opts.paras), { ...DEFAULT_PREFS, tier: 'full', ...prefs }, {
    onProgress: (p) => opts.progress?.push(p),
  });
  engine = e;
  await e.mount(null);
  return { el, e };
}
const mid = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };

describe('ReaderEngine', () => {
  it('mount waits for the body font (Review Focus 3)', async () => {
    await open();
    expect(document.fonts.check('19.5px "Newsreader Variable"')).toBe(true);
  });

  it('R-01: every line in the window gets blur and opacity from the formula', async () => {
    const { el, e } = await open();
    el.scrollTop = 1500;
    e.paintNow();
    const band = bandFor(el.clientHeight, 30);
    const m = mid(el);
    let checked = 0;
    for (const line of Array.from(el.querySelectorAll<HTMLElement>('.rd-line'))) {
      const r = line.getBoundingClientRect();
      if (r.bottom < el.getBoundingClientRect().top || r.top > el.getBoundingClientRect().bottom) continue;
      const t = tFor(Math.abs(r.top + r.height / 2 - m), band);
      const b = blurPx(t, 7);
      expect(line.style.filter).toBe(b > 0 ? `blur(${b}px)` : 'none');
      expect(Number(line.style.opacity)).toBeCloseTo(opacityFor(t), 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
    expect(lineAt(el, m).style.filter).toBe('none');
  });

  it('writes a style only when its value changed', async () => {
    const { e } = await open();
    const before = e.stats.styleWrites;
    e.paintNow();
    expect(e.stats.styleWrites).toBe(before);
  });

  it('reads no layout while painting', async () => {
    const { el, e } = await open();
    let reads = 0;
    const gbcr = Element.prototype.getBoundingClientRect;
    const gcr = Range.prototype.getClientRects;
    const ot = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')!;
    Element.prototype.getBoundingClientRect = function (this: Element) { reads++; return gbcr.call(this); };
    Range.prototype.getClientRects = function (this: Range) { reads++; return gcr.call(this); };
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get() { reads++; return ot.get!.call(this); } });
    try {
      for (let i = 0; i < 30; i++) { el.scrollTop += 17; e.paintNow(); }
    } finally {
      Element.prototype.getBoundingClientRect = gbcr;
      Range.prototype.getClientRects = gcr;
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', ot);
    }
    expect(reads).toBe(0);
  });

  it('only touches lines within ±1 viewport, and sets will-change only there', async () => {
    const { el, e } = await open();
    e.paintNow();
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.rd-line'));
    const far = lines.at(-1)!;
    expect(far.style.filter).toBe('');
    expect(far.style.willChange).toBe('');
    expect(lineAt(el, mid(el)).style.willChange).toBe('filter, opacity');
  });

  it('sentence mode fades lines outside the current sentence (t + 0.18)', async () => {
    const { el, e } = await open({ sentenceMode: true, focusPct: 80 });
    el.scrollTop = 1200;
    e.paintNow();
    const opacities = Array.from(el.querySelectorAll<HTMLElement>('.rd-line'))
      .filter((l) => Math.abs(l.getBoundingClientRect().top + 17 - mid(el)) < 100)
      .map((l) => Number(l.style.opacity));
    expect(opacities).toContain(1);
    expect(opacities).toContain(opacityFor(0.18));
  });

  it('S-03: with 聚焦模糊 off every line is sharp and tappable; turning it back on restores the band', async () => {
    const { el, e } = await open({ focusBlur: false, sentenceMode: true });
    el.scrollTop = 1500;
    e.paintNow();
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.rd-line')).filter((l) => l.style.opacity !== '');
    expect(lines.length).toBeGreaterThan(15);
    for (const l of lines) {
      expect(l.style.filter).toBe('none');
      expect(l.style.opacity).toBe('1');
      expect(l.style.willChange).toBe('');
    }
    const top = Array.from(el.querySelectorAll<HTMLElement>('.rd-line'))
      .findIndex((l) => l.getBoundingClientRect().top > el.getBoundingClientRect().top + 40);
    expect(e.isInBand(top)).toBe(false);
    expect(e.isTappable(top)).toBe(true);

    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', focusBlur: true });
    expect(e.isTappable(top)).toBe(false);
    const m = mid(el);
    const box = el.getBoundingClientRect();
    const far = lines.find((l) => { const t = l.getBoundingClientRect().top; return t > box.top && t < box.bottom && Math.abs(t - m) > 300; })!;
    expect(far.style.filter).toMatch(/^blur\(/);
    expect(Number(far.style.opacity)).toBeLessThan(1);
    expect(lineAt(el, m).style.willChange).toBe('filter, opacity');
  });

  it('R-07: a font-size change keeps the anchor paragraph inside the band', async () => {
    const { el, e } = await open();
    el.scrollTop = 2400;
    e.paintNow();
    const before = e.currentAnchor();
    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', fontSize: 'L' });
    expect(el.style.getPropertyValue('--lh')).toBe('38px');
    const after = e.currentAnchor();
    expect(after.chapter).toBe(before.chapter);
    expect(after.para).toBe(before.para);
  });

  it('keeps the anchor when the viewport height changes (Review Focus 1)', async () => {
    const { el, e } = await open();
    el.scrollTop = 2400;
    e.paintNow();
    const before = e.currentAnchor();
    el.parentElement!.style.height = '700px';
    await frames(3);
    const after = e.currentAnchor();
    expect([after.chapter, after.para]).toEqual([before.chapter, before.para]);
  });

  it('first and last lines reach the band; pct is 1 then 100 (Review Focus 4)', async () => {
    const progress: Progress[] = [];
    const { el, e } = await open({}, { progress });
    expect(progress.at(-1)).toMatchObject({ chapterTitle: 'Chapter 1', pct: 1 });
    const half = bandFor(el.clientHeight, 30).half;
    el.scrollTop = 0;
    e.paintNow();
    const first = el.querySelector<HTMLElement>('.rd-line[data-p]')!.getBoundingClientRect();
    expect(Math.abs(first.top + first.height / 2 - mid(el))).toBeLessThanOrEqual(half);

    e.scrollToAnchor({ chapter: 2, para: 29, sentence: 0 });
    await sleep(300);
    el.scrollTop = el.scrollHeight;
    e.paintNow();
    const lines = el.querySelectorAll<HTMLElement>('.rd-line[data-p]');
    const last = lines[lines.length - 1]!.getBoundingClientRect();
    expect(Math.abs(last.top + last.height / 2 - mid(el))).toBeLessThanOrEqual(half);
    expect(progress.at(-1)).toMatchObject({ chapterTitle: 'Chapter 3', pct: 100 });
  });

  it('R-01: crossing into a long chapter never blocks a frame (layout runs in background slices)', async () => {
    const { el } = await open({}, { chapters: 4, paras: 250 });
    const mounted = () => Array.from(el.querySelectorAll<HTMLElement>('.rd-chapter')).map((b) => Number(b.dataset.ch));
    expect(mounted()).toEqual([0, 1]);
    // Read like a person: scroll in bursts with pauses, from chapter 0 well into chapter 1.
    const start = el.querySelector<HTMLElement>('.rd-chapter[data-ch="1"]')!.offsetTop - el.clientHeight;
    el.scrollTop = start;
    await sleep(300);
    const gaps: number[] = [];
    let last = 0;
    let run = true;
    const loop = (t: number) => { if (last) gaps.push(t - last); last = t; if (run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    for (let burst = 0; burst < 6; burst++) {
      for (let i = 0; i < 20; i++) { el.scrollTop += 30; await frames(1); }
      await sleep(400);
    }
    run = false;
    expect(mounted()).toEqual([0, 1, 2]);
    expect(Math.max(...gaps)).toBeLessThan(40);
  }, 20_000);

  it('R-01: redrawing footnotes never blocks a frame (nearest paragraphs first, rest in slices)', async () => {
    const { el, e } = await open();
    const all = el.querySelectorAll('.rd-line[data-p]').length;
    const slow = (_c: number, _p: number, _para: string[], text: string) => {
      const until = performance.now() + 1; // 1 ms per paragraph: ~90 ms for the mounted chapters at once
      while (performance.now() < until) { /* busy */ }
      const m = /\S+/.exec(text.slice(1))!;
      return [{ start: m.index + 1, end: m.index + 1 + m[0].length, text: '注' }];
    };
    const t0 = performance.now();
    e.setAnnotator(slow);
    expect(performance.now() - t0).toBeLessThan(5 + 1 + 4);
    // What is on screen came first.
    const centre = lineAt(el, mid(el)).closest('.rd-chapter')!;
    expect(centre.querySelectorAll('.rd-fn').length).toBeGreaterThan(0);
    const paras = () => new Set(Array.from(el.querySelectorAll<HTMLElement>('.rd-fn')).map((f) => {
      const l = f.closest<HTMLElement>('.rd-line')!;
      return `${l.closest<HTMLElement>('.rd-chapter')!.dataset.ch}:${l.dataset.p}`;
    })).size;
    const expected = new Set(Array.from(el.querySelectorAll<HTMLElement>('.rd-line[data-p]')).map((l) => `${l.closest<HTMLElement>('.rd-chapter')!.dataset.ch}:${l.dataset.p}`)).size;
    await expect.poll(paras, { timeout: 3000 }).toBe(expected);
    expect(all).toBeGreaterThan(0);
  });

  it('the drawer reaches the screen edges: its chapter does not clip it (content-visibility)', async () => {
    const { el, e } = await open();
    const line = Array.from(el.querySelectorAll<HTMLElement>('.rd-line')).findIndex((l) => mid(l) > 400);
    const gap = e.openGap(line);
    const wd = document.createElement('div');
    wd.className = 'wd';
    wd.style.height = '60px';
    gap.append(wd);
    e.setGap(gap.offsetHeight);
    await frames(2);
    const box = el.getBoundingClientRect();
    const y = wd.getBoundingClientRect().top + 30;
    expect(document.elementFromPoint(box.left + 6, y)).toBe(wd);
    expect(document.elementFromPoint(box.right - 6, y)).toBe(wd);
    e.closeGap();
    expect(getComputedStyle(el.querySelector('.rd-chapter')!).contentVisibility).toBe('auto');
  });

  it('virtualises to chapter ±1 without moving the text under the reader', async () => {
    const { el, e } = await open({}, { chapters: 6 });
    const mounted = () => Array.from(el.querySelectorAll<HTMLElement>('.rd-chapter')).map((b) => Number(b.dataset.ch));
    expect(mounted()).toEqual([0, 1]);
    // Neighbours are laid out in the background and attached at the next pause.
    e.scrollToAnchor({ chapter: 1, para: 0, sentence: 0 });
    await expect.poll(mounted, { timeout: 3000 }).toEqual([0, 1, 2]);
    e.scrollToAnchor({ chapter: 2, para: 3, sentence: 0 });
    await expect.poll(mounted, { timeout: 3000 }).toEqual([1, 2, 3]);
    expect(e.currentAnchor()).toMatchObject({ chapter: 2, para: 3 });
  });
});

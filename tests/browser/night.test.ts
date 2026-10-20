import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { paragraphText, sentenceStarts } from '../../src/core/ingest/text.ts';
import { DEFAULT_PREFS, type Prefs } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { bandFor, blurPx, opacityFor, tFor } from '../../src/core/reader/focus.ts';
import type { SentenceId } from '../../src/core/reader/guide.ts';
import { frames, host, makeBook, sleep } from './helpers.ts';

const book = makeBook(3);
let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; delete document.documentElement.dataset.theme; });

async function open(prefs: Partial<Prefs> = {}) {
  if (prefs.theme === 'night') document.documentElement.dataset.theme = 'night';
  const el = host(402, 874);
  const e = new ReaderEngine(el, book, { ...DEFAULT_PREFS, tier: 'full', ...prefs });
  engine = e;
  await e.mount(null);
  el.scrollTop = 1500;
  e.paintNow();
  await frames(2);
  return { el, e };
}
const ACCENT = 'rgb(255, 180, 180)';
/** The accent the engine wrote (the computed colour is mid-transition for 240 ms). */
const accented = (l: HTMLElement) => l.style.color === 'var(--reader-accent)';
const visible = (el: HTMLElement) => {
  const box = el.getBoundingClientRect();
  return [...el.querySelectorAll<HTMLElement>('.rd-line[data-p]')].filter((l) => {
    const r = l.getBoundingClientRect();
    return r.bottom > box.top && r.top < box.bottom && Number(l.dataset.p) >= 0;
  });
};
const tOf = (el: HTMLElement, l: HTMLElement) => {
  const box = el.getBoundingClientRect();
  const r = l.getBoundingClientRect();
  return tFor(Math.abs(r.top + r.height / 2 - (box.top + box.height / 2)), bandFor(el.clientHeight, 30));
};

/** The lines (in the DOM) that show part of sentence `id`, worked out from the text alone. */
function linesOf(el: HTMLElement, id: SentenceId): HTMLElement[] {
  const block = el.querySelector<HTMLElement>(`[data-ch="${id.chapter}"]`)!;
  const lines = [...block.querySelectorAll<HTMLElement>(`.rd-line[data-p="${id.para}"]`)];
  const p = book.chapters[id.chapter]!.paras[id.para]!;
  const starts = sentenceStarts(p);
  const from = starts[id.sentence]!;
  const to = id.sentence + 1 < starts.length ? starts[id.sentence + 1]! - 1 : paragraphText(p).length;
  let at = 0;
  return lines.filter((l) => {
    const a = at;
    at += (l.textContent ?? '').length;
    return a < to && at > from;
  });
}

describe('夜读 in the reader engine (N1–N3)', () => {
  it('NM-01: switching 纸白 → 夜读 → 纸白 moves no line', async () => {
    const { el, e } = await open();
    const tops = () => [...el.querySelectorAll<HTMLElement>('.rd-line')].map((l) => l.getBoundingClientRect().top);
    const before = tops();
    document.documentElement.dataset.theme = 'night';
    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', theme: 'night' });
    await frames(2);
    expect(tops()).toEqual(before);
    delete document.documentElement.dataset.theme;
    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', theme: 'paper' });
    expect(tops()).toEqual(before);
    expect(el.querySelectorAll<HTMLElement>('.rd-line[style*="color"]').length).toBe(0); // no accent left in 纸白
  });

  it('NM-02: at night the far lines fade to .08 and blur to 9 px by default', async () => {
    const { el } = await open({ theme: 'night' });
    let far = 0;
    for (const l of visible(el)) {
      const t = tOf(el, l);
      expect(Number(l.style.opacity)).toBeCloseTo(opacityFor(t, true), 2);
      const b = blurPx(t, 9);
      expect(l.style.filter).toBe(b > 0 ? `blur(${b}px)` : 'none');
      if (t === 1) { far++; expect(Number(l.style.opacity)).toBeCloseTo(0.08, 2); }
    }
    expect(far).toBeGreaterThan(0);
  });

  it('NM-03: not guiding, exactly the sharp (t = 0) lines carry the accent, and only at night', async () => {
    const { el } = await open({ theme: 'night' });
    let lit = 0;
    for (const l of visible(el)) {
      const sharp = tOf(el, l) === 0;
      expect(accented(l), `t=${tOf(el, l)}`).toBe(sharp);
      if (sharp) lit++;
    }
    expect(lit).toBeGreaterThan(2);
    await sleep(300); // after the 240 ms colour transition, the accent is #ffb4b4
    for (const l of visible(el)) expect(getComputedStyle(l).color === ACCENT).toBe(tOf(el, l) === 0);
  });

  it('NM-03: 聚焦模糊 off at night: no accent while not guiding', async () => {
    const { el } = await open({ theme: 'night', focusBlur: false });
    for (const l of visible(el)) expect(accented(l)).toBe(false);
  });
});

describe('带读 in the reader engine (N3, N4)', () => {
  it('NM-03: guiding, exactly the lit sentence’s lines carry the accent and are sharp; the others go one step deeper', async () => {
    const { el, e } = await open({ theme: 'night' });
    const id = e.sentenceAtCentre()!;
    const next = e.nextSentence(id)!;
    e.setGuideSentence(next);
    await frames(1);
    const mine = new Set(linesOf(el, next));
    expect(mine.size).toBeGreaterThan(0);
    for (const l of visible(el)) {
      expect(accented(l)).toBe(mine.has(l));
      if (mine.has(l)) expect(l.style.filter).toBe('none');
      else expect(Number(l.style.opacity)).toBeLessThan(1); // t ≥ .18 even inside the band
    }
    e.setGuideSentence(null);
    for (const l of visible(el)) expect(accented(l)).toBe(tOf(el, l) === 0);
  });

  it('NM-03: guiding with 聚焦模糊 off still colours the lit sentence (and blurs nothing)', async () => {
    const { el, e } = await open({ theme: 'night', focusBlur: false });
    const id = e.sentenceAtCentre()!;
    e.setGuideSentence(id);
    const mine = new Set(linesOf(el, id));
    for (const l of visible(el)) {
      expect(accented(l)).toBe(mine.has(l));
      expect(l.style.filter).toBe('none');
    }
  });

  it('N4: sentence navigation follows the book: next in the paragraph, then the next paragraph, null at the chapter end', async () => {
    const { e } = await open({ theme: 'night' });
    const ch = book.chapters[0]!;
    const p0 = ch.paras[0]!;
    expect(e.nextSentence({ chapter: 0, para: 0, sentence: 0 })).toEqual(p0.length > 1 ? { chapter: 0, para: 0, sentence: 1 } : { chapter: 0, para: 1, sentence: 0 });
    const lastPara = ch.paras.length - 1;
    expect(e.nextSentence({ chapter: 0, para: lastPara, sentence: ch.paras[lastPara]!.length - 1 })).toBeNull();
    expect(e.sentenceWords({ chapter: 0, para: 0, sentence: 0 })).toBe(p0[0]!.split(' ').length);
  });

  it('N4: the 600 ms step puts the next sentence’s centre at the viewport centre; a second step cancels the first (no stacking)', async () => {
    const { el, e } = await open({ theme: 'night' });
    const id = e.sentenceAtCentre()!;
    const a = e.nextSentence(id)!;
    const b = e.nextSentence(a)!;
    let doneA = 0;
    let doneB = 0;
    e.scrollSentenceToCentre(a, 600, () => doneA++);
    await sleep(100);
    e.scrollSentenceToCentre(b, 600, () => doneB++);
    await sleep(800);
    expect(doneA).toBe(0);
    expect(doneB).toBe(1);
    const lines = linesOf(el, b);
    const top = lines[0]!.getBoundingClientRect().top;
    const bottom = lines.at(-1)!.getBoundingClientRect().bottom;
    const box = el.getBoundingClientRect();
    expect((top + bottom) / 2).toBeCloseTo(box.top + box.height / 2, -0.5); // within ~1.5 px
  });

  it('NM-05: cancelling the step stops the scroll at once', async () => {
    const { el, e } = await open({ theme: 'night' });
    const next = e.nextSentence(e.nextSentence(e.sentenceAtCentre()!)!)!;
    let done = 0;
    const cancel = e.scrollSentenceToCentre(next, 600, () => done++);
    await sleep(150);
    cancel();
    const at = el.scrollTop;
    await sleep(300);
    expect(el.scrollTop).toBe(at);
    expect(done).toBe(0);
  });

  it('NM-07: painting during a guided step reads no layout', async () => {
    const { e } = await open({ theme: 'night' });
    const next = e.nextSentence(e.nextSentence(e.sentenceAtCentre()!)!)!;
    e.setGuideSentence(e.sentenceAtCentre());
    let reads = 0;
    const gbcr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) { reads++; return gbcr.call(this); };
    try {
      await new Promise<void>((r) => e.scrollSentenceToCentre(next, 300, r));
    } finally {
      Element.prototype.getBoundingClientRect = gbcr;
    }
    expect(reads).toBe(0);
  });
});

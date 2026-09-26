import type { EngineBook } from '../../src/core/reader/engine.ts';
import type { ChapterData } from '../../src/core/types.ts';

const WORDS = 'the quiet river ran past our house and the dust of the road settled on the leaves while soldiers marched toward the mountains in the late summer light'.split(' ');

/** Deterministic synthetic book: `chapters` × `paras` paragraphs of 1–4 sentences. */
export function makeBook(chapters = 3, paras = 30): EngineBook {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sentence = () => {
    const w = Array.from({ length: 6 + Math.floor(rnd() * 14) }, () => WORDS[Math.floor(rnd() * WORDS.length)]!);
    w[0] = w[0]!.charAt(0).toUpperCase() + w[0]!.slice(1);
    return `${w.join(' ')}.`;
  };
  const out: ChapterData[] = [];
  let wordStart = 0;
  for (let c = 0; c < chapters; c++) {
    const ps = Array.from({ length: paras }, () => Array.from({ length: 1 + Math.floor(rnd() * 4) }, sentence));
    out.push({ idx: c, title: `Chapter ${c + 1}`, paras: ps, wordStart });
    wordStart += ps.flat().join(' ').split(' ').length;
  }
  return { id: 'test', wordCount: wordStart, chapters: out };
}

export function host(w = 402, h = 874): HTMLElement {
  const page = document.createElement('div');
  Object.assign(page.style, { position: 'relative', width: `${w}px`, height: `${h}px`, overflow: 'hidden' });
  const el = document.createElement('div');
  page.append(el);
  document.body.append(page);
  return el;
}

export const frames = (n = 2) => new Promise<void>((r) => {
  const tick = (k: number) => (k === 0 ? r() : requestAnimationFrame(() => tick(k - 1)));
  tick(n);
});
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The body line whose centre is closest to viewport-y `y` (tests may read layout). */
export function lineAt(scroller: HTMLElement, y: number): HTMLElement {
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const el of Array.from(scroller.querySelectorAll<HTMLElement>('.rd-line'))) {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - y);
    if (d < bestD) { bestD = d; best = el; }
  }
  return best!;
}

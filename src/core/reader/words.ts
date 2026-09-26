import { sentenceStarts } from '../ingest/text.ts';
import type { Paragraph } from '../types.ts';

/** Characters that belong to a tappable word: letters, apostrophes, hyphens and the word joiner. */
const WORD_CH = /[A-Za-z'’‘\-‐‑⁠]/;
const EDGE = /['’‘\-‐‑⁠]/;

/** Bounds [start, end) of the word at or just before `offset` in `text`, or null over space/punctuation. */
export function wordBounds(text: string, offset: number): [number, number] | null {
  let i = offset;
  if (!WORD_CH.test(text[i] ?? '') && WORD_CH.test(text[i - 1] ?? '')) i--;
  if (!/[A-Za-z]/.test(text[i] ?? '') && !WORD_CH.test(text[i] ?? '')) return null;
  let a = i;
  let b = i + 1;
  while (a > 0 && WORD_CH.test(text[a - 1]!)) a--;
  while (b < text.length && WORD_CH.test(text[b]!)) b++;
  while (a < b && EDGE.test(text[a]!)) a++;
  while (b > a && EDGE.test(text[b - 1]!)) b--;
  return b > a && /[A-Za-z]/.test(text.slice(a, b)) ? [a, b] : null;
}

export interface WordContext { sentence: number; sentenceText: string; sentenceInitial: boolean; prevWord?: string }

/** Which sentence the word at `start` is in, whether it opens it, and the word before it. */
export function wordContext(p: Paragraph, start: number): WordContext {
  const starts = sentenceStarts(p);
  let s = 0;
  while (s + 1 < starts.length && starts[s + 1]! <= start) s++;
  const text = p[s] ?? '';
  const before = text.slice(0, Math.max(0, start - (starts[s] ?? 0)));
  const prev = before.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g);
  return { sentence: s, sentenceText: text, sentenceInitial: !prev, prevWord: prev?.at(-1) };
}

/** Every word in a paragraph's text with its offsets. */
export function* words(text: string): Generator<{ word: string; start: number; end: number }> {
  for (const m of text.matchAll(/[A-Za-z]+(?:['’‐‑⁠-][A-Za-z]+)*/g)) yield { word: m[0], start: m.index, end: m.index + m[0].length };
}

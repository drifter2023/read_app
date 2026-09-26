import type { Paragraph } from '../types.ts';

export const INDENT = ' ';

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'mt', 'jr', 'sr', 'prof', 'capt', 'col', 'gen', 'lt', 'sgt',
  'rev', 'hon', 'vs', 'no', 'co', 'inc', 'ltd', 'messrs', 'mme', 'mlle', 'ave', 'etc',
]);

/** Collapses ASCII whitespace (keeps U+00A0) and maps Standard Ebooks' U+FEFF to a word joiner. */
export function normaliseText(s: string): string {
  return s.replace(/﻿/g, '⁠').replace(/[ \t\n\r\f]+/g, ' ').trim();
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Sentences of one paragraph; `result.join(' ')` equals the normalised input. */
export function splitSentences(para: string): string[] {
  const out: string[] = [];
  for (const { segment } of segmenter.segment(para)) {
    const s = segment.trim();
    if (!s) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && endsWithAbbreviation(prev)) out[out.length - 1] = `${prev} ${s}`;
    else out.push(s);
  }
  return out;
}

function endsWithAbbreviation(s: string): boolean {
  const m = /(?:^|[\s“"'(])([A-Za-z]+)\.$/.exec(s);
  if (!m) return false;
  const w = m[1]!;
  return ABBREVIATIONS.has(w.toLowerCase()) || (w.length === 1 && w === w.toUpperCase());
}

const WORD = /[A-Za-z0-9]+(?:['’⁠-][A-Za-z0-9]+)*/g;

export function countWords(s: string): number {
  return s.match(WORD)?.length ?? 0;
}

export function paragraphText(p: Paragraph): string {
  return INDENT + p.join(' ');
}

/** Offset of each sentence inside `paragraphText(p)`. */
export function sentenceStarts(p: Paragraph): number[] {
  const out: number[] = [];
  let at = INDENT.length;
  for (const s of p) {
    out.push(at);
    at += s.length + 1;
  }
  return out;
}

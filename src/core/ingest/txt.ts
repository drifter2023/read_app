import type { ParsedBook, ParsedChapter } from '../types.ts';
import { EpubError } from './epub.ts';
import { countWords, normaliseText, splitSentences } from './text.ts';

/** Thrown with a message that can be shown to the user as-is. */
export class TxtError extends EpubError {}

const HEADING = /^(?:(?:chapter|book|part|section)\s+(?:[0-9]+|[IVXLCDM]+|[a-z-]+)\b.{0,60}|[IVXLCDM]+\.?|[0-9]{1,3}\.?)$/i;
const META_LINE = /^(?:(?:Title|Author|Translator|Illustrator|Editor|Release Date|Posting Date|Language|Credits|Produced by|Character set encoding|Most recently updated):\s*.+?\s*)+$/i;
/** Books with no headings are cut into sections of about this many words, so layout stays cheap. */
const SECTION_WORDS = 2500;

/**
 * UTF-8 plain text → book. Paragraphs are separated by blank lines (hard-wrapped lines inside a
 * paragraph are joined); if the file has no blank lines, every line is a paragraph. Chapters start
 * at lines like "CHAPTER IV" / "Part Two" / "XII". Project Gutenberg headers and licences are dropped.
 */
export function parseTxt(bytes: Uint8Array | ArrayBuffer, id: string, fileName: string): ParsedBook {
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new TxtError('这个 TXT 不是 UTF-8 编码，请先转成 UTF-8 再导入');
  }
  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const meta = (key: string) => normaliseText(new RegExp(`^${key}:\\s*(.+)$`, 'mi').exec(text.slice(0, 4000))?.[1] ?? '');
  const title = meta('Title') || fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '未命名';
  const author = meta('Author');
  const start = /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG.*$/im.exec(text);
  if (start) text = text.slice(start.index + start[0].length);
  const end = /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/im.exec(text);
  if (end) text = text.slice(0, end.index);

  const blocks = /\n[ \t]*\n/.test(text)
    ? text.split(/\n[ \t]*\n+/).map((b) => b.split('\n').map((l) => l.trim()).join(' '))
    : text.split('\n');
  // A metadata block ("Title: …", "Author: …") at the top is not body text.
  const paras = blocks.map(normaliseText).filter(Boolean).filter((p, i) => i > 2 || !META_LINE.test(p));
  if (!paras.length) throw new TxtError('这个 TXT 文件是空的');

  const chapters: ParsedChapter[] = [];
  let cur: ParsedChapter | null = null;
  for (const p of paras) {
    if (HEADING.test(p) && p.length <= 70) {
      cur = { title: p, paras: [], wordCount: 0 };
      chapters.push(cur);
      continue;
    }
    if (!cur) { cur = { title: '', paras: [], wordCount: 0 }; chapters.push(cur); }
    const sentences = splitSentences(p);
    cur.paras.push(sentences);
    cur.wordCount += countWords(p);
  }
  let out = chapters.filter((c) => c.paras.length > 0);
  if (!out.length) throw new TxtError('这个 TXT 里没有找到正文');
  // A front-matter block before the first heading keeps the book title; no headings at all → sections.
  if (out.length === 1 && out[0]!.wordCount > SECTION_WORDS * 1.5) out = splitSections(out[0]!.paras);
  else out.forEach((c, i) => { if (!c.title) c.title = i === 0 ? title : `Section ${i + 1}`; });
  return { id, title, author, chapters: out, wordCount: out.reduce((n, c) => n + c.wordCount, 0) };
}

function splitSections(paras: string[][]): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  let cur: ParsedChapter = { title: 'Section 1', paras: [], wordCount: 0 };
  for (const p of paras) {
    if (cur.wordCount >= SECTION_WORDS) {
      out.push(cur);
      cur = { title: `Section ${out.length + 1}`, paras: [], wordCount: 0 };
    }
    cur.paras.push(p);
    cur.wordCount += countWords(p.join(' '));
  }
  out.push(cur);
  return out;
}

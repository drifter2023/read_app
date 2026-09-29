import type { Db } from '../db/types.ts';
import type { Grammar } from './parse.ts';
import { PROMPT_VERSION } from './prompt.ts';

/** Where a sentence is: book, chapter, paragraph and sentence index (as in `Anchor`). */
export interface SentenceRef { bookId: string; chapter: number; para: number; sentence: number }

/** FNV-1a: tells a re-imported book's changed sentence apart from the one that was analysed. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The stored analysis, if it was made for this exact text with the current prompt. */
export async function loadGrammar(db: Db, ref: SentenceRef, text: string): Promise<Grammar | null> {
  const [row] = await db.all<{ text_hash: string; prompt_version: number; pattern: string; points: string }>(
    'SELECT text_hash, prompt_version, pattern, points FROM grammar WHERE book_id = ? AND chapter = ? AND para = ? AND sentence = ?',
    [ref.bookId, ref.chapter, ref.para, ref.sentence]);
  if (!row || row.text_hash !== hash(text) || row.prompt_version !== PROMPT_VERSION) return null;
  try {
    return { pattern: row.pattern, points: JSON.parse(row.points) as Grammar['points'] };
  } catch {
    return null;
  }
}

export async function saveGrammar(db: Db, ref: SentenceRef, text: string, g: Grammar, at = Date.now()): Promise<void> {
  await db.run(
    `INSERT INTO grammar (book_id, chapter, para, sentence, text_hash, prompt_version, pattern, points, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (book_id, chapter, para, sentence) DO UPDATE SET text_hash = excluded.text_hash,
       prompt_version = excluded.prompt_version, pattern = excluded.pattern, points = excluded.points, at = excluded.at`,
    [ref.bookId, ref.chapter, ref.para, ref.sentence, hash(text), PROMPT_VERSION, g.pattern, JSON.stringify(g.points), at]);
}

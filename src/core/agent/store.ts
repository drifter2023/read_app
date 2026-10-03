import type { Db } from '../db/types.ts';
import type { AgentMessage, AgentSession } from './types.ts';

interface SessionRow {
  id: string; book_id: string; chapter: number; chapter_label: string; title: string;
  anchor_para: number; anchor_sentence: number; updated_at: number;
}

/** A book's sessions, newest first. */
export async function listSessions(db: Db, bookId: string): Promise<AgentSession[]> {
  const rows = await db.all<SessionRow>(
    `SELECT id, book_id, chapter, chapter_label, title, anchor_para, anchor_sentence, updated_at
       FROM agent_session WHERE book_id = ? ORDER BY updated_at DESC, rowid DESC`, [bookId]);
  return rows.map((r) => ({
    id: r.id, bookId: r.book_id, chapter: r.chapter, chapterLabel: r.chapter_label, title: r.title,
    anchorPara: r.anchor_para, anchorSentence: r.anchor_sentence, updatedAt: r.updated_at,
  }));
}

export async function createSession(db: Db, s: AgentSession): Promise<void> {
  await db.run(
    `INSERT INTO agent_session (id, book_id, chapter, chapter_label, title, anchor_para, anchor_sentence, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.bookId, s.chapter, s.chapterLabel, s.title, s.anchorPara, s.anchorSentence, s.updatedAt]);
}

export async function loadMessages(db: Db, sessionId: string): Promise<AgentMessage[]> {
  const rows = await db.all<{ role: string; text: string; quote: string | null; cite: string | null; at: number }>(
    'SELECT role, text, quote, cite, at FROM agent_message WHERE session_id = ? ORDER BY id', [sessionId]);
  return rows.map((r): AgentMessage => r.role === 'user'
    ? { role: 'user', text: r.text, ...(r.quote ? { quote: r.quote } : {}), at: r.at }
    : { role: 'agent', text: r.text, ...(r.cite ? { cite: r.cite } : {}), at: r.at });
}

const TITLE_CHARS = 24;

/** A question and its complete answer, stored together (nothing is stored for a failed answer). */
export async function saveExchange(
  db: Db, sessionId: string, ex: { question: string; quote?: string; answer: string; cite?: string }, at = Date.now(),
): Promise<void> {
  await db.tx(async () => {
    await db.run('INSERT INTO agent_message (session_id, role, text, quote, cite, at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, 'user', ex.question, ex.quote ?? null, null, at]);
    await db.run('INSERT INTO agent_message (session_id, role, text, quote, cite, at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, 'agent', ex.answer, null, ex.cite ?? null, at]);
    const title = Array.from(ex.question.trim()).slice(0, TITLE_CHARS).join('');
    await db.run("UPDATE agent_session SET title = CASE WHEN title = '' THEN ? ELSE title END, updated_at = ? WHERE id = ?", [title, at, sessionId]);
  });
}

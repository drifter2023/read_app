import type { Db } from '../db/types.ts';
import type { Anchor } from '../types.ts';

export async function loadPosition(db: Db, bookId: string): Promise<Anchor | null> {
  const [r] = await db.all<Anchor>('SELECT chapter, para, sentence FROM position WHERE book_id = ?', [bookId]);
  return r ? { chapter: r.chapter, para: r.para, sentence: r.sentence } : null;
}

export async function savePosition(db: Db, bookId: string, a: Anchor, pct: number, now = Date.now()): Promise<void> {
  await db.tx(async () => {
    await db.run(
      `INSERT INTO position (book_id, chapter, para, sentence, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET chapter = excluded.chapter, para = excluded.para,
         sentence = excluded.sentence, updated_at = excluded.updated_at`,
      [bookId, a.chapter, a.para, a.sentence, now],
    );
    await db.run('UPDATE book SET pct = ? WHERE id = ?', [pct, bookId]);
  });
}

/** Debounces anchor saves (README: 1s). Call flush() when the app is hidden or the reader closes. */
export class PositionSaver {
  #save: (a: Anchor, pct: number) => Promise<void>;
  #delay: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending: { a: Anchor; pct: number } | null = null;

  constructor(save: (a: Anchor, pct: number) => Promise<void>, delayMs = 1000) {
    this.#save = save;
    this.#delay = delayMs;
  }

  push(a: Anchor, pct: number): void {
    this.#pending = { a, pct };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { void this.flush(); }, this.#delay);
  }

  async flush(): Promise<void> {
    clearTimeout(this.#timer);
    const p = this.#pending;
    this.#pending = null;
    if (p) await this.#save(p.a, p.pct);
  }
}

import { useEffect, useState } from 'react';
import { boot, type Session } from './app/boot.ts';
import { getBook, getChapters, listBooks, markOpened } from './core/library/library.ts';
import type { EngineBook } from './core/reader/engine.ts';
import { loadPosition } from './core/reader/position.ts';
import type { Anchor } from './core/types.ts';
import './styles/reader.css';
import { ReaderView } from './views/ReaderView.tsx';

interface Opened { session: Session; book: EngineBook; anchor: Anchor | null }

/** M1: opens a book directly (?book=<id>, else last opened, else gatsby). Home arrives in M3. */
export function App() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const session = await boot();
      const requested = new URLSearchParams(location.search).get('book');
      const recent = (await listBooks(session.db)).find((b) => b.openedAt !== null)?.id;
      const id = requested ?? recent ?? 'gatsby';
      const row = await getBook(session.db, id);
      if (!row) throw new Error(`没有找到这本书：${id}`);
      const chapters = await getChapters(session.db, id);
      await markOpened(session.db, id, Date.now());
      const anchor = await loadPosition(session.db, id);
      if (live) setOpened({ session, book: { id, wordCount: row.wordCount, chapters }, anchor });
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  if (error) return <p className="app-error">{error}</p>;
  if (!opened) return null;
  return <ReaderView session={opened.session} book={opened.book} initialAnchor={opened.anchor} />;
}

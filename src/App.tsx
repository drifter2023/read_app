import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { boot, type Session } from './app/boot.ts';
import { followTheme } from './app/theme.ts';
import { getBook, getChapters, markOpened } from './core/library/library.ts';
import { MOTION } from './core/motion.ts';
import { loadPosition } from './core/reader/position.ts';
import type { Anchor } from './core/types.ts';
import './styles/home.css';
import './styles/reader.css';
import { Flight, type Fly } from './views/Flight.tsx';
import { HomeView, type OpenRequest } from './views/home/HomeView.tsx';
import { ReaderView, type ReaderBook } from './views/ReaderView.tsx';

interface Opened { book: ReaderBook; anchor: Anchor | null; from: 'continue' | 'row' }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

async function loadBook(session: Session, id: string): Promise<{ book: ReaderBook; anchor: Anchor | null } | null> {
  const row = await getBook(session.db, id);
  if (!row) return null;
  const [chapters, anchor] = await Promise.all([getChapters(session.db, id), loadPosition(session.db, id)]);
  await markOpened(session.db, id, Date.now());
  return { book: { id, title: row.title, wordCount: row.wordCount, chapters }, anchor };
}

/** Two screens, Home and Reader, joined by the open-book flight (H-04). `?book=<id>` opens a book directly. */
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [readerOn, setReaderOn] = useState(false);
  const [fly, setFlyState] = useState<Fly | null>(null);
  /** Commits a flight phase now, so each phase's timer starts when its transition does (H-04). */
  const setFly = (f: Fly | null) => flushSync(() => setFlyState(f));
  const busy = useRef(false);
  /** The running open flight; going back waits for it rather than being dropped. */
  const opening = useRef<Promise<void> | null>(null);
  const reloadHome = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const s = await boot();
      const direct = new URLSearchParams(location.search).get('book');
      if (direct) {
        const b = await loadBook(s, direct);
        if (!b) throw new Error(`没有找到这本书：${direct}`);
        if (!live) return;
        setOpened({ ...b, from: 'row' });
        setReaderOn(true);
      }
      if (live) setSession(s);
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  useEffect(() => (session ? followTheme(session.prefs) : undefined), [session]);

  const open = useCallback(({ book, from }: OpenRequest) => {
    if (!session || busy.current) return;
    busy.current = true;
    opening.current = runOpenFlight(book, from).finally(() => { busy.current = false; opening.current = null; });
  }, [session]);

  const runOpenFlight = async (book: OpenRequest['book'], from: HTMLElement) => {
    if (!session) return;
    const r = from.getBoundingClientRect();
    const base: Fly = {
      rect: { left: r.left, top: r.top, width: r.width, height: r.height }, phase: 'spine',
      title: book.title, author: book.author, cover: book.cover, color: book.color,
    };
    const fromKind = from.closest('.continue') ? 'continue' : 'row';
    setFly(base);
    const loading = loadBook(session, book.id);
    await frame();
    setFly({ ...base, phase: 'out' });
    await wait(MOTION.bookOut + 20);
    setFly({ ...base, phase: 'full' });
    await wait(MOTION.bookExpand);
    // Mount the reader only once the expand has finished, so its layout work cannot stall the flight.
    const loaded = await loading;
    if (!loaded) { setFly(null); return; }
    setOpened({ ...loaded, from: fromKind });
    await frame();
    setReaderOn(true);
    setFly({ ...base, phase: 'page' });
    await wait(MOTION.pageFade);
    setFly(null);
  };

  const back = useCallback(async () => {
    if (opening.current) await opening.current;
    if (!opened || busy.current) return;
    busy.current = true;
    const id = opened.book.id;
    await reloadHome.current?.();
    await frame();
    // The home screen is laid out (hidden) under the reader, so the landing rect can be measured.
    const sel = opened.from === 'continue' ? '.continue' : `[data-book-id="${id}"] [data-cover]`;
    const target = document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>('.continue');
    const r = target?.getBoundingClientRect() ?? { left: 24, top: 120, width: 46, height: 64 };
    const book = session ? await getBook(session.db, id) : null;
    const base: Fly = {
      rect: { left: r.left, top: r.top, width: r.width, height: r.height }, phase: 'page',
      title: opened.book.title, author: book?.author ?? '', cover: book?.cover ?? null, color: book?.color ?? 0,
    };
    setFly(base);
    await frame();
    setFly({ ...base, phase: 'full' }); // cover fades back in over the page
    await wait(MOTION.coverFade);
    setReaderOn(false);
    setOpened(null);
    setFly({ ...base, phase: 'back' });
    await wait(MOTION.bookBack);
    setFly(null);
    busy.current = false;
  }, [opened, session]);

  if (error) return <p className="app-error">{error}</p>;
  return (
    <>
      {session && <HomeView session={session} onOpen={open} hidden={opened !== null && readerOn} reloadRef={reloadHome} />}
      {opened && session && (
        <div className={readerOn ? 'reader-layer reader-on' : 'reader-layer'}>
          <ReaderView session={session} book={opened.book} initialAnchor={opened.anchor} onBack={() => void back()} />
        </div>
      )}
      {fly && <Flight fly={fly} />}
    </>
  );
}

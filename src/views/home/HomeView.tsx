import { useEffect, useRef, useState } from 'react';
import type { Session } from '../../app/boot.ts';
import { Capacitor } from '@capacitor/core';
import { ImportError, importFile, importLink, type ImportProgress, type ImportResult, type LinkStage } from '../../app/importBook.ts';
import { shareTextFile } from '../../app/share.ts';
import { exportMetrics } from '../../core/metrics/metrics.ts';
import { linkFrom } from '../../core/ingest/link.ts';
import { BUNDLED } from '../../core/library/bundled.ts';
import { dateEyebrow, minutesLeft } from '../../core/library/format.ts';
import { deleteBook, listShelf, restoreBundled, type ShelfBook } from '../../core/library/library.ts';
import type { Theme } from '../../core/prefs/prefs.ts';
import type { ParsedBook } from '../../core/types.ts';
import { Confirm } from '../Confirm.tsx';
import { AiKeyCard } from './AiKeyCard.tsx';
import { ImportChooser } from './ImportChooser.tsx';
import { ShelfRow } from './ShelfRow.tsx';
import { VocabCard } from './VocabCard.tsx';

export interface OpenRequest { book: ShelfBook; from: HTMLElement }

type ImportState = { name: string; progress: ImportProgress | null; stage?: LinkStage; error: string | null } | null;

/** Link import needs our Worker; the iOS app gets it later (docs/plans/2026-10-12-link-import.md). */
const LINKS = !Capacitor.isNativePlatform();

/** Home (README → Screens → 1): date eyebrow, continue block, shelf with filter, import. */
export function HomeView({ session, onOpen, hidden, reloadRef }: {
  session: Session; onOpen: (r: OpenRequest) => void; hidden?: boolean;
  /** Lets the app refresh the shelf before measuring where the flight should land. */
  reloadRef?: { current: (() => Promise<void>) | null };
}) {
  const [shelf, setShelf] = useState<ShelfBook[] | null>(null);
  const [filter, setFilter] = useState<'reading' | 'done'>('reading');
  const [swiped, setSwiped] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ShelfBook | null>(null);
  const [importing, setImporting] = useState<ImportState>(null);
  const [choosing, setChoosing] = useState(false);
  const [theme, setTheme] = useState<Theme>(session.prefs.get().theme);
  useEffect(() => session.prefs.subscribe((p) => setTheme(p.theme)), [session]);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const openAfterLoad = useRef<string | null>(null);

  const reload = async () => setShelf(await listShelf(session.db));
  useEffect(() => { void reload(); }, [session]);
  if (reloadRef) reloadRef.current = reload;

  // After an import, open the new book from its shelf row once the row exists (H-03).
  useEffect(() => {
    const id = openAfterLoad.current;
    if (!id || !shelf) return;
    openAfterLoad.current = null;
    const book = shelf.find((b) => b.id === id);
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-book-id="${id}"] [data-cover]`);
    if (book && el) onOpen({ book, from: el });
  }, [shelf, onOpen]);

  const run = async (name: string, job: () => Promise<ImportResult>) => {
    setImporting({ name, progress: null, error: null });
    try {
      const r = await job();
      setImporting(null);
      const book = shelf?.find((b) => b.id === r.id);
      if (book) setFilter(book.status === 'done' ? 'done' : 'reading');
      else setFilter('reading');
      openAfterLoad.current = r.id;
      await reload();
    } catch (e) {
      setImporting((s) => ({ name: s?.name ?? name, progress: null, error: e instanceof ImportError ? e.message : '导入失败，请换一个文件再试' }));
    }
  };
  const pick = (file: File) => run(file.name, () => importFile(session.db, file, (progress) => setImporting((s) => s && { ...s, progress })));
  const link = (text: string) => {
    setChoosing(false);
    return run(linkName(text), () => importLink(session.db, text, (stage) => setImporting((s) => s && { ...s, stage })));
  };

  const restore = async (id: string) => {
    const res = await fetch(`${import.meta.env.BASE_URL}books/${id}.json`);
    if (res.ok) await restoreBundled(session.db, (await res.json()) as ParsedBook);
    await reload();
  };

  /** Beta metrics leave the device only when the tester shares this file themselves. */
  const exportLog = async () => {
    const day = new Date().toISOString().slice(0, 10);
    await shareTextFile(`spotlight-log-${day}.json`, await exportMetrics(session.db)).catch(() => {});
  };

  if (!shelf) return <div className="home" />;
  const current = shelf.find((b) => b.openedAt !== null);
  const rows = shelf.filter((b) => b.status === filter);

  return (
    <div className="home" ref={rootRef} aria-hidden={hidden} onClick={() => swiped && setSwiped(null)}>
      <div className="home-scroll">
        <div className="home-top">
          <div className="eyebrow home-date">{dateEyebrow(new Date())}</div>
          <div className="theme-toggle" role="radiogroup" aria-label="主题">
            {([['paper', '纸白'], ['night', '夜读']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => void session.prefs.set('theme', id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {current && (
          <section
            className="continue"
            role="button"
            tabIndex={0}
            aria-label={`继续阅读 ${current.title}`}
            onClick={(e) => onOpen({ book: current, from: e.currentTarget })}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen({ book: current, from: e.currentTarget }); }}
          >
            <div className="eyebrow label">Continue</div>
            <h1 className="continue-title">{current.title}</h1>
            <div className="continue-meta">{current.author}{current.author ? ' · ' : ''}第 {current.chapter + 1} 章</div>
            <div className="continue-progress">
              <div className="bar"><i style={{ width: `${Math.max(1, Math.round(current.pct))}%` }} /></div>
              <span className="continue-pct">{Math.max(1, Math.round(current.pct))}%</span>
            </div>
            <div className="continue-left">还剩约 {minutesLeft(current.wordCount, current.pct)} 分钟</div>
          </section>
        )}
        {current && <hr className="rule rule-continue" />}

        <div className="shelf-head">
          <span className="eyebrow">Shelf</span>
          <button type="button" className="import-btn" onClick={() => (LINKS ? setChoosing(true) : fileRef.current?.click())}>+ 导入</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".epub,.txt,application/epub+zip,text/plain"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }}
        />

        {shelf.length === 0 ? (
          <div className="empty">
            <p className="empty-copy">书架是空的。导入一本 EPUB 或 TXT，或者从下面的公版书开始。</p>
            <ul className="empty-list">
              {BUNDLED.map((b) => (
                <li key={b.id}>
                  <span><span className="empty-title">{b.title}</span><span className="empty-author">{b.author}</span></span>
                  <button type="button" onClick={() => void restore(b.id)}>放回书架</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="filter" role="tablist">
              {([['reading', '在读'], ['done', '读完']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            {rows.length === 0 && <p className="shelf-none">{filter === 'done' ? '还没有读完的书' : '在读的书都读完了'}</p>}
            <ul className="shelf">
              {rows.map((b) => (
                <ShelfRow
                  key={b.id}
                  book={b}
                  open={swiped === b.id}
                  onSwipe={(o) => setSwiped(o ? b.id : null)}
                  onOpen={(el) => onOpen({ book: b, from: el })}
                  onDelete={() => setConfirm(b)}
                />
              ))}
            </ul>
          </>
        )}

        <VocabCard db={session.db} />
        <AiKeyCard db={session.db} />

        <footer className="home-foot">
          <button type="button" onClick={() => void exportLog()}>导出内测日志</button>
        </footer>
      </div>

      {importing && (
        <div className="import-sheet" role="status" onClick={(e) => e.stopPropagation()}>
          <div className="import-name">{importing.name}</div>
          {importing.error ? (
            <>
              <p className="import-error">{importing.error}</p>
              <button type="button" className="import-ok" onClick={() => setImporting(null)}>好</button>
            </>
          ) : (
            <>
              <div className="bar import-bar"><i style={{ width: `${importing.progress ? Math.round((100 * importing.progress.done) / Math.max(1, importing.progress.total)) : 4}%` }} /></div>
              <p className="import-note">{importing.stage === 'fetch' ? '正在抓取网页…' : `正在解析${importing.progress ? ` · ${importing.progress.done}/${importing.progress.total}` : '…'}`}</p>
            </>
          )}
        </div>
      )}

      {choosing && (
        <ImportChooser
          onLink={(text) => void link(text)}
          onFile={() => { setChoosing(false); fileRef.current?.click(); }}
          onClose={() => setChoosing(false)}
        />
      )}

      {confirm && (
        <Confirm
          title={`删除《${confirm.title}》？`}
          body="这本书的阅读进度和查词记录会一起删除。"
          action="删除"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            setSwiped(null);
            void deleteBook(session.db, id).then(reload);
          }}
        />
      )}
    </div>
  );
}

/** The progress sheet's name for a link: its host and path, else what was pasted. */
function linkName(text: string): string {
  const url = linkFrom(text);
  if (!url) return text.trim().slice(0, 80);
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
}

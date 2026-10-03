import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AgentService, type AskState } from '../../core/agent/service.ts';
import { flatten, defaultIndex, pageAround, readingContext, type Page } from '../../core/agent/context.ts';
import { formatWhen } from '../../core/agent/format.ts';
import { SUGGESTIONS } from '../../core/agent/prompt.ts';
import { createSession, listSessions, loadMessages } from '../../core/agent/store.ts';
import type { AgentMessage, AgentSession } from '../../core/agent/types.ts';
import { FAILURE, NO_RETRY } from '../../core/ai/failure.ts';
import type { Db } from '../../core/db/types.ts';
import type { ReaderEngine } from '../../core/reader/engine.ts';
import type { ChapterData } from '../../core/types.ts';

interface Props {
  db: Db;
  book: { id: string; title: string; chapters: ChapterData[] };
  engine: RefObject<ReaderEngine | null>;
  /** True once the drawer is open (or opening): the page text is read from the reader then. */
  open: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
}

interface Live { sid: string; question: string; quote: string; state: AskState }

const EMPTY_PAGE: Page = { chapter: 0, chapterTitle: '', paras: [] };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The Agent drawer (AGENT_DRAWER.md, design 9a): a per-book chat with the reading companion 旁注. */
export function AgentDrawer({ db, book, engine, open, panelRef }: Props) {
  const service = useMemo(() => new AgentService(db), [db]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [sid, setSid] = useState<string | null | undefined>(undefined); // undefined: not chosen yet
  const [msgs, setMsgs] = useState<AgentMessage[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [hist, setHist] = useState(false);
  const [page, setPage] = useState<Page>(EMPTY_PAGE);
  const [sel, setSel] = useState(0);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const tapLock = useRef(false);
  const lockTimer = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(lockTimer.current); }; }, []);

  const flat = useMemo(() => flatten(page), [page]);
  const refreshSessions = useCallback(async () => {
    const list = await listSessions(db, book.id);
    if (alive.current) setSessions(list);
    return list;
  }, [db, book.id]);

  // Opening: read the text around the reader's position; the first time, continue the latest conversation.
  useEffect(() => {
    if (!open) return;
    const a = engine.current?.currentAnchor() ?? { chapter: 0, para: 0, sentence: 0 };
    const p = pageAround(book.chapters, a);
    setPage(p);
    setSel(defaultIndex(p, a));
    setHist(false);
    void refreshSessions().then((list) => { if (alive.current) setSid((cur) => (cur === undefined ? list[0]?.id ?? null : cur)); });
  }, [open, book, engine, refreshSessions]);

  useEffect(() => {
    if (!sid) { setMsgs([]); return; }
    let stale = false;
    void loadMessages(db, sid).then((m) => { if (!stale) setMsgs(m); });
    return () => { stale = true; };
  }, [db, sid]);

  // New messages or another conversation: scroll to the end. A change of the selected sentence does not.
  const shown = live && live.sid === sid ? live : null;
  useEffect(() => {
    const l = listRef.current;
    if (l) l.scrollTop = l.scrollHeight;
  }, [sid, msgs.length, shown?.state.status, shown && 'text' in shown.state ? shown.state.text : '']);

  // --- sentence picker: the sentence on the middle line is the selected one (AGENT_DRAWER.md §4.2) ---
  const scrollPick = useCallback((i: number, smooth: boolean) => {
    const el = pickRef.current;
    const sp = el?.querySelector<HTMLElement>(`[data-si="${i}"]`);
    if (!el || !sp) return;
    const er = el.getBoundingClientRect(), r = sp.getBoundingClientRect();
    el.scrollTo({ top: el.scrollTop + (r.top + r.height / 2) - (er.top + er.height / 2), behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const lock = (ms: number) => { tapLock.current = true; clearTimeout(lockTimer.current); lockTimer.current = window.setTimeout(() => { tapLock.current = false; }, ms); };
  useEffect(() => {
    if (!open || !flat.length) return;
    lock(300);
    const id = requestAnimationFrame(() => scrollPick(sel, false));
    return () => cancelAnimationFrame(id);
    // Only when the page or the conversation changes; `sel` changes come from the picker itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flat, sid, scrollPick]);
  const onPick = (el: HTMLDivElement) => {
    if (tapLock.current) return;
    const cy = el.getBoundingClientRect().top + el.clientHeight / 2;
    let best = sel, bd = Infinity;
    const hits: number[] = [];
    el.querySelectorAll<HTMLElement>('[data-si]').forEach((sp) => {
      for (const r of sp.getClientRects()) {
        const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
        if (d === 0) hits.push(+sp.dataset.si!);
        if (d < bd) { bd = d; best = +sp.dataset.si!; }
      }
    });
    const next = hits.length ? (hits.includes(sel) ? sel : hits.reduce((a, b) => (Math.abs(b - sel) < Math.abs(a - sel) ? b : a))) : best;
    if (next !== sel) setSel(next);
  };

  // --- asking ---
  const send = useCallback(async (raw: string) => {
    const question = raw.trim();
    const sentence = flat[sel];
    if (!question || !sentence || (shown && (shown.state.status === 'waiting' || shown.state.status === 'streaming'))) return;
    let id = sid;
    if (!id) {
      id = newId();
      await createSession(db, {
        id, bookId: book.id, chapter: page.chapter, chapterLabel: page.chapterTitle, title: '',
        anchorPara: sentence.para, anchorSentence: sentence.sentence, updatedAt: Date.now(),
      });
      setSid(id);
    }
    const sessionId = id;
    setLive({ sid: sessionId, question, quote: sentence.text, state: { status: 'waiting' } });
    const final = await service.ask({
      sessionId, question, sentence: sentence.text, title: book.title, chapter: page.chapterTitle,
      reading: readingContext(book.chapters, page),
    }, (state) => { if (alive.current) setLive((cur) => (cur && cur.sid === sessionId && cur.question === question ? { ...cur, state } : cur)); });
    if (!alive.current) return;
    if (final.status === 'done') {
      await refreshSessions();
      if (!alive.current) return;
      setMsgs(await loadMessages(db, sessionId));
      setLive((cur) => (cur && cur.sid === sessionId && cur.question === question ? null : cur));
    }
  }, [flat, sel, shown, sid, db, book, page, service, refreshSessions]);

  const used = new Set(msgs.filter((m) => m.role === 'user').map((m) => m.text));
  const chips = SUGGESTIONS.filter((q) => !used.has(q));
  const current = sessions.find((s) => s.id === sid);
  const title = current?.title || (shown ? shown.question : '新对话');
  const quoteOf = (s: AgentSession) => book.chapters[s.chapter]?.paras[s.anchorPara]?.[s.anchorSentence] ?? '';

  const pickSession = (s: AgentSession) => {
    setSid(s.id);
    setHist(false);
    if (s.chapter === page.chapter) {
      const i = flat.findIndex((x) => x.para === s.anchorPara && x.sentence === s.anchorSentence);
      if (i >= 0) setSel(i);
    }
  };

  let k = -1;
  return (
    <div ref={panelRef} className="ag-panel" inert={!open} aria-hidden={!open} aria-label="旁注">
      <div className="ag-head-wrap">
        <div className="ag-head">
          <button type="button" className="ag-title-btn" data-open={hist} aria-expanded={hist} onClick={() => setHist((h) => !h)}>
            <span className="ag-meta">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M2.2 2.6v2.6h2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 5.2V8l2 1.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>历史 {sessions.length}</span><span className="ag-dot">·</span><span className="ag-meta-ch">{current?.chapterLabel ?? page.chapterTitle}</span>
            </span>
            <span className="ag-title">
              <span className="ag-title-text">{title}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="ag-chev">
                <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>
        <div className="ag-scrim" data-open={hist} onClick={() => setHist(false)} />
        <div className="ag-hist" data-open={hist} role="listbox" aria-label="本书的对话">
          <div className="ag-hist-head"><span className="ag-label">本书的对话</span><span className="ag-hint">点选继续</span></div>
          {sessions.map((s) => (
            <button type="button" key={s.id} role="option" aria-selected={s.id === sid} className="ag-sess" data-current={s.id === sid} onClick={() => pickSession(s)}>
              <span className="ag-sess-dot" />
              <span className="ag-sess-body">
                <span className="ag-sess-top"><span className="ag-sess-title">{s.title || '新对话'}</span><span className="ag-sess-when">{formatWhen(s.updatedAt)}</span></span>
                <span className="ag-sess-quote">{quoteOf(s)}</span>
                <span className="ag-label">{s.chapterLabel}</span>
              </span>
            </button>
          ))}
          <button type="button" className="ag-new" onClick={() => { setSid(null); setHist(false); }}>
            <span className="ag-new-plus">+</span>新对话 · 从当前句开始
          </button>
        </div>
      </div>

      <div ref={listRef} className="ag-list">
        <div className="ag-now">
          <div className="ag-now-head"><span className="ag-label">当前句</span><span className="ag-hint">滑动或点选一句</span></div>
          <div ref={pickRef} className="ag-pick" onScroll={(e) => onPick(e.currentTarget)} data-noswipe="">
            {page.paras.map((p, pi) => (
              <p key={p.para} className="ag-para" style={{ textIndent: pi ? '1em' : 0 }}>
                {p.sentences.map((s) => {
                  const i = ++k;
                  return (
                    <span key={s.sentence} data-si={i} className="ag-sent" data-sel={i === sel}
                      onClick={() => { lock(500); setSel(i); scrollPick(i, true); }}>{s.text}{' '}</span>
                  );
                })}
              </p>
            ))}
          </div>
        </div>

        {msgs.map((m, i) => <Message key={i} m={m} />)}
        {shown && (
          <>
            <Message m={{ role: 'user', text: shown.question, quote: shown.quote, at: 0 }} />
            <div className="ag-msg">
              {shown.state.status === 'waiting' && <Dots />}
              {shown.state.status === 'streaming' && <Answer text={shown.state.text} caret />}
              {shown.state.status === 'error' && (
                <>
                  {shown.state.partial && <Answer text={shown.state.partial} />}
                  <p className="ag-error" role="alert">{FAILURE[shown.state.reason]}</p>
                  {!NO_RETRY.has(shown.state.reason) && (
                    <button type="button" className="ag-retry" onClick={() => void send(shown.question)}>重试</button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="ag-chips" data-noswipe="">
        {chips.map((q) => <button type="button" key={q} className="ag-chip" onClick={() => void send(q)}>{q}</button>)}
      </div>
      <form className="ag-composer" onSubmit={(e) => { e.preventDefault(); const q = draft; setDraft(''); void send(q); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="在页边写下你的问题" aria-label="问题" enterKeyHint="send" />
        <button type="submit" className="ag-send" aria-label="发送" disabled={!draft.trim()}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 12V2M7 2L2.5 6.5M7 2l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function Dots() {
  return <div className="ag-dots" role="status" aria-label="正在回答"><i /><i /><i /></div>;
}

function Answer({ text, caret = false }: { text: string; caret?: boolean }) {
  return (
    <>
      <div className="ag-tag"><span className="ag-tag-dot" />旁注</div>
      <div className="ag-answer">{text}{caret && <span className="ag-caret" aria-hidden="true" />}</div>
    </>
  );
}

function Message({ m }: { m: AgentMessage }) {
  if (m.role === 'user') {
    return (
      <div className="ag-msg">
        {m.quote && <div className="ag-quote">“{m.quote}”</div>}
        <div className="ag-user"><div className="ag-bubble">{m.text}</div></div>
      </div>
    );
  }
  return (
    <div className="ag-msg">
      <Answer text={m.text} />
      {m.cite && <div className="ag-cite">{m.cite}</div>}
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Session } from '../app/boot.ts';
import { devTools, exposeDevHandle } from '../app/devtools.ts';
import { logMetric } from '../core/metrics/metrics.ts';
import { ReaderEngine, type EngineBook } from '../core/reader/engine.ts';
import { PositionSaver, savePosition } from '../core/reader/position.ts';
import { decideTier, runProbe } from '../core/reader/probe.ts';
import type { Anchor } from '../core/types.ts';
import { AgentDrawer } from './agent/AgentDrawer.tsx';
import { useAgentSwipe } from './agent/useAgentSwipe.ts';
import { DevPanel } from './DevPanel.tsx';
import { FpsMeter } from './FpsMeter.tsx';
import { ReaderChrome } from './reader/ReaderChrome.tsx';
import { SettingsSheet } from './reader/SettingsSheet.tsx';
import { TocSheet } from './reader/TocSheet.tsx';
import { useExposure } from './useExposure.ts';
import { drawerInner, useWordLookup } from './useWordLookup.tsx';

export interface ReaderBook extends EngineBook { title: string }
interface Props { session: Session; book: ReaderBook; initialAnchor: Anchor | null; onBack: () => void }

const CHROME_IDLE_MS = 3000;
const MIN_SESSION_MS = 5000;

export function ReaderView({ session, book, initialAnchor, onBack }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chapterRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const saverRef = useRef<PositionSaver | null>(null);
  const [prefs, setPrefs] = useState(session.prefs.get());
  const [probing, setProbing] = useState(false);
  const [chrome, setChrome] = useState(false);
  const [sheet, setSheet] = useState<'settings' | 'toc' | null>(null);
  const [chapter, setChapter] = useState(initialAnchor?.chapter ?? 0);
  const chromeTimer = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  useAgentSwipe({ shell: shellRef, page: pageRef, panel: panelRef, dim: dimRef, shield: shieldRef }, setAgentOpen);
  const lookup = useWordLookup(engineRef, session.db, book, session.prefs);
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  useExposure(scrollRef, engineRef, book, lookup);

  useEffect(() => {
    const saver = new PositionSaver((a, pct) => savePosition(session.db, book.id, a, pct));
    saverRef.current = saver;
    let pct = 1;
    // Session metrics: time visible and words advanced (README → Local log).
    let visibleSince = performance.now();
    let startWords = -1;
    let maxWords = 0;
    const endSession = () => {
      const ms = performance.now() - visibleSince;
      if (ms >= MIN_SESSION_MS) void logMetric(session.db, { type: 'session', bookId: book.id, ms: Math.round(ms), words: Math.max(0, maxWords - startWords) });
      startWords = -1;
    };
    const engine = new ReaderEngine(scrollRef.current!, book, session.prefs.get(), {
      // Written straight to the DOM: no React render per scroll frame.
      onProgress: (p) => {
        chapterRef.current!.textContent = p.chapterTitle;
        pctRef.current!.textContent = `${p.pct}%`;
        pct = p.pct;
        if (startWords < 0) { startWords = p.words; maxWords = p.words; }
        maxWords = Math.max(maxWords, p.words);
        setChapter(p.chapter);
      },
      onAnchor: (a) => saver.push(a, pct),
      onRelayout: () => lookupRef.current.reset(),
    });
    engineRef.current = engine;
    exposeDevHandle({ engine, prefs: session.prefs });
    const unsubscribe = session.prefs.subscribe((p) => { engine.setPrefs(p); setPrefs(p); });
    const onHide = () => {
      if (document.visibilityState === 'hidden') { void saver.flush(); endSession(); }
      else visibleSince = performance.now();
    };
    const onPageHide = () => { void saver.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    let cancelled = false;
    void engine.mount(initialAnchor).then(async () => {
      if (cancelled || session.prefs.get().tier !== null) return;
      const forced = (window as { __forceTier?: 'full' | 'fallback' }).__forceTier; // e2e only
      if (forced) { await session.prefs.set('tier', forced); return; }
      setProbing(true);
      const result = await runProbe(engine);
      if (cancelled) return;
      await session.prefs.set('tier', decideTier(result));
      setProbing(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      endSession();
      void saver.flush();
      engine.destroy();
      engineRef.current = null;
    };
  }, [session, book, initialAnchor]);

  // Chrome: shown by a tap on blank space, hidden after 3 s idle or when scrolling starts.
  const showChrome = (on: boolean) => {
    clearTimeout(chromeTimer.current);
    setChrome(on);
    if (on) chromeTimer.current = window.setTimeout(() => setChrome(false), CHROME_IDLE_MS);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !chrome) return;
    const hide = () => showChrome(false);
    el.addEventListener('scroll', hide, { passive: true, once: true });
    return () => el.removeEventListener('scroll', hide);
  }, [chrome]);
  useEffect(() => () => clearTimeout(chromeTimer.current), []);

  /**
   * Tap arbitration (README): sheet open → close it; inside the drawer → nothing (its buttons handle
   * themselves); word → drawer; drawer open → close; else chrome.
   */
  const onTap = (e: MouseEvent) => {
    if (sheet) { setSheet(null); return; }
    if (drawerInner(e.target)) return;
    if (lookup.onTap(e.clientX, e.clientY, e.timeStamp)) { if (chrome) showChrome(false); return; }
    showChrome(!chrome);
  };

  const back = () => {
    void saverRef.current?.flush().then(onBack, onBack);
  };

  const vars = { '--focus-pct': prefs.focusPct, '--blur-max': `${prefs.blurMax}px` } as CSSProperties;
  return (
    <div ref={shellRef} className="rd-shell">
    <AgentDrawer db={session.db} book={book} engine={engineRef} open={agentOpen} panelRef={panelRef} />
    <div ref={pageRef} className="rd-page" style={vars} onClick={onTap}>
      <div ref={scrollRef} data-testid="reader-scroll" />
      {prefs.tier === 'fallback' && (
        <>
          <div className="rd-bblur rd-bblur-top" />
          <div className="rd-bblur rd-bblur-bottom" />
        </>
      )}
      <div className="rd-mask rd-mask-top" />
      <div className="rd-mask rd-mask-bottom" />
      <div className="rd-eyebrow">
        <span ref={chapterRef} className="rd-eyebrow-chapter" />
        <span ref={pctRef} className="rd-eyebrow-pct">1%</span>
      </div>
      {lookup.drawer}
      <ReaderChrome
        visible={chrome && !sheet}
        title={book.title}
        onBack={back}
        onToc={() => { showChrome(false); setSheet('toc'); }}
        onSettings={() => { showChrome(false); setSheet('settings'); }}
      />
      <SettingsSheet prefs={session.prefs} open={sheet === 'settings'} onClose={() => setSheet(null)} />
      <TocSheet
        chapters={book.chapters}
        current={chapter}
        open={sheet === 'toc'}
        onClose={() => setSheet(null)}
        onPick={(idx) => { setSheet(null); engineRef.current?.scrollToChapter(idx); }}
      />
      {probing && <p className="rd-probing">正在适配这台设备…</p>}
      {devTools && <FpsMeter engine={engineRef} />}
      {devTools && <DevPanel prefs={session.prefs} />}
      <div ref={dimRef} className="ag-dim" />
      <div ref={shieldRef} className="ag-shield" />
    </div>
    </div>
  );
}

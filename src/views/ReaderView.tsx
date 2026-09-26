// src/views/ReaderView.tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Session } from '../app/boot.ts';
import { devTools, exposeDevHandle } from '../app/devtools.ts';
import { ReaderEngine, type EngineBook } from '../core/reader/engine.ts';
import { PositionSaver, savePosition } from '../core/reader/position.ts';
import { decideTier, runProbe } from '../core/reader/probe.ts';
import type { Anchor } from '../core/types.ts';
import { DevPanel } from './DevPanel.tsx';
import { FpsMeter } from './FpsMeter.tsx';

interface Props { session: Session; book: EngineBook; initialAnchor: Anchor | null }

export function ReaderView({ session, book, initialAnchor }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chapterRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const [prefs, setPrefs] = useState(session.prefs.get());
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const saver = new PositionSaver((a, pct) => savePosition(session.db, book.id, a, pct));
    let pct = 1;
    const engine = new ReaderEngine(scrollRef.current!, book, session.prefs.get(), {
      // Written straight to the DOM: no React render per scroll frame.
      onProgress: (p) => {
        chapterRef.current!.textContent = p.chapterTitle;
        pctRef.current!.textContent = `${p.pct}%`;
        pct = p.pct;
      },
      onAnchor: (a) => saver.push(a, pct),
    });
    engineRef.current = engine;
    exposeDevHandle({ engine, prefs: session.prefs });
    const unsubscribe = session.prefs.subscribe((p) => { engine.setPrefs(p); setPrefs(p); });
    const onHide = () => { if (document.visibilityState === 'hidden') void saver.flush(); };
    const onPageHide = () => { void saver.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    let cancelled = false;
    void engine.mount(initialAnchor).then(async () => {
      if (cancelled || session.prefs.get().tier !== null) return;
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
      void saver.flush();
      engine.destroy();
      engineRef.current = null;
    };
  }, [session, book, initialAnchor]);

  const vars = { '--focus-pct': prefs.focusPct, '--blur-max': `${prefs.blurMax}px` } as CSSProperties;
  return (
    <div className="rd-page" style={vars}>
      <div ref={scrollRef} />
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
      {probing && <p className="rd-probing">正在适配这台设备…</p>}
      {devTools && <FpsMeter engine={engineRef} />}
      {devTools && <DevPanel prefs={session.prefs} />}
    </div>
  );
}

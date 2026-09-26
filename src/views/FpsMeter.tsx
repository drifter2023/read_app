// src/views/FpsMeter.tsx
import { useEffect, useState, type RefObject } from 'react';
import type { ReaderEngine } from '../core/reader/engine.ts';
import { summarise } from '../core/reader/probe.ts';

/** Dev overlay: fps, worst frame, dropped-frame ratio and last paint cost, refreshed twice a second. */
export function FpsMeter({ engine }: { engine: RefObject<ReaderEngine | null> }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let since = performance.now();
    const deltas: number[] = [];
    const loop = (ts: number) => {
      if (last) deltas.push(ts - last);
      last = ts;
      if (ts - since >= 500 && deltas.length) {
        const batch = deltas.splice(0);
        const r = summarise(batch, []);
        const fps = Math.round((r.frames * 1000) / (ts - since));
        // The worst frame shows a single freeze that an average hides.
        const worst = Math.round(Math.max(...batch));
        setText(`${fps} fps · worst ${worst}ms · drop ${(r.ratio * 100).toFixed(1)}% · paint ${(engine.current?.stats.lastPaintMs ?? 0).toFixed(2)}ms`);
        since = ts;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);
  return <div className="dev-fps">{text}</div>;
}

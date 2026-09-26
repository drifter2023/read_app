import type { Tier } from '../prefs/prefs.ts';
import type { ReaderEngine } from './engine.ts';

export interface ProbeResult { frames: number; dropped: number; ratio: number; avgPaintMs: number }

export function summarise(frameDeltas: number[], paintMs: number[]): ProbeResult {
  const sorted = [...frameDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
  const dropped = frameDeltas.filter((d) => d > median * 1.5).length;
  return {
    frames: frameDeltas.length,
    dropped,
    ratio: frameDeltas.length ? dropped / frameDeltas.length : 1,
    avgPaintMs: paintMs.length ? paintMs.reduce((a, b) => a + b, 0) / paintMs.length : 0,
  };
}

export function decideTier(r: ProbeResult): Tier {
  return r.ratio < 0.02 && r.avgPaintMs <= 4 ? 'full' : 'fallback';
}

/** First-launch probe: scrolls the real reader for `frames` frames with full blur and measures. */
export function runProbe(engine: Pick<ReaderEngine, 'scroller' | 'paintNow' | 'stats'>, frames = 120, warmup = 10): Promise<ProbeResult> {
  const el = engine.scroller;
  const start = el.scrollTop;
  const deltas: number[] = [];
  const paint: number[] = [];
  let dir = 1;
  let last = 0;
  let n = 0;
  return new Promise((resolve) => {
    const step = (ts: number): void => {
      if (last && n > warmup) deltas.push(ts - last);
      last = ts;
      n++;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) dir = -1;
      if (el.scrollTop <= 0) dir = 1;
      el.scrollTop += 6 * dir;
      engine.paintNow();
      if (n > warmup) paint.push(engine.stats.lastPaintMs);
      if (deltas.length < frames) {
        requestAnimationFrame(step);
      } else {
        el.scrollTop = start;
        engine.paintNow();
        resolve(summarise(deltas, paint));
      }
    };
    requestAnimationFrame(step);
  });
}

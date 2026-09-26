import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { runProbe } from '../../src/core/reader/probe.ts';
import { host, makeBook } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); document.body.innerHTML = ''; });

it('scrolls for N frames, measures, and restores the scroll position', async () => {
  const el = host();
  engine = new ReaderEngine(el, makeBook(), { ...DEFAULT_PREFS, tier: 'full' });
  await engine.mount(null);
  const start = el.scrollTop;
  const r = await runProbe(engine, 40);
  expect(r.frames).toBe(40);
  expect(r.ratio).toBeGreaterThanOrEqual(0);
  expect(r.ratio).toBeLessThanOrEqual(1);
  expect(el.scrollTop).toBe(start);
});

it('fallback tier paints opacity but no per-line blur', async () => {
  const el = host();
  engine = new ReaderEngine(el, makeBook(), { ...DEFAULT_PREFS, tier: 'fallback' });
  await engine.mount(null);
  el.scrollTop = 1500;
  engine.paintNow();
  const lines = Array.from(el.querySelectorAll<HTMLElement>('.rd-line')).filter((l) => l.style.opacity !== '');
  expect(lines.length).toBeGreaterThan(10);
  for (const l of lines) expect(l.style.filter === '' || l.style.filter === 'none').toBe(true);
  expect(new Set(lines.map((l) => l.style.opacity)).size).toBeGreaterThan(3);
});

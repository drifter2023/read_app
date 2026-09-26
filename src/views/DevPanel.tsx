// src/views/DevPanel.tsx
import { useEffect, useState } from 'react';
import type { FontSize, PrefsStore, Tier } from '../core/prefs/prefs.ts';

/** Temporary controls for M1 testing (the real SettingsSheet is M3). Shown only with ?dev=1. */
export function DevPanel({ prefs }: { prefs: PrefsStore }) {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe((next) => setP(next)), [prefs]);
  return (
    <div className="dev-panel">
      {(['S', 'M', 'L'] as FontSize[]).map((s) => (
        <button key={s} aria-pressed={p.fontSize === s} onClick={() => void prefs.set('fontSize', s)}>{s}</button>
      ))}
      <label>band {p.focusPct}%
        <input type="range" min={20} max={80} step={5} value={p.focusPct} onChange={(e) => void prefs.set('focusPct', Number(e.target.value))} />
      </label>
      <label>blur {p.blurMax}
        <input type="range" min={2} max={14} step={1} value={p.blurMax} onChange={(e) => void prefs.set('blurMax', Number(e.target.value))} />
      </label>
      <label><input type="checkbox" checked={p.sentenceMode} onChange={(e) => void prefs.set('sentenceMode', e.target.checked)} /> sentence</label>
      <select value={p.tier ?? ''} onChange={(e) => void prefs.set('tier', (e.target.value || null) as Tier | null)}>
        <option value="">probe</option><option value="full">full</option><option value="fallback">fallback</option>
      </select>
    </div>
  );
}

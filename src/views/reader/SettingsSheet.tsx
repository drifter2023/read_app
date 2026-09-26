import { useEffect, useState } from 'react';
import type { FontSize, PrefsStore } from '../../core/prefs/prefs.ts';
import { Sheet } from './Sheet.tsx';

const SIZES: { v: FontSize; label: string; px: number }[] = [
  { v: 'S', label: '小', px: 13 }, { v: 'M', label: '中', px: 16 }, { v: 'L', label: '大', px: 19 },
];

/** S-01: font size, focus band, blur and sentence mode. Every change applies live and persists. */
export function SettingsSheet({ prefs, open, onClose }: { prefs: PrefsStore; open: boolean; onClose: () => void }) {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe((next) => setP(next)), [prefs]);
  return (
    <Sheet open={open} label="阅读设置" onClose={onClose}>
      <div className="set-row">
        <span className="set-label">字号</span>
        <div className="set-seg" role="radiogroup" aria-label="字号">
          {SIZES.map((s) => (
            <button key={s.v} type="button" role="radio" aria-checked={p.fontSize === s.v} aria-label={s.label}
              onClick={() => void prefs.set('fontSize', s.v)}>
              <span style={{ fontSize: s.px }}>Aa</span>
            </button>
          ))}
        </div>
      </div>
      <label className="set-row">
        <span className="set-label">清晰带</span>
        <input type="range" min={20} max={80} step={5} value={p.focusPct} aria-label="清晰带"
          onChange={(e) => void prefs.set('focusPct', Number(e.target.value))} />
        <span className="set-val">{p.focusPct}%</span>
      </label>
      <label className="set-row">
        <span className="set-label">模糊强度</span>
        <input type="range" min={2} max={14} step={1} value={p.blurMax} aria-label="模糊强度"
          onChange={(e) => void prefs.set('blurMax', Number(e.target.value))} />
        <span className="set-val">{p.blurMax}</span>
      </label>
      <label className="set-row">
        <span className="set-label">整句模式</span>
        <span className="set-hint">当前句之外再淡一些</span>
        <input type="checkbox" role="switch" className="set-switch" checked={p.sentenceMode} aria-label="整句模式"
          onChange={(e) => void prefs.set('sentenceMode', e.target.checked)} />
      </label>
    </Sheet>
  );
}

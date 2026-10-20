import { useEffect, useState } from 'react';
import { blurMaxFor, type FontSize, type PrefsStore } from '../../core/prefs/prefs.ts';
import type { PredictLevel } from '../../core/vocab/predict.ts';
import { Sheet } from './Sheet.tsx';

const SIZES: { v: FontSize; label: string; px: number }[] = [
  { v: 'S', label: '小', px: 13 }, { v: 'M', label: '中', px: 16 }, { v: 'L', label: '大', px: 19 },
];

/** P-05: how many words get a predicted footnote. */
const PREDICT: { v: PredictLevel; label: string }[] = [{ v: 'off', label: '关' }, { v: 'few', label: '少' }, { v: 'many', label: '多' }];

/** S-01, S-03: font size, focus blur on/off, focus band, blur, predicted words and sentence mode. Every change applies live and persists. */
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
        <span className="set-label">聚焦模糊</span>
        <span className="set-hint">关闭后整页清晰</span>
        <input type="checkbox" role="switch" className="set-switch" checked={p.focusBlur} aria-label="聚焦模糊"
          onChange={(e) => void prefs.set('focusBlur', e.target.checked)} />
      </label>
      <label className="set-row" aria-disabled={!p.focusBlur}>
        <span className="set-label">清晰带</span>
        <input type="range" min={20} max={80} step={5} value={p.focusPct} aria-label="清晰带" disabled={!p.focusBlur}
          onChange={(e) => void prefs.set('focusPct', Number(e.target.value))} />
        <span className="set-val">{p.focusPct}%</span>
      </label>
      <label className="set-row" aria-disabled={!p.focusBlur}>
        <span className="set-label">模糊强度</span>
        <input type="range" min={2} max={14} step={1} value={blurMaxFor(p)} aria-label="模糊强度" disabled={!p.focusBlur}
          onChange={(e) => void prefs.set('blurMax', Number(e.target.value))} />
        <span className="set-val">{blurMaxFor(p)}</span>
      </label>
      <div className="set-row">
        <span className="set-label">预测生词</span>
        <div className="set-seg set-seg-text" role="radiogroup" aria-label="预测生词">
          {PREDICT.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={p.predict === o.v}
              onClick={() => void prefs.set('predict', o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <label className="set-row" aria-disabled={!p.focusBlur}>
        <span className="set-label">整句模式</span>
        <span className="set-hint">当前句之外再淡一些</span>
        <input type="checkbox" role="switch" className="set-switch" checked={p.sentenceMode} aria-label="整句模式" disabled={!p.focusBlur}
          onChange={(e) => void prefs.set('sentenceMode', e.target.checked)} />
      </label>
    </Sheet>
  );
}

import { useEffect, useState } from 'react';
import type { FontSize, PrefsStore } from '../../core/prefs/prefs.ts';
import type { PredictLevel } from '../../core/vocab/predict.ts';
import { Sheet } from './Sheet.tsx';

const SIZES: { v: FontSize; label: string; px: number }[] = [
  { v: 'S', label: '小', px: 13 }, { v: 'M', label: '中', px: 16 }, { v: 'L', label: '大', px: 19 },
];

/** P-05: how many words get a predicted footnote. */
const PREDICT: { v: PredictLevel; label: string }[] = [{ v: 'off', label: '关' }, { v: 'few', label: '少' }, { v: 'many', label: '多' }];

/**
 * S-01, S-03: 聚焦模糊 first, then the rows it governs (清晰带, 模糊强度, 整句模式), 字号 and 预测生词
 * (CHANGES 2026-10-14 · C6). Every change applies live and persists.
 */
export function SettingsSheet({ prefs, open, onClose }: { prefs: PrefsStore; open: boolean; onClose: () => void }) {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe((next) => setP(next)), [prefs]);
  const off = !p.focusBlur;
  return (
    <Sheet open={open} label="阅读设置" onClose={onClose}>
      <label className="set-row set-row-switch">
        <span className="set-text">
          <span className="set-title">聚焦模糊</span>
          <span className="set-sub">{p.focusBlur ? '中央清晰，上下渐隐模糊' : '已关闭 · 全文清晰'}</span>
        </span>
        <input type="checkbox" role="switch" className="set-switch" checked={p.focusBlur} aria-label="聚焦模糊"
          onChange={(e) => void prefs.set('focusBlur', e.target.checked)} />
      </label>
      <label className="set-row" aria-disabled={off}>
        <span className="set-label">清晰带</span>
        <input type="range" min={20} max={80} step={5} value={p.focusPct} aria-label="清晰带" disabled={off}
          onChange={(e) => void prefs.set('focusPct', Number(e.target.value))} />
        <span className="set-val">{p.focusPct}%</span>
      </label>
      <label className="set-row" aria-disabled={off}>
        <span className="set-label">模糊强度</span>
        <input type="range" min={2} max={14} step={1} value={p.blurMax} aria-label="模糊强度" disabled={off}
          onChange={(e) => void prefs.set('blurMax', Number(e.target.value))} />
        <span className="set-val">{p.blurMax}</span>
      </label>
      <label className="set-row set-row-switch" aria-disabled={off}>
        <span className="set-text">
          <span className="set-title">整句模式</span>
          <span className="set-sub">当前句之外再淡一些</span>
        </span>
        <input type="checkbox" role="switch" className="set-switch" checked={p.sentenceMode} aria-label="整句模式" disabled={off}
          onChange={(e) => void prefs.set('sentenceMode', e.target.checked)} />
      </label>
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
    </Sheet>
  );
}

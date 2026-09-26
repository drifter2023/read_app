import type { ReactNode } from 'react';
import type { LookupResult } from '../core/dict/service.ts';
import type { Grammar } from '../core/grammar/samples.ts';

export type DrawerState = 'loading' | 'ready' | 'notfound';

const notchTop = (x: string) => `polygon(0 0,100% 0,100% 16px,calc(${x} + 12px) 16px,${x} 4px,calc(${x} - 12px) 16px,0 16px)`;
const notchBottom = (x: string) => `polygon(calc(${x} - 12px) 16px,${x} 0,calc(${x} + 12px) 16px)`;

/**
 * The tear-paper drawer (README → Reader 4a), rendered into the engine's gap after a line.
 * `x` is the notch centre in px, already clamped to [16, width − 16].
 */
function DrawerFrame({ kind, state, closing, x, children }: {
  kind: 'word' | 'sentence'; state: DrawerState; closing: boolean; x: number; children: ReactNode;
}) {
  const px = `${x}px`;
  return (
    <div className={closing ? 'wd wd-closing' : 'wd'} data-testid="drawer" data-kind={kind} data-state={closing ? 'closing' : state}>
      <div className="wd-body leather">
        <div className="wd-clip">
          <div className="wd-inner">{children}</div>
        </div>
      </div>
      <div className="wd-notch wd-notch-top" style={{ clipPath: notchTop(px), WebkitClipPath: notchTop(px) }} />
      <div className="wd-notch wd-notch-bottom" style={{ clipPath: notchBottom(px), WebkitClipPath: notchBottom(px) }} />
    </div>
  );
}

interface WordProps {
  state: DrawerState;
  closing: boolean;
  result: LookupResult | null;
  x: number;
  saved: boolean;
  onSave: () => void;
  /** Undo a mistaken tap: the book forgets this word (no footnotes, no record). */
  onUndo: () => void;
}

export function WordDrawer({ state, closing, result, x, saved, onSave, onUndo }: WordProps) {
  return (
    <DrawerFrame kind="word" state={state} closing={closing} x={x}>
      {state === 'loading' && <div className="wd-dots" aria-label="加载中"><i /><i /><i /></div>}
      {state === 'notfound' && <p className="wd-miss">词典未收录这个词</p>}
      {state === 'ready' && result && (
        <>
          <div className="wd-head">
            <span className="wd-word" lang="en">{result.lemma}</span>
            {result.phonetic && <span className="wd-ph">{result.phonetic}</span>}
            {result.pos && <span className="wd-pos">{result.pos}</span>}
          </div>
          <p className="wd-def">{result.gloss}</p>
          <div className="wd-actions">
            <button
              type="button"
              className="wd-save"
              aria-pressed={saved}
              onClick={(e) => { e.stopPropagation(); if (!saved) onSave(); }}
            >
              {saved ? '已存' : '保存'}
            </button>
            <button
              type="button"
              className="wd-undo"
              aria-label="撤回生词标记"
              onClick={(e) => { e.stopPropagation(); onUndo(); }}
            >
              撤回
            </button>
          </div>
        </>
      )}
    </DrawerFrame>
  );
}

/** The grammar drawer opened from a sentence's droplet. `grammar` is null until notes exist for it. */
export function GrammarDrawer({ closing, grammar, x }: { closing: boolean; grammar: Grammar | null; x: number }) {
  return (
    <DrawerFrame kind="sentence" state="ready" closing={closing} x={x}>
      <div className="wd-eyebrow">语法</div>
      {grammar ? (
        <>
          <p className="wd-pattern">{grammar.pattern}</p>
          <dl className="wd-points">
            {grammar.points.map((p) => (
              <div key={p.label} className="wd-point">
                <dt>{p.label}</dt>
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="wd-miss">这句话的语法解释即将推出</p>
      )}
    </DrawerFrame>
  );
}

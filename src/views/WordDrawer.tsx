import type { LookupResult } from '../core/dict/service.ts';

export type DrawerState = 'loading' | 'ready' | 'notfound';

interface Props {
  state: DrawerState;
  closing: boolean;
  result: LookupResult | null;
  /** Centre x of the tapped word in px, already clamped to [16, width − 16]. */
  x: number;
  saved: boolean;
  onSave: () => void;
}

const notchTop = (x: string) => `polygon(0 0,100% 0,100% 16px,calc(${x} + 12px) 16px,${x} 4px,calc(${x} - 12px) 16px,0 16px)`;
const notchBottom = (x: string) => `polygon(calc(${x} - 12px) 16px,${x} 0,calc(${x} + 12px) 16px)`;

/** The tear-paper drawer (README → Reader 4a). Rendered into the engine's gap after the tapped line. */
export function WordDrawer({ state, closing, result, x, saved, onSave }: Props) {
  const px = `${x}px`;
  return (
    <div className={closing ? 'wd wd-closing' : 'wd'} data-testid="drawer" data-state={closing ? 'closing' : state}>
      <div className="wd-body leather">
        <div className="wd-clip">
          <div className="wd-inner">
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
                <button
                  type="button"
                  className="wd-save"
                  aria-pressed={saved}
                  onClick={(e) => { e.stopPropagation(); if (!saved) onSave(); }}
                >
                  {saved ? '已存' : '保存'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="wd-notch wd-notch-top" style={{ clipPath: notchTop(px), WebkitClipPath: notchTop(px) }} />
      <div className="wd-notch wd-notch-bottom" style={{ clipPath: notchBottom(px), WebkitClipPath: notchBottom(px) }} />
    </div>
  );
}

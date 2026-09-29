import { useEffect, useRef, type ReactNode } from 'react';
import type { LookupResult } from '../core/dict/service.ts';
import type { AiErrorKind } from '../core/ai/deepseek.ts';
import type { Grammar, Pending } from '../core/grammar/parse.ts';
import type { RunState } from '../core/grammar/service.ts';

export type DrawerState = 'loading' | 'ready' | 'notfound';

const notchTop = (x: string) => `polygon(0 0,100% 0,100% 16px,calc(${x} + 12px) 16px,${x} 4px,calc(${x} - 12px) 16px,0 16px)`;
const notchBottom = (x: string) => `polygon(calc(${x} - 12px) 16px,${x} 0,calc(${x} + 12px) 16px)`;

/**
 * Keeps a capped drawer honest while its content changes: marks `data-more` while text is hidden
 * below (a fade at the bottom edge), and with `follow` (an answer streaming in) keeps the newest
 * line in view until the reader scrolls up.
 */
function useInnerScroll(follow: boolean) {
  const scroller = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const followRef = useRef(follow);
  followRef.current = follow;
  useEffect(() => {
    const el = scroller.current;
    const content = flow.current;
    if (!el || !content) return;
    let stick = true;
    const gap = () => el.scrollHeight - el.clientHeight - el.scrollTop;
    const mark = () => el.toggleAttribute('data-more', gap() > 1);
    const onScroll = () => { stick = gap() < 4; mark(); };
    const onGrow = () => {
      if (followRef.current && stick) el.scrollTop = el.scrollHeight;
      mark();
    };
    const ro = new ResizeObserver(onGrow);
    ro.observe(content);
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, []);
  return { scroller, flow };
}

/**
 * The tear-paper drawer (README → Reader 4a), rendered into the engine's gap after a line.
 * `x` is the notch centre in px, already clamped to [16, width − 16]. Its height is capped
 * (`--wd-max`); longer content scrolls inside it.
 */
function DrawerFrame({ kind, state, closing, x, follow = false, children }: {
  kind: 'word' | 'sentence'; state: string; closing: boolean; x: number; follow?: boolean; children: ReactNode;
}) {
  const px = `${x}px`;
  const { scroller, flow } = useInnerScroll(follow);
  return (
    <div className={closing ? 'wd wd-closing' : 'wd'} data-testid="drawer" data-kind={kind} data-state={closing ? 'closing' : state}>
      <div className="wd-body leather">
        <div className="wd-clip">
          <div className="wd-inner" ref={scroller}><div ref={flow}>{children}</div></div>
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

/** Why a grammar analysis failed, in words a reader can act on (G-05). */
const FAILURE: Record<AiErrorKind, string> = {
  'no-key': '先在首页填写 DeepSeek API Key',
  'invalid-key': 'API Key 无效，请到首页更换',
  'no-balance': 'DeepSeek 账户余额不足',
  'rate-limit': '请求太频繁，请稍后再试',
  server: 'DeepSeek 暂时不可用，请稍后再试',
  network: '网络连接失败',
  timeout: '等待超时',
  'bad-answer': '没有得到有效的分析',
};
/** Failures that 重试 cannot fix: the key has to change first. */
const NO_RETRY = new Set<AiErrorKind>(['no-key', 'invalid-key', 'no-balance']);

const DATA_STATE: Record<RunState['status'], string> = { waiting: 'loading', streaming: 'streaming', done: 'ready', error: 'error' };

function Caret() {
  return <span className="wd-caret" aria-hidden="true" />;
}

/** The pattern and points so far; `pending` is the line still being written (with the caret). */
function GrammarBody({ grammar, pending }: { grammar: Grammar; pending: Pending | null }) {
  const pattern = grammar.pattern || (pending?.kind === 'pattern' ? pending.text : '');
  return (
    <>
      <p className="wd-pattern">{pattern}{pending?.kind === 'pattern' && <Caret />}</p>
      {(grammar.points.length > 0 || pending?.kind === 'point') && (
        <dl className="wd-points">
          {grammar.points.map((p, i) => (
            <div key={i} className="wd-point">
              <dt>{p.label}</dt>
              <dd>{p.text}</dd>
            </div>
          ))}
          {pending?.kind === 'point' && (
            <div className="wd-point">
              <dt>{pending.text ? pending.label : <>{pending.label}<Caret /></>}</dt>
              <dd>{pending.text}{pending.text && <Caret />}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}

/** The grammar drawer opened from a sentence's droplet: dots, then the answer as it streams (G-02). */
export function GrammarDrawer({ closing, run, x, onRetry }: { closing: boolean; run: RunState; x: number; onRetry: () => void }) {
  return (
    <DrawerFrame kind="sentence" state={DATA_STATE[run.status]} closing={closing} x={x} follow={run.status === 'streaming'}>
      <div className="wd-eyebrow">语法</div>
      {run.status === 'waiting' && <div className="wd-dots wd-dots-grammar" aria-label="分析中"><i /><i /><i /></div>}
      {run.status === 'streaming' && (
        run.grammar.pattern || run.grammar.pending
          ? <GrammarBody grammar={run.grammar} pending={run.grammar.pending} />
          : <p className="wd-pattern"><Caret /></p>
      )}
      {run.status === 'done' && <GrammarBody grammar={run.grammar} pending={null} />}
      {run.status === 'error' && (
        <>
          {run.partial && (run.partial.pattern || run.partial.points.length > 0) && <GrammarBody grammar={run.partial} pending={null} />}
          <div className="wd-fail">
            <p className="wd-miss">{run.partial ? `${FAILURE[run.reason]}，没有保存` : FAILURE[run.reason]}</p>
            {!NO_RETRY.has(run.reason) && (
              <button type="button" className="wd-undo" onClick={(e) => { e.stopPropagation(); onRetry(); }}>重试</button>
            )}
          </div>
        </>
      )}
    </DrawerFrame>
  );
}

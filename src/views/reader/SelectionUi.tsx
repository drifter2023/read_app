import { ASK_H } from '../../core/reader/selection.ts';

/** One end of a selection (C1): a 2 px bar over the line and a 12 px dot (start: dot on top, end: dot below). */
export function SelectionHandle({ end, x, top, height }: { end: 'start' | 'end'; x: number; top: number; height: number }) {
  return end === 'start' ? (
    <span className="rd-handle" data-end="start" data-noswipe="" aria-hidden="true"
      style={{ transform: `translate(${x - 14}px, ${top - 14}px)`, height: height + 14 }}>
      <i className="rd-handle-dot" /><i className="rd-handle-bar" />
    </span>
  ) : (
    <span className="rd-handle rd-handle-end" data-end="end" data-noswipe="" aria-hidden="true"
      style={{ transform: `translate(${x - 14}px, ${top}px)`, height: height + 14 }}>
      <i className="rd-handle-bar" /><i className="rd-handle-dot" />
    </span>
  );
}

/** 问旁注 (C2): the pill above a selection that sends it to the Agent drawer; hidden while dragging (`on` false). */
export function AskButton({ x, y, on, onAsk }: { x: number; y: number; on: boolean; onAsk: () => void }) {
  return (
    <button type="button" className="rd-ask" data-noswipe="" data-on={on} tabIndex={on ? 0 : -1}
      style={{ left: x, top: y, height: ASK_H }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onAsk(); }}>
      <i className="rd-ask-dot" />问旁注
    </button>
  );
}

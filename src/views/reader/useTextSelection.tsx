import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { lightHaptic } from '../../app/haptics.ts';
import { paragraphText } from '../../core/ingest/text.ts';
import type { EngineBook, ReaderEngine, SelectionBox } from '../../core/reader/engine.ts';
import { askButtonAt, spanOf, type WordPos } from '../../core/reader/selection.ts';
import { wordBounds } from '../../core/reader/words.ts';
import { AskButton, SelectionHandle } from './SelectionUi.tsx';

/** CHANGES 2026-10-14 · C1: hold this long on a word to select it; moving further first is a scroll or swipe. */
const LONG_PRESS_MS = 380;
const SLOP = 8;

export interface TextSelectionApi {
  /** True while a selection is on the page (the next tap only clears it). */
  has(): boolean;
  clear(): void;
  /** Re-reads where the selection is (after the engine redrew it). */
  refresh(): void;
  /** The handles and the 问旁注 button, rendered into the engine's selection layer. */
  ui: ReactNode;
}

interface Drag { kind: 'press' | 'handle'; id: number; anchor: WordPos; dx: number; dy: number }

/**
 * Select-to-ask (C1, C2). A long-press on a sharp word selects it; holding and dragging extends it
 * word by word (nearest word, same line first); after release two handles adjust either end and the
 * 问旁注 button floats above. The system selection, callout and context menu never show.
 * Everything during a drag is written by the engine; React renders only the handles and the button,
 * once per change of the selected words.
 */
export function useTextSelection(opts: {
  engine: RefObject<ReaderEngine | null>;
  page: RefObject<HTMLElement | null>;
  shell: RefObject<HTMLElement | null>;
  book: EngineBook;
  /** False while a sheet or a drawer is open: the page takes no long-press then. */
  enabled: () => boolean;
  onAsk: (text: string, chapter: number) => void;
}): TextSelectionApi {
  const { engine, page, shell, book } = opts;
  const [phase, setPhase] = useState<'none' | 'press' | 'handle' | 'shown'>('none');
  const [box, setBox] = useState<SelectionBox | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const drag = useRef<Drag | null>(null);
  /** The click that ends a long-press or a handle drag is not a tap; a new press resets this. */
  const swallowClick = useRef(false);

  const refresh = useCallback(() => setBox(engine.current?.selectionBox() ?? null), [engine]);

  const clear = useCallback(() => {
    drag.current = null;
    engine.current?.setSelection(null);
    if (shell.current) delete shell.current.dataset.selecting;
    setPhase('none');
    setBox(null);
  }, [engine, shell]);

  useEffect(() => {
    const el = page.current;
    if (!el) return;
    let timer = 0;
    let press: { x: number; y: number; id: number } | null = null;
    /** The touch that made or adjusted the selection is ending (pointerup comes before touchend). */
    let endingTouch = false;

    const select = (anchor: WordPos, focus: WordPos, chapter: number) => {
      engine.current?.setSelection(spanOf(chapter, anchor, focus));
      refresh();
    };
    const beginDrag = (d: Drag) => {
      drag.current = d;
      if (shell.current) shell.current.dataset.selecting = '1'; // the Agent swipe stands down
      try { el.setPointerCapture(d.id); } catch { /* the pointer is gone */ }
    };

    const onDown = (e: PointerEvent) => {
      swallowClick.current = false;
      if (e.button !== 0 || !optsRef.current.enabled()) return;
      const t = e.target as Element;
      const handle = t.closest<HTMLElement>('.rd-handle');
      const e2 = engine.current;
      if (handle && e2?.selection) {
        // Drag one end; the word at the other end stays put.
        e.stopPropagation();
        const s = e2.selection;
        const b = engine.current!.selectionBox()!;
        const isStart = handle.dataset.end === 'start';
        const paras = book.chapters[s.chapter]!.paras;
        const fixedAt = isStart ? s.to.at - 1 : s.from.at;
        const fixedPara = isStart ? s.to.para : s.from.para;
        const w = wordBounds(paragraphText(paras[fixedPara]!), fixedAt);
        if (!w) return;
        beginDrag({
          kind: 'handle', id: e.pointerId, anchor: { para: fixedPara, start: w[0], end: w[1] },
          dx: (isStart ? b.startX + 1 : b.endX - 1) - e.clientX,
          dy: (isStart ? (b.startTop + b.startBottom) / 2 : (b.endTop + b.endBottom) / 2) - e.clientY,
        });
        setPhase('handle');
        return;
      }
      if (t.closest('.rd-ask, .wd, .sheet, .sheet-scrim, .rd-top, .rd-capsule')) return;
      press = { x: e.clientX, y: e.clientY, id: e.pointerId };
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const p = press;
        press = null;
        const en = engine.current;
        if (!p || !en || !optsRef.current.enabled()) return;
        const hit = en.hitTest(p.x, p.y);
        if (!hit || !en.isTappable(hit.lineIndex)) return; // only sharp text starts a selection (owner decision 5c)
        const word = { para: hit.para, start: hit.start, end: hit.end };
        beginDrag({ kind: 'press', id: p.id, anchor: word, dx: 0, dy: 0 });
        select(word, word, hit.chapter);
        lightHaptic();
        setPhase('press');
      }, LONG_PRESS_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) { clearTimeout(timer); press = null; }
      const d = drag.current;
      const en = engine.current;
      if (!d || !en?.selection) return;
      const w = en.wordNear(e.clientX + d.dx, e.clientY + d.dy, en.selection.chapter);
      if (w) select(d.anchor, w, w.chapter);
    };

    const onUp = (e: PointerEvent) => {
      clearTimeout(timer);
      press = null;
      if (!drag.current) return;
      drag.current = null;
      endingTouch = e.pointerType === 'touch';
      if (shell.current) delete shell.current.dataset.selecting;
      swallowClick.current = true;
      setPhase(engine.current?.selection ? 'shown' : 'none');
      refresh();
    };

    // That click would otherwise clear the selection it just made.
    const onClick = (e: MouseEvent) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    // While selecting, the finger extends the selection instead of scrolling the page.
    const onTouchMove = (e: TouchEvent) => { if (drag.current) e.preventDefault(); };
    // iOS: cancelling that touch's end keeps WebKit from treating it as its own long-press, which
    // otherwise swallows the next tap (the first tap on 问旁注 did nothing).
    const onTouchEnd = (e: TouchEvent) => { if (endingTouch) { endingTouch = false; e.preventDefault(); } };
    const block = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('contextmenu', block);
    el.addEventListener('selectstart', block);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('contextmenu', block);
      el.removeEventListener('selectstart', block);
    };
  }, [engine, page, shell, book, refresh]);

  const ask = () => {
    const en = engine.current;
    const s = en?.selection;
    if (!en || !s) return;
    const text = en.selectionText();
    clear();
    optsRef.current.onAsk(text, s.chapter);
  };

  const host = engine.current?.selectionUi;
  let ui: ReactNode = null;
  if (host && box && phase !== 'none') {
    // The layer scrolls with the text: convert viewport coordinates to content coordinates.
    const sc = engine.current!.scroller;
    const r = sc.getBoundingClientRect();
    const cx = (x: number) => x - r.left;
    const cy = (y: number) => y - r.top + sc.scrollTop;
    const btn = askButtonAt({ top: box.startTop - r.top, bottom: box.endBottom - r.top, left: box.left - r.left, right: box.right - r.left }, r.width);
    const handles = phase === 'shown' || phase === 'handle';
    ui = createPortal(
      <>
        {handles && (
          <>
            <SelectionHandle end="start" x={cx(box.startX)} top={cy(box.startTop)} height={box.startBottom - box.startTop} />
            <SelectionHandle end="end" x={cx(box.endX)} top={cy(box.endTop)} height={box.endBottom - box.endTop} />
          </>
        )}
        <AskButton x={btn.x} y={btn.y + sc.scrollTop} on={phase === 'shown'} onAsk={ask} />
      </>,
      host,
    );
  }

  return { has: () => phaseRef.current !== 'none', clear, refresh, ui };
}

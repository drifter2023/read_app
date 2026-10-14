import { useEffect, useRef, type RefObject } from 'react';
import { EASE } from '../../core/motion.ts';

/** AGENT_DRAWER.md §2. Progress p runs 0 (closed) … 1 (open). */
const SCALE = 0.9;
/**
 * The strip of page left on the left edge when open, in px (60 on a 402 px phone, as designed).
 * Fixed, not a share of the width: the drawer's 82 px left padding must clear it on an iPad too.
 */
const STRIP = 60;
/** How far the page travels when open: its scaled right edge (centre + half its scaled width) lands at STRIP. */
const travel = (W: number) => W * (1 + SCALE) / 2 - STRIP;
const PARALLAX = 0.12;
const DIM = 0.06;
const RADIUS = 22;
const SHADOW = 0.18;
const MS = 420;
const FLICK = 0.35; // px/ms

interface Els {
  shell: RefObject<HTMLElement | null>;
  page: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  dim: RefObject<HTMLElement | null>;
  shield: RefObject<HTMLElement | null>;
}

/**
 * Swipe left to push the page aside and show the Agent drawer; swipe right (or tap the strip of page)
 * to bring it back. Every frame of the drag is written straight to the elements: no React render.
 * `onSettle` runs once the drawer is open or closed for good.
 */
export function useAgentSwipe(els: Els, onSettle: (open: boolean) => void): { setOpen: (open: boolean) => void } {
  const api = useRef<{ setOpen: (open: boolean) => void }>({ setOpen: () => {} });
  const settle = useRef(onSettle);
  settle.current = onSettle;

  useEffect(() => {
    const shell = els.shell.current, page = els.page.current, panel = els.panel.current, dim = els.dim.current, shield = els.shield.current;
    if (!shell || !page || !panel || !dim || !shield) return;
    let p = 0;
    let open = false;
    let justDragged = false;
    let timer = 0;

    const apply = (to: number, anim: boolean) => {
      const W = shell.clientWidth || 402;
      const tr = anim ? `${MS}ms ${EASE}` : 'none';
      page.style.transition = anim ? `transform ${tr}, border-radius ${tr}, box-shadow ${tr}` : 'none';
      page.style.transform = to === 0 && !anim ? '' : `translateX(${-to * travel(W)}px) scale(${1 - to * (1 - SCALE)})`;
      page.style.borderRadius = `${to * RADIUS}px`;
      page.style.boxShadow = to === 0 ? 'none' : `0 ${10 * to}px ${40 * to}px rgba(0,0,0,${SHADOW * to})`;
      panel.style.transition = anim ? `transform ${tr}, opacity ${tr}` : 'none';
      panel.style.transform = `translateX(${(1 - to) * PARALLAX * 100}%)`;
      panel.style.opacity = String(0.3 + 0.7 * to);
      dim.style.transition = anim ? `opacity ${tr}` : 'none';
      dim.style.opacity = String(to * DIM);
      p = to;
    };
    const setOpen = (next: boolean) => {
      open = next;
      shield.style.pointerEvents = next ? 'auto' : 'none';
      apply(next ? 1 : 0, true);
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!next) { page.style.transform = ''; page.style.boxShadow = 'none'; } // leave no transform on the closed page
        settle.current(next);
      }, MS);
      if (next) settle.current(true); // the drawer can fill itself while the page slides
    };
    api.current.setOpen = setOpen;
    apply(0, false);

    let g: { sx: number; sy: number; p0: number; drag: boolean; lx: number; lt: number; v: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('input, textarea, [data-noswipe]')) return;
      g = { sx: e.clientX, sy: e.clientY, p0: p, drag: false, lx: e.clientX, lt: e.timeStamp, v: 0, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!g) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.drag) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2 && ((g.p0 < 0.5 && dx < 0) || (g.p0 >= 0.5 && dx > 0))) {
          g.drag = true;
          try { shell.setPointerCapture(g.id); } catch { /* the pointer is gone */ }
        } else if (Math.abs(dy) > 12) { g = null; return; } else return;
      }
      const W = shell.clientWidth || 402;
      g.v = (e.clientX - g.lx) / Math.max(1, e.timeStamp - g.lt);
      g.lx = e.clientX; g.lt = e.timeStamp;
      apply(Math.max(0, Math.min(1, g.p0 - dx / travel(W))), false);
      e.preventDefault();
    };
    const end = () => {
      if (!g) return;
      if (g.drag) {
        setOpen(g.v < -FLICK ? true : g.v > FLICK ? false : p > 0.45);
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 60);
      }
      g = null;
    };
    const swallow = (e: Event) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } };
    const shieldClick = (e: Event) => { e.stopPropagation(); if (!justDragged) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };

    shell.addEventListener('pointerdown', down);
    shell.addEventListener('pointermove', move);
    shell.addEventListener('pointerup', end);
    shell.addEventListener('pointercancel', end);
    shell.addEventListener('click', swallow, true);
    shield.addEventListener('click', shieldClick);
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(timer);
      shell.removeEventListener('pointerdown', down);
      shell.removeEventListener('pointermove', move);
      shell.removeEventListener('pointerup', end);
      shell.removeEventListener('pointercancel', end);
      shell.removeEventListener('click', swallow, true);
      shield.removeEventListener('click', shieldClick);
      window.removeEventListener('keydown', key);
      api.current.setOpen = () => {};
    };
  }, [els.shell, els.page, els.panel, els.dim, els.shield]);

  return { setOpen: (open) => api.current.setOpen(open) };
}

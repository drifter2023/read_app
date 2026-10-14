import type { TextSelection } from './engine.ts';

/** A word by its paragraph offsets. */
export interface WordPos { para: number; start: number; end: number }

/** True if word `a` comes before word `b` in the chapter. */
export function before(a: WordPos, b: WordPos): boolean {
  return a.para < b.para || (a.para === b.para && a.start < b.start);
}

/** The selection from the fixed word to the dragged one, in reading order, both words whole (C1). */
export function spanOf(chapter: number, anchor: WordPos, focus: WordPos): TextSelection {
  const [a, b] = before(focus, anchor) ? [focus, anchor] : [anchor, focus];
  return { chapter, from: { para: a.para, at: a.start }, to: { para: b.para, at: b.end } };
}

/** Button height and the gaps from CHANGES 2026-10-14 · C2. */
export const ASK_H = 40;
const ABOVE = 56;
const BELOW = 20;
const MIN_TOP = 84;
const EDGE = 72;

/**
 * Where the 问旁注 button goes, relative to the page: its centre x and its top y. 56 px above the
 * selection's top line, or 20 px below its bottom line when the top is closer than 84 px to the page
 * top; centred on the selection and kept within [72, W − 72].
 */
export function askButtonAt(sel: { top: number; bottom: number; left: number; right: number }, W: number): { x: number; y: number; below: boolean } {
  const x = Math.min(W - EDGE, Math.max(EDGE, (sel.left + sel.right) / 2));
  if (sel.top < MIN_TOP) return { x, y: sel.bottom + BELOW, below: true };
  return { x, y: sel.top - ABOVE, below: false };
}

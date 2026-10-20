/** How far below the eyebrow (章节名 · 进度) the title area reaches; the area starts at the top of the page. */
export const MENU_PAD = 22;
/** Slack around a line's text, as for a word hit: a tap this close to a glyph is still on the text. */
const TEXT_SLACK = 4;

export type TapAction =
  | 'clear-selection'
  | 'close-sheet'
  | 'drawer' // a word or grammar drawer is open: close it (another word closes first, then opens: R-05)
  | 'menu' // the title area: show or hide ‹ 书架, 目录 and Aa (even on a word)
  | 'lookup'; // a word or a droplet opens its drawer; blank space or the page edge shows or hides the menu; other text only hides it

/**
 * Tap order on the reader page (owner decisions 2026-10-14, 2026-10-15 and 2026-10-20, README → Tap arbitration):
 * selection → close an open sheet or drawer → the title area shows or hides the menu (even on a word) → word
 * → blank space or the page edge shows or hides the menu (see `onText`).
 * `menuH` is the height of the title area, from the top of the page.
 */
export function routeTap(s: { selection: boolean; sheet: boolean; drawer: boolean; y: number; pageTop: number; menuH: number }): TapAction {
  if (s.selection) return 'clear-selection';
  if (s.sheet) return 'close-sheet';
  if (s.drawer) return 'drawer';
  if (s.y - s.pageTop < s.menuH) return 'menu';
  return 'lookup';
}

/**
 * True if a viewport point is on the text of a line or a chapter heading, blurred or sharp. The side
 * margins, the gaps between paragraphs and the space after a short line are blank (owner request 2026-10-20).
 */
export function onText(target: EventTarget | null, x: number, y: number): boolean {
  const line = target instanceof Element ? target.closest<HTMLElement>('.rd-line, .rd-head') : null;
  if (!line) return false;
  const box = line.getBoundingClientRect();
  if (y < box.top || y > box.bottom) return false;
  const range = line.ownerDocument.createRange();
  range.selectNodeContents(line);
  return [...range.getClientRects()].some((r) => r.width > 0 && x >= r.left - TEXT_SLACK && x <= r.right + TEXT_SLACK);
}

/** How far below the eyebrow (章节名 · 进度) the title area reaches; the area starts at the top of the page. */
export const MENU_PAD = 22;

export type TapAction =
  | 'clear-selection'
  | 'close-sheet'
  | 'drawer' // a word or grammar drawer is open: close it (another word closes first, then opens: R-05)
  | 'menu' // the title area: show or hide ‹ 书架, 目录 and Aa (even on a word)
  | 'lookup'; // a word or a droplet opens its drawer; elsewhere a tap only hides the top bar and capsule

/**
 * Tap order on the reader page (owner decisions 2026-10-14 and 2026-10-15, README → Tap arbitration):
 * selection → close an open sheet or drawer → the title area shows or hides the menu (even on a word) → word.
 * `menuH` is the height of the title area, from the top of the page.
 */
export function routeTap(s: { selection: boolean; sheet: boolean; drawer: boolean; y: number; pageTop: number; menuH: number }): TapAction {
  if (s.selection) return 'clear-selection';
  if (s.sheet) return 'close-sheet';
  if (s.drawer) return 'drawer';
  if (s.y - s.pageTop < s.menuH) return 'menu';
  return 'lookup';
}

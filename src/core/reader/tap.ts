/** The share of the page, from the top, where a tap shows or hides the top bar and capsule (owner decision 2026-10-14). */
export const MENU_ZONE = 0.3;

export type TapAction =
  | 'clear-selection'
  | 'close-sheet'
  | 'drawer' // a word or grammar drawer is open: close it (another word closes first, then opens: R-05)
  | 'menu' // the top 30 %: show or hide ‹ 书架, 目录 and Aa (even on a word)
  | 'lookup'; // a word or a droplet opens its drawer; blank space toggles the top bar and capsule

/**
 * Tap order on the reader page (owner decision 2026-10-14, README → Tap arbitration):
 * selection → close an open sheet or drawer → top 30 % shows or hides the menu (even on a word) → word.
 */
export function routeTap(s: { selection: boolean; sheet: boolean; drawer: boolean; y: number; pageTop: number; pageH: number }): TapAction {
  if (s.selection) return 'clear-selection';
  if (s.sheet) return 'close-sheet';
  if (s.drawer) return 'drawer';
  if (s.y - s.pageTop < s.pageH * MENU_ZONE) return 'menu';
  return 'lookup';
}

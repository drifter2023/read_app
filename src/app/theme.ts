import type { PrefsStore, Theme } from '../core/prefs/prefs.ts';

/** Browser bar colour per theme: the page background (4a paper / 7b night Home). */
const BAR: Record<Theme, string> = { paper: '#faf8f3', night: '#0b0c0f' };
/** Mirrors the theme for the inline script in index.html, which applies it before first paint. */
const KEY = 'spotlight-theme';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: only the first paint may flash */ }
}

/** Applies the stored theme now and on every change. Returns the unsubscribe function. */
export function followTheme(prefs: PrefsStore): () => void {
  applyTheme(prefs.get().theme);
  return prefs.subscribe((p, changed) => { if (changed === 'theme') applyTheme(p.theme); });
}

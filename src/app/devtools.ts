// src/app/devtools.ts
import type { PrefsStore } from '../core/prefs/prefs.ts';
import type { ReaderEngine } from '../core/reader/engine.ts';

declare global {
  interface Window { __spotlight?: { engine: ReaderEngine; prefs: PrefsStore } }
}

export const devTools: boolean =
  import.meta.env.VITE_DEV_TOOLS === '1' || new URLSearchParams(location.search).has('dev');

export function exposeDevHandle(h: { engine: ReaderEngine; prefs: PrefsStore }): void {
  if (devTools) window.__spotlight = h;
}

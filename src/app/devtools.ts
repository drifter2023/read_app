// src/app/devtools.ts
import type { PrefsStore } from '../core/prefs/prefs.ts';
import type { ReaderEngine } from '../core/reader/engine.ts';
import type { Guide } from '../core/reader/guide.ts';

declare global {
  interface Window { __spotlight?: DevHandle }
}

export const devTools: boolean =
  import.meta.env.VITE_DEV_TOOLS === '1' || new URLSearchParams(location.search).has('dev');

/** Test handle (dev builds only): the reader engine, the settings and 带读. */
export interface DevHandle { engine: ReaderEngine; prefs: PrefsStore; guide?: Guide }

export function exposeDevHandle(h: DevHandle): void {
  if (devTools) window.__spotlight = h;
}

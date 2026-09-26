import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { lightHaptic } from '../app/haptics.ts';
import { loadDict } from '../app/dict.ts';
import { footnoteAnnotator } from '../core/annot/footnotes.ts';
import { isSaved, recordLookup, seenLemmas, setSaved } from '../core/annot/lookups.ts';
import type { Db } from '../core/db/types.ts';
import type { DictService, LookupResult } from '../core/dict/service.ts';
import { logMetric } from '../core/metrics/metrics.ts';
import { MOTION } from '../core/motion.ts';
import type { ReaderEngine, WordHit } from '../core/reader/engine.ts';
import { WordDrawer, type DrawerState } from './WordDrawer.tsx';

interface Pop {
  hit: WordHit; host: HTMLElement; x: number; state: DrawerState; result: LookupResult | null;
  closing: boolean; lookupId: number | null; saved: boolean;
}

/** README → Word tap: the first scroll gesture after close stays locked this long. */
const SCROLL_LOCK_MS = MOTION.drawerClose;
const KEEP_BOTTOM = 70;
/** Beta metric: does the reader scroll again within 10 s of closing a drawer? */
const RESCROLL_MS = 10000;

export interface WordLookup {
  /** Call from the engine's onRelayout. */
  reset(): void;
  /** Tap arbitration steps 1 and 2. Returns false when the tap should toggle the chrome instead. */
  onTap(x: number, y: number, timeStamp: number): boolean;
  isOpen(): boolean;
  drawer: ReactNode;
}

export function useWordLookup(engine: RefObject<ReaderEngine | null>, db: Db, bookId: string): WordLookup {
  const [pop, setPopState] = useState<Pop | null>(null);
  const popRef = useRef<Pop | null>(null);
  const dictRef = useRef<DictService | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const seenDirty = useRef(false);
  const lockUntil = useRef(0);
  const pending = useRef<WordHit | null>(null);
  const timers = useRef<number[]>([]);
  const closedAt = useRef<{ at: number; timer: number } | null>(null);

  const setPop = useCallback((p: Pop | null) => { popRef.current = p; setPopState(p); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  // Dictionary and `seen` load in the background; the reader is usable before they arrive.
  useEffect(() => {
    let live = true;
    void Promise.all([loadDict(), seenLemmas(db, bookId)]).then(([dict, seen]) => {
      if (!live) return;
      dictRef.current = dict;
      seenRef.current = seen;
      engine.current?.setAnnotator(footnoteAnnotator(dict, seen));
    }).catch(() => { /* the drawer shows not-found; footnotes stay off */ });
    return () => {
      live = false;
      for (const t of timers.current) clearTimeout(t);
      if (closedAt.current) clearTimeout(closedAt.current.timer);
    };
  }, [db, bookId, engine]);

  /** Follows the drawer's height while it animates, so lines below are painted where they are. */
  const trackGap = (host: HTMLElement, ms: number, done?: () => void) => {
    const start = performance.now();
    const step = () => {
      const e = engine.current;
      if (!e || !host.isConnected) return;
      e.setGap(host.offsetHeight);
      if (performance.now() - start < ms + 34) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  };

  const keepOnScreen = (host: HTMLElement) => {
    const scroller = engine.current?.scroller;
    if (!scroller || !host.isConnected) return;
    const over = host.getBoundingClientRect().bottom - (scroller.getBoundingClientRect().bottom - KEEP_BOTTOM);
    if (over > 8) scroller.scrollTo({ top: scroller.scrollTop + over, behavior: 'smooth' });
  };

  const resolve = (hit: WordHit): Pick<Pop, 'state' | 'result'> => {
    const dict = dictRef.current;
    if (!dict) return { state: 'loading', result: null };
    const r = dict.lookup(hit.word, { prevWord: hit.prevWord, sentenceInitial: hit.sentenceInitial });
    return r ? { state: 'ready', result: r } : { state: 'notfound', result: null };
  };

  /** Side effects of a successful lookup: Lookup row, `seen`, saved state (README → On open). */
  const record = (p: Pop) => {
    const r = p.result;
    if (!r) return;
    if (!seenRef.current.has(r.lemma)) { seenRef.current.add(r.lemma); seenDirty.current = true; }
    void logMetric(db, { type: 'lookup', bookId });
    void (async () => {
      const id = await recordLookup(db, {
        bookId, surface: r.surface, lemma: r.lemma, zh: r.gloss, phonetic: r.phonetic, sentence: p.hit.sentenceText,
        loc: { chapter: p.hit.chapter, para: p.hit.para, sentence: p.hit.sentence, offset: p.hit.start }, at: Date.now(),
      });
      const cur = popRef.current;
      if (cur?.hit === p.hit && cur.saved) await setSaved(db, id, true); // Save tapped before the row existed
      const saved = await isSaved(db, bookId, r.lemma);
      const now = popRef.current;
      if (now?.hit === p.hit) setPop({ ...now, lookupId: id, saved: saved || now.saved });
    })();
  };

  /** A newly seen lemma gets its footnote everywhere, including under the open word (fig-4a-drawer). */
  const refreshFootnotes = () => {
    if (!seenDirty.current || !dictRef.current) return;
    seenDirty.current = false;
    engine.current?.setAnnotator(footnoteAnnotator(dictRef.current, seenRef.current));
  };

  const open = (hit: WordHit, tapAt?: number) => {
    const e = engine.current;
    if (!e) return;
    const host = e.openGap(hit.lineIndex);
    e.setHighlight(hit);
    const box = e.scroller.getBoundingClientRect();
    const x = Math.min(Math.max(16, hit.rect.left + hit.rect.width / 2 - box.left), box.width - 16);
    const p: Pop = { hit, host, x, ...resolve(hit), closing: false, lookupId: null, saved: false };
    setPop(p);
    lightHaptic();
    if (tapAt !== undefined) {
      requestAnimationFrame(() => { window.__spotlightTapMs = performance.now() - tapAt; });
    }
    if (p.state === 'ready') record(p);
    else if (p.state === 'loading') {
      void loadDict().then(() => {
        const cur = popRef.current;
        if (cur?.hit !== hit || cur.closing) return;
        const next = { ...cur, ...resolve(hit) };
        setPop(next);
        if (next.state === 'ready') record(next);
      }).catch(() => {
        const cur = popRef.current;
        if (cur?.hit === hit && !cur.closing) setPop({ ...cur, state: 'notfound' });
      });
    }
    trackGap(host, MOTION.drawerOpen, () => { keepOnScreen(host); refreshFootnotes(); });
  };

  const close = useCallback(() => {
    const p = popRef.current;
    if (!p || p.closing) return;
    setPop({ ...p, closing: true });
    trackGap(p.host, MOTION.drawerClose);
    if (closedAt.current) clearTimeout(closedAt.current.timer);
    closedAt.current = {
      at: performance.now(),
      timer: window.setTimeout(() => {
        closedAt.current = null;
        void logMetric(db, { type: 'drawer_close', bookId, rescroll: false });
      }, RESCROLL_MS),
    };
    later(() => {
      const e = engine.current;
      e?.closeGap();
      e?.setHighlight(null);
      setPop(null);
      refreshFootnotes();
      const next = pending.current;
      pending.current = null;
      if (next) open(next);
    }, MOTION.drawerClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPop]);

  // Scrolling closes the drawer: the first gesture is swallowed, then scrolling stays locked briefly.
  useEffect(() => {
    const scroller = engine.current?.scroller;
    if (!scroller) return;
    const guard = (ev: Event) => {
      const p = popRef.current;
      const c = closedAt.current;
      // A gesture that only closes the drawer is not a re-scroll; one after it has closed is.
      if (c && (!p || p.closing) && performance.now() - c.at > 50) {
        clearTimeout(c.timer);
        closedAt.current = null;
        void logMetric(db, { type: 'drawer_close', bookId, rescroll: true });
      }
      if (p && !p.closing) {
        if (ev.cancelable) ev.preventDefault();
        close();
        lockUntil.current = performance.now() + SCROLL_LOCK_MS;
        return;
      }
      if (performance.now() < lockUntil.current && ev.cancelable) ev.preventDefault();
    };
    scroller.addEventListener('touchmove', guard, { passive: false });
    scroller.addEventListener('wheel', guard, { passive: false });
    return () => {
      scroller.removeEventListener('touchmove', guard);
      scroller.removeEventListener('wheel', guard);
    };
  });

  /** A relayout (font size, rotation) dropped the lines the drawer was attached to. */
  const reset = () => {
    pending.current = null;
    engine.current?.setHighlight(null);
    setPop(null);
  };

  const onTap = (x: number, y: number, timeStamp: number): boolean => {
    const e = engine.current;
    if (!e) return false;
    const p = popRef.current;
    const hit = e.hitTest(x, y);
    if (p) {
      if (p.closing) { if (hit) pending.current = hit; return true; }
      const same = hit && hit.chapter === p.hit.chapter && hit.para === p.hit.para && hit.start === p.hit.start;
      if (hit && !same) pending.current = hit; // close first, then open after the close duration
      close();
      return true;
    }
    if (!hit) return false;
    open(hit, timeStamp);
    return true;
  };

  const save = () => {
    const p = popRef.current;
    if (!p || p.state !== 'ready') return;
    setPop({ ...p, saved: true });
    if (p.lookupId !== null) void setSaved(db, p.lookupId, true);
  };

  const drawer = pop
    ? createPortal(
      <WordDrawer state={pop.state} closing={pop.closing} result={pop.result} x={pop.x} saved={pop.saved} onSave={save} />,
      pop.host,
    )
    : null;

  return { onTap, reset, isOpen: () => popRef.current !== null, drawer };
}

declare global {
  interface Window { __spotlightTapMs?: number }
}

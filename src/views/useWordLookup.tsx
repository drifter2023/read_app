import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { lightHaptic } from '../app/haptics.ts';
import { loadDict } from '../app/dict.ts';
import { footnoteAnnotator } from '../core/annot/footnotes.ts';
import { forgetLemma, isSaved, recordLookup, seenLemmas, setSaved } from '../core/annot/lookups.ts';
import type { Db } from '../core/db/types.ts';
import type { DictService, LookupResult } from '../core/dict/service.ts';
import { GrammarService, type GrammarRun, type RunState } from '../core/grammar/service.ts';
import { logMetric } from '../core/metrics/metrics.ts';
import { MOTION } from '../core/motion.ts';
import type { ReaderEngine, SentenceHit, WordHit } from '../core/reader/engine.ts';
import { GrammarDrawer, WordDrawer, type DrawerState } from './WordDrawer.tsx';

/** What a drawer is open for: a tapped word, or a tapped grammar droplet (its sentence). */
type Target = { kind: 'word'; hit: WordHit } | { kind: 'sentence'; hit: SentenceHit };

interface Pop {
  target: Target; host: HTMLElement; x: number; closing: boolean;
  /** Word drawers only. */
  state: DrawerState; result: LookupResult | null; lookupId: number | null; saved: boolean;
  /** Sentence drawers only: the analysis run and its state as last rendered. */
  run: GrammarRun | null; runState: RunState | null;
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

/** The scrolling part of the drawer that `target` is in, if any. */
export function drawerInner(target: EventTarget | null): HTMLElement | null {
  const wd = target instanceof Element ? target.closest('.wd') : null;
  return wd?.querySelector<HTMLElement>('.wd-inner') ?? null;
}

export function useWordLookup(engine: RefObject<ReaderEngine | null>, db: Db, bookId: string): WordLookup {
  const [pop, setPopState] = useState<Pop | null>(null);
  const popRef = useRef<Pop | null>(null);
  const dictRef = useRef<DictService | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const seenDirty = useRef(false);
  const lockUntil = useRef(0);
  const pending = useRef<Target | null>(null);
  /** The Lookup write in flight, so an undo can wait for the row it deletes. */
  const recording = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef<number[]>([]);
  const closedAt = useRef<{ at: number; timer: number } | null>(null);
  /** One service per open book, so reopening a sentence that is still streaming joins its run. */
  const grammar = useMemo(() => new GrammarService(db), [db]);
  /** Stops following the open grammar run (its updates and its drawer's growth). */
  const unfollow = useRef<(() => void) | null>(null);

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
      unfollow.current?.();
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
    if (!r || p.target.kind !== 'word') return;
    const hit = p.target.hit;
    if (!seenRef.current.has(r.lemma)) { seenRef.current.add(r.lemma); seenDirty.current = true; }
    void logMetric(db, { type: 'lookup', bookId });
    recording.current = (async () => {
      const id = await recordLookup(db, {
        bookId, surface: r.surface, lemma: r.lemma, zh: r.gloss, phonetic: r.phonetic, sentence: hit.sentenceText,
        loc: { chapter: hit.chapter, para: hit.para, sentence: hit.sentence, offset: hit.start }, at: Date.now(),
      });
      const cur = popRef.current;
      if (cur?.target === p.target && cur.saved) await setSaved(db, id, true); // Save tapped before the row existed
      const saved = await isSaved(db, bookId, r.lemma);
      const now = popRef.current;
      if (now?.target === p.target && !now.closing) setPop({ ...now, lookupId: id, saved: saved || now.saved });
    })();
  };

  /** A newly seen lemma gets its footnote everywhere, including under the open word (fig-4a-drawer). */
  const refreshFootnotes = () => {
    if (!seenDirty.current || !dictRef.current) return;
    seenDirty.current = false;
    engine.current?.setAnnotator(footnoteAnnotator(dictRef.current, seenRef.current));
  };

  const open = (target: Target, tapAt?: number) => {
    const e = engine.current;
    if (!e) return;
    const { hit } = target;
    const host = e.openGap(hit.lineIndex);
    const box = e.scroller.getBoundingClientRect();
    const cx = target.kind === 'word' ? target.hit.rect.left + target.hit.rect.width / 2 : target.hit.x;
    const x = Math.min(Math.max(16, cx - box.left), box.width - 16);
    const base: Pop = { target, host, x, closing: false, state: 'ready', result: null, lookupId: null, saved: false, run: null, runState: null };
    lightHaptic();
    if (target.kind === 'sentence') {
      const s = target.hit;
      const run = grammar.open({ bookId, chapter: s.chapter, para: s.para, sentence: s.sentence }, s.sentenceText, s.prevText);
      setPop({ ...base, run, runState: run.get() });
      follow(host, run);
      trackGap(host, MOTION.drawerOpen, () => keepOnScreen(host));
      return;
    }
    const word = target.hit;
    e.setHighlight(word);
    const p: Pop = { ...base, ...resolve(word) };
    setPop(p);
    if (tapAt !== undefined) {
      requestAnimationFrame(() => { window.__spotlightTapMs = performance.now() - tapAt; });
    }
    if (p.state === 'ready') record(p);
    else if (p.state === 'loading') {
      void loadDict().then(() => {
        const cur = popRef.current;
        if (cur?.target !== target || cur.closing) return;
        const next = { ...cur, ...resolve(word) };
        setPop(next);
        if (next.state === 'ready') record(next);
      }).catch(() => {
        const cur = popRef.current;
        if (cur?.target === target && !cur.closing) setPop({ ...cur, state: 'notfound' });
      });
    }
    trackGap(host, MOTION.drawerOpen, () => { keepOnScreen(host); refreshFootnotes(); });
  };

  /**
   * While a grammar drawer is open: re-render it at most once per frame as the answer streams in,
   * and keep the lines below it in step as it grows (keeping it on screen until the reader touches).
   */
  const follow = (host: HTMLElement, run: GrammarRun) => {
    unfollow.current?.();
    let frame = 0;
    const off = run.subscribe(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const cur = popRef.current;
        if (cur?.run === run && !cur.closing) setPop({ ...cur, runState: run.get() });
      });
    });
    const openedAt = performance.now();
    let touched = false;
    const scroller = engine.current?.scroller;
    const onTouch = () => { touched = true; };
    scroller?.addEventListener('touchstart', onTouch, { passive: true });
    const ro = new ResizeObserver(() => {
      const e = engine.current;
      if (!e || !host.isConnected) return;
      e.setGap(host.offsetHeight);
      if (!touched && performance.now() - openedAt > MOTION.drawerOpen) keepOnScreen(host);
    });
    ro.observe(host);
    unfollow.current = () => {
      off();
      cancelAnimationFrame(frame);
      ro.disconnect();
      scroller?.removeEventListener('touchstart', onTouch);
      unfollow.current = null;
    };
  };

  const close = useCallback(() => {
    const p = popRef.current;
    if (!p || p.closing) return;
    unfollow.current?.(); // the run goes on without the drawer and still stores its answer
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

  // Scrolling outside the drawer closes it: the first gesture is swallowed, then scrolling stays
  // locked briefly. A gesture inside the drawer scrolls the drawer instead.
  useEffect(() => {
    const scroller = engine.current?.scroller;
    if (!scroller) return;
    const guard = (ev: Event) => {
      const p = popRef.current;
      const inner = p && !p.closing ? drawerInner(ev.target) : null;
      if (inner) {
        // One with nothing to scroll holds the page still, so the text under it does not move.
        if (inner.scrollHeight <= inner.clientHeight && ev.cancelable) ev.preventDefault();
        return;
      }
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
    unfollow.current?.();
    pending.current = null;
    engine.current?.setHighlight(null);
    setPop(null);
  };

  /**
   * A tap right on a word's glyphs opens the word; otherwise a droplet within reach opens its
   * sentence. Only the sharp text in the focus band opens anything; blurred text is blank space.
   */
  const targetAt = (e: ReaderEngine, x: number, y: number): Target | null => {
    const tapped = e.hitTest(x, y);
    const word = tapped && e.isInBand(tapped.lineIndex) ? tapped : null;
    const r = word?.rect;
    const onGlyphs = r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const drop = onGlyphs ? null : e.dropAt(x, y);
    if (drop) return { kind: 'sentence', hit: drop };
    return word ? { kind: 'word', hit: word } : null;
  };

  const sameTarget = (a: Target, b: Target): boolean => {
    if (a.kind !== b.kind || a.hit.chapter !== b.hit.chapter || a.hit.para !== b.hit.para) return false;
    return a.kind === 'word' ? a.hit.start === (b.hit as WordHit).start : a.hit.sentence === (b.hit as SentenceHit).sentence;
  };

  const onTap = (x: number, y: number, timeStamp: number): boolean => {
    const e = engine.current;
    if (!e) return false;
    const p = popRef.current;
    const target = targetAt(e, x, y);
    if (p) {
      if (p.closing) { if (target) pending.current = target; return true; }
      if (target && !sameTarget(target, p.target)) pending.current = target; // close first, then open after the close duration
      close();
      return true;
    }
    if (!target) return false;
    open(target, timeStamp);
    return true;
  };

  const save = () => {
    const p = popRef.current;
    if (!p || p.state !== 'ready') return;
    setPop({ ...p, saved: true });
    if (p.lookupId !== null) void setSaved(db, p.lookupId, true);
  };

  /** The drawer's 撤回: this book forgets the word (rows, saved state, footnotes), then the drawer closes. */
  const undo = () => {
    const p = popRef.current;
    const lemma = p?.result?.lemma;
    if (!p || p.closing || !lemma) return;
    if (seenRef.current.delete(lemma)) seenDirty.current = true;
    close();
    void recording.current.then(() => forgetLemma(db, bookId, lemma));
  };

  const drawer = pop
    ? createPortal(
      pop.target.kind === 'sentence'
        ? <GrammarDrawer closing={pop.closing} run={pop.runState!} x={pop.x} onRetry={() => pop.run?.retry()} />
        : <WordDrawer state={pop.state} closing={pop.closing} result={pop.result} x={pop.x} saved={pop.saved} onSave={save} onUndo={undo} />,
      pop.host,
    )
    : null;

  return { onTap, reset, isOpen: () => popRef.current !== null, drawer };
}

declare global {
  interface Window { __spotlightTapMs?: number }
}

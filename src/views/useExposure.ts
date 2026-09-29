import { useEffect, useRef, type RefObject } from 'react';
import { paragraphText } from '../core/ingest/text.ts';
import type { EngineBook, ReaderEngine } from '../core/reader/engine.ts';
import { words } from '../core/reader/words.ts';
import type { WordLookup } from './useWordLookup.tsx';

/** The band has to stay this long per word to count as read (400 words a minute). */
const SECONDS_PER_WORD = 0.15;
/** A scroll pause this long takes a snapshot of the sharp lines. */
const SETTLE_MS = 400;
const FLUSH_MS = 30000;

/**
 * Predicted words (P-02): words read in the focus band without a tap are weak "known" evidence.
 * At each scroll pause the sharp lines are remembered; when the band moves on, they count as read if
 * it stayed long enough for their words. Each line counts once per session; words that already have
 * a footnote do not count (the reader saw the gloss).
 */
export function useExposure(scrollRef: RefObject<HTMLElement | null>, engine: RefObject<ReaderEngine | null>, book: EngineBook, lookup: WordLookup) {
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const credited = new Set<string>();
    let snap: { ranges: ReturnType<ReaderEngine['sharpText']>; at: number } | null = null;
    let idle = 0;

    const take = () => {
      const e = engine.current;
      if (e && !lookupRef.current.isOpen()) snap = { ranges: e.sharpText(), at: performance.now() };
    };
    const settle = () => {
      const s = snap;
      snap = null;
      const v = lookupRef.current.vocab();
      if (!s || !v) return;
      const lines = s.ranges
        .filter((r) => !credited.has(`${r.chapter}:${r.para}:${r.start}`))
        .map((r) => ({ key: `${r.chapter}:${r.para}:${r.start}`, text: paragraphText(book.chapters[r.chapter]?.paras[r.para] ?? []).slice(r.start, r.end) }));
      const count = lines.reduce((n, l) => n + [...words(l.text)].length, 0);
      if (!count || performance.now() - s.at < count * SECONDS_PER_WORD * 1000) return;
      const read = new Set<string>();
      for (const l of lines) {
        credited.add(l.key);
        for (const w of words(l.text)) {
          const lemma = v.dict.lookup(w.word)?.lemma;
          if (lemma && !v.footnoted.has(lemma)) read.add(lemma);
        }
      }
      v.model.noteRead(read);
    };
    const flush = () => { void lookupRef.current.vocab()?.model.flush(); };

    const onScroll = () => {
      if (snap) settle();
      clearTimeout(idle);
      idle = window.setTimeout(take, SETTLE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      settle();
      flush();
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    idle = window.setTimeout(take, SETTLE_MS * 3); // the opening position, once the book has laid out
    const timer = window.setInterval(flush, FLUSH_MS);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(idle);
      clearInterval(timer);
      settle();
      flush();
    };
  }, [scrollRef, engine, book]);
}

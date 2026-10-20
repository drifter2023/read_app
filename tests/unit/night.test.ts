import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { ease } from '../../src/core/motion.ts';
import { blurMaxFor, DEFAULT_PREFS, NIGHT_BLUR_MAX, PrefsStore, sanitise } from '../../src/core/prefs/prefs.ts';
import { opacityFor } from '../../src/core/reader/focus.ts';
import { dwellMs, Guide, GUIDE_STEP_MS, type GuideClock, type GuideHost, type SentenceId } from '../../src/core/reader/guide.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('夜读 focus band (N3)', () => {
  it('NM-02: night opacity reaches .08 at t = 1 (4a stays at .15); the night blur defaults to 9 px until the reader sets one', () => {
    expect(opacityFor(1, true)).toBeCloseTo(0.08, 3);
    expect(opacityFor(0, true)).toBe(1);
    expect(opacityFor(0.5, true)).toBe(0.54);
    expect(opacityFor(1)).toBe(0.15);
    const night = { ...DEFAULT_PREFS, theme: 'night' as const };
    expect(blurMaxFor(night)).toBe(NIGHT_BLUR_MAX);
    expect(NIGHT_BLUR_MAX).toBe(9);
    expect(blurMaxFor({ ...night, blurMax: 5, blurMaxSet: true })).toBe(5);
    expect(blurMaxFor({ ...night, blurMax: 7, blurMaxSet: true })).toBe(7); // set to the old default on purpose
    expect(blurMaxFor(DEFAULT_PREFS)).toBe(7);
  });

  it('the easing function is the app curve: symmetric, 0 → 1', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 3);
    expect(ease(0.1)).toBeLessThan(0.1); // eases in
  });
});

describe('settings for 夜读 (N6)', () => {
  let db: Db;
  beforeEach(async () => { db = nodeDb(); await migrate(db); });

  it('NM-10: theme and guideSpeed persist across reloads', async () => {
    const a = await PrefsStore.load(db);
    await a.set('theme', 'night');
    await a.set('guideSpeed', 1.6);
    expect((await PrefsStore.load(db)).get()).toMatchObject({ theme: 'night', guideSpeed: 1.6 });
  });

  it('moving 模糊强度 makes it the reader’s own, even onto the value already shown', async () => {
    const a = await PrefsStore.load(db);
    await a.set('blurMax', 7);
    expect(a.get().blurMaxSet).toBe(true);
    expect((await PrefsStore.load(db)).get()).toMatchObject({ blurMax: 7, blurMaxSet: true });
  });

  it('only the three speeds are kept', () => {
    expect(sanitise({ ...DEFAULT_PREFS, guideSpeed: 2 as never }).guideSpeed).toBe(1);
    expect(sanitise({ ...DEFAULT_PREFS, guideSpeed: 0.6 }).guideSpeed).toBe(0.6);
  });
});

describe('带读 dwell (NM-04)', () => {
  it('a 20-word sentence dwells 6000 ms at 1× and 3750 ms at 1.6×; never under 1200 ms', () => {
    expect(dwellMs(20, 1)).toBe(6000);
    expect(dwellMs(20, 1.6)).toBe(3750);
    expect(dwellMs(20, 0.6)).toBe(10000);
    expect(dwellMs(1, 1.6)).toBe(1200);
    expect(dwellMs(0, 1)).toBe(1200);
  });
});

/** A fake clock: timers run only when the test advances time. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: GuideClock = {
    setTimeout: (fn, ms) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  return { clock, advance, pending: () => timers.size, now: () => now };
}

/** A chapter of sentences with word counts; scrolls take GUIDE_STEP_MS on the same fake clock. */
function fakeHost(chapter: number[][], clock: GuideClock) {
  const lit: (SentenceId | null)[] = [];
  const scrolls: SentenceId[] = [];
  let scrolling = 0;
  const host: GuideHost = {
    sentenceAtCentre: () => ({ chapter: 0, para: 0, sentence: 0 }),
    nextSentence: (id) => {
      if (id.sentence + 1 < chapter[id.para]!.length) return { ...id, sentence: id.sentence + 1 };
      return id.para + 1 < chapter.length ? { chapter: 0, para: id.para + 1, sentence: 0 } : null;
    },
    sentenceWords: (id) => chapter[id.para]![id.sentence]!,
    setGuideSentence: (id) => { lit.push(id); },
    scrollSentenceToCentre: (id, ms, done) => {
      scrolls.push(id);
      scrolling++;
      const t = clock.setTimeout(() => { scrolling--; done(); }, ms);
      return () => { scrolling--; clock.clearTimeout(t); };
    },
  };
  return { host, lit, scrolls, scrolling: () => scrolling };
}

describe('带读 guide (N4)', () => {
  it('NM-04: holds each sentence for its dwell at the current speed, then scrolls 600 ms to the next', () => {
    const c = fakeClock();
    const h = fakeHost([[20, 4]], c.clock);
    let speed: 1 | 1.6 = 1;
    const g = new Guide(h.host, () => speed, () => {}, c.clock);
    g.play();
    expect(g.current).toEqual({ chapter: 0, para: 0, sentence: 0 });
    c.advance(5999);
    expect(h.scrolls).toHaveLength(0);
    speed = 1.6; // applies from the next dwell
    c.advance(1);
    expect(h.scrolls).toEqual([{ chapter: 0, para: 0, sentence: 1 }]);
    c.advance(GUIDE_STEP_MS);
    expect(g.current).toEqual({ chapter: 0, para: 0, sentence: 1 });
    c.advance(1199); // 4 words at 1.6× → the 1200 ms floor
    expect(g.playing).toBe(true);
    c.advance(1);
    expect(g.playing).toBe(false); // last sentence of the chapter
  });

  it('NM-05: a pause stops everything at once, mid-dwell or mid-scroll, and nothing resumes without play', () => {
    for (const at of [3000, 6000 + 300]) {
      const c = fakeClock();
      const h = fakeHost([[20, 20, 20]], c.clock);
      const changes: [boolean, string?][] = [];
      const g = new Guide(h.host, () => 1, (p, r) => changes.push([p, r]), c.clock);
      g.play();
      c.advance(at);
      g.pause('touch');
      expect(c.pending()).toBe(0); // no timer and no scroll left
      expect(h.scrolling()).toBe(0);
      expect(h.lit.at(-1)).toBeNull(); // the band is back to normal
      const lit = h.lit.length;
      c.advance(60_000);
      expect(h.lit.length).toBe(lit);
      expect(g.playing).toBe(false);
      expect(changes).toEqual([[true, undefined], [false, 'touch']]);
    }
  });

  it('NM-06: stops at the last sentence of the chapter, paused, without turning the chapter', () => {
    const c = fakeClock();
    const h = fakeHost([[4], [4, 4]], c.clock);
    const reasons: (string | undefined)[] = [];
    const g = new Guide(h.host, () => 1.6, (p, r) => { if (!p) reasons.push(r); }, c.clock);
    g.play();
    c.advance(60_000);
    expect(h.scrolls).toEqual([{ chapter: 0, para: 1, sentence: 0 }, { chapter: 0, para: 1, sentence: 1 }]);
    expect(g.playing).toBe(false);
    expect(reasons).toEqual(['chapter-end']);
  });
});

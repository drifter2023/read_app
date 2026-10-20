/**
 * 带读 · auto guided reading (NIGHT_MODE_1c.md → N4). Sentence-stepped: the current sentence is lit,
 * held for a dwell that depends on its length and the speed, then the page scrolls the next sentence
 * to the centre and its dwell starts. Pure logic: the reader engine does the painting and scrolling.
 */
import type { GuideSpeed } from '../prefs/prefs.ts';

export interface SentenceId { chapter: number; para: number; sentence: number }

/** Scroll from one sentence to the next (N4 → Advance). */
export const GUIDE_STEP_MS = 600;
const MIN_DWELL_MS = 1200;
const BASE_WPM = 200;

/** How long a sentence of `words` words stays lit: ≈120 / 200 / 320 wpm at 0.6× / 1× / 1.6×, never under 1.2 s. */
export function dwellMs(words: number, speed: number): number {
  return Math.max(MIN_DWELL_MS, (words * 60_000) / (BASE_WPM * speed));
}

/** What the guide needs from the reader. */
export interface GuideHost {
  /** The first sentence on the line at the band centre (same anchor as R-07), or null. */
  sentenceAtCentre(): SentenceId | null;
  /** The sentence after `id` in the same chapter, or null at the chapter's end. */
  nextSentence(id: SentenceId): SentenceId | null;
  sentenceWords(id: SentenceId): number;
  /** Lights a sentence (and dims the rest), or goes back to the plain focus band with null. */
  setGuideSentence(id: SentenceId | null): void;
  /** Scrolls `id` to the viewport centre over `ms`, then calls `done`; returns a cancel function. */
  scrollSentenceToCentre(id: SentenceId, ms: number, done: () => void): () => void;
}

export interface GuideClock {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export type PauseReason = 'user' | 'touch' | 'chapter-end' | 'hidden' | 'theme' | 'overlay' | 'gone';

export class Guide {
  #host: GuideHost;
  #speed: () => GuideSpeed;
  #clock: GuideClock;
  #onChange: (playing: boolean, reason?: PauseReason) => void;
  #playing = false;
  #current: SentenceId | null = null;
  #timer = 0;
  #cancelScroll: (() => void) | null = null;

  constructor(host: GuideHost, speed: () => GuideSpeed, onChange: (playing: boolean, reason?: PauseReason) => void = () => {}, clock: GuideClock = window) {
    this.#host = host;
    this.#speed = speed;
    this.#onChange = onChange;
    this.#clock = clock;
  }

  get playing(): boolean {
    return this.#playing;
  }

  /** The lit sentence while playing. */
  get current(): SentenceId | null {
    return this.#current;
  }

  /** Play: from the sentence at the band centre. Only this starts the guide; nothing resumes it by itself. */
  play(): void {
    if (this.#playing) return;
    const id = this.#host.sentenceAtCentre();
    if (!id) return;
    this.#playing = true;
    this.#onChange(true);
    this.#step(id);
  }

  /** Stops at once: no timer or scroll left running, the band back to normal. Safe to call any time. */
  pause(reason: PauseReason = 'user'): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#clock.clearTimeout(this.#timer);
    this.#timer = 0;
    this.#cancelScroll?.();
    this.#cancelScroll = null;
    this.#current = null;
    this.#host.setGuideSentence(null);
    this.#onChange(false, reason);
  }

  #step(id: SentenceId): void {
    this.#current = id;
    this.#host.setGuideSentence(id);
    // The speed is read here, so a change applies from the next dwell (N5).
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = 0;
      const next = this.#host.nextSentence(id);
      if (!next) { this.pause('chapter-end'); return; } // never turns the chapter (N-06)
      this.#cancelScroll = this.#host.scrollSentenceToCentre(next, GUIDE_STEP_MS, () => {
        this.#cancelScroll = null;
        if (this.#playing) this.#step(next);
      });
    }, dwellMs(this.#host.sentenceWords(id), this.#speed()));
  }
}

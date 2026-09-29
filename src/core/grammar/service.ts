import { AiError, streamChat, type AiErrorKind, type Fetch } from '../ai/deepseek.ts';
import { getKey } from '../ai/key.ts';
import type { Db } from '../db/types.ts';
import { loadGrammar, saveGrammar, type SentenceRef } from './history.ts';
import { isUsable, parseGrammar, type Grammar, type ParsedGrammar } from './parse.ts';
import { SYSTEM_PROMPT, userMessage } from './prompt.ts';

/**
 * What the grammar drawer shows for one sentence.
 * - `waiting`: before the first token (history and key are read first).
 * - `streaming`: the answer so far, with the line being written as `pending`.
 * - `done`: `cached` when it came from history, without a request.
 * - `error`: what went wrong, plus whatever had arrived (kept visible, never stored).
 */
export type RunState =
  | { status: 'waiting' }
  | { status: 'streaming'; grammar: ParsedGrammar }
  | { status: 'done'; grammar: Grammar; cached: boolean }
  | { status: 'error'; reason: AiErrorKind; partial: ParsedGrammar | null };

export interface GrammarRun {
  get(): RunState;
  subscribe(fn: (s: RunState) => void): () => void;
  /** 重试 after an error: starts over from history. */
  retry(): void;
}

/** About twice a full answer (docs/plans/2026-09-29-deepseek-grammar.md → Length). */
const MAX_TOKENS = 900;
const TEMPERATURE = 0.5;

interface Options { fetch?: Fetch; firstTokenMs?: number; idleMs?: number }

/**
 * history → key → stream from DeepSeek → store. One run per sentence at a time: reopening a
 * sentence that is still streaming joins its run. A run goes on when its drawer closes, so a
 * paid-for answer is always kept.
 */
export class GrammarService {
  #db: Db;
  #fetch: Fetch | undefined;
  #firstTokenMs: number;
  #idleMs: number;
  #runs = new Map<string, Run>();

  constructor(db: Db, opts: Options = {}) {
    this.#db = db;
    this.#fetch = opts.fetch;
    this.#firstTokenMs = opts.firstTokenMs ?? 15_000;
    this.#idleMs = opts.idleMs ?? 20_000;
  }

  /** Tests only: swap the network. */
  setFetch(f: Fetch): void {
    this.#fetch = f;
  }

  open(ref: SentenceRef, text: string, prev: string | null): GrammarRun {
    const id = `${ref.bookId}:${ref.chapter}:${ref.para}:${ref.sentence}`;
    const live = this.#runs.get(id);
    if (live && live.get().status !== 'error') return live;
    const run = new Run(() => this.#go(run, ref, text, prev), () => { if (this.#runs.get(id) === run) this.#runs.delete(id); });
    this.#runs.set(id, run);
    run.start();
    return run;
  }

  async #go(run: Run, ref: SentenceRef, text: string, prev: string | null): Promise<RunState> {
    const cached = await loadGrammar(this.#db, ref, text);
    if (cached) return { status: 'done', grammar: cached, cached: true };
    const key = await getKey(this.#db);
    if (!key) return { status: 'error', reason: 'no-key', partial: null };

    const ac = new AbortController();
    const expire = () => ac.abort(new AiError('timeout'));
    let timer = setTimeout(expire, this.#firstTokenMs);
    let acc = '';
    try {
      const r = await streamChat({
        key, system: SYSTEM_PROMPT, user: userMessage(prev, text), maxTokens: MAX_TOKENS, temperature: TEMPERATURE, signal: ac.signal,
      }, (piece) => {
        clearTimeout(timer);
        timer = setTimeout(expire, this.#idleMs);
        acc += piece;
        run.set({ status: 'streaming', grammar: parseGrammar(acc) });
      }, this.#fetch);
      const g = parseGrammar(acc, { final: true, truncated: r.finish === 'length' });
      if (!isUsable(g)) return { status: 'error', reason: 'bad-answer', partial: acc ? g : null };
      const grammar: Grammar = { translation: g.translation, pattern: g.pattern, points: g.points };
      await saveGrammar(this.#db, ref, text, grammar).catch(() => {}); // e.g. the book was deleted meanwhile
      return { status: 'done', grammar, cached: false };
    } catch (e) {
      const reason = e instanceof AiError ? e.kind : 'network';
      return { status: 'error', reason, partial: acc ? parseGrammar(acc, { final: true, truncated: true }) : null };
    } finally {
      clearTimeout(timer);
    }
  }
}

class Run implements GrammarRun {
  #state: RunState = { status: 'waiting' };
  #subs = new Set<(s: RunState) => void>();
  #work: () => Promise<RunState>;
  #settled: () => void;

  constructor(work: () => Promise<RunState>, settled: () => void) {
    this.#work = work;
    this.#settled = settled;
  }

  start(): void {
    this.set({ status: 'waiting' });
    void this.#work()
      .catch((): RunState => ({ status: 'error', reason: 'network', partial: null }))
      .then((s) => {
        this.set(s);
        if (s.status === 'done') this.#settled(); // history serves it from now on
      });
  }

  get(): RunState {
    return this.#state;
  }

  set(s: RunState): void {
    this.#state = s;
    for (const fn of this.#subs) fn(s);
  }

  subscribe(fn: (s: RunState) => void): () => void {
    this.#subs.add(fn);
    return () => { this.#subs.delete(fn); };
  }

  retry(): void {
    if (this.#state.status === 'error') this.start();
  }
}

import { AiError, streamChat, type AiErrorKind, type ChatTurn, type Fetch } from '../ai/deepseek.ts';
import { getKey } from '../ai/key.ts';
import type { Db } from '../db/types.ts';
import { SYSTEM_PROMPT, splitAnswer, userMessage } from './prompt.ts';
import { loadMessages, saveExchange } from './store.ts';

/**
 * What the Agent drawer shows for the question being answered.
 * - `waiting`: before the first token.  - `streaming`: the answer so far.
 * - `done`: stored.  - `error`: nothing is stored; `partial` is what had arrived.
 */
export type AskState =
  | { status: 'waiting' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string; cite?: string }
  | { status: 'error'; reason: AiErrorKind; partial: string };

export interface AskInput {
  sessionId: string; question: string;
  /** The selected sentence, or the text attached by 问旁注 (then `selected`). It is stored as the question's quote. */
  sentence: string;
  selected?: boolean;
  title: string; chapter: string;
  /** The chapter text up to the end of the page (the "read so far"). */
  reading: string;
}

const MAX_TOKENS = 600;
const TEMPERATURE = 0.6;
/** Earlier messages sent along: the last four exchanges. */
const HISTORY = 8;

interface Options { fetch?: Fetch; firstTokenMs?: number; idleMs?: number }

/**
 * key → stream from DeepSeek → store. The exchange is saved when the answer is complete, even if
 * the drawer has been left meanwhile.
 */
export class AgentService {
  #db: Db;
  #fetch: Fetch | undefined;
  #firstTokenMs: number;
  #idleMs: number;

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

  /** Resolves with the last state (also passed to `onState`). Never rejects. */
  async ask(input: AskInput, onState: (s: AskState) => void): Promise<AskState> {
    const emit = (s: AskState): AskState => { onState(s); return s; };
    emit({ status: 'waiting' });
    let acc = '';
    try {
      const key = await getKey(this.#db);
      if (!key) return emit({ status: 'error', reason: 'no-key', partial: '' });
      const history: ChatTurn[] = (await loadMessages(this.#db, input.sessionId)).slice(-HISTORY)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

      const ac = new AbortController();
      const expire = () => ac.abort(new AiError('timeout'));
      let timer = setTimeout(expire, this.#firstTokenMs);
      try {
        await streamChat({
          key, system: SYSTEM_PROMPT, history, maxTokens: MAX_TOKENS, temperature: TEMPERATURE, signal: ac.signal,
          user: userMessage({ title: input.title, chapter: input.chapter, reading: input.reading, sentence: input.sentence, question: input.question, selected: input.selected }),
        }, (piece) => {
          clearTimeout(timer);
          timer = setTimeout(expire, this.#idleMs);
          acc += piece;
          onState({ status: 'streaming', text: splitAnswer(acc).text });
        }, this.#fetch);
        const { text, cite } = splitAnswer(acc);
        if (!text) return emit({ status: 'error', reason: 'bad-answer', partial: '' });
        await saveExchange(this.#db, input.sessionId, { question: input.question, quote: input.sentence, answer: text, ...(cite ? { cite } : {}) });
        return emit({ status: 'done', text, ...(cite ? { cite } : {}) });
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const reason = e instanceof AiError ? e.kind : 'network';
      return emit({ status: 'error', reason, partial: splitAnswer(acc).text });
    }
  }
}

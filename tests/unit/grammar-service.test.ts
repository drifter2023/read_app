import { beforeEach, describe, expect, it } from 'vitest';
import type { Fetch } from '../../src/core/ai/deepseek.ts';
import { setKey } from '../../src/core/ai/key.ts';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { loadGrammar, saveGrammar } from '../../src/core/grammar/history.ts';
import { SYSTEM_PROMPT, userMessage } from '../../src/core/grammar/prompt.ts';
import { GrammarService, type RunState } from '../../src/core/grammar/service.ts';
import { saveParsedBook } from '../../src/core/library/library.ts';
import { nodeDb } from '../helpers/nodeDb.ts';
import { sse, stalled } from '../helpers/sse.ts';

let db: Db;
const book = { id: 'a', title: 'a', author: 'A', wordCount: 2, chapters: [{ title: 'I', paras: [['Hi there.']], wordCount: 2 }] };
const ref = { bookId: 'a', chapter: 0, para: 3, sentence: 1 };
const TEXT = 'His nostrils curved back to make another, smaller, v.';
const PREV = 'Samuel Spade’s jaw was long and bony.';
const PIECES = ['句型：简单句', ' + 不定式\n主干｜His nostrils', ' curved back\n不定式｜to make another v 表结果\n'];

let requests: { url: string; body: unknown }[] = [];
const answer = (pieces = PIECES, finish = 'stop'): Fetch => async (url, init) => {
  requests.push({ url, body: JSON.parse(init!.body as string) });
  return new Response(sse(pieces, finish));
};
/** Resolves only when aborted, like a request that never gets an answer. */
const silent: Fetch = (url, init) => {
  requests.push({ url, body: null });
  return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
};

/** Every state a run goes through, until it settles. */
function watch(service: GrammarService, text = TEXT): Promise<RunState[]> {
  const run = service.open(ref, text, PREV);
  const seen: RunState[] = [run.get()];
  return new Promise((resolve) => {
    const off = run.subscribe((s) => {
      seen.push(s);
      if (s.status === 'done' || s.status === 'error') { off(); resolve(seen); }
    });
    if (seen[0]!.status === 'done' || seen[0]!.status === 'error') resolve(seen);
  });
}

beforeEach(async () => {
  requests = [];
  db = nodeDb();
  await migrate(db);
  await saveParsedBook(db, book, 'epub', 0);
  await setKey(db, 'sk-test-1234');
});

describe('grammar service', () => {
  it('G-02: waits, streams, then finishes; the request carries prompt v1', async () => {
    const states = await watch(new GrammarService(db, { fetch: answer() }));
    expect(states[0]!.status).toBe('waiting');
    expect(states.some((s) => s.status === 'streaming')).toBe(true);
    const last = states.at(-1)!;
    expect(last).toMatchObject({ status: 'done', cached: false, grammar: { pattern: '简单句 + 不定式' } });
    expect(last.status === 'done' && last.grammar.points.map((p) => p.label)).toEqual(['主干', '不定式']);
    const body = requests[0]!.body as { messages: { content: string }[]; max_tokens: number; temperature: number };
    expect(body.messages[0]!.content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1]!.content).toBe(userMessage(PREV, TEXT));
    expect(body).toMatchObject({ max_tokens: 400, temperature: 0.5 });
  });

  it('G-03: a finished analysis is stored; the next open is served from history without a request', async () => {
    await watch(new GrammarService(db, { fetch: answer() }));
    expect(await loadGrammar(db, ref, TEXT)).toMatchObject({ pattern: '简单句 + 不定式' });
    requests = [];
    const states = await watch(new GrammarService(db, { fetch: silent }));
    expect(states.at(-1)).toMatchObject({ status: 'done', cached: true });
    expect(requests).toHaveLength(0);
  });

  it('G-03: a closed drawer does not stop the run; its answer is still stored', async () => {
    const service = new GrammarService(db, { fetch: answer() });
    const run = service.open(ref, TEXT, PREV);
    run.subscribe(() => {})(); // the drawer subscribes, then closes at once
    await expect.poll(() => loadGrammar(db, ref, TEXT)).not.toBeNull();
  });

  it('reopening a sentence while it streams joins the same run (one request)', async () => {
    const service = new GrammarService(db, { fetch: answer() });
    const a = service.open(ref, TEXT, PREV);
    const b = service.open(ref, TEXT, PREV);
    expect(b).toBe(a);
    await expect.poll(() => a.get().status).toBe('done');
    expect(requests).toHaveLength(1);
  });

  it('G-05: no key → no-key, and no request', async () => {
    await db.run("DELETE FROM settings WHERE key = 'deepseek.key'");
    const states = await watch(new GrammarService(db, { fetch: answer() }));
    expect(states.at(-1)).toMatchObject({ status: 'error', reason: 'no-key' });
    expect(requests).toHaveLength(0);
  });

  it('G-05: no first token in time → timeout; nothing stored; retry starts over', async () => {
    const service = new GrammarService(db, { fetch: silent, firstTokenMs: 30 });
    const states = await watch(service);
    expect(states.at(-1)).toMatchObject({ status: 'error', reason: 'timeout' });
    expect(await loadGrammar(db, ref, TEXT)).toBeNull();
    // 重试 with a working network
    service.setFetch(answer());
    const run = service.open(ref, TEXT, PREV);
    run.retry();
    await expect.poll(() => run.get().status).toBe('done');
  });

  it('G-05: a stream that stalls midway keeps what arrived, times out, and stores nothing', async () => {
    const stall: Fetch = async () => new Response(stalled(['句型：简单句\n主干｜His nostrils curved back\n']));
    const states = await watch(new GrammarService(db, { fetch: stall, idleMs: 40 }));
    const last = states.at(-1)!;
    expect(last).toMatchObject({ status: 'error', reason: 'timeout' });
    expect(last.status === 'error' && last.partial?.points).toHaveLength(1);
    expect(await loadGrammar(db, ref, TEXT)).toBeNull();
  });

  it('G-05: an answer without the format is an error, not a stored analysis', async () => {
    const states = await watch(new GrammarService(db, { fetch: answer(['I cannot help with that.']) }));
    expect(states.at(-1)).toMatchObject({ status: 'error', reason: 'bad-answer' });
    expect(await loadGrammar(db, ref, TEXT)).toBeNull();
  });

  it('a cut-off answer keeps its complete lines', async () => {
    const states = await watch(new GrammarService(db, { fetch: answer(['句型：简单句\n主干｜His nostrils curved back\n不定式｜to ma'], 'length') }));
    const last = states.at(-1)!;
    expect(last.status === 'done' && last.grammar.points).toHaveLength(1);
  });

  it('an old analysis for other text is ignored', async () => {
    await saveGrammar(db, ref, 'Something else.', { pattern: '旧', points: [{ label: '主干', text: 'x' }] });
    const states = await watch(new GrammarService(db, { fetch: answer() }));
    expect(states.at(-1)).toMatchObject({ status: 'done', cached: false });
  });
});

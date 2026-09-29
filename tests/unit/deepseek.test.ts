import { beforeEach, describe, expect, it } from 'vitest';
import { AiError, checkKey, streamChat, type Fetch } from '../../src/core/ai/deepseek.ts';
import { clearKey, getKey, maskKey, setKey } from '../../src/core/ai/key.ts';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { nodeDb } from '../helpers/nodeDb.ts';
import { sse } from '../helpers/sse.ts';

const calls: { url: string; init: RequestInit }[] = [];
const fake = (res: () => Response | Promise<Response>): Fetch => async (url, init) => {
  calls.push({ url: String(url), init: init! });
  return res();
};
beforeEach(() => { calls.length = 0; });

const req = { key: 'sk-test-1234', system: '系统', user: '用户', maxTokens: 400, temperature: 0.5 };

describe('DeepSeek streaming client (G-05)', () => {
  it('streams content pieces in order, whatever the chunking, and reports the finish reason', async () => {
    const pieces = ['句型：主句', ' + 定语从句\n主干｜my father', ' gave me some advice'];
    for (const size of [1, 3, 7, 64]) {
      let text = '';
      const r = await streamChat(req, (t) => { text += t; }, fake(() => new Response(sse(pieces, 'stop', size))));
      expect(text).toBe(pieces.join(''));
      expect(r.finish).toBe('stop');
    }
  });

  it('sends the key as a bearer token and the request as JSON', async () => {
    await streamChat(req, () => {}, fake(() => new Response(sse(['x']))));
    const { url, init } = calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-1234');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'deepseek-flash', stream: true, thinking: { type: 'disabled' }, max_tokens: 400, temperature: 0.5,
      messages: [{ role: 'system', content: '系统' }, { role: 'user', content: '用户' }],
    });
  });

  it('reports a cut-off answer', async () => {
    const r = await streamChat(req, () => {}, fake(() => new Response(sse(['a'], 'length'))));
    expect(r.finish).toBe('length');
  });

  it('maps HTTP failures to typed errors that never carry the key', async () => {
    const cases: [number, string][] = [[401, 'invalid-key'], [402, 'no-balance'], [429, 'rate-limit'], [500, 'server'], [503, 'server'], [400, 'server']];
    for (const [status, kind] of cases) {
      const err = await streamChat(req, () => {}, fake(() => new Response('{"error":{"message":"Authentication Fails (sk-test-1234)"}}', { status })))
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).kind).toBe(kind);
      expect(String((err as AiError).message)).not.toContain('sk-test');
    }
  });

  it('maps a dropped connection to a network error, and an abort to its reason', async () => {
    const down = await streamChat(req, () => {}, fake(() => { throw new TypeError('Load failed'); })).catch((e: unknown) => e);
    expect((down as AiError).kind).toBe('network');
    const ac = new AbortController();
    ac.abort(new AiError('timeout'));
    const timedOut = await streamChat({ ...req, signal: ac.signal }, () => {}, fake(() => { throw new DOMException('aborted', 'AbortError'); }))
      .catch((e: unknown) => e);
    expect((timedOut as AiError).kind).toBe('timeout');
  });
});

describe('key check (G-01)', () => {
  it('asks GET /models with the key: 200 ok, 401 invalid, anything else network', async () => {
    expect(await checkKey('sk-a', fake(() => new Response('{"data":[]}', { status: 200 })))).toBe('ok');
    expect(calls[0]!.url).toBe('https://api.deepseek.com/models');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-a');
    expect(await checkKey('sk-a', fake(() => new Response('', { status: 401 })))).toBe('invalid');
    expect(await checkKey('sk-a', fake(() => new Response('', { status: 503 })))).toBe('network');
    expect(await checkKey('sk-a', fake(() => { throw new TypeError('offline'); }))).toBe('network');
  });
});

describe('key storage (G-01)', () => {
  let db: Db;
  beforeEach(async () => { db = nodeDb(); await migrate(db); });

  it('stores, replaces and clears the key; shows only its last four characters', async () => {
    expect(await getKey(db)).toBeNull();
    await setKey(db, '  sk-abcdef1234  ');
    expect(await getKey(db)).toBe('sk-abcdef1234');
    await setKey(db, 'sk-zzzz9876');
    expect(await getKey(db)).toBe('sk-zzzz9876');
    expect(maskKey('sk-zzzz9876')).toBe('····9876');
    await clearKey(db);
    expect(await getKey(db)).toBeNull();
  });
});

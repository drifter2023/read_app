import { describe, expect, it, vi } from 'vitest';
import worker, { handleFetch, isPublicUrl, MAX_BYTES, type Env } from '../../server/worker.ts';

const SELF = 'https://spotlight.example';
const call = (body: unknown, init: { origin?: string | null; method?: string } = {}) => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (init.origin !== null) headers.set('Origin', init.origin ?? SELF);
  return new Request(`${SELF}/api/fetch`, {
    method: init.method ?? 'POST', headers, body: init.method === 'GET' ? undefined : JSON.stringify(body),
  });
};
const page = (html: string, headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' }) =>
  new Response(html, { status: 200, headers });
const error = async (r: Response) => ((await r.json()) as { error: string }).error;

describe('link fetch Worker (L-01)', () => {
  it('returns the page bytes with its own Content-Type, uncached', async () => {
    const up = vi.fn(async () => page('<p>Hello</p>', { 'Content-Type': 'text/html; charset=windows-1252' }));
    const r = await handleFetch(call({ url: 'https://news.example/a' }), {}, up as typeof fetch);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('<p>Hello</p>');
    expect(r.headers.get('Content-Type')).toBe('text/html; charset=windows-1252');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Final-Url')).toBe('https://news.example/a');
    expect(up).toHaveBeenCalledWith('https://news.example/a', expect.objectContaining({ redirect: 'manual' }));
  });

  it('only serves its own origin, only POST', async () => {
    const up = vi.fn();
    expect((await handleFetch(call({ url: 'https://a.example/' }, { origin: 'https://evil.example' }), {}, up)).status).toBe(403);
    expect((await handleFetch(call({ url: 'https://a.example/' }, { origin: null }), {}, up)).status).toBe(403);
    expect((await handleFetch(call(null, { method: 'GET' }), {}, up)).status).toBe(405);
    expect(up).not.toHaveBeenCalled();
  });

  it('rejects bad bodies and non-public URLs before fetching', async () => {
    const up = vi.fn();
    for (const body of [{}, { url: 42 }, { url: 'not a url' }, { url: 'x'.repeat(5000) }]) {
      expect((await handleFetch(call(body), {}, up)).status).toBe(400);
    }
    for (const url of ['file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.8/', 'http://192.168.1.1/',
      'http://169.254.169.254/latest', 'http://[::1]/', 'http://[fd00::1]/', 'http://2130706433/', 'https://a.example:8443/',
      'https://user:pw@a.example/', 'http://printer.local/', 'https://spotlight.example/x']) {
      const r = await handleFetch(call({ url }), {}, up);
      expect([r.status, url]).toEqual([400, url]);
    }
    expect(up).not.toHaveBeenCalled();
  });

  it('follows redirects by hand and checks every hop', async () => {
    const up = vi.fn(async (u: string) => u === 'https://short.example/x'
      ? new Response(null, { status: 301, headers: { Location: 'https://news.example/story' } })
      : page('<p>Story</p>'));
    const r = await handleFetch(call({ url: 'https://short.example/x' }), {}, up as typeof fetch);
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Final-Url')).toBe('https://news.example/story');

    const sneaky = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }));
    const s = await handleFetch(call({ url: 'https://short.example/x' }), {}, sneaky as typeof fetch);
    expect([s.status, await error(s)]).toEqual([502, 'blocked_url']);
    expect(sneaky).toHaveBeenCalledTimes(1);

    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://loop.example/' } }));
    const l = await handleFetch(call({ url: 'https://loop.example/' }), {}, loop as typeof fetch);
    expect(await error(l)).toBe('too_many_redirects');
    expect(loop).toHaveBeenCalledTimes(6);
  });

  it('only HTML or text, at most 3 MB, upstream errors passed on as codes', async () => {
    const pdf = await handleFetch(call({ url: 'https://a.example/f.pdf' }), {}, (async () => page('%PDF', { 'Content-Type': 'application/pdf' })) as typeof fetch);
    expect([pdf.status, await error(pdf)]).toEqual([415, 'not_html']);
    const big = 'x'.repeat(MAX_BYTES + 1);
    const huge = await handleFetch(call({ url: 'https://a.example/' }), {}, (async () => page(big)) as typeof fetch);
    expect([huge.status, await error(huge)]).toEqual([413, 'too_large']);
    const gone = await handleFetch(call({ url: 'https://a.example/' }), {}, (async () => new Response('', { status: 404 })) as typeof fetch);
    expect(await gone.json()).toEqual({ error: 'upstream_status', status: 404 });
    const down = await handleFetch(call({ url: 'https://a.example/' }), {}, (async () => { throw new TypeError('network'); }) as typeof fetch);
    expect(await error(down)).toBe('unreachable');
    const slow = await handleFetch(call({ url: 'https://a.example/' }), {}, (async () => { throw new DOMException('t', 'TimeoutError'); }) as typeof fetch);
    expect([slow.status, await error(slow)]).toEqual([504, 'timeout']);
  });

  it('is rate-limited per IP', async () => {
    const keys: string[] = [];
    const env: Env = { FETCH_LIMIT: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } };
    const req = call({ url: 'https://a.example/' });
    req.headers.set('CF-Connecting-IP', '203.0.113.9');
    const r = await handleFetch(req, env, vi.fn());
    expect([r.status, await error(r)]).toEqual([429, 'rate_limited']);
    expect(keys).toEqual(['203.0.113.9']);
  });

  it('routes /api/fetch to the handler and everything else to the static assets', async () => {
    const assets = vi.fn(async () => new Response('app'));
    expect(await (await worker.fetch(new Request(`${SELF}/index.html`), { ASSETS: { fetch: assets } })).text()).toBe('app');
    expect((await worker.fetch(new Request(`${SELF}/api/other`), { ASSETS: { fetch: assets } })).status).toBe(404);
    expect((await worker.fetch(call(null, { method: 'GET' }), {})).status).toBe(405);
  });

  it('isPublicUrl keeps ordinary sites', () => {
    for (const u of ['https://www.theguardian.com/world/x', 'http://example.org/', 'https://8.8.8.8/', 'https://[2606:4700::1111]/']) {
      expect([u, isPublicUrl(new URL(u), 'spotlight.example')]).toEqual([u, true]);
    }
  });
});

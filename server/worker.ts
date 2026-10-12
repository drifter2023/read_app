// Cloudflare Worker for the mobile web build (docs/plans/2026-10-12-link-import.md, L-01).
// Static files are served by the assets binding; this script runs only for /api/* and does one
// thing: fetch a public web page for the app's own link import. It never logs or stores the URL.

export interface RateLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }
export interface Env {
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** Workers Rate Limiting binding (wrangler.jsonc → ratelimits); absent on the Vite dev server. */
  FETCH_LIMIT?: RateLimiter;
}

export type FetchErrorCode =
  | 'method' | 'origin' | 'bad_request' | 'bad_url' | 'blocked_url' | 'rate_limited'
  | 'timeout' | 'unreachable' | 'upstream_status' | 'not_html' | 'too_large' | 'too_many_redirects';

export const MAX_BYTES = 3 * 1024 * 1024;
export const TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 5;
const MAX_BODY = 4096;
const TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;
// Many sites turn away unknown clients; ask as Safari on an iPhone would.
const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === '/api/fetch') return handleFetch(req, env);
    if (path.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
  },
};

/** `POST /api/fetch {url}` → the page's bytes with its own Content-Type, or `{error}`. */
export async function handleFetch(req: Request, env: Env, upstream: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'POST') return fail('method', 405);
  const self = new URL(req.url);
  if (req.headers.get('Origin') !== self.origin) return fail('origin', 403);

  let target: URL;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail('bad_request', 400);
    const url = (JSON.parse(text) as { url?: unknown }).url;
    if (typeof url !== 'string') return fail('bad_request', 400);
    target = new URL(url);
  } catch {
    return fail('bad_url', 400);
  }
  if (!isPublicUrl(target, self.hostname)) return fail('blocked_url', 400);

  if (env.FETCH_LIMIT) {
    const key = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await env.FETCH_LIMIT.limit({ key })).success) return fail('rate_limited', 429);
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await upstream(target.href, { headers: UPSTREAM_HEADERS, redirect: 'manual', signal });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('Location') : null;
      if (!next) break;
      await res.body?.cancel();
      try { target = new URL(next, target); } catch { return fail('bad_url', 502); }
      if (!isPublicUrl(target, self.hostname)) return fail('blocked_url', 502);
      res = null;
    }
    if (!res) return fail('too_many_redirects', 502);
    if (!res.ok) { await res.body?.cancel(); return fail('upstream_status', 502, { status: res.status }); }
    const type = res.headers.get('Content-Type') ?? 'text/html';
    if (!TYPES.test(type)) { await res.body?.cancel(); return fail('not_html', 415); }
    const length = Number(res.headers.get('Content-Length') ?? 0);
    if (length > MAX_BYTES) { await res.body?.cancel(); return fail('too_large', 413); }
    const bytes = await readCapped(res, MAX_BYTES);
    if (!bytes) return fail('too_large', 413);
    return new Response(bytes, {
      headers: { 'Content-Type': type, 'X-Final-Url': target.href, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return (e as Error)?.name === 'TimeoutError' || signal.aborted ? fail('timeout', 504) : fail('unreachable', 502);
  }
}

/** Public http(s) only: no credentials, default ports, no private or loopback addresses, not ourselves. */
export function isPublicUrl(u: URL, selfHost: string): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === selfHost.toLowerCase()) return false;
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return false;
  if (host.startsWith('[')) return isPublicIpv6(host.slice(1, -1));
  if (/^[\d.]+$/.test(host)) return isPublicIpv4(host);
  return host.includes('.');
}

function isPublicIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)));
}

function isPublicIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPublicIpv4(mapped[1]!);
  if (v.startsWith('::ffff:')) return false;
  return !/^(f[c-d]|fe[89ab])/.test(v);
}

async function readCapped(res: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

function fail(error: FetchErrorCode, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * DeepSeek chat API, called straight from the app: CORS allows the web origin and
 * capacitor://localhost, so web and iOS share this fetch-based client and both can stream.
 * The only runtime network access in Spotlight (CLAUDE.md → Scope guard).
 */
export const DEEPSEEK = 'https://api.deepseek.com';
/** DeepSeek-V4.1-Flash. */
export const MODEL = 'deepseek-flash';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type AiErrorKind = 'no-key' | 'invalid-key' | 'no-balance' | 'rate-limit' | 'server' | 'network' | 'timeout' | 'bad-answer';

/** A failure the drawer can explain. Messages are fixed text: never the server's, which may echo the key. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  constructor(kind: AiErrorKind) {
    super(`DeepSeek: ${kind}`);
    this.name = 'AiError';
    this.kind = kind;
  }
}

export interface ChatRequest {
  key: string; system: string; user: string; maxTokens: number; temperature: number; signal?: AbortSignal;
}
/** `length`: the token limit cut the answer. */
export interface ChatResult { finish: 'stop' | 'length' | 'other' }

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });
const defaultFetch: Fetch = (url, init) => fetch(url, init);

/** Checks a key without spending tokens: `GET /models`. */
export async function checkKey(key: string, f: Fetch = defaultFetch): Promise<'ok' | 'invalid' | 'network'> {
  try {
    const res = await f(`${DEEPSEEK}/models`, { headers: auth(key) });
    if (res.ok) return 'ok';
    return res.status === 401 || res.status === 403 ? 'invalid' : 'network';
  } catch {
    return 'network';
  }
}

function httpError(status: number): AiError {
  if (status === 401 || status === 403) return new AiError('invalid-key');
  if (status === 402) return new AiError('no-balance');
  if (status === 429) return new AiError('rate-limit');
  return new AiError('server');
}

/**
 * Streams one chat completion, calling `onText` with each piece of content as it arrives
 * (server-sent events: `data: {json}` lines, `: comment` keep-alives, `data: [DONE]`).
 * Thinking is off so the first content token comes as early as possible.
 */
export async function streamChat(req: ChatRequest, onText: (text: string) => void, f: Fetch = defaultFetch): Promise<ChatResult> {
  const failed = (e: unknown): AiError => {
    if (e instanceof AiError) return e;
    if (req.signal?.aborted) return req.signal.reason instanceof AiError ? req.signal.reason : new AiError('timeout');
    return new AiError('network');
  };
  let res: Response;
  try {
    res = await f(`${DEEPSEEK}/chat/completions`, {
      method: 'POST',
      headers: { ...auth(req.key), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        model: MODEL, stream: true, thinking: { type: 'disabled' }, max_tokens: req.maxTokens, temperature: req.temperature,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      }),
      signal: req.signal,
    });
  } catch (e) {
    throw failed(e);
  }
  if (!res.ok) throw httpError(res.status);
  if (!res.body) throw new AiError('server');

  const reader = res.body.getReader();
  // A timeout aborts the request; also stop a read that is waiting on a stalled stream.
  req.signal?.addEventListener('abort', () => { reader.cancel().catch(() => {}); }, { once: true });
  const decoder = new TextDecoder();
  let buf = '';
  let finish: ChatResult['finish'] = 'other';
  const line = (raw: string): boolean => {
    const l = raw.replace(/\r$/, '');
    if (!l.startsWith('data:')) return false; // blank separators and ": keep-alive" comments
    const data = l.slice(5).trim();
    if (data === '[DONE]') return true;
    let chunk: { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] };
    try { chunk = JSON.parse(data) as typeof chunk; } catch { throw new AiError('server'); }
    const c = chunk.choices?.[0];
    if (c?.delta?.content) onText(c.delta.content);
    if (c?.finish_reason) finish = c.finish_reason === 'stop' ? 'stop' : c.finish_reason === 'length' ? 'length' : 'other';
    return false;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buf += decoder.decode(value, { stream: !done }); // `stream` keeps a character split across chunks whole
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        if (line(buf.slice(0, nl))) { await reader.cancel().catch(() => {}); return { finish }; }
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
      }
      if (done) break;
    }
    if (req.signal?.aborted) throw failed(req.signal.reason);
    if (buf && line(buf)) return { finish };
  } catch (e) {
    throw failed(e);
  }
  return { finish };
}

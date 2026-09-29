/** The text of a DeepSeek streaming response carrying these content pieces. */
export function sseText(pieces: string[], finish = 'stop'): string {
  return [
    ': keep-alive\n\n',
    ...pieces.map((c) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c }, finish_reason: null }] })}\r\n\r\n`),
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '' }, finish_reason: finish }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
}

/** The same as a byte stream cut into `size`-byte chunks (so cuts land inside lines and characters). */
export function sse(pieces: string[], finish = 'stop', size = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(sseText(pieces, finish));
  let at = 0;
  return new ReadableStream({
    pull(c) {
      if (at >= bytes.length) { c.close(); return; }
      c.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

/** A stream that sends `first` and then nothing more, until cancelled. */
export function stalled(first: string[]): ReadableStream<Uint8Array> {
  const head = new TextEncoder().encode(sseText(first).split('data: {"choices":[{"index":0,"delta":{"content":""}')[0]!);
  let sent = false;
  return new ReadableStream({
    pull(c) {
      if (!sent) { sent = true; c.enqueue(head); return; }
      return new Promise<void>(() => {}); // never
    },
  });
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import worker from '../server/worker.ts';

/** Mounts the Cloudflare Worker's /api routes on the Vite dev and preview servers (L-01). */
export function workerApi(): Plugin {
  const mount = (mw: Connect.Server): void => {
    mw.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      void serve(req, res).catch(next);
    });
  };
  return { name: 'spotlight-worker-api', configureServer: (s) => mount(s.middlewares), configurePreviewServer: (s) => mount(s.middlewares) };
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const out = await worker.fetch(request, {});
  res.statusCode = out.status;
  out.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await out.arrayBuffer()));
}

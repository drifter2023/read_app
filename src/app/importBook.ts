import type { Db } from '../core/db/types.ts';
import type { CoverImage } from '../core/ingest/epub.ts';
import type { ImportMessage, ImportRequest } from '../core/ingest/worker.ts';
import { fetchErrorMessage, linkFrom } from '../core/ingest/link.ts';
import { findDuplicate, saveParsedBook } from '../core/library/library.ts';

export interface ImportProgress { done: number; total: number }
export interface ImportResult { id: string; title: string; duplicate: boolean }

/** Thrown with a message that can be shown to the user as-is. */
export class ImportError extends Error {}

/**
 * H-03: file → Worker parse → one transaction into user.db. A book already on the shelf (same
 * title and author) is not imported twice; its id comes back with `duplicate: true`.
 */
export async function importFile(db: Db, file: File, onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  const bytes = await file.arrayBuffer();
  return save(db, await parse({ id: newId(), name: file.name, bytes }, onProgress));
}

/** What a link import is doing, for the progress sheet (L-03). */
export type LinkStage = 'fetch' | 'parse';

/**
 * L-03: pasted text → the link in it → our Worker fetches the page (`POST /api/fetch`, L-01) →
 * the import Worker extracts the article (L-02) → saved like any book.
 */
export async function importLink(db: Db, input: string, onStage?: (s: LinkStage) => void): Promise<ImportResult> {
  const url = linkFrom(input);
  if (!url) throw new ImportError('请粘贴一个网页链接（以 http:// 或 https:// 开头）');
  onStage?.('fetch');
  let res: Response;
  try {
    res = await fetch(new URL('api/fetch', document.baseURI), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    });
  } catch {
    throw new ImportError('网络连接失败，请检查网络后再试');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; status?: number };
    throw new ImportError(fetchErrorMessage(body.error, body.status));
  }
  const bytes = await res.arrayBuffer();
  onStage?.('parse');
  const web = { url: res.headers.get('X-Final-Url') ?? url, contentType: res.headers.get('Content-Type') ?? 'text/html' };
  return save(db, await parse({ id: newId(), name: url, bytes, web }));
}

const newId = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function parse(req: ImportRequest, onProgress?: (p: ImportProgress) => void): Promise<Extract<ImportMessage, { type: 'done' }>> {
  const worker = new Worker(new URL('../core/ingest/worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Extract<ImportMessage, { type: 'done' }>>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ImportMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.({ done: m.done, total: m.total });
      else if (m.type === 'done') resolve(m);
      else reject(new ImportError(m.message));
    };
    worker.onerror = () => reject(new ImportError(req.web ? '导入失败：无法解析这个网页' : '导入失败：无法读取这个文件'));
    worker.postMessage(req, [req.bytes]);
  }).finally(() => worker.terminate());
}

/** A book already on the shelf (same title and author) is not imported twice. */
async function save(db: Db, done: Extract<ImportMessage, { type: 'done' }>): Promise<ImportResult> {
  const { book, format, coverImage } = done;
  const dup = await findDuplicate(db, book.title, book.author);
  if (dup) return { id: dup, title: book.title, duplicate: true };
  const cover = coverImage ? await shrinkCover(coverImage).catch(() => null) : null;
  await saveParsedBook(db, { ...book, cover }, format, Date.now());
  return { id: book.id, title: book.title, duplicate: false };
}

/** EPUB covers can be several MB; keep a 360px JPEG data URL (the web db is saved whole to IndexedDB). */
async function shrinkCover(c: CoverImage): Promise<string> {
  const bmp = await createImageBitmap(new Blob([c.bytes as BlobPart], { type: c.mime }));
  const w = Math.min(360, bmp.width);
  const h = Math.round((bmp.height * w) / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

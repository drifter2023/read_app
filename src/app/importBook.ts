import type { Db } from '../core/db/types.ts';
import type { CoverImage } from '../core/ingest/epub.ts';
import type { ImportMessage, ImportRequest } from '../core/ingest/worker.ts';
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
  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const worker = new Worker(new URL('../core/ingest/worker.ts', import.meta.url), { type: 'module' });
  const done = await new Promise<Extract<ImportMessage, { type: 'done' }>>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ImportMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.({ done: m.done, total: m.total });
      else if (m.type === 'done') resolve(m);
      else reject(new ImportError(m.message));
    };
    worker.onerror = () => reject(new ImportError('导入失败：无法读取这个文件'));
    worker.postMessage({ id, name: file.name, bytes } satisfies ImportRequest, [bytes]);
  }).finally(() => worker.terminate());

  const { book, format, coverImage } = done;
  const dup = await findDuplicate(db, book.title, book.author);
  if (dup) return { id: dup, title: book.title, duplicate: true };
  const cover = coverImage ? await shrinkCover(coverImage).catch(() => null) : null;
  await saveParsedBook(db, { ...book, cover }, format, Date.now());
  return { id, title: book.title, duplicate: false };
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

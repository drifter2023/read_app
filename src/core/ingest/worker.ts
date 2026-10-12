/// <reference lib="webworker" />
// Import runs here so parsing never blocks the UI thread (CLAUDE.md → Stack).
import type { BookFormat, ParsedBook } from '../types.ts';
import { parseArticle } from './article.ts';
import { EpubError, parseEpub, type CoverImage } from './epub.ts';
import { parseTxt } from './txt.ts';

/** A file, or a fetched web page (`web`: where it ended up and its Content-Type, L-02). */
export interface ImportRequest { id: string; name: string; bytes: ArrayBuffer; web?: { url: string; contentType: string } }
export type ImportMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; book: ParsedBook; format: BookFormat; coverImage?: CoverImage }
  | { type: 'error'; message: string };

declare const self: DedicatedWorkerGlobalScope;
const post = (m: ImportMessage, transfer: Transferable[] = []) => self.postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<ImportRequest>) => {
  const { id, name, bytes, web } = e.data;
  try {
    if (web) {
      post({ type: 'done', book: parseArticle(bytes, web.contentType, web.url, id), format: 'web' });
      return;
    }
    const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    if (/\.epub$/i.test(name) || isZip) {
      const { coverImage, ...book } = await parseEpub(bytes, id, (done, total) => post({ type: 'progress', done, total }));
      post({ type: 'done', book, format: 'epub', coverImage }, coverImage ? [coverImage.bytes.buffer as ArrayBuffer] : []);
    } else if (/\.(txt|text)$/i.test(name)) {
      post({ type: 'done', book: parseTxt(bytes, id, name), format: 'txt' });
    } else {
      post({ type: 'error', message: '只支持 EPUB 和 TXT 格式的书' });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof EpubError ? err.message : '导入失败：文件可能已损坏' });
  }
};

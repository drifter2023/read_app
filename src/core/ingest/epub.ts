import JSZip from 'jszip';
import { DOMParser } from 'linkedom';
import type { ParsedBook, ParsedChapter } from '../types.ts';
import { countWords, normaliseText, splitSentences } from './text.ts';

/** Thrown with a message that can be shown to the user as-is. */
export class EpubError extends Error {}

const SKIP = /\b(frontmatter|backmatter|titlepage|halftitlepage|imprint|colophon|copyright-page|toc|dedication|epigraph|loi|endnotes)\b/;
const ROMAN = /^[IVXLCDM]+$/;

/** The EPUB's own cover image, if it declares one (EPUB 3 `cover-image` or EPUB 2 `<meta name="cover">`). */
export interface CoverImage { bytes: Uint8Array; mime: string }

export async function parseEpub(
  bytes: Uint8Array | ArrayBuffer, id: string, onProgress?: (done: number, total: number) => void,
): Promise<ParsedBook & { coverImage?: CoverImage }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new EpubError('这不是有效的 EPUB 文件');
  }
  const container = await readText(zip, 'META-INF/container.xml');
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) throw new EpubError('EPUB 缺少目录文件（container.xml）');
  if (await hasDrm(zip)) throw new EpubError('这本书有 DRM 加密，无法导入');

  const opf = parse(await readText(zip, opfPath), 'text/xml');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, string>();
  let coverPath: string | undefined;
  let coverMime = '';
  const coverId = Array.from(opf.querySelectorAll('meta')).find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  for (const item of Array.from(opf.querySelectorAll('item'))) {
    const itemId = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (!itemId || !href) continue;
    manifest.set(itemId, resolvePath(base, href));
    const mime = item.getAttribute('media-type') ?? '';
    const isCover = /\bcover-image\b/.test(item.getAttribute('properties') ?? '') || itemId === coverId;
    if (isCover && /^image\/(jpeg|png|gif|webp)$/.test(mime) && !coverPath) { coverPath = resolvePath(base, href); coverMime = mime; }
  }

  const chapters: ParsedChapter[] = [];
  const spine = Array.from(opf.querySelectorAll('itemref'));
  for (const [i, ref] of spine.entries()) {
    onProgress?.(i, spine.length);
    const path = manifest.get(ref.getAttribute('idref') ?? '');
    if (!path || !zip.file(path)) continue;
    const ch = readChapter(parse(await readText(zip, path), 'text/html'));
    if (ch) chapters.push(ch);
  }
  if (chapters.length === 0) throw new EpubError('这本 EPUB 里没有找到正文');

  const coverFile = coverPath ? zip.file(coverPath) : null;
  const coverImage = coverFile ? { bytes: await coverFile.async('uint8array'), mime: coverMime } : undefined;
  return {
    id,
    title: normaliseText(tagText(opf, 'dc:title')) || id,
    author: normaliseText(tagText(opf, 'dc:creator')),
    chapters,
    wordCount: chapters.reduce((n, c) => n + c.wordCount, 0),
    ...(coverImage ? { coverImage } : {}),
  };
}

function readChapter(doc: Document): ParsedChapter | null {
  const body = doc.querySelector('body');
  if (!body) return null;
  const section = body.querySelector('section, article');
  const types = `${body.getAttribute('epub:type') ?? ''} ${section?.getAttribute('epub:type') ?? ''}`;
  if (SKIP.test(types)) return null;

  for (const br of Array.from(body.querySelectorAll('br'))) br.parentNode?.replaceChild(doc.createTextNode(' '), br);
  const paras = Array.from(body.querySelectorAll('p'))
    .filter((p) => !p.closest('hgroup, header, figcaption, nav'))
    .map((p) => normaliseText(p.textContent ?? ''))
    .filter((t) => t.length > 0)
    .map(splitSentences);
  if (paras.length === 0) return null;

  return { title: chapterTitle(doc), paras, wordCount: paras.reduce((n, p) => n + countWords(p.join(' ')), 0) };
}

function chapterTitle(doc: Document): string {
  const head = normaliseText(doc.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '');
  const sub = Array.from(doc.querySelectorAll('hgroup p'))
    .map((p) => normaliseText(p.textContent ?? ''))
    .filter(Boolean)
    .join(' ');
  const main = ROMAN.test(head) ? `Chapter ${head}` : head || normaliseText(doc.querySelector('title')?.textContent ?? '');
  return sub ? `${main} · ${sub}` : main;
}

async function hasDrm(zip: JSZip): Promise<boolean> {
  const f = zip.file('META-INF/encryption.xml');
  if (!f) return false;
  // Font obfuscation also uses encryption.xml; only encrypted text documents mean DRM.
  return /URI="[^"]+\.x?html?"/i.test(await f.async('string'));
}

async function readText(zip: JSZip, path: string): Promise<string> {
  const f = zip.file(path);
  if (!f) throw new EpubError(`EPUB 缺少文件：${path}`);
  return f.async('string');
}

function parse(src: string, type: 'text/xml' | 'text/html'): Document {
  return new DOMParser().parseFromString(src, type) as unknown as Document;
}

function tagText(doc: Document, qualifiedName: string): string {
  // linkedom's getElementsByTagName('*') is empty for XML documents; querySelectorAll('*') is not.
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (el.tagName === qualifiedName || el.localName === qualifiedName) return el.textContent ?? '';
  }
  return '';
}

function resolvePath(base: string, href: string): string {
  const parts = (base + decodeURIComponent(href.split('#')[0] ?? '')).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

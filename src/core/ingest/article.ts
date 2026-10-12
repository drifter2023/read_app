import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { Paragraph, ParsedBook } from '../types.ts';
import { EpubError } from './epub.ts';
import { countWords, normaliseText, splitSentences } from './text.ts';
import { parseTxt } from './txt.ts';

/** Thrown with a message that can be shown to the user as-is. */
export class ArticleError extends EpubError {}

/** Fewer words than this is not an article (a login wall, a cookie page, a video page). */
export const MIN_WORDS = 30;

const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TBODY', 'THEAD', 'TR', 'HR', 'DETAILS', 'SUMMARY',
]);
const SKIP = new Set(['FIGURE', 'FIGCAPTION', 'PICTURE', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'SUP', 'BUTTON', 'FORM']);

/**
 * A fetched web page → a one-chapter book (L-02). `contentType` is the page's own header (for the
 * charset); `url` is where the page ended up (for the author fallback).
 */
export function parseArticle(bytes: Uint8Array | ArrayBuffer, contentType: string, url: string, id: string): ParsedBook {
  const host = hostOf(url);
  if (/^text\/plain\b/i.test(contentType)) return parseTxt(bytes, id, host);

  const html = decodeHtml(bytes, contentType);
  if (!/<(body|p|div|article)\b/i.test(html)) throw new ArticleError('这个页面里没有找到文章正文');
  const { document } = parseHTML(html);
  const doc = document as unknown as Document;
  const named = pageTitle(doc);
  let article: ReturnType<Readability<Element>['parse']>;
  try {
    article = new Readability<Element>(doc, { serializer: (n) => n as Element }).parse();
  } catch {
    article = null;
  }
  if (!article?.content) throw new ArticleError('这个页面里没有找到文章正文');

  const title = named || normaliseText(article.title ?? '') || host || '未命名文章';
  const author = authorOf(article.byline, article.siteName, host);
  const byline = new Set([normaliseText(article.byline ?? ''), `By ${author}`, `by ${author}`]);
  const paras = blocks(article.content)
    .filter((t, i) => !(i === 0 && t === title) && !byline.has(t))
    .map(splitSentences);
  const wordCount = paras.reduce((n, p) => n + countWords(p.join(' ')), 0);
  if (wordCount < MIN_WORDS) throw new ArticleError('这个页面里没有找到文章正文（可能需要登录，或者正文要靠脚本加载）');

  return { id, title, author, chapters: [{ title, paras, wordCount }], wordCount };
}

/** Page bytes → text: the header's charset, else a `<meta>` charset near the top, else UTF-8. */
export function decodeHtml(bytes: Uint8Array | ArrayBuffer, contentType: string): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder('latin1').decode(view.subarray(0, 4096));
  const label = charsetOf(contentType) ?? /<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(head)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(label).decode(view);
  } catch {
    return new TextDecoder('utf-8').decode(view);
  }
}

function charsetOf(contentType: string): string | null {
  return /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType)?.[1] ?? null;
}

/** The text blocks of Readability's content in document order; a block inside a block is its own paragraph. */
function blocks(root: Element): string[] {
  const out: string[] = [];
  let run = '';
  const flush = () => {
    const t = normaliseText(run);
    if (t) out.push(t);
    run = '';
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) { run += child.textContent ?? ''; continue; }
      if (child.nodeType !== 1) continue;
      const tag = (child as Element).tagName.toUpperCase();
      if (SKIP.has(tag)) continue;
      if (tag === 'BR') { run += ' '; continue; }
      if (tag === 'TD' || tag === 'TH') { run += ' '; walk(child); run += ' '; continue; }
      if (BLOCK.has(tag)) { flush(); walk(child); flush(); } else walk(child);
    }
  };
  walk(root);
  flush();
  return out;
}

/** og:title, else the page's only h1 when the <title> starts with it (titles carry " | Site Name"). */
function pageTitle(doc: Document): string {
  const og = normaliseText(doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '');
  if (og) return og;
  const h1s = Array.from(doc.querySelectorAll('h1'));
  const h1 = h1s.length === 1 ? normaliseText(h1s[0]!.textContent ?? '') : '';
  const head = normaliseText(doc.querySelector('title')?.textContent ?? '');
  return h1 && head.startsWith(h1) ? h1 : '';
}

function authorOf(byline: string | null | undefined, siteName: string | null | undefined, host: string): string {
  const b = normaliseText(byline ?? '').replace(/^by\s+/i, '');
  if (b && b.length <= 60) return b;
  return normaliseText(siteName ?? '') || host;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

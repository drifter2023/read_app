# Link import (M9)

Owner request 2026-10-12: in Import, paste a link; the app fetches the page, keeps the article and opens it like any book. The owner chose a Cloudflare Worker fetch (see the conversation: a browser page cannot read other sites because of CORS, and the owner preferred a server fetch to pasting text or a bookmarklet). Web build first; iOS later.

## Flow

```
Home · + 导入 → sheet: 文件 / 链接
  链接 → paste → POST /api/fetch {url}         (our Worker, same origin)
       Worker: check URL → fetch (≤ 5 redirects, each re-checked) → ≤ 3 MB HTML/text → bytes
  → import Worker: decode charset → Readability (on linkedom) → paragraphs → sentences
  → saveParsedBook(format 'web')  → open from the shelf like a file import
```

After the import the article is a book in `user.db`: it reads offline, has footnotes, grammar and the Agent drawer like any other book.

## Worker (`server/worker.ts`)

The Worker runs only for `/api/*` (`assets.run_worker_first`); every other path is still the static app.

- `POST /api/fetch`, JSON body `{ url }` (≤ 4 KB). The URL is never put in a query string, logged or stored.
- Same origin only: the request's `Origin` must equal the Worker's own origin.
- URL rules: `http`/`https`, no user:password, default ports only; no IP literals in private, loopback or link-local ranges, no `localhost`, `.local`, `.internal`, and not the Worker's own host.
- Redirects are followed by hand, at most 5, and every hop is checked by the same rules.
- 10 s timeout; body cut off at 3 MB; only `text/html`, `application/xhtml+xml` and `text/plain`.
- Per-IP rate limit (Workers Rate Limiting binding, 20 per minute).
- Reply: the page bytes with the page's own `Content-Type` and `X-Final-Url`, `Cache-Control: no-store`. Errors: JSON `{ error }` with a code the app maps to a Chinese message.

`vite.config.ts` mounts the same handler on the dev and preview servers so the feature works locally.

## Article extraction (`src/core/ingest/article.ts`)

- Charset: `Content-Type` charset, else `<meta charset>` / `http-equiv` in the first 4 KB, else UTF-8.
- `text/plain` pages go through the TXT importer.
- HTML: Readability (Mozilla, Apache-2.0) on a linkedom document. Title: Readability title. Author: byline, else site name, else host name.
- Paragraphs: the blocks of Readability's content (`p`, `li`, `blockquote`, `pre`, `h1`–`h6`, `dd`) in document order, nested blocks not counted twice; each split into sentences. One chapter, titled with the article title.
- No article, or fewer than 30 words: an error the user can read.

## Acceptance

| ID | Check |
|---|---|
| **L-01** | The Worker fetches only for its own origin, only public http(s) URLs (every redirect hop too), within 10 s and 3 MB, only HTML or text; rate-limited; nothing about the URL is logged or cached. |
| **L-02** | A news-style page becomes title + author + paragraphs, without navigation, ads or comments; non-UTF-8 pages decode correctly; a page without an article gives a plain error. |
| **L-03** | `+ 导入` offers 文件 and 链接. A pasted link (alone or inside shared text) imports with 抓取中 → 解析中 and opens the article; the same article twice opens the existing book; every failure shows a Chinese reason. Web only for now; iOS keeps the file picker. |
| **L-04** | Once imported, the article opens and reads with the network off. |

## Not in this version

iOS (Capacitor native fetch, later), images, multi-page articles, pages that need JavaScript to show text, paywalled pages.

import { describe, expect, it } from 'vitest';
import { ArticleError, decodeHtml, parseArticle } from '../../src/core/ingest/article.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const story = [
  'The harbour was quiet when the first boats came back, and the gulls followed them in low over the water.',
  'Nobody on the quay said much. They had all heard the forecast, and they had all decided to go out anyway.',
  'By noon the wind had turned, and the old men who sat by the chandlery began, one by one, to go home.',
  'What follows is the account of the three crews who stayed out past dark, as they told it the next morning.',
];
const NEWS = `<!doctype html><html><head><title>Storm at the Harbour | The Coastal Times</title>
<meta property="og:site_name" content="The Coastal Times"><meta name="author" content="Jane Doe"></head><body>
<nav><ul><li><a href="/">Home</a></li><li><a href="/world">World</a></li><li><a href="/sport">Sport</a></li></ul></nav>
<div class="promo-banner">Buy one get one free! Subscribe now for unlimited access.</div>
<main><article>
  <h1>Storm at the Harbour</h1>
  <p class="byline">By Jane Doe</p>
  ${story.map((s) => `<p>${s} ${s}</p>`).join('\n')}
  <figure><img src="a.jpg"><figcaption>Boats in the harbour at dawn.</figcaption></figure>
  <h2>The long night</h2>
  <blockquote><p>We could not see the lights.</p></blockquote>
  <ul><li>First, the radio went quiet.</li><li>Then the engine stopped.</li></ul>
  <p>It was, as one of them put it, a night to remember<sup>1</sup>, and they will tell it for years.</p>
</article></main>
<section class="comments"><h3>Comments</h3><p>great article!!!</p></section>
<footer>© The Coastal Times. All rights reserved.</footer></body></html>`;

describe('article extraction (L-02)', () => {
  const book = parseArticle(enc(NEWS), 'text/html; charset=utf-8', 'https://www.coastaltimes.example/2026/storm', 'w1');
  const text = book.chapters.flatMap((c) => c.paras.map((p) => p.join(' ')));

  it('keeps title, author and the article paragraphs as one chapter', () => {
    expect(book.title).toBe('Storm at the Harbour');
    expect(book.author).toBe('Jane Doe');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe(book.title);
    expect(text[0]).toBe(`${story[0]} ${story[0]}`);
    expect(book.chapters[0]!.paras[0]).toEqual([story[0], story[0]]);
    expect(text).toContain('The long night');
    expect(text).toContain('We could not see the lights.');
    expect(text).toContain('First, the radio went quiet.');
    expect(text).toContain('Then the engine stopped.');
    expect(text.at(-1)).toBe('It was, as one of them put it, a night to remember, and they will tell it for years.');
    expect(book.wordCount).toBeGreaterThan(150);
  });

  it('drops navigation, ads, captions, comments and the footer', () => {
    const all = text.join('\n');
    for (const junk of ['Home', 'Subscribe now', 'Boats in the harbour at dawn', 'great article', 'All rights reserved', 'By Jane Doe']) {
      expect(all).not.toContain(junk);
    }
  });

  it('falls back to the site name, then the host, for the author', () => {
    const noByline = NEWS.replace('<p class="byline">By Jane Doe</p>', '').replace('<meta name="author" content="Jane Doe">', '');
    expect(parseArticle(enc(noByline), 'text/html', 'https://www.coastaltimes.example/x', 'w2').author).toBe('The Coastal Times');
    const bare = noByline.replace('<meta property="og:site_name" content="The Coastal Times">', '');
    expect(parseArticle(enc(bare), 'text/html', 'https://www.coastaltimes.example/x', 'w3').author).toBe('coastaltimes.example');
  });

  it('decodes the charset from the header or from <meta>', () => {
    const latin = Uint8Array.from('<p>café — naïve</p>', (c) => c.charCodeAt(0) <= 255 ? c.charCodeAt(0) : 0x97);
    expect(decodeHtml(latin, 'text/html; charset=windows-1252')).toBe('<p>café — naïve</p>');
    const meta = Uint8Array.from('<meta charset="iso-8859-1"><p>café</p>', (c) => c.charCodeAt(0));
    expect(decodeHtml(meta, 'text/html')).toContain('café');
    expect(decodeHtml(enc('<p>café</p>'), 'text/html')).toBe('<p>café</p>');
    expect(decodeHtml(enc('<p>café</p>'), 'text/html; charset=bogus-charset')).toBe('<p>café</p>');
  });

  it('imports a text/plain page through the TXT importer', () => {
    const txt = parseArticle(enc(story.join('\n\n')), 'text/plain; charset=utf-8', 'https://example.org/notes.txt', 'w4');
    expect(txt.chapters[0]!.paras).toHaveLength(4);
  });

  it('a page with no article is a plain error', () => {
    const empty = '<html><head><title>Sign in</title></head><body><form><input name="u"><button>Sign in</button></form><p>Please sign in.</p></body></html>';
    expect(() => parseArticle(enc(empty), 'text/html', 'https://example.org/', 'w5')).toThrow(ArticleError);
    expect(() => parseArticle(enc(''), 'text/html', 'https://example.org/', 'w6')).toThrow(/没有找到文章正文/);
  });
});

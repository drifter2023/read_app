import { describe, expect, it } from 'vitest';
import { fetchErrorMessage, linkFrom } from '../../src/core/ingest/link.ts';

describe('pasted links (L-03)', () => {
  it('finds the link in a bare URL, shared text, or a bare domain path', () => {
    expect(linkFrom('https://example.org/a?b=1#c')).toBe('https://example.org/a?b=1#c');
    expect(linkFrom('  How to Do Great Work https://paulgraham.com/greatwork.html  ')).toBe('https://paulgraham.com/greatwork.html');
    expect(linkFrom('看看这篇：https://example.org/story，写得很好。')).toBe('https://example.org/story');
    expect(linkFrom('(see https://example.org/x).')).toBe('https://example.org/x');
    expect(linkFrom('example.org/story')).toBe('https://example.org/story');
    expect(linkFrom('HTTP://EXAMPLE.ORG/A')).toBe('http://example.org/A');
  });

  it('is null when there is no web link', () => {
    for (const t of ['', '这不是链接', 'hello world', 'ftp://example.org/f', 'javascript:alert(1)', 'mailto:a@b.c']) expect(linkFrom(t)).toBeNull();
  });

  it('every Worker error code has a Chinese message', () => {
    for (const code of ['bad_url', 'blocked_url', 'rate_limited', 'timeout', 'not_html', 'too_large', 'too_many_redirects', 'unreachable', undefined]) {
      expect(fetchErrorMessage(code)).toMatch(/[一-鿿]/);
    }
    expect(fetchErrorMessage('upstream_status', 403)).toContain('不允许抓取');
    expect(fetchErrorMessage('upstream_status', 404)).toContain('不存在');
    expect(fetchErrorMessage('upstream_status', 500)).toContain('500');
  });
});

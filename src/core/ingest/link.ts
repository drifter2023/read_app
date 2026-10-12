import type { FetchErrorCode } from '../../../server/worker.ts';

/**
 * The link in what the reader pasted (L-03): a bare URL, a URL inside shared text ("Title — https://…"),
 * or a bare domain path ("example.com/story"). Null if there is none.
 */
export function linkFrom(input: string): string | null {
  const text = input.trim();
  const found = /https?:\/\/[^\s<>"'，。、；）】」]+/i.exec(text)?.[0];
  const candidate = found ?? (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? `https://${text}` : null);
  if (!candidate) return null;
  try {
    const u = new URL(trimTrailing(candidate));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Drops sentence punctuation after a link, and a closing bracket only when the link did not open it (Focus_(optics)). */
function trimTrailing(url: string): string {
  let u = url;
  for (;;) {
    const last = u.at(-1);
    if (last && '.,;:!?'.includes(last)) u = u.slice(0, -1);
    else if (last === ')' && count(u, ')') > count(u, '(')) u = u.slice(0, -1);
    else if (last === ']' && count(u, ']') > count(u, '[')) u = u.slice(0, -1);
    else return u;
  }
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** What to tell the reader when the Worker could not fetch the page. */
export function fetchErrorMessage(code: FetchErrorCode | string | undefined, status?: number): string {
  switch (code) {
    case 'bad_url': case 'bad_request': return '这个链接无法识别，请检查后再试';
    case 'blocked_url': return '只能导入公开网站上的文章';
    case 'rate_limited': return '导入太频繁了，请过一分钟再试';
    case 'timeout': return '这个网站响应太慢，请稍后再试';
    case 'not_html': return '这个链接不是网页文章（比如 PDF 或图片），无法导入';
    case 'too_large': return '这个网页太大了（超过 3 MB），无法导入';
    case 'too_many_redirects': return '这个链接跳转次数太多，无法打开';
    case 'upstream_status':
      if (status === 401 || status === 403) return '这个网站不允许抓取（或需要登录、订阅），可以换一个链接试试';
      if (status === 404 || status === 410) return '这个页面不存在了，请检查链接';
      return `这个网站暂时打不开（${status ?? '错误'}），请稍后再试`;
    case 'unreachable': return '连不上这个网站，请检查链接';
    default: return '导入失败，请稍后再试';
  }
}

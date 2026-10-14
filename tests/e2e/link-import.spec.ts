import { expect, test, type Page } from '@playwright/test';
import { fullTier, openFromHome, ready, tapTitle } from './helpers.ts';

// With the offline service worker registered, page.route misses the page's requests.
test.use({ serviceWorkers: 'block' });

const ARTICLE = `<!doctype html><html><head><meta charset="utf-8"><title>The Quiet Harbour | Coastal Notes</title>
<meta property="og:site_name" content="Coastal Notes"></head><body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article><h1>The Quiet Harbour</h1>
${Array.from({ length: 6 }, (_, i) => `<p>Paragraph ${i + 1}: the boats came back one by one before dark, and the harbour master counted them twice before he went home to sleep.</p>`).join('\n')}
</article><footer>Subscribe to Coastal Notes</footer></body></html>`;

async function chooseLink(page: Page, text: string) {
  await page.getByRole('button', { name: '+ 导入' }).click();
  const dialog = page.getByRole('dialog', { name: '导入' });
  await dialog.getByPlaceholder('粘贴文章链接').fill(text);
  await dialog.getByRole('button', { name: '导入链接' }).click();
}

async function back(page: Page) {
  await tapTitle(page);
  await page.getByRole('button', { name: '‹ 书架' }).click();
  await expect(page.locator('.reader-layer')).toHaveCount(0);
  await expect(page.getByTestId('flight')).toHaveCount(0);
}

test('L-03/L-04: a pasted link imports through /api/fetch, opens, dedupes, and reads offline', async ({ page, context }) => {
  await fullTier(page);
  const bodies: string[] = [];
  await page.route('**/api/fetch', async (route) => {
    bodies.push(route.request().postData() ?? '');
    await page.waitForTimeout(150); // long enough to see 正在抓取网页
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Final-Url': 'https://coastal.example/harbour' }, body: ARTICLE });
  });
  await page.goto('/');

  await chooseLink(page, 'Read this: The Quiet Harbour https://coastal.example/harbour?ref=share');
  await expect(page.locator('.import-note')).toHaveText('正在抓取网页…');
  await ready(page);
  await expect(page.locator('.rd-line[data-p]').first()).toContainText('Paragraph 1: the boats came back');
  expect(bodies).toEqual([JSON.stringify({ url: 'https://coastal.example/harbour?ref=share' })]);
  expect(page.url()).not.toContain('coastal.example'); // the link never goes into our own URLs
  await back(page);
  const row = page.locator('.row', { hasText: 'The Quiet Harbour' });
  await expect(row.locator('.row-author')).toHaveText('Coastal Notes');

  await chooseLink(page, 'https://coastal.example/harbour');
  await ready(page);
  await back(page);
  await expect(page.locator('.row-title', { hasText: 'The Quiet Harbour' })).toHaveCount(1);

  await context.setOffline(true);
  await openFromHome(page, 'The Quiet Harbour');
  await expect(page.locator('.rd-line[data-p]').first()).toContainText('Paragraph 1');
  await context.setOffline(false);
});

test('L-03: link import failures are explained in Chinese; the file picker is still there', async ({ page }) => {
  await fullTier(page);
  await page.route('**/api/fetch', (route) => route.fulfill({ status: 502, json: { error: 'upstream_status', status: 403 } }));
  await page.goto('/');

  await chooseLink(page, '这不是链接');
  await expect(page.locator('.import-error')).toHaveText('请粘贴一个网页链接（以 http:// 或 https:// 开头）');
  await page.getByRole('button', { name: '好' }).click();

  await chooseLink(page, 'https://paywalled.example/story');
  await expect(page.locator('.import-error')).toHaveText('这个网站不允许抓取（或需要登录、订阅），可以换一个链接试试');
  await page.getByRole('button', { name: '好' }).click();

  await page.unroute('**/api/fetch');
  await page.route('**/api/fetch', (route) => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/html' }, body: '<html><body><p>Sign in.</p></body></html>' }));
  await chooseLink(page, 'https://login.example/');
  await expect(page.locator('.import-error')).toContainText('没有找到文章正文');
  await page.getByRole('button', { name: '好' }).click();

  await page.getByRole('button', { name: '+ 导入' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择文件（EPUB / TXT）' }).click();
  await chooser;
  await expect(page.getByRole('dialog', { name: '导入' })).toHaveCount(0);
});

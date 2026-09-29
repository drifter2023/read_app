import { expect, test, type Page, type Route } from '@playwright/test';
import { fullTier } from './helpers.ts';

// With the offline service worker registered, page.route misses the page's requests (they would reach the real API).
test.use({ serviceWorkers: 'block' });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST' };

/** Answers GET /models: 200 for keys ending in "good", 401 otherwise. Records every request to DeepSeek. */
async function fakeModels(page: Page) {
  const seen: string[] = [];
  await page.route('https://api.deepseek.com/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push(`${req.method()} ${new URL(req.url()).pathname}`);
    const ok = (req.headers().authorization ?? '').endsWith('good');
    return route.fulfill({ status: ok ? 200 : 401, headers: { ...CORS, 'content-type': 'application/json' }, body: ok ? '{"object":"list","data":[]}' : '{}' });
  });
  return seen;
}

test('G-01: the Home key card checks a key before saving it, masks it, and clears it', async ({ page }) => {
  await fullTier(page);
  const seen = await fakeModels(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'AI 语法分析' });
  await expect(card.locator('.ai-status')).toHaveText('未设置');

  const input = card.getByLabel('DeepSeek API Key');
  await expect(input).toHaveAttribute('type', 'password');
  await card.getByRole('button', { name: '确认' }).click();
  await expect(card.locator('.ai-note')).toHaveText('请先填写 API Key');

  await input.fill('sk-wrong');
  await card.getByRole('button', { name: '确认' }).click();
  await expect(card.locator('.ai-note')).toHaveText('Key 无效，请检查后重新填写');
  await expect(card.locator('.ai-status')).toHaveText('未设置');

  await input.fill('sk-0123456789-good');
  await card.getByRole('button', { name: '显示' }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await card.getByRole('button', { name: '确认' }).click();
  await expect(card.locator('.ai-status')).toHaveText('已连接 ····good');
  await expect(card.getByLabel('DeepSeek API Key')).toHaveCount(0);
  expect(seen).toEqual(['GET /models', 'GET /models']);

  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce
  await page.reload();
  await expect(card.locator('.ai-status')).toHaveText('已连接 ····good');
  expect(await page.content()).not.toContain('sk-0123456789-good');

  await card.getByRole('button', { name: '清除' }).click();
  await expect(card.locator('.ai-status')).toHaveText('未设置');
});

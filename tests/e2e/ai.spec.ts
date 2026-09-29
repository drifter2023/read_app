import { expect, test, type Page, type Route } from '@playwright/test';
import { sseText } from '../helpers/sse.ts';
import { dropInBand, fullTier, ready } from './helpers.ts';

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

const ANSWER = ['句型：主句 + 定语从句\n主干｜my father gave me', ' some advice，give 带双宾语\n定语从句｜that I’ve been turning over 修饰 advice\n', '时态｜现在完成进行时：一直琢磨至今\n'];

/** A DeepSeek stand-in: /models accepts any key; /chat/completions runs `chat` (default: the answer above, after 800 ms). */
async function fakeDeepSeek(page: Page, chat?: (route: Route) => Promise<void>) {
  const bodies: { messages: { content: string }[] }[] = [];
  await page.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (new URL(req.url()).pathname === '/models') return route.fulfill({ status: 200, headers: CORS, body: '{"data":[]}' });
    bodies.push(JSON.parse(req.postData()!));
    if (chat) return chat(route);
    await new Promise((r) => setTimeout(r, 800));
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sseText(ANSWER) });
  });
  return bodies;
}

async function withKey(page: Page) {
  await page.goto('/');
  const card = page.getByRole('region', { name: 'AI 语法分析' });
  await card.getByLabel('DeepSeek API Key').fill('sk-e2e-good');
  await card.getByRole('button', { name: '确认' }).click();
  await expect(card.locator('.ai-status')).toHaveText('已连接 ····good');
  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce
}

const drawer = (page: Page) => page.getByTestId('drawer');

test('G-02/G-03: a droplet shows dots, then the analysis; it is stored and reopens without the network', async ({ page }) => {
  await fullTier(page);
  const bodies = await fakeDeepSeek(page);
  await withKey(page);
  await page.goto('/?book=gatsby');
  await ready(page);

  const d = await dropInBand(page, 0, 0);
  await page.mouse.click(d.x, d.y);
  await expect(drawer(page)).toHaveAttribute('data-kind', 'sentence');
  await expect(drawer(page)).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('.wd-dots')).toBeVisible();
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.wd-pattern')).toHaveText('主句 + 定语从句');
  await expect(page.locator('.wd-point dt')).toHaveText(['主干', '定语从句', '时态']);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.messages[1]!.content).toContain('目标句：In my younger and more vulnerable years');
  expect(bodies[0]!.messages[1]!.content).toContain('前一句：（无）');

  // Close, go offline, reopen: served from history.
  await page.waitForTimeout(900);
  const again = await dropInBand(page, 0, 0);
  await page.mouse.click(again.x, 120); // a tap elsewhere closes
  await expect(drawer(page)).toHaveCount(0);
  await page.unroute('https://api.deepseek.com/**');
  await page.route('https://api.deepseek.com/**', (route) => route.abort('internetdisconnected'));
  const d2 = await dropInBand(page, 0, 0);
  await page.mouse.click(d2.x, d2.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.wd-pattern')).toHaveText('主句 + 定语从句');
});

test('G-05: without a key the drawer says where to add one, and asks nothing', async ({ page }) => {
  await fullTier(page);
  const bodies = await fakeDeepSeek(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  const d = await dropInBand(page, 0, 0);
  await page.mouse.click(d.x, d.y);
  await expect(page.locator('.wd-miss')).toHaveText('先在首页填写 DeepSeek API Key');
  await expect(drawer(page).getByRole('button', { name: '重试' })).toHaveCount(0);
  expect(bodies).toHaveLength(0);
});

test('G-05: a server error offers 重试, which then succeeds', async ({ page }) => {
  await fullTier(page);
  let fail = true;
  await fakeDeepSeek(page, async (route) => {
    if (fail) return route.fulfill({ status: 503, headers: CORS, body: '{}' });
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sseText(ANSWER) });
  });
  await withKey(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  const d = await dropInBand(page, 0, 0);
  await page.mouse.click(d.x, d.y);
  await expect(page.locator('.wd-miss')).toHaveText('DeepSeek 暂时不可用，请稍后再试');
  fail = false;
  await page.waitForTimeout(450);
  await drawer(page).getByRole('button', { name: '重试' }).click();
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.wd-pattern')).toHaveText('主句 + 定语从句');
});

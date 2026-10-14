import { expect, test, type Page } from '@playwright/test';
import { sseText } from '../helpers/sse.ts';
import { fullTier, ready } from './helpers.ts';

test.use({ serviceWorkers: 'block' });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST' };

async function fakeDeepSeek(page: Page) {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  await page.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (new URL(req.url()).pathname === '/models') return route.fulfill({ status: 200, headers: CORS, body: '{"data":[]}' });
    bodies.push(JSON.parse(req.postData()!));
    await new Promise((r) => setTimeout(r, 500));
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sseText(['很克制，', '没有形容情绪的词。\n出处：', 'a few words']) });
  });
  return bodies;
}

async function swipe(page: Page, from: number, to: number) {
  await page.mouse.move(from, 420);
  await page.mouse.down();
  await page.mouse.move((from + to) / 2, 424, { steps: 6 });
  await page.mouse.move(to, 424, { steps: 6 });
  await page.mouse.up();
}

test('A-01…A-05: swipe left opens the Agent drawer, a question is answered with a 出处 and stored, swipe right closes', async ({ page }) => {
  await fullTier(page);
  const bodies = await fakeDeepSeek(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'AI 语法分析' });
  await card.getByLabel('DeepSeek API Key').fill('sk-e2e-good');
  await card.getByRole('button', { name: '确认' }).click();
  await expect(card.locator('.ai-status')).toHaveText('已连接 ····good');
  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce

  await page.goto('/?book=gatsby');
  await ready(page);
  const panel = page.locator('.ag-panel');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');

  // A-01: the page is pushed aside and shrunk into a card.
  await swipe(page, 330, 40);
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await page.waitForTimeout(500);
  const box = await page.locator('.rd-page').boundingBox();
  expect(box!.x).toBeLessThan(-200);
  expect(box!.x + box!.width).toBeGreaterThan(60); // a strip of page is left on the left edge
  expect(bodies).toHaveLength(0); // opening makes no request

  // A-02/A-03: ask; the question carries the selected sentence and the reply is streamed, with its 出处.
  await panel.getByLabel('问题').fill('这段的语气');
  await panel.getByLabel('问题').press('Enter');
  await expect(panel.locator('.ag-answer')).toHaveText('很克制，没有形容情绪的词。');
  await expect(panel.locator('.ag-cite')).toHaveText('a few words');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.messages[1]!.content).toContain('问题：这段的语气');
  await expect(panel.locator('.ag-title-text')).toHaveText('这段的语气');
  await expect(panel.locator('.ag-chip', { hasText: '这段的语气' })).toHaveCount(0); // used suggestions leave the list

  // A-04: swipe right brings the page back.
  await swipe(page, 40, 330);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');

  // The conversation is stored: after a reload it is the first one in the history.
  await page.waitForTimeout(600);
  await page.reload();
  await ready(page);
  await swipe(page, 330, 40);
  await expect(panel.locator('.ag-answer')).toHaveText('很克制，没有形容情绪的词。');
});

for (const vp of [{ name: 'phone', width: 402, height: 874 }, { name: 'iPad', width: 820, height: 1180 }, { name: 'iPad landscape', width: 1180, height: 820 }]) {
  test(`A-01: on a ${vp.name} the pushed page leaves the same strip and never covers the drawer`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await fullTier(page);
    await page.goto('/?book=gatsby');
    await ready(page);
    await swipe(page, vp.width - 70, 40);
    await expect(page.locator('.ag-panel')).toHaveAttribute('aria-hidden', 'false');
    await page.waitForTimeout(500);
    const pageRight = await page.locator('.rd-page').evaluate((el) => el.getBoundingClientRect().right);
    expect(pageRight).toBeGreaterThan(50);
    expect(pageRight).toBeLessThan(70);
    for (const sel of ['.ag-head', '.ag-now', '.ag-chips', '.ag-composer']) {
      const left = await page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().left);
      expect(left, sel).toBeGreaterThanOrEqual(pageRight + 12);
    }
  });
}

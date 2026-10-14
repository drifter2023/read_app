import { expect, test, type Page } from '@playwright/test';
import { sseText } from '../helpers/sse.ts';
import { fullTier, ready, wordInBand } from './helpers.ts';

test.use({ serviceWorkers: 'block' });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST' };

async function fakeDeepSeek(page: Page) {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  await page.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (new URL(req.url()).pathname === '/models') return route.fulfill({ status: 200, headers: CORS, body: '{"data":[]}' });
    bodies.push(JSON.parse(req.postData()!));
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sseText(['父亲的话很克制。']) });
  });
  return bodies;
}

const rects = (page: Page) => page.locator('.rd-sel-rect');
const ask = (page: Page) => page.locator('.rd-ask');
const selected = (page: Page) => page.evaluate(() => window.__spotlight!.engine.selectionText());

async function longPress(page: Page, p: { x: number; y: number }, then?: { x: number; y: number }) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  if (then) await page.mouse.move(then.x, then.y, { steps: 8 });
  await page.mouse.up();
}

test('N-04: long-press selects a word, dragging extends it, handles adjust it, a tap clears it; no menu, no drawer', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  const p = await wordInBand(page, 'advice');

  // A short press is still a tap: the word drawer opens, nothing is selected.
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await page.mouse.click(12, 600);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(rects(page)).toHaveCount(0);

  // Hold 380 ms: the word is selected; the release opens no drawer.
  await longPress(page, p);
  await expect(rects(page)).toHaveCount(1);
  expect(await selected(page)).toBe('advice');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(ask(page)).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.rd-handle')).toHaveCount(2);

  // A tap anywhere clears it.
  await page.mouse.click(200, 600);
  await expect(rects(page)).toHaveCount(0);
  await expect(page.locator('.rd-handle')).toHaveCount(0);

  // Hold and drag: the selection grows word by word, and the button waits for the release.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(p.x + 60, p.y + 34, { steps: 6 }); // down a line
  await expect(ask(page)).not.toHaveAttribute('data-on', 'true');
  await page.mouse.up();
  await expect(rects(page)).toHaveCount(2);
  const grown = await selected(page);
  expect(grown.startsWith('advice')).toBe(true);
  expect(grown.split(/\s+/).length).toBeGreaterThan(3);
  await expect(ask(page)).toHaveAttribute('data-on', 'true');

  // Drag the end handle back up onto the first line: the selection shrinks to that line.
  const end = await page.locator('.rd-handle[data-end="end"] .rd-handle-dot').boundingBox();
  await page.mouse.move(end!.x + 6, end!.y + 6);
  await page.mouse.down();
  await page.mouse.move(end!.x + 6, end!.y + 6 - 34, { steps: 6 });
  await page.mouse.up();
  await expect(rects(page)).toHaveCount(1);
  const shrunk = await selected(page);
  expect(shrunk.startsWith('advice')).toBe(true);
  expect(shrunk.length).toBeLessThan(grown.length);

  // The system menu is blocked on the page.
  const prevented = await page.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('.rd-line[data-p]')!.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('N-04: a long-press on blurred text selects nothing (owner decision 5c)', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await wordInBand(page, 'politician');
  const blurred = await page.evaluate(() => {
    const h = window.innerHeight;
    const line = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => {
      const b = l.getBoundingClientRect();
      return b.top > h - 260 && b.bottom < h - 160 && l.style.filter !== 'none';
    })!;
    const b = line.getBoundingClientRect();
    return { x: b.left + 40, y: b.top + b.height / 2 };
  });
  await longPress(page, blurred);
  await page.waitForTimeout(200);
  await expect(rects(page)).toHaveCount(0);
});

test('N-06: 问旁注 opens the Agent drawer with the selection in 当前句\'s slot; it is asked about, quoted and then cleared; closing drops it', async ({ page }) => {
  await fullTier(page);
  const bodies = await fakeDeepSeek(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'AI 语法分析' });
  await card.getByLabel('DeepSeek API Key').fill('sk-e2e-good');
  await card.getByRole('button', { name: '确认' }).click();
  await expect(card.locator('.ai-status')).toHaveText('已连接 ····good');
  await page.waitForTimeout(600);

  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  const p = await wordInBand(page, 'advice');
  await longPress(page, p, { x: p.x + 60, y: p.y + 34 });
  const text = await selected(page);
  await ask(page).click();

  const panel = page.locator('.ag-panel');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(rects(page)).toHaveCount(0);
  const attach = panel.locator('.ag-attach');
  await expect(attach.locator('.ag-label')).toHaveText('选中的文字 · 第 1 章');
  await expect(attach.locator('.ag-attach-quote')).toHaveText(`“${text}”`);
  await expect(panel.getByLabel('问题')).toHaveAttribute('placeholder', '就这段文字提问');
  await expect(panel.locator('.ag-chip')).toHaveText(['解释这段', '这里有什么隐喻', '和前文有关联吗']);
  // The attachment takes 当前句's slot above the input: never both.
  await expect(panel.locator('.ag-now')).toHaveCount(0);
  await expect(panel.getByLabel('问题')).toBeFocused({ timeout: 1500 });

  // × removes it; 当前句 is back in the slot, its selected sentence centred.
  await attach.getByRole('button', { name: '移除选中的文字' }).click();
  await expect(attach).toHaveCount(0);
  await expect(panel.locator('.ag-now .ag-hint')).toHaveText('滑动或点选一句');
  await expect(panel.getByLabel('问题')).toHaveAttribute('placeholder', '在页边写下你的问题');
  await expect.poll(() => panel.locator('.ag-pick').evaluate((el) => {
    const s = el.querySelector('.ag-sent[data-sel="true"]')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return Math.abs((s.top + s.bottom) / 2 - (r.top + r.bottom) / 2) < s.height / 2 + 2;
  })).toBe(true);

  // Closing the drawer drops an attachment: the next left swipe shows 当前句.
  await page.mouse.click(30, 400); // the page strip closes the drawer
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.waitForTimeout(500);
  const r = await wordInBand(page, 'advice');
  await longPress(page, r);
  await ask(page).click();
  await expect(panel.locator('.ag-attach')).toHaveCount(1);
  await page.mouse.click(30, 400);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.waitForTimeout(500);
  await page.mouse.move(330, 400); await page.mouse.down(); await page.mouse.move(40, 410, { steps: 10 }); await page.mouse.up();
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(panel.locator('.ag-attach')).toHaveCount(0);
  await expect(panel.locator('.ag-now')).toHaveCount(1);
  await expect(panel.getByLabel('问题')).toHaveAttribute('placeholder', '在页边写下你的问题');

  // Again, and send: the question carries the selected text, quoted above it; then it is cleared.
  await page.waitForTimeout(500); // the drawer has finished sliding in
  await page.mouse.click(30, 400);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.waitForTimeout(500);
  const q = await wordInBand(page, 'advice');
  await longPress(page, q, { x: q.x + 60, y: q.y + 34 });
  await ask(page).click();
  await expect(panel.locator('.ag-attach')).toHaveCount(1);
  await panel.locator('.ag-chip', { hasText: '解释这段' }).click();
  await expect(panel.locator('.ag-answer')).toHaveText('父亲的话很克制。');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.messages.at(-1)!.content).toContain(`所选文字：${text}`);
  expect(bodies[0]!.messages.at(-1)!.content).toContain('问题：解释这段');
  await expect(panel.locator('.ag-quote').last()).toHaveText(`“${text}”`);
  await expect(panel.locator('.ag-attach')).toHaveCount(0);
});

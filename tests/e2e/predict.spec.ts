import { expect, test, type Page } from '@playwright/test';
import { fullTier, ready, wordInBand } from './helpers.ts';

/** The footnote under the first mounted `word`, or null. */
const noteUnder = (page: Page, word: string) => page.evaluate((w) => {
  const span = [...document.querySelectorAll<HTMLElement>('.rd-w')].find((s) => s.firstChild?.textContent === w);
  return span?.querySelector('.rd-fn')?.textContent ?? null;
}, word);
const noteCount = (page: Page) => page.locator('.rd-fn').count();
const setPredict = (page: Page, v: 'off' | 'few' | 'many') => page.evaluate((x) => window.__spotlight!.prefs.set('predict', x), v);

async function openGatsby(page: Page) {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
}

test('P-03/P-05: rare words get footnotes before any tap; 关 removes them, 多 adds more; lines do not move', async ({ page }) => {
  await openGatsby(page);
  await wordInBand(page, 'levity');
  await expect.poll(() => noteUnder(page, 'levity'), { timeout: 10_000 }).not.toBeNull();
  expect(await noteUnder(page, 'vulnerable')).toBeNull(); // a CET-6 word: not predicted for a CET-6 reader
  const tops = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rd-line')].slice(0, 60).map((l) => l.getBoundingClientRect().top));
  const before = await tops();
  const few = await noteCount(page);

  await setPredict(page, 'off');
  await expect.poll(() => noteCount(page)).toBe(0);
  expect(await tops()).toEqual(before);

  await setPredict(page, 'many');
  await expect.poll(() => noteCount(page)).toBeGreaterThan(few);
  expect(await tops()).toEqual(before);
});

test('P-04: 撤回 on a predicted word removes its footnote for good', async ({ page }) => {
  await openGatsby(page);
  const p = await wordInBand(page, 'levity');
  await expect.poll(() => noteUnder(page, 'levity'), { timeout: 10_000 }).not.toBeNull();
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await page.getByRole('button', { name: '撤回生词标记' }).click();
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect.poll(() => noteUnder(page, 'levity')).toBeNull();

  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce
  await page.reload();
  await ready(page);
  await wordInBand(page, 'levity');
  await expect.poll(() => noteCount(page), { timeout: 10_000 }).toBeGreaterThan(0); // predictions are back…
  expect(await noteUnder(page, 'levity')).toBeNull(); // …but not this one
});

test('P-06: the calibration test on Home asks 24 multiple-choice words and shows a vocabulary size', async ({ page }) => {
  await fullTier(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: '预测生词' });
  await card.getByRole('button', { name: '开始测试' }).click();
  const dialog = page.getByRole('dialog', { name: '词汇量测试' });
  await expect(dialog.locator('.cal-word')).toBeVisible();
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    seen.add((await dialog.locator('.cal-word').textContent())!);
    if (i < 12) {
      await expect(dialog.locator('.cal-opt')).toHaveCount(4);
      await dialog.locator('.cal-opt').first().click();
    } else {
      await dialog.getByRole('button', { name: '不认识', exact: true }).click();
    }
  }
  expect(seen.size).toBe(24);
  await expect(dialog.locator('.cal-level')).toHaveText(/^约 [\d,]+ 词$/);
  await dialog.getByRole('button', { name: '完成' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.locator('.ai-status')).toHaveText(/^词汇量约 [\d,]+ 词$/);
  await expect(card.getByRole('button', { name: '重新测试' })).toBeVisible();

  await page.waitForTimeout(600);
  await page.reload();
  await expect(card.getByRole('button', { name: '开始测试' })).toHaveCount(0);
});

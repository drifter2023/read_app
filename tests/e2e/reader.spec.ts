import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('.rd-line[data-p]').first().waitFor();
  await expect(page.locator('.rd-probing')).toHaveCount(0, { timeout: 20_000 });
}

test('makes no network requests outside the app origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  await page.goto('/?book=gatsby');
  await ready(page);
  expect(foreign).toEqual([]);
});

test('opens The Great Gatsby with the chapter eyebrow and 1%', async ({ page }) => {
  await page.goto('/?book=gatsby');
  await ready(page);
  await expect(page.locator('.rd-eyebrow-chapter')).toHaveText('Chapter I');
  await expect(page.locator('.rd-eyebrow-pct')).toHaveText('1%');
  await expect(page.locator('.rd-line[data-p="0"]').first()).toContainText('In my younger and more vulnerable years');
});

test('R-07: a reload restores the same paragraph into the band', async ({ page }) => {
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => { document.querySelector('.rd-scroll')!.scrollTop += 6000; });
  await page.waitForTimeout(1800); // idle 180ms + save debounce 1000ms
  const before = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  await page.reload();
  await ready(page);
  const after = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  expect([after.chapter, after.para]).toEqual([before.chapter, before.para]);
});

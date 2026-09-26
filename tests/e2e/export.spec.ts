import { expect, test } from '@playwright/test';
import { fullTier, wordInBand } from './helpers.ts';

test('task 23: the beta log exports as a file with a summary', async ({ page }) => {
  await fullTier(page);
  // No share sheet in a headless browser: take the download path the web build falls back to.
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }); });
  await page.goto('/?book=gatsby');
  await page.locator('.rd-line[data-p]').first().waitFor();
  const p = await wordInBand(page, 'advice');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await page.waitForTimeout(1000); // the web db is written to IndexedDB 300 ms after the last change
  await page.goto('/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出内测日志' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^spotlight-log-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(json.summary.lookups).toBe(1);
  expect(json.events[0]).toMatchObject({ type: 'lookup', bookId: 'gatsby' });
});

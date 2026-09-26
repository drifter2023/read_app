import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { fullTier, openFromHome, ready, tapBlank } from './helpers.ts';

async function back(page: Page) {
  await tapBlank(page);
  await page.getByRole('button', { name: '‹ 书架' }).click();
  await expect(page.locator('.reader-layer')).toHaveCount(0);
  await expect(page.getByTestId('flight')).toHaveCount(0);
}

test('H-01/H-02: home lists the three books, continue shows the last opened one', async ({ page }) => {
  await fullTier(page);
  await page.goto('/');
  await expect(page.locator('.home-date')).toHaveText(/^[A-Z]{3} · \d+月\d+日$/);
  await expect(page.locator('.row-title')).toHaveText(['The Great Gatsby', 'A Farewell to Arms', 'The Maltese Falcon']);
  await openFromHome(page, 'The Maltese Falcon');
  await back(page);
  await expect(page.locator('.continue-title')).toHaveText('The Maltese Falcon');
  await expect(page.locator('.continue-left')).toHaveText(/^还剩约 \d+ 分钟$/);
  await expect(page.locator('.row-title').first()).toHaveText('The Maltese Falcon');
  await page.getByRole('tab', { name: '读完' }).click();
  await expect(page.locator('.shelf-none')).toHaveText('还没有读完的书');
});

test('H-02: reaching 100% moves the book to 读完 with its finish date', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?dev=1');
  await openFromHome(page, 'The Great Gatsby');
  await page.evaluate(async () => {
    const e = window.__spotlight!.engine;
    e.scrollToChapter(8);
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 40; i++) {
      e.scroller.scrollTop = e.scroller.scrollHeight;
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  await expect(page.locator('.rd-eyebrow-pct')).toHaveText('100%');
  await page.waitForTimeout(1300);
  await back(page);
  await page.getByRole('tab', { name: '读完' }).click();
  await expect(page.locator('.row-title')).toHaveText(['The Great Gatsby']);
  await expect(page.locator('.row-note')).toHaveText(/^\d+月\d+日读完$/);
});

test('H-04: the flight runs 220 → 460 → 300/320 ms and lands back on the cover', async ({ page }) => {
  await fullTier(page);
  await page.goto('/');
  await page.evaluate(() => {
    const log: [string, number][] = [];
    (window as unknown as { __fly: typeof log }).__fly = log;
    new MutationObserver(() => {
      const f = document.querySelector<HTMLElement>('[data-testid=flight]');
      const p = f?.dataset.phase ?? 'none';
      if (log.at(-1)?.[0] !== p) log.push([p, performance.now()]);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase'] });
  });
  await openFromHome(page, 'A Farewell to Arms');
  await expect(page.getByTestId('flight')).toHaveCount(0);
  const log = await page.evaluate(() => (window as unknown as { __fly: [string, number][] }).__fly);
  while (log[0]?.[0] === 'none') log.shift();
  expect(log.map((l) => l[0])).toEqual(['spine', 'out', 'full', 'page', 'none']);
  const at = Object.fromEntries(log.map(([p, t]) => [p, t]));
  // Timers and the observer tick at ~1-4 ms, so allow 5 ms of slack on each bound.
  expect(at.full! - at.out!).toBeGreaterThanOrEqual(215);
  expect(at.page! - at.full!).toBeGreaterThanOrEqual(455);
  expect(at.none! - at.page!).toBeGreaterThanOrEqual(315);

  await page.evaluate(() => { (window as unknown as { __fly: unknown[] }).__fly.length = 0; });
  await back(page);
  const back2 = (await page.evaluate(() => (window as unknown as { __fly: [string, number][] }).__fly.map((l) => l[0])))
    .filter((p, i, a) => !(p === 'none' && i === 0 && a.length > 1));
  expect(back2).toEqual(['page', 'full', 'back', 'none']);
});

test('H-05: swipe left, confirm, and the book is gone', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('[data-book-id="falcon"] .row');
  const b = (await row.boundingBox())!;
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 80, b.y + b.height / 2, { steps: 6 });
  await page.mouse.move(b.x + b.width - 140, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('删除《The Maltese Falcon》？');
  await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
  await expect(page.locator('[data-book-id="falcon"]')).toHaveCount(0);
  await page.waitForTimeout(1000); // web db persists to IndexedDB 300 ms after a write
  await page.reload();
  await expect(page.locator('.row-title')).toHaveText(['The Great Gatsby', 'A Farewell to Arms']);
});

test('H-05: an empty shelf offers the bundled books back', async ({ page }) => {
  await page.goto('/?dev=1');
  // Delete through the UI to exercise the same path the user takes.
  for (const title of ['The Great Gatsby', 'A Farewell to Arms', 'The Maltese Falcon']) {
    const row = page.locator('.row', { hasText: title });
    const b = (await row.boundingBox())!;
    await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 150, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.locator('.row-wrap', { hasText: title }).getByRole('button', { name: '删除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
    await expect(page.locator('.row', { hasText: title })).toHaveCount(0);
  }
  await expect(page.locator('.empty-copy')).toBeVisible();
  await expect(page.locator('.empty-title')).toHaveText(['The Great Gatsby', 'A Farewell to Arms', 'The Maltese Falcon']);
  await page.locator('.empty-list li', { hasText: 'The Great Gatsby' }).getByRole('button').click();
  await expect(page.locator('.row-title')).toHaveText(['The Great Gatsby']);
});

test('H-03: importing a 300-page EPUB is readable within 3 s', async ({ page }) => {
  await fullTier(page);
  await page.goto('/');
  // Remove the bundled copy first, or the import is recognised as a duplicate.
  const row = page.locator('[data-book-id="farewell"] .row');
  const b = (await row.boundingBox())!;
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 150, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.locator('[data-book-id="farewell"]').getByRole('button', { name: '删除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();

  const bytes = await readFile('books/ernest-hemingway_a-farewell-to-arms.epub');
  const t0 = Date.now();
  await page.locator('input[type=file]').setInputFiles({ name: 'farewell.epub', mimeType: 'application/epub+zip', buffer: bytes });
  await ready(page);
  expect(Date.now() - t0).toBeLessThan(3000);
  await expect(page.locator('.rd-line[data-p]').first()).toContainText('In the late summer of that year');
});

test('H-03: TXT import, duplicate detection, and a plain-language error', async ({ page }) => {
  await fullTier(page);
  await page.goto('/');
  const txt = 'Title: A Short Tale\nAuthor: Test Writer\n\nCHAPTER I\n\nThe rain came down on the quiet town.\n\nCHAPTER II\n\nThen the sun came out again.\n';
  await page.locator('input[type=file]').setInputFiles({ name: 'tale.txt', mimeType: 'text/plain', buffer: Buffer.from(txt) });
  await ready(page);
  await expect(page.locator('.rd-line[data-p]').first()).toContainText('The rain came down');
  await back(page);
  await expect(page.locator('.row-title').first()).toHaveText('A Short Tale');

  await page.locator('input[type=file]').setInputFiles({ name: 'tale again.txt', mimeType: 'text/plain', buffer: Buffer.from(txt) });
  await ready(page);
  await back(page);
  await expect(page.locator('.row-title', { hasText: 'A Short Tale' })).toHaveCount(1);

  await page.locator('input[type=file]').setInputFiles({ name: 'broken.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('not a zip at all') });
  await expect(page.locator('.import-error')).toHaveText('这不是有效的 EPUB 文件');
  await page.getByRole('button', { name: '好' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.locator('.import-error')).toHaveText('只支持 EPUB 和 TXT 格式的书');
});

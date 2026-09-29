import { expect, test, type Page } from '@playwright/test';
import { fullTier, ready, wordInBand } from './helpers.ts';

async function open(page: Page) {
  await fullTier(page);
  await page.goto('/?book=gatsby');
  await ready(page);
}
const drawer = (page: Page) => page.getByTestId('drawer');

test('R-04: tap to drawer ≤ 100 ms; lemma, IPA, POS and gloss shown', async ({ page }) => {
  await open(page);
  // Warm the dictionary (it loads in the background after the book opens).
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('dict.db')));
  await page.waitForTimeout(500);
  const p = await wordInBand(page, 'turning');
  await page.mouse.click(p.x, p.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.wd-word')).toHaveText('turn');
  await expect(page.locator('.wd-ph')).toHaveText(/^\/.+\/$/);
  await expect(page.locator('.wd-pos')).toHaveText(/^v/);
  await expect(page.locator('.wd-def')).not.toBeEmpty();
  const ms = await page.evaluate(() => window.__spotlightTapMs!);
  expect(ms).toBeLessThanOrEqual(100);
  await expect(page.locator('.rd-hl')).toHaveText('turning');
});

test('R-04: a word the dictionary lacks shows the not-found state', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => window.__spotlight!.engine.scrollToChapter(6)); // Michaelis, the Wilsons' neighbour
  await page.waitForTimeout(300);
  const p = await wordInBand(page, 'Michaelis');
  await page.mouse.click(p.x, p.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'notfound');
  await expect(page.locator('.wd-miss')).toHaveText('词典未收录这个词');
});

test('R-05: same word closes; another word closes first, then opens; a tap elsewhere closes', async ({ page }) => {
  await open(page);
  const a = await wordInBand(page, 'advice');
  await page.mouse.click(a.x, a.y);
  await expect(page.locator('.wd-word')).toHaveText('advice');
  await page.mouse.click(a.x, a.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'closing');
  await expect(drawer(page)).toHaveCount(0);

  await page.mouse.click(a.x, a.y);
  await expect(page.locator('.wd-word')).toHaveText('advice');
  const b = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => /\bfather\b/.test(l.textContent ?? ''))!;
    const w = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.textContent!.indexOf('father');
      if (i < 0 || (n.parentElement as HTMLElement).classList.contains('rd-fn')) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 6);
      const bb = r.getBoundingClientRect();
      return { x: bb.left + bb.width / 2, y: bb.top + bb.height / 2 };
    }
    throw new Error('no father');
  });
  await page.mouse.click(b.x, b.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'closing');
  await expect(page.locator('.wd-word')).toHaveText('father');
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');

  await page.mouse.click(200, 70); // eyebrow area: not a word
  await expect(drawer(page)).toHaveCount(0);
});

test('R-05: the first scroll gesture closes the drawer instead of scrolling', async ({ page }) => {
  await open(page);
  const a = await wordInBand(page, 'advice');
  await page.mouse.click(a.x, a.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  const top = await page.evaluate(() => document.querySelector('.rd-scroll')!.scrollTop);
  // Mobile WebKit has no wheel in Playwright; dispatch the gesture event the guard listens for.
  const prevented = await page.evaluate(() => {
    const ev = new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true });
    document.querySelector('.rd-scroll')!.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(drawer(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('.rd-scroll')!.scrollTop)).toBeCloseTo(top, -1);
});

test('R-05: a tap or a scroll gesture inside the drawer leaves it open and the page still', async ({ page }) => {
  await open(page);
  const a = await wordInBand(page, 'advice');
  await page.mouse.click(a.x, a.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');

  await page.locator('.wd-def').click();
  await page.waitForTimeout(900); // the page has settled, keeping the drawer on screen
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  const top = await page.evaluate(() => document.querySelector('.rd-scroll')!.scrollTop);

  // Nothing to scroll in a word drawer: the gesture is held, not passed to the page.
  const prevented = await page.evaluate(() => {
    const ev = new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true });
    document.querySelector('.wd-def')!.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await page.waitForTimeout(400);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => document.querySelector('.rd-scroll')!.scrollTop)).toBeCloseTo(top, -1);
});

test('R-05: a drawer opened low on the screen is scrolled up to stay 70 px above the bottom', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => window.__spotlight!.prefs.set('focusPct', 90)); // only the band opens drawers
  const vp = page.viewportSize()!;
  const low = await page.evaluate((h) => {
    const lines = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')];
    const line = lines.find((l) => { const b = l.getBoundingClientRect(); return b.top > h - 230 && b.bottom < h - 150; })!;
    const b = line.getBoundingClientRect();
    return { x: b.left + 40, y: b.top + b.height / 2 };
  }, vp.height);
  await page.mouse.click(low.x, low.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  await page.waitForTimeout(900);
  const bottom = await drawer(page).evaluate((d) => d.getBoundingClientRect().bottom);
  expect(bottom).toBeLessThanOrEqual(vp.height - 70 + 8 + 1);
});

test('R-06 and R-09: footnotes follow the lemma, survive a reload, and Save sticks', async ({ page }) => {
  await open(page);
  const a = await wordInBand(page, 'advice');
  await page.mouse.click(a.x, a.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  // Let the 330 ms open finish: clicking a half-revealed button makes Playwright scroll it into view.
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: '已存' })).toBeVisible();
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready'); // Save does not close the drawer
  // Keep-on-screen may have scrolled the text up; tap the highlighted word where it is now.
  await page.waitForTimeout(700);
  const hl = (await page.locator('.rd-hl').boundingBox())!;
  await page.mouse.click(hl.x + hl.width / 2, hl.y + hl.height / 2);
  await expect(drawer(page)).toHaveCount(0);
  const note = page.locator('.rd-w', { hasText: 'advice' }).first().locator('.rd-fn');
  await expect(note).toHaveText('忠告');

  await page.reload();
  await ready(page);
  await wordInBand(page, 'advice');
  await expect(page.locator('.rd-w', { hasText: 'advice' }).first().locator('.rd-fn')).toHaveText('忠告');
  const b = await wordInBand(page, 'advice');
  await page.mouse.click(b.x, b.y);
  await expect(page.getByRole('button', { name: '已存' })).toBeVisible();
});

test('Undo: 撤回 forgets a mistaken word; its footnotes are gone, also after a reload', async ({ page }) => {
  await open(page);
  const a = await wordInBand(page, 'advice');
  await page.mouse.click(a.x, a.y);
  await expect(drawer(page)).toHaveAttribute('data-state', 'ready');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '保存' }).click(); // undo also clears a saved word
  await page.getByRole('button', { name: '撤回生词标记' }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.rd-hl')).toHaveCount(0);
  await expect(page.locator('.rd-w', { hasText: 'advice' })).toHaveCount(0);

  await page.waitForTimeout(600); // user.db persists to IndexedDB after a 300 ms debounce
  await page.reload();
  await ready(page);
  const b = await wordInBand(page, 'advice');
  await expect(page.locator('.rd-w', { hasText: 'advice' })).toHaveCount(0);
  await page.mouse.click(b.x, b.y);
  await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
});

test('Only the focus band opens drawers: a blurred word is blank space', async ({ page }) => {
  await open(page);
  await wordInBand(page, 'politician'); // well into the text, so there are blurred lines above the band
  const blurred = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => {
      const b = l.getBoundingClientRect();
      return b.top > 160 && b.bottom < 260 && l.style.filter !== 'none';
    })!;
    const b = line.getBoundingClientRect();
    return { x: b.left + 40, y: b.top + b.height / 2 };
  });
  await page.mouse.click(blurred.x, blurred.y);
  await page.waitForTimeout(400);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.rd-top')).toHaveClass(/rd-chrome-on/); // it toggled the chrome instead
});

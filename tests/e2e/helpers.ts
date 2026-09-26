import { expect, type Page } from '@playwright/test';

/** Waits for body lines and for the first-launch probe to finish. */
export async function ready(page: Page) {
  await page.locator('.rd-line[data-p]').first().waitFor();
  await expect(page.locator('.rd-probing')).toHaveCount(0, { timeout: 20_000 });
}

/** Skips the probe in tests that don't measure it (the tier is a stored setting). */
export async function fullTier(page: Page) {
  await page.addInitScript(() => { (window as unknown as { __forceTier?: string }).__forceTier = 'full'; });
}

export async function openFromHome(page: Page, title: string) {
  await page.getByRole('button', { name: new RegExp(title) }).last().click();
  await ready(page);
}

/**
 * Scrolls so the first line containing `word` (as a whole word, not opening a sentence unless
 * `any`) sits at the viewport centre, and returns the viewport point at the middle of that word.
 */
export async function wordInBand(page: Page, word: string, nth = 0): Promise<{ x: number; y: number }> {
  const pt = await page.evaluate(async ({ word, nth }) => {
    const scroller = document.querySelector<HTMLElement>('.rd-scroll')!;
    const re = new RegExp(`\\b${word}\\b`);
    const lines = [...scroller.querySelectorAll<HTMLElement>('.rd-line[data-p]')].filter((l) => re.test(l.textContent ?? ''));
    const line = lines[nth];
    if (!line) throw new Error(`no line with ${word}`);
    const box = scroller.getBoundingClientRect();
    scroller.scrollTop += line.getBoundingClientRect().top + line.offsetHeight / 2 - (box.top + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.parentElement as HTMLElement).classList.contains('rd-fn')) continue;
      const m = re.exec(n.textContent ?? '');
      if (!m) continue;
      const r = document.createRange();
      r.setStart(n, m.index);
      r.setEnd(n, m.index + word.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    throw new Error('word not found in text nodes');
  }, { word, nth });
  return pt;
}

/** A tap on blank space (the left gutter at mid-height): toggles the chrome. */
export async function tapBlank(page: Page) {
  const vp = page.viewportSize()!;
  await page.mouse.click(12, vp.height / 2);
}

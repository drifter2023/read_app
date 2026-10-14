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
/** A tap in the title area (the eyebrow strip at the top): shows or hides ‹ 书架, 目录 and Aa (N-01). */
export async function tapTitle(page: Page) {
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, 64);
}

/** Scrolls the end of sentence `s` of paragraph `p` (Gatsby, chapter 0) to the band centre; returns its droplet's centre. */
export async function dropInBand(page: Page, p: number, s: number): Promise<{ x: number; y: number }> {
  return page.evaluate(async ({ p, s }) => {
    const book = await (await fetch('/books/gatsby.json')).json() as { chapters: { paras: string[][] }[] };
    const para = book.chapters[0]!.paras[p]!;
    const text = ` ${para.join(' ')}`; // paragraphText: INDENT + sentences
    const end = 1 + para.slice(0, s + 1).join(' ').length;
    const scroller = document.querySelector<HTMLElement>('.rd-scroll')!;
    let cursor = 0;
    const line = [...scroller.querySelectorAll<HTMLElement>(`.rd-chapter[data-ch="0"] .rd-line[data-p="${p}"]`)].find((l) => {
      const at = text.indexOf(l.textContent!, cursor);
      cursor = at + l.textContent!.length;
      return end <= cursor;
    })!;
    const box = scroller.getBoundingClientRect();
    scroller.scrollTop += line.getBoundingClientRect().top + line.offsetHeight / 2 - (box.top + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
    const d = document.querySelector<HTMLElement>(`.rd-drop[data-ch="0"][data-p="${p}"][data-at="${end}"]:not(.rd-drop-off)`);
    if (!d) throw new Error('droplet not in the band');
    const b = d.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, { p, s });
}

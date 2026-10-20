import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { onText } from '../../src/core/reader/tap.ts';

afterEach(() => { document.body.innerHTML = ''; });

function page() {
  document.body.innerHTML = `
    <div style="width:402px;padding:0 34px;font:18px/30px serif">
      <div class="rd-line rd-head">Chapter I</div>
      <div class="rd-blank" style="height:30px"></div>
      <div class="rd-line" style="filter:blur(4px);opacity:.4">a blurred line of text that runs full width</div>
      <div class="rd-line">short</div>
    </div>`;
  const [head, blurred, short] = [...document.querySelectorAll<HTMLElement>('.rd-line')];
  return { head: head!, blurred: blurred!, short: short!, blank: document.querySelector<HTMLElement>('.rd-blank')! };
}
const at = (el: HTMLElement, x: number) => { const b = el.getBoundingClientRect(); return { x: b.left + x, y: b.top + b.height / 2 }; };
const hit = (x: number, y: number) => onText(document.elementFromPoint(x, y), x, y);

describe('onText (N-01, owner request 2026-10-20)', () => {
  it('is true on the glyphs of any line, blurred or sharp, and on the chapter heading', () => {
    const { head, blurred, short } = page();
    for (const el of [head, blurred, short]) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const g = r.getBoundingClientRect();
      expect(hit(g.left + 2, g.top + g.height / 2)).toBe(true);
      expect(hit(g.right - 2, g.top + g.height / 2)).toBe(true);
    }
  });

  it('is false on the side margins, between paragraphs and after a short line', () => {
    const { short, blank } = page();
    const margin = at(short, -20);
    expect(hit(margin.x, margin.y)).toBe(false);
    const gap = at(blank, 40);
    expect(hit(gap.x, gap.y)).toBe(false);
    const after = at(short, 250);
    expect(hit(after.x, after.y)).toBe(false);
  });
});

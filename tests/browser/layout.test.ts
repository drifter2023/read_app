import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { countWords, INDENT, paragraphText } from '../../src/core/ingest/text.ts';
import { breakLines, layoutChapter } from '../../src/core/reader/layout.ts';

const WIDTH = 334; // 402 - 2 × 34

function stage() {
  const scroll = document.createElement('div');
  scroll.className = 'rd-scroll';
  Object.assign(scroll.style, { position: 'relative', width: `${WIDTH + 68}px`, height: '874px' });
  const content = document.createElement('div');
  content.className = 'rd-content';
  const probe = document.createElement('div');
  probe.className = 'rd-probe';
  probe.style.width = `${WIDTH}px`;
  scroll.append(content, probe);
  document.body.append(scroll);
  return { content, probe };
}

function width(content: HTMLElement, text: string): number {
  const el = document.createElement('div');
  el.className = 'rd-line';
  el.style.display = 'inline-block';
  el.textContent = text;
  content.append(el);
  const w = el.getBoundingClientRect().width;
  el.remove();
  return w;
}

const LONG = [
  'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.',
  '“Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”',
];

beforeAll(async () => { await document.fonts.load('19.5px "Newsreader Variable"'); });
afterEach(() => { document.body.innerHTML = ''; });

describe('breakLines', () => {
  it('splits into lines that re-join to the text and each fit the column', () => {
    const { content, probe } = stage();
    const text = paragraphText(LONG);
    const starts = breakLines(probe, text);
    expect(starts[0]).toBe(0);
    expect(starts.length).toBeGreaterThan(3);
    const pieces = starts.map((a, i) => text.slice(a, starts[i + 1] ?? text.length));
    expect(pieces.join('')).toBe(text);
    for (const p of pieces) expect(width(content, p.trimEnd())).toBeLessThanOrEqual(WIDTH + 0.5);
  });

  it('breaks inside a word wider than the column (Review Focus 2)', () => {
    const { content, probe } = stage();
    const text = `${INDENT}See https://example.com/${'x'.repeat(90)} now.`;
    const starts = breakLines(probe, text);
    const pieces = starts.map((a, i) => text.slice(a, starts[i + 1] ?? text.length));
    expect(pieces.join('')).toBe(text);
    for (const p of pieces) expect(width(content, p.trimEnd())).toBeLessThanOrEqual(WIDTH + 0.5);
  });
});

describe('layoutChapter', () => {
  it('emits fixed-height lines, a heading, and correct sentence and word bookkeeping', () => {
    const { content, probe } = stage();
    const ch = { idx: 2, title: 'Chapter III · The Party', paras: [LONG, ['Short one.'], ['A. Two.', 'B. Three.']], wordStart: 100 };
    const { block, lines } = layoutChapter(probe, ch);
    content.append(block);

    expect(block.dataset.ch).toBe('2');
    expect(lines[0]).toMatchObject({ chapter: 2, para: -1, wordEnd: 100 });
    expect(lines[0]!.el.textContent).toBe('Chapter III · The Party');
    for (const el of Array.from(block.children)) expect((el as HTMLElement).getBoundingClientRect().height).toBe(34);

    const body = lines.slice(1);
    expect(new Set(body.map((l) => l.para))).toEqual(new Set([0, 1, 2]));
    expect(body[0]!.el.textContent!.startsWith(INDENT)).toBe(true);
    expect(body[0]!.sFirst).toBe(0);
    const lastOfPara0 = body.filter((l) => l.para === 0).at(-1)!;
    expect(lastOfPara0.sLast).toBe(1);
    const allWords = [LONG, ['Short one.'], ['A. Two.', 'B. Three.']].flat().map(countWords).reduce((a, b) => a + b, 0);
    expect(lines.at(-1)!.wordEnd).toBe(100 + allWords);
    // Paragraphs are separated by exactly one blank line.
    const firstPara1 = body.find((l) => l.para === 1)!.el;
    expect(firstPara1.previousElementSibling!.className).toBe('rd-blank');
    expect(firstPara1.previousElementSibling!.previousElementSibling!.className).toBe('rd-line');
  });
});

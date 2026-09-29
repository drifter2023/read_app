import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunState } from '../../src/core/grammar/service.ts';
import { GrammarDrawer } from '../../src/views/WordDrawer.tsx';

let root: Root | null = null;
afterEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; });

function render(run: RunState, width: number): HTMLElement {
  const still = document.createElement('style');
  still.textContent = '*, *::before { animation: none !important; }'; // measure the opened drawer, not its first frame
  document.body.append(still);
  const page = document.createElement('div');
  page.className = 'rd-page';
  Object.assign(page.style, { position: 'relative', width: `${width}px`, padding: '0 34px', boxSizing: 'border-box' });
  document.body.append(page);
  root = createRoot(page);
  flushSync(() => root!.render(createElement(GrammarDrawer, { closing: false, run, x: 120, onRetry: () => {} })));
  return page.querySelector<HTMLElement>('.wd')!;
}

/** The longest answer the prompt allows: a 24-字 pattern and 5 points of 60 字 each (all Chinese, the widest case). */
const POINT = '这一部分说明句子的主干成分以及它和后面从句之间的修饰关系，读的时候先抓住主语和谓语，再看后面的从句怎样修饰前面的名词和动词'.slice(0, 60);
const LONGEST: RunState = {
  status: 'done', cached: true,
  grammar: {
    pattern: '主句 + 定语从句 + 状语从句并列结构，再带一个插入语',
    points: ['主干', '定语从句', '状语从句', '独立主格', '插入语'].map((label) => ({ label, text: POINT })),
  },
};
const SHORT: RunState = { status: 'done', cached: true, grammar: { pattern: '简单句', points: [{ label: '主干', text: 'He looked like a satan' }] } };
const inner = (wd: HTMLElement) => wd.querySelector<HTMLElement>('.wd-inner')!;
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

describe('grammar drawer', () => {
  it('G-04: the longest allowed answer is capped at 320 px and scrolls inside, with a fade while more is below', async () => {
    expect(POINT.length).toBe(60);
    for (const w of [375, 402]) {
      const wd = render(LONGEST, w);
      await document.fonts.ready;
      await settle();
      expect(wd.getBoundingClientRect().height).toBeLessThanOrEqual(320);
      const el = inner(wd);
      expect(el.scrollHeight).toBeGreaterThan(el.clientHeight);
      expect(el.hasAttribute('data-more')).toBe(true);
      expect(el.scrollTop).toBe(0); // a stored answer opens at its top
      expect(el.hasAttribute('data-above')).toBe(false);
      el.scrollTop = el.scrollHeight;
      await expect.poll(() => el.hasAttribute('data-more')).toBe(false);
      expect(el.hasAttribute('data-above')).toBe(true);
      const mask = getComputedStyle(el).getPropertyValue('-webkit-mask-image') || getComputedStyle(el).maskImage;
      expect(mask).toMatch(/^linear-gradient\((transparent|rgba\(0, 0, 0, 0\)),/); // the top edge fades
      root!.unmount(); root = null; document.body.innerHTML = '';
    }
  });

  it('G-04: the cap is 45% of the screen on a short screen', async () => {
    const wd = render(LONGEST, 402);
    await document.fonts.ready;
    const cap = Math.min(320, innerHeight * 0.45);
    expect(inner(wd).getBoundingClientRect().height).toBeLessThanOrEqual(cap + 0.5);
  });

  it('G-04: a short answer sizes to its content, with no fade', async () => {
    const wd = render(SHORT, 402);
    await settle();
    expect(wd.getBoundingClientRect().height).toBeLessThan(200);
    expect(inner(wd).hasAttribute('data-more')).toBe(false);
  });

  it('G-02: a fast stream stays followed to its last line (our own scroll events do not let go)', async () => {
    const points = LONGEST.status === 'done' ? LONGEST.grammar.points : [];
    const wd = render({ status: 'waiting' }, 402);
    const el = inner(wd);
    for (let n = 0; n < points.length; n++) {
      for (let k = 6; k <= POINT.length; k += 6) {
        const run: RunState = { status: 'streaming', grammar: { pattern: '并列句', points: points.slice(0, n), pending: { kind: 'point', label: points[n]!.label, text: POINT.slice(0, k) } } };
        flushSync(() => root!.render(createElement(GrammarDrawer, { closing: false, run, x: 120, onRetry: () => {} })));
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    await settle();
    expect(el.scrollHeight).toBeGreaterThan(el.clientHeight);
    expect(el.scrollHeight - el.clientHeight - el.scrollTop).toBeLessThan(4);
  });

  it('G-02: a streaming answer keeps its newest line in view until the reader scrolls up', async () => {
    const stream = (n: number): RunState => ({
      status: 'streaming',
      grammar: { pattern: '并列句', points: LONGEST.status === 'done' ? LONGEST.grammar.points.slice(0, n) : [], pending: { kind: 'point', label: '时态', text: '正在写' } },
    });
    const wd = render(stream(4), 402);
    const el = inner(wd);
    const atBottom = () => el.scrollHeight - el.clientHeight - el.scrollTop < 4;
    await expect.poll(() => el.scrollHeight > el.clientHeight && atBottom()).toBe(true);
    el.scrollTop = 0;
    await settle();
    flushSync(() => root!.render(createElement(GrammarDrawer, { closing: false, run: stream(5), x: 120, onRetry: () => {} })));
    await settle();
    expect(el.scrollTop).toBe(0);
  });

  it('G-02: dots while waiting; the answer so far with a caret while streaming; no caret when done', () => {
    let wd = render({ status: 'waiting' }, 402);
    expect(wd.dataset.state).toBe('loading');
    expect(wd.querySelector('.wd-dots')).not.toBeNull();
    root!.unmount(); document.body.innerHTML = '';

    wd = render({ status: 'streaming', grammar: { pattern: '简单句', points: [{ label: '主干', text: 'eyes were horizontal' }], pending: { kind: 'point', label: '复合形容词', text: 'yellow-grey' } } }, 402);
    expect(wd.dataset.state).toBe('streaming');
    expect(wd.querySelector('.wd-dots')).toBeNull();
    expect([...wd.querySelectorAll('.wd-point dt')].map((d) => d.textContent)).toEqual(['主干', '复合形容词']);
    expect(wd.querySelectorAll('.wd-caret')).toHaveLength(1);
    expect(wd.querySelector('.wd-point:last-child dd .wd-caret')).not.toBeNull();
    root!.unmount(); document.body.innerHTML = '';

    wd = render(LONGEST, 402);
    expect(wd.dataset.state).toBe('ready');
    expect(wd.querySelectorAll('.wd-caret')).toHaveLength(0);
  });

  it('G-05: a failure keeps what arrived, says it was not saved, and offers 重试; no key offers no retry', () => {
    let wd = render({ status: 'error', reason: 'timeout', partial: { pattern: '简单句', points: [{ label: '主干', text: 'eyes were horizontal' }], pending: null } }, 402);
    expect(wd.dataset.state).toBe('error');
    expect(wd.querySelector('.wd-pattern')!.textContent).toBe('简单句');
    expect(wd.querySelector('.wd-miss')!.textContent).toBe('等待超时，没有保存');
    expect(wd.querySelector('button')!.textContent).toBe('重试');
    root!.unmount(); document.body.innerHTML = '';

    wd = render({ status: 'error', reason: 'no-key', partial: null }, 402);
    expect(wd.querySelector('.wd-miss')!.textContent).toBe('先在首页填写 DeepSeek API Key');
    expect(wd.querySelector('button')).toBeNull();
  });
});

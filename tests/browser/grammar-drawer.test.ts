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

/** The longest answer the prompt allows: a 16-字 pattern and 4 points of 36 字 each (all Chinese, the widest case). */
const LONGEST: RunState = {
  status: 'done', cached: true,
  grammar: {
    pattern: '主句 + 定语从句 + 状语从句并列结构',
    points: ['主干', '定语从句', '状语从句', '独立主格'].map((label) => ({
      label, text: '这一部分说明句子的主干成分以及它和后面从句之间的修饰关系，读的时候先抓住',
    })),
  },
};

describe('grammar drawer', () => {
  it('G-04: the longest allowed answer stays within 300 px, also on a 375 px wide screen', async () => {
    expect(LONGEST.status === 'done' && LONGEST.grammar.points[0]!.text.length).toBe(36);
    for (const w of [375, 402]) {
      const wd = render(LONGEST, w);
      await document.fonts.ready;
      expect(wd.getBoundingClientRect().height).toBeLessThanOrEqual(300);
      root!.unmount(); root = null; document.body.innerHTML = '';
    }
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

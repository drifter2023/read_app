import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, useRef, useState } from 'react';
import { fn } from 'storybook/test';
import { askButtonAt } from '../../core/reader/selection.ts';
import { LINES } from '../_stories/fixtures.ts';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { AskButton, SelectionHandle } from './SelectionUi.tsx';

/**
 * Select-to-ask (M11, C1–C2): a long-press on sharp text selects a word, a drag extends it, two handles
 * adjust it, and 问旁注 sends it to the Agent drawer as an attachment. No system menu or callout.
 * Here the selection is placed by measuring the still page; in the app the engine places it.
 */
const meta = {
  title: 'Reader/选中与问旁注 SelectionUi',
  component: AskButton,
  args: { x: 0, y: 0, on: true, onAsk: fn() },
  render: (args) => <Phone><ReaderPage band={[0, 6]} /><Selection from={{ line: 1, word: 'advice' }} to={{ line: 2, word: 'mind' }} on={args.on} onAsk={args.onAsk} /></Phone>,
} satisfies Meta<typeof AskButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};
/** While a finger is still dragging, the button waits (hidden) and the handles are off. */
export const Dragging: Story = { args: { on: false } };

interface Box { rects: DOMRect[]; start: DOMRect; end: DOMRect }

/** Rectangles over the selected words (one per line), the two handles and the button, from Range geometry. */
function Selection({ from, to, on, onAsk }: { from: { line: number; word: string }; to: { line: number; word: string }; on: boolean; onAsk: () => void }) {
  const probe = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    let live = true;
    // Measure once the book font is in: the fallback font's line widths are different.
    // (WebKit resolves `fonts.ready` before the page has asked for the face, so ask for it first.)
    void document.fonts.load("400 19.5px 'Newsreader Variable'").then(() => document.fonts.ready).then(() => { if (live) measure(); });
    return () => { live = false; };
  }, [from, to]);
  const measure = () => {
    const frame = probe.current!.parentElement!;
    const lines = [...frame.querySelectorAll<HTMLElement>('.rd-line')];
    const lineOf = (i: number) => lines.find((l) => l.textContent === LINES[i])!;
    // One range per line (like the engine's one rectangle per line): a range across lines would
    // also count the end of each line box.
    const rects: DOMRect[] = [];
    for (let i = from.line; i <= to.line; i++) {
      const text = LINES[i]!;
      if (!text) continue;
      const range = document.createRange();
      const node = lineOf(i).firstChild!;
      range.setStart(node, i === from.line ? text.indexOf(from.word) : text.length - text.trimStart().length);
      range.setEnd(node, i === to.line ? text.indexOf(to.word) + to.word.length : text.length);
      rects.push(range.getBoundingClientRect());
    }
    setBox({ rects, start: rects[0]!, end: rects.at(-1)! });
    setOrigin(frame.getBoundingClientRect());
  };
  const o = origin;
  const btn = box && o ? askButtonAt({ top: box.start.top - o.top, bottom: box.end.bottom - o.top, left: Math.min(...box.rects.map((r) => r.left)) - o.left, right: Math.max(...box.rects.map((r) => r.right)) - o.left }, o.width) : null;
  return (
    <>
      <span ref={probe} hidden />
      {box && o && btn && (
        <div className="rd-sel-ui" style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
          {box.rects.map((r, i) => (
            <span key={i} className="rd-sel-rect" style={{ transform: `translate(${r.left - o.left - 2}px, ${r.top - o.top}px)`, width: r.width + 4, height: r.height }} />
          ))}
          {on && <SelectionHandle end="start" x={box.start.left - o.left} top={box.start.top - o.top} height={box.start.height} />}
          {on && <SelectionHandle end="end" x={box.end.right - o.left} top={box.end.top - o.top} height={box.end.height} />}
          <AskButton x={btn.x} y={btn.y} on={on} onAsk={onAsk} />
        </div>
      )}
    </>
  );
}

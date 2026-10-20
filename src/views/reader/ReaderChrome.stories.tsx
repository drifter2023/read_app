import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { onText } from '../../core/reader/tap.ts';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { ReaderChrome } from './ReaderChrome.tsx';

/**
 * Top bar (‹ 书架 + title) and the floating capsule (目录 · Aa), shown and hidden together.
 * A tap in the title area (the top of the page down to just below the eyebrow, even on a word), on
 * blank space or at the page edge shows or hides them; a tap on text, blurred or sharp, only hides
 * them; they also fade after 3 s or on scroll (owner decisions 2026-10-15, owner request 2026-10-20).
 */
const meta = {
  title: 'Reader/顶部栏与胶囊 ReaderChrome',
  component: ReaderChrome,
  args: { visible: true, title: 'The Great Gatsby', onBack: fn(), onToc: fn(), onSettings: fn() },
  render: (args) => <Phone><ReaderPage overlay={<ReaderChrome {...args} />} /></Phone>,
} satisfies Meta<typeof ReaderChrome>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};
export const Hidden: Story = { args: { visible: false } };

/** Tap the margins or the gaps between paragraphs to show or hide them; a tap on a line only hides them. */
export const TapBlank: Story = {
  args: { visible: false },
  render: function Render(args) {
    const [on, setOn] = useState(args.visible);
    return (
      <Phone>
        <div style={{ display: 'contents' }} onClick={(e) => setOn(onText(e.target, e.clientX, e.clientY) ? false : !on)}>
          <ReaderPage overlay={<ReaderChrome {...args} visible={on} />} />
        </div>
      </Phone>
    );
  },
};

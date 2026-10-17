import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { ReaderChrome } from './ReaderChrome.tsx';

/**
 * Top bar (‹ 书架 + title) and the floating capsule (目录 · Aa), shown and hidden together.
 * Only a tap in the title area (the top of the page down to just below the eyebrow) shows or hides
 * them, even on a word; a tap anywhere else only hides them; they also fade after 3 s or on scroll
 * (owner decisions 2026-10-15).
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

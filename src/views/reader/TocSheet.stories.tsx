import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CHAPTERS } from '../_stories/fixtures.ts';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { TocSheet } from './TocSheet.tsx';

/** 目录 (R-10), opened from the capsule: the current chapter in vermilion; a tap jumps to its start. */
const meta = {
  title: 'Reader/目录 TocSheet',
  component: TocSheet,
  args: { chapters: CHAPTERS, current: 0, open: true, onPick: fn(), onClose: fn() },
  render: (args) => <Phone><ReaderPage overlay={<TocSheet {...args} />} /></Phone>,
} satisfies Meta<typeof TocSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstChapter: Story = {};
export const LaterChapter: Story = { args: { current: 4 } };

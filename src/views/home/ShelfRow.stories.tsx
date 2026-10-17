import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SHELF } from '../_stories/fixtures.ts';
import { HomeScreen } from '../_stories/Phone.tsx';
import { ShelfRow } from './ShelfRow.tsx';

/**
 * A shelf row on Home: cover (or a flat colour block from the title), title, author, progress and
 * "第 N 章 · 还剩 M 分" (or the day it was finished). Swipe left for 删除 (H-05).
 */
const meta = {
  title: 'Home/书架行 ShelfRow',
  component: ShelfRow,
  args: { book: SHELF.reading, open: false, onOpen: fn(), onDelete: fn(), onSwipe: fn() },
  render: (args) => <HomeScreen><ul className="shelf"><ShelfRow {...args} /></ul></HomeScreen>,
} satisfies Meta<typeof ShelfRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reading: Story = {};
export const NotStarted: Story = { args: { book: SHELF.fresh } };
export const Finished: Story = { args: { book: SHELF.done } };
/** A web article (M9): no cover, so the colour block. */
export const WebArticle: Story = { args: { book: SHELF.web } };
/** Swiped left: 删除 shows. */
export const Swiped: Story = { args: { open: true } };

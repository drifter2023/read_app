import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { setKey } from '../../core/ai/key.ts';
import type { Db } from '../../core/db/types.ts';
import { memDb } from '../_stories/fixtures.ts';
import { HomeScreen } from '../_stories/Phone.tsx';
import { AiKeyCard } from './AiKeyCard.tsx';

/**
 * Home → AI 语法分析 (G-01): the reader's own DeepSeek API key, used by the grammar drawer and the
 * Agent drawer. Saved only after DeepSeek accepts it; kept on the device. (These stories never press
 * 确认 with a key: that would call DeepSeek.)
 */
const meta = {
  title: 'Home/AI 语法分析 AiKeyCard',
  render: (_args, { loaded }) => <HomeScreen><AiKeyCard db={loaded.db as Db} /></HomeScreen>,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const NotSet: Story = { loaders: [async () => ({ db: await memDb() })] };

export const Connected: Story = {
  loaders: [async () => { const db = await memDb(); await setKey(db, 'sk-3f9a0c7d1e2b4a6c8d0e1f2a3b4cgood'); return { db }; }],
};

/** 更换 opens the field again, with 取消. */
export const Changing: Story = {
  ...Connected,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: '更换' }));
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/** 确认 with an empty field: the note asks for a key (nothing is sent). */
export const EmptyKey: Story = {
  ...NotSet,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole('button', { name: '确认' }));
    await expect(c.getByRole('status')).toHaveTextContent('请先填写 API Key');
    (document.activeElement as HTMLElement | null)?.blur(); // a scripted click leaves a focus ring a tap would not
  },
};

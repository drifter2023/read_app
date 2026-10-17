import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { HomeScreen } from '../_stories/Phone.tsx';
import { VocabCardView } from './VocabCard.tsx';

/**
 * Home → 预测生词 (M7, P-06): offers the one-minute vocabulary test until it is taken or skipped; then
 * shows the estimate, which lookups, 撤回 and reading keep correcting on the device.
 */
const meta = {
  title: 'Home/预测生词 VocabCard',
  component: VocabCardView,
  args: { state: null, size: null, onSkip: fn(), onTest: fn() },
  render: (args) => <HomeScreen><VocabCardView {...args} /></HomeScreen>,
} satisfies Meta<typeof VocabCardView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Offer: Story = {};
export const Tested: Story = { args: { state: 'done', size: '约 6,500 词' } };
export const Skipped: Story = { args: { state: 'skipped', size: '约 4,000 词' } };

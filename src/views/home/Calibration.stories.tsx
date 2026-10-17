import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { CalibrationItem } from '../../core/vocab/calibrate.ts';
import { Phone } from '../_stories/Phone.tsx';
import { CalibrationScreen } from './Calibration.tsx';

/** Real dictionary words from easy to rare, three per band, as pickItems draws them (24 in all). */
const ITEMS: CalibrationItem[] = Array.from({ length: 24 }, (_, i) => [
  { word: 'harbor', options: ['港口；海港', '收获；收成', '和谐；协调', '伤害；损害'], answer: 0 },
  { word: 'reticent', options: ['沉默寡言的', '有弹性的', '可悔改的', '退休的'], answer: 0 },
  { word: 'obsequious', options: ['谄媚的；奉承的', '模糊的；晦涩的', '必须遵守的', '过时的'], answer: 0 },
][i % 3]!);

/**
 * The one-minute vocabulary test (P-06), full screen over Home: one real word at a time, four meanings
 * and 不认识. No answer is marked right or wrong on screen; the result is an estimate, not a score.
 */
const meta = {
  title: 'Home/词汇量测试 Calibration',
  component: CalibrationScreen,
  args: { step: { kind: 'ask', items: ITEMS, answers: [] }, onAnswer: fn(), onClose: fn() },
  render: (args) => <Phone bg="var(--home-bg)"><CalibrationScreen {...args} /></Phone>,
} satisfies Meta<typeof CalibrationScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstWord: Story = {};
export const HalfWay: Story = { args: { step: { kind: 'ask', items: ITEMS, answers: Array.from({ length: 13 }, (_, i) => (i % 4 === 3 ? null : 0)) } } };
export const Result: Story = { args: { step: { kind: 'result', size: '约 6,500 词' } } };
export const Preparing: Story = { args: { step: { kind: 'loading' } } };

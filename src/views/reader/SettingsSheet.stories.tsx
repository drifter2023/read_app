import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { fn } from 'storybook/test';
import type { PrefsStore } from '../../core/prefs/prefs.ts';
import { prefsWith } from '../_stories/fixtures.ts';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { SettingsSheet } from './SettingsSheet.tsx';

/**
 * 阅读设置 (S-01, S-03), opened by Aa: 字号, 聚焦模糊, 清晰带, 模糊强度, 预测生词, 整句模式 on the
 * leather surface. With 聚焦模糊 off the rows it governs grey out and the whole page is sharp.
 * Every change applies live — the controls work here too.
 */
const meta = {
  title: 'Reader/阅读设置 SettingsSheet',
  render: (_args, { loaded }) => <Live prefs={loaded.prefs as PrefsStore} />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { loaders: [async () => ({ prefs: await prefsWith() })] };
export const BlurOff: Story = { loaders: [async () => ({ prefs: await prefsWith({ focusBlur: false }) })] };
export const LargeTextNoPredictions: Story = { loaders: [async () => ({ prefs: await prefsWith({ fontSize: 'L', predict: 'off', sentenceMode: true }) })] };

/** The page behind follows the switch, as in the reader. */
function Live({ prefs }: { prefs: PrefsStore }) {
  const [blur, setBlur] = useState(prefs.get().focusBlur);
  useEffect(() => prefs.subscribe((p) => setBlur(p.focusBlur)), [prefs]);
  return <Phone><ReaderPage sharp={!blur} overlay={<SettingsSheet prefs={prefs} open onClose={fn()} />} /></Phone>;
}

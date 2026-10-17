import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { fn } from 'storybook/test';
import type { Session } from '../../app/boot.ts';
import { setKey } from '../../core/ai/key.ts';
import { PrefsStore } from '../../core/prefs/prefs.ts';
import { setCalibrationState } from '../../core/vocab/store.ts';
import { memDb, shelfDb } from '../_stories/fixtures.ts';
import { Phone } from '../_stories/Phone.tsx';
import { HomeView } from './HomeView.tsx';

/**
 * Home (7a / 7b): date, the 纸白 · 夜读 capsule, Continue, the shelf with 在读 / 读完 and + 导入, then
 * the 预测生词 and AI 语法分析 cards.
 */
const meta = {
  title: 'Home/首页 HomeView',
  render: (_args, { loaded, globals }) => <Home session={loaded.session as Session} theme={globals.theme === 'night' ? 'night' : 'paper'} />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { loaders: [async () => { const db = await shelfDb(); return { session: { db, prefs: await PrefsStore.load(db) } }; }] };
/** Later on: the test taken (the estimate comes from the real dictionary) and a DeepSeek key saved. */
export const Settled: Story = {
  loaders: [async () => {
    const db = await shelfDb();
    await setCalibrationState(db, 'done');
    await setKey(db, 'sk-3f9a0c7d1e2b4a6c8d0e1f2a3b4cgood');
    return { session: { db, prefs: await PrefsStore.load(db) } };
  }],
};
/** Every book deleted: the three bundled books can be put back. */
export const EmptyShelf: Story = { loaders: [async () => { const db = await memDb(); return { session: { db, prefs: await PrefsStore.load(db) } }; }] };

/** The capsule shows the toolbar's theme; tapping it switches the page like the app does. */
function Home({ session, theme }: { session: Session; theme: 'paper' | 'night' }) {
  useEffect(() => { void session.prefs.set('theme', theme); }, [session, theme]);
  useEffect(() => session.prefs.subscribe((p) => { document.documentElement.dataset.theme = p.theme; }), [session]);
  return <Phone bg="var(--home-bg)"><HomeView session={session} onOpen={fn()} /></Phone>;
}

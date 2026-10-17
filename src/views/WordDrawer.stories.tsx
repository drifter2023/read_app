import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Phone, ReaderPage } from './_stories/Phone.tsx';
import { WordDrawer } from './WordDrawer.tsx';

/**
 * 单词抽屉 (Reader 4a): a tap on a sharp word tears the page open under its line. 保存 adds the word
 * to 生词; 撤回 (M5) undoes a mistaken tap: the book forgets the word (no footnotes, no record).
 */
const meta = {
  title: 'Reader/单词抽屉 WordDrawer',
  component: WordDrawer,
  args: {
    state: 'ready', closing: false, x: 190, saved: false, onSave: fn(), onUndo: fn(),
    result: { surface: 'vulnerable', lemma: 'vulnerable', phonetic: '/ˈvʌlnɚəbəl/', pos: 'adj.', gloss: '易受伤害的；脆弱的；易受攻击的', footnote: '脆弱的' },
  },
  render: (args) => (
    <Phone>
      <ReaderPage band={[0, 2]} gapAfter={0} hl={{ line: 0, word: 'vulnerable' }}>
        <WordDrawer {...args} />
      </ReaderPage>
    </Phone>
  ),
} satisfies Meta<typeof WordDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Saved: Story = { args: { saved: true } };
export const Loading: Story = { args: { state: 'loading', result: null } };
export const NotFound: Story = { args: { state: 'notfound', result: null } };
/** The notch follows the tapped word; near an edge it is clamped to 16 px from it. */
export const NotchAtEdge: Story = {
  args: { x: 60, result: { surface: 'younger', lemma: 'young', phonetic: '/jʌŋ/', pos: 'adj.', gloss: '年轻的；幼小的', footnote: '年轻的' } },
  render: (args) => (
    <Phone>
      <ReaderPage band={[0, 2]} gapAfter={0} hl={{ line: 0, word: 'younger' }}>
        <WordDrawer {...args} />
      </ReaderPage>
    </Phone>
  ),
};

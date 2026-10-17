import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { Grammar } from '../core/grammar/parse.ts';
import { Phone, ReaderPage } from './_stories/Phone.tsx';
import { GrammarDrawer } from './WordDrawer.tsx';

const ANSWER: Grammar = {
  translation: '在我年纪还轻、阅历尚浅的那些年里，父亲给过我一句忠告，从那以后我一直在心里反复琢磨。',
  pattern: '主句 + 定语从句：advice that I’ve been turning over…',
  points: [
    { label: '比较级并列', text: 'younger and more vulnerable 两个比较级并列，修饰 years，指“更年轻、更脆弱的那些年”。' },
    { label: '现在完成进行时', text: 'I’ve been turning over 表示从过去一直持续到现在的动作。' },
    { label: '短语动词', text: 'turn over in one’s mind：反复思考、琢磨。' },
  ],
};

/**
 * 语法抽屉 (M6): a tap on the droplet after a sentence in the focus band. DeepSeek streams the
 * sentence's translation on top (since 2026-09-30), then the pattern and up to five points.
 */
const meta = {
  title: 'Reader/语法抽屉 GrammarDrawer',
  component: GrammarDrawer,
  args: { closing: false, x: 356, onRetry: fn(), run: { status: 'done', grammar: ANSWER, cached: false } },
  render: (args) => (
    <Phone>
      <ReaderPage band={[0, 2]} gapAfter={2}>
        <GrammarDrawer {...args} />
      </ReaderPage>
    </Phone>
  ),
} satisfies Meta<typeof GrammarDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = {};
export const Waiting: Story = { args: { run: { status: 'waiting' } } };
export const Streaming: Story = {
  args: { run: { status: 'streaming', grammar: { translation: ANSWER.translation, pattern: ANSWER.pattern, points: ANSWER.points.slice(0, 1), pending: { kind: 'point', label: '现在完成进行时', text: 'I’ve been turning over 表示从过去' } } } },
};
export const NoKey: Story = { args: { run: { status: 'error', reason: 'no-key', partial: null } } };
/** A network failure after part of the answer arrived: the part stays, with 重试. */
export const FailedHalfway: Story = {
  args: { run: { status: 'error', reason: 'network', partial: { translation: ANSWER.translation, pattern: '', points: [], pending: null } } },
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { GuideBar } from './GuideBar.tsx';

/**
 * 带读 control bar (夜读 only, NIGHT_MODE_1c.md → N5): play / pause, the reading progress and the speed
 * (0.6× / 1× / 1.6×). Paused it stays; playing, it fades out after 3 s and the first touch on the page
 * pauses. While 带读 plays, only the lit sentence is sharp and in the accent.
 */
const meta = {
  title: 'Reader/带读 GuideBar',
  component: GuideBar,
  globals: { theme: 'night' },
  args: { playing: false, speed: 1, faded: false, fillRef: (el: HTMLElement | null) => { if (el) el.style.width = '23%'; }, onPlay: fn(), onPause: fn(), onSpeed: fn() },
  render: (args) => (
    <Phone>
      <ReaderPage band={[0, 7]} lit={args.playing ? [4, 7] : undefined} overlay={<GuideBar {...args} />} />
    </Phone>
  ),
} satisfies Meta<typeof GuideBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Playing: Story = { args: { playing: true } };
export const Fast: Story = { args: { playing: true, speed: 1.6 } };

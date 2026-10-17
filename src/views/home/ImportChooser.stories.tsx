import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Phone } from '../_stories/Phone.tsx';
import { ImportChooser } from './ImportChooser.tsx';

/**
 * + 导入 on Home (web build, M9 / L-03): paste a link to a web article (fetched by our own Worker,
 * article text only, the link is not kept) or pick an EPUB / TXT file.
 */
const meta = {
  title: 'Home/导入 ImportChooser',
  component: ImportChooser,
  args: { onLink: fn(), onFile: fn(), onClose: fn() },
  // Home components need the `.home` root: it sets their fonts (--zh) and secondary colour (--sec).
  render: (args) => <Phone bg="var(--home-bg)"><div className="home"><ImportChooser {...args} /></div></Phone>,
} satisfies Meta<typeof ImportChooser>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

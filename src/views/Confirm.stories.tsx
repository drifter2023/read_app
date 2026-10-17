import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { HomeScreen } from './_stories/Phone.tsx';
import { Confirm } from './Confirm.tsx';

/** The second confirmation before something is destroyed (H-05: deleting a book from the shelf). */
const meta = {
  title: 'Home/确认 Confirm',
  component: Confirm,
  args: { title: '删除《The Great Gatsby》？', body: '这本书的阅读进度和查词记录会一起删除。', action: '删除', onCancel: fn(), onConfirm: fn() },
  render: (args) => <HomeScreen><Confirm {...args} /></HomeScreen>,
} satisfies Meta<typeof Confirm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DeleteBook: Story = {};

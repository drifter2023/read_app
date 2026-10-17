import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import '../src/styles/fonts.css';
import '../src/styles/tokens.css';
import '../src/styles/home.css';
import '../src/styles/reader.css';
import '../src/styles/agent.css';

/** 纸白 / 夜读, as the Home capsule sets it: `data-theme` on <html>. */
const withTheme: Decorator = (Story, ctx) => {
  const theme = ctx.globals.theme === 'night' ? 'night' : 'paper';
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <Story />;
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: '纸白 / 夜读',
      toolbar: { title: '主题', icon: 'mirror', items: [{ value: 'paper', title: '纸白' }, { value: 'night', title: '夜读' }], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'paper' },
  decorators: [withTheme],
  parameters: { layout: 'fullscreen', controls: { expanded: true } },
};
export default preview;

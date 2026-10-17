import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Component stories (dev only; nothing here ships in the app). Also the source for /design-sync.
 * public/ is served as in the app (covers, dict.db): run `npm run assets` once first.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true }, // zero network: no usage reports
  // The app's own plugins (service worker precache, the /api/fetch dev proxy) have no place here.
  viteFinal: (cfg) => ({
    ...cfg,
    plugins: (cfg.plugins ?? []).flat().filter((p) => !(p && typeof p === 'object' && 'name' in p && String(p.name).startsWith('spotlight-'))),
  }),
};
export default config;

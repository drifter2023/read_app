import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lin.spotlight',
  appName: 'Spotlight',
  webDir: 'dist',
  // The reader's own container scrolls; the web view itself must not bounce or inset content.
  ios: { contentInset: 'never', scrollEnabled: false },
};

export default config;

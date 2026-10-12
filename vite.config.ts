import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { workerApi } from './scripts/api-plugin.ts';
import { precacheServiceWorker } from './scripts/sw-plugin.ts';

// base './' so the build works from capacitor://localhost and from any sub-path.
export default defineConfig({ plugins: [react(), precacheServiceWorker(), workerApi()], base: './', build: { target: 'safari16' } });

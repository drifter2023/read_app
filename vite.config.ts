import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works from capacitor://localhost and from any sub-path.
export default defineConfig({ plugins: [react()], base: './', build: { target: 'safari16' } });

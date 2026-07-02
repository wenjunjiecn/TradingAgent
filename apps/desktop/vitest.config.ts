import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  test: {
    name: 'unit:apps/desktop',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', '**/node_modules/**'],
  },
});

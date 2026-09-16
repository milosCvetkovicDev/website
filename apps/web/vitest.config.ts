import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Report-only: `pnpm --filter web test:coverage` prints a summary and fails on nothing. A
    // threshold, and running it in CI, would each need a decision of their own.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});

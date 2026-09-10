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
    // The animated-hero phases mount deep GSAP trees: single cases take 1.3-2.5s on an idle
    // 12-core machine, and CI runs the whole suite with one worker on a two-core runner. The 5s
    // default leaves too little headroom there, and a timeout fails unrelated files in the run.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});

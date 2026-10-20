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
    // Report-only: `pnpm --filter web test:coverage` has no coverage threshold, so the numbers
    // never fail the run; a failing test still does. A threshold, and running it in CI, would each
    // need a decision of their own. `reportOnFailure` prints the summary when a test fails too, so
    // one flaky test under load does not cost a rerun of the whole suite to see the numbers.
    // `include` names source extensions only: the provider parses every file it matches as code,
    // and a non-code file (`src/app/fonts/README.md` under `src/**`) logs a stack trace. `exclude`
    // drops test infrastructure, which vitest counts as source: `src/test/**` and the helpers in
    // `__tests__` folders (vitest already leaves out the `*.test.*` files themselves). A completed
    // text-summary run leaves no `coverage/` behind, but the provider writes `coverage/.tmp` while
    // it runs, and an interrupted run can leave it; `/coverage` in apps/web/.gitignore, `coverage`
    // in the root .gitignore, `/apps/web/coverage` in .vercelignore, the ESLint global ignores and
    // `pnpm clean` all cover it.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/__tests__/**'],
    },
  },
  // Mirrors `paths` in tsconfig.json. The file is `.mts` so Vite's native config loader reads it as
  // ESM rather than warning on every run (#188); `"type": "module"` in apps/web/package.json would
  // do the same but change how Next, Playwright and Node load every other config here. ESM has no
  // `__dirname`, hence `import.meta.dirname`.
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});

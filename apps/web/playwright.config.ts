import { defineConfig, devices } from '@playwright/test';

// GitHub Actions sets CI=true; anything else (including "false") is treated as local.
const isCI = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // CI runners are slow and the pages are animation-heavy: one worker, longer expect timeout.
  workers: isCI ? 1 : undefined,
  expect: { timeout: isCI ? 10_000 : 5_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI runs the production build (`pnpm build` runs first); locally the dev server is reused.
    command: isCI ? 'pnpm start' : 'pnpm dev',
    port: 3000,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});

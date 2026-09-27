import { defineConfig, devices } from '@playwright/test';

/**
 * The check that runs against the deployed site after Vercel reports a production deployment
 * ready (`.github/workflows/live-check.yml`), and by hand with
 * `pnpm --filter web exec playwright test --config playwright.live.config.ts`.
 *
 * A configuration of its own, over a directory of its own: the main suite in `playwright.config.ts`
 * starts the server it tests and runs every spec under `e2e/`, and what this one checks exists only
 * on Vercel, where `VERCEL_ENV` turns Web Analytics on (ADR 0026). So it starts no server and never
 * sees the main suite's specs, which never see its spec either.
 *
 * `LIVE_URL` overrides the target, the apex by default. Vercel's own deployment URLs sit behind
 * Vercel Authentication, so the public apex is what this checks.
 */
export const DEFAULT_LIVE_URL = 'https://miloscvetkovic.dev';

export default defineConfig({
  testDir: './e2e-live',
  forbidOnly: true,
  // The network between a runner and the site is the one thing here that can fail by itself.
  retries: 2,
  workers: 1,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.LIVE_URL || DEFAULT_LIVE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

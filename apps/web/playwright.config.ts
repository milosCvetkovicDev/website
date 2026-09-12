import { defineConfig, devices } from '@playwright/test';

// GitHub Actions sets CI=true; anything else (including "false") is treated as local. This chooses
// the command and the runner hardening below, not the port: docs/runbooks/deploy.md sets CI=true by
// hand to reproduce the CI path on a developer machine, where 3000 is usually taken.
const isCI = process.env.CI === 'true' || process.env.CI === '1';

// 3000 belongs to `pnpm dev`, and on a machine running several checkouts of this repository it
// belongs to whichever one claimed it first, so the suite serves 3210 instead. CI overrides this
// back to 3000 through PLAYWRIGHT_PORT in .github/workflows/ci.yml (ADR 0014).
const DEFAULT_PORT = 3210;

/**
 * The port this run serves and tests. `PLAYWRIGHT_PORT` overrides the default, which is what CI
 * does, and what a second checkout needs when it runs its own suite at the same time.
 *
 * A value that is not a usable port throws instead of falling back to the default: serving a port
 * other than the one that was asked for is the class of failure this configuration exists to
 * remove, and a warning nobody reads would reintroduce it.
 *
 * Exported so `src/test/playwright-config.test.ts` can pin the parsing, as `next.config.ts` does
 * with `findWorkspaceRoot`.
 */
export function resolvePort(raw: string | undefined, fallback: number): number {
  // An unset variable and one a shell expanded to nothing mean the same thing: take the default.
  if (raw === undefined || raw === '') return fallback;
  // Digits, no leading zero. `Number` would otherwise accept "0x0c8a", "3.21e3" and " 3210 " as
  // 3210, and "03000" as 3000 — a value that reads as one port and resolves to another.
  const port = /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PLAYWRIGHT_PORT must be an integer between 1 and 65535, got "${raw}".`);
  }
  return port;
}

const port = resolvePort(process.env.PLAYWRIGHT_PORT, DEFAULT_PORT);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // A test that passes only on a retry fails the run in CI. The retries stay (ADR 0004), so a flake
  // is still retried and reported as flaky, but the job goes red, which is what uploads the report
  // and the `on-first-retry` trace (`failure() || cancelled()` in ci.yml) instead of discarding
  // both with a green run. Locally there are no retries, so a flake has nothing to pass on.
  failOnFlakyTests: isCI,
  // CI runners are slow and the pages are animation-heavy: one worker, longer expect timeout.
  workers: isCI ? 1 : undefined,
  expect: { timeout: isCI ? 10_000 : 5_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI runs the production build (`pnpm build` runs first); locally the dev server.
    command: isCI ? 'pnpm start' : 'pnpm dev',
    // Playwright merges this over process.env rather than replacing it. `next dev` and `next start`
    // both read PORT, so the port reaches Next without depending on how pnpm forwards arguments.
    env: {
      PORT: String(port),
      // Only the dev server builds anything at run time, and it may run beside a `pnpm dev` started
      // by hand from this same checkout: two `next dev` processes writing one build directory race,
      // so it gets its own (apps/web/next.config.ts reads NEXT_DIST_DIR). `pnpm start` is pinned to
      // .next, which is where `next build` wrote: set explicitly rather than omitted, because
      // Playwright merges this over process.env and an omitted key would inherit an ambient value.
      NEXT_DIST_DIR: isCI ? '.next' : '.next-e2e',
    },
    port,
    // Never attach to a server this run did not start. Reuse was on locally until ADR 0014: a
    // `next start` from another checkout of this same site answered every request convincingly, so
    // the suite passed against a build that was not the working tree. A port that is already taken
    // now aborts the run instead.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

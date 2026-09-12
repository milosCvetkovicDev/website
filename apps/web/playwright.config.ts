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

/**
 * Selects the phone-only specs under `e2e/mobile/`.
 *
 * Anchored on a path separator so it cannot be satisfied by a file merely *named* for a phone:
 * `e2e/mobile-menu.spec.ts` at the top level would match a bare `/mobile/` on some platforms once
 * Playwright normalises separators, and would then run three times at three viewports. A trailing
 * separator requires the directory.
 *
 * Exported for `src/test/playwright-config.test.ts`, which pins both halves of the split: a spec in
 * `e2e/mobile/` runs on the two phone projects and on neither desktop one, and a spec outside it the
 * other way round. The two projects' `testMatch` and the desktop project's `testIgnore` are the same
 * pattern, so they cannot drift apart into a spec that runs everywhere or nowhere.
 */
export const MOBILE_SPECS = /[\\/]mobile[\\/]/;

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
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  // Three projects. The desktop one is the original and still runs everything that is not phone
  // specific; the two phone ones run only `e2e/mobile/`, which is where a spec goes when the defect
  // it measures needs a real phone viewport and a real `isMobile` (a tap rather than a click, and a
  // `<header>` whose `backdrop-blur-sm` becomes the containing block for the `fixed` menu panel it
  // renders — the whole of pages-1).
  //
  // WebKit rather than Firefox for the second engine, for two reasons that both matter here:
  // Playwright's `isMobile` is unsupported on Firefox, and whether a `backdrop-filter` ancestor
  // becomes the containing block for a `fixed` descendant is exactly the class of behaviour that
  // differs between Blink and WebKit. A mobile-menu geometry assertion that only ever ran on
  // Chromium would say nothing about what an iPhone visitor sees.
  //
  // `resolvePort` and the `webServer` block below are untouched: one server, started by this run,
  // never reused, whichever projects are selected (ADR 0014).
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Without this the desktop project would run the phone specs at 1280x720, where the mobile
      // header is `md:hidden` and every menu locator resolves to nothing: nine tests failing for a
      // reason that has nothing to do with the defect they exist to record.
      testIgnore: MOBILE_SPECS,
    },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, testMatch: MOBILE_SPECS },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] }, testMatch: MOBILE_SPECS },
  ],
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

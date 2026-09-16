/**
 * These assertions read a configuration module with no DOM in them, and building a jsdom window is
 * the most expensive thing in a test file that does not need one -- importing the module alone costs
 * about two seconds in every worker.
 *
 * @vitest-environment node
 */
import type { PlaywrightTestConfig } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePort } from '../../playwright.config';

const FALLBACK = 3210;
const resolve = (raw: string | undefined) => resolvePort(raw, FALLBACK);

describe('resolvePort', () => {
  it('takes the default when PLAYWRIGHT_PORT is unset or expanded to nothing by a shell', () => {
    expect(resolve(undefined)).toBe(FALLBACK);
    expect(resolve('')).toBe(FALLBACK);
  });

  it('takes a plain port number', () => {
    expect(resolve('3000')).toBe(3000);
    expect(resolve('3211')).toBe(3211);
    expect(resolve('1')).toBe(1);
    expect(resolve('65535')).toBe(65_535);
  });

  // `Number` reads every one of these as a valid number, most of them as exactly 3210 or 3000. A
  // value that reads as one port and resolves to another is the failure ADR 0014 exists to remove,
  // so the parse is digits-only with no leading zero rather than `Number`.
  it.each(['0x0c8a', '3.21e3', ' 3210 ', '3210.0', '03000', '0000003210', '1_000', '+3000'])(
    'rejects %j, which Number would accept',
    (raw) => {
      expect(() => resolve(raw)).toThrow(/must be an integer between 1 and 65535/);
    },
  );

  it.each(['abc', '3210abc', '-1', '0', '65536', '70000', 'Infinity', 'NaN', ' '])(
    'rejects %j',
    (raw) => {
      expect(() => resolve(raw)).toThrow(/must be an integer between 1 and 65535/);
    },
  );

  it('names the offending value, so the message says what to correct', () => {
    expect(() => resolve('abc')).toThrow(
      'PLAYWRIGHT_PORT must be an integer between 1 and 65535, got "abc".',
    );
  });
});

/**
 * Loads playwright.config.ts fresh under the current environment. The module reads `process.env`
 * while it is evaluated, so each mode needs its own module instance.
 */
async function loadConfig(ci: string | undefined): Promise<PlaywrightTestConfig> {
  vi.stubEnv('CI', ci);
  // The suite's own port must not leak into the assertions: a developer or CI runner that exported
  // PLAYWRIGHT_PORT would otherwise change what `command` and `port` come out as.
  vi.stubEnv('PLAYWRIGHT_PORT', '');
  vi.resetModules();
  return (await import('../../playwright.config')).default;
}

describe('playwright.config.ts flaky tests', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // CI retries twice (ADR 0004). Without this a test that passed only on a retry left the job green,
  // and the report and its retry trace are uploaded only when the job fails, so both were discarded.
  it('fails the run on a flaky test under CI', async () => {
    expect((await loadConfig('true')).failOnFlakyTests).toBe(true);
  });

  // Locally there are no retries, so nothing can pass on one.
  it('leaves it off locally', async () => {
    expect((await loadConfig(undefined)).failOnFlakyTests).toBeFalsy();
  });
});

/** `webServer` is typed as one object or an array of them; every assertion here wants the object. */
function webServerOf(config: PlaywrightTestConfig) {
  const { webServer } = config;
  expect(Array.isArray(webServer)).toBe(false);
  expect(webServer).toBeDefined();
  return webServer as Exclude<typeof webServer, readonly unknown[] | undefined>;
}

describe('playwright.config.ts webServer (ADR 0014)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Reuse was on locally until ADR 0014: a `next start` from another checkout of this same site
  // answered every request convincingly, so the suite passed against a build that was not the
  // working tree. False in both modes, so a taken port aborts the run instead.
  it.each([
    ['CI', 'true'],
    ['local', undefined],
  ])('never attaches to a server it did not start (%s)', async (_label, ci) => {
    expect(webServerOf(await loadConfig(ci)).reuseExistingServer).toBe(false);
  });

  it('serves the production build under CI and the dev server locally', async () => {
    expect(webServerOf(await loadConfig('true')).command).toBe('pnpm start');
    expect(webServerOf(await loadConfig(undefined)).command).toBe('pnpm dev');
  });

  // Only the dev server builds anything at run time, and it may run beside a `pnpm dev` from this
  // same checkout, so it gets its own build directory. Set explicitly in both modes rather than
  // omitted under CI: Playwright merges this over process.env, so an omitted key would inherit an
  // ambient NEXT_DIST_DIR and point `pnpm start` at a directory `next build` never wrote.
  it('pins NEXT_DIST_DIR in both modes', async () => {
    expect(webServerOf(await loadConfig('true')).env?.NEXT_DIST_DIR).toBe('.next');
    expect(webServerOf(await loadConfig(undefined)).env?.NEXT_DIST_DIR).toBe('.next-e2e');
  });

  it('serves the port it tests', async () => {
    const config = await loadConfig(undefined);
    expect(webServerOf(config).port).toBe(FALLBACK);
    expect(config.use?.baseURL).toBe(`http://localhost:${FALLBACK}`);
  });
});

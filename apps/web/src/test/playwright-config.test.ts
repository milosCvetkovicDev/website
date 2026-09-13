import { describe, expect, it } from 'vitest';
import config, { MOBILE_SPECS, resolvePort } from '../../playwright.config';

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
 * The three projects and the split between them.
 *
 * A phone spec that silently stopped running is the failure mode worth a test: `testMatch` and
 * `testIgnore` accept a pattern that matches nothing without complaining, so a renamed directory or
 * a pattern that lost its separators would leave the mobile-menu baseline green by never executing.
 * `playwright test --list` would show it, and nobody reads a list on a green run. These fail instead.
 */
describe('the Playwright projects', () => {
  const projects = config.projects ?? [];
  const byName = (name: string) => projects.find((project) => project.name === name);

  it('declares the desktop project and the two phone projects, and nothing else', () => {
    expect(projects.map(({ name }) => name)).toEqual([
      'chromium',
      'mobile-chrome',
      'mobile-safari',
    ]);
  });

  it('gives each phone project a real device descriptor with a phone viewport', () => {
    // `devices[...]` for a name Playwright does not know is `undefined`, and spreading that leaves
    // `use` empty: the project would run at the default desktop viewport under a name saying
    // otherwise, and every geometry assertion in e2e/mobile/ would be measuring a desktop. Reading
    // the emulation back is what catches a typo in the device name.
    for (const name of ['mobile-chrome', 'mobile-safari']) {
      const use = byName(name)?.use;
      expect(use?.isMobile, `${name} must emulate a mobile device`).toBe(true);
      expect(use?.hasTouch, `${name} must have touch input`).toBe(true);
      expect(use?.viewport?.width, `${name}'s viewport must be phone sized`).toBeLessThan(500);
    }
    // Two engines, deliberately: whether a `backdrop-filter` ancestor becomes the containing block
    // for a `fixed` descendant differs between Blink and WebKit, and that is the mechanism the
    // mobile-menu rows measure.
    expect(byName('mobile-chrome')?.use?.defaultBrowserType).toBe('chromium');
    expect(byName('mobile-safari')?.use?.defaultBrowserType).toBe('webkit');
  });

  it('runs e2e/mobile/ on both phone projects and on neither desktop one', () => {
    expect(byName('mobile-chrome')?.testMatch).toBe(MOBILE_SPECS);
    expect(byName('mobile-safari')?.testMatch).toBe(MOBILE_SPECS);
    expect(byName('chromium')?.testIgnore).toBe(MOBILE_SPECS);
    // The desktop project keeps Playwright's default match, so a new top-level spec is picked up
    // without being listed anywhere.
    expect(byName('chromium')?.testMatch).toBeUndefined();
    // And neither phone project may pick up a desktop spec: those are written for a viewport where
    // the mobile header does not exist.
    expect(byName('mobile-chrome')?.testIgnore).toBeUndefined();
    expect(byName('mobile-safari')?.testIgnore).toBeUndefined();
  });

  it.each([
    ['e2e/mobile/navigation.spec.ts', true],
    ['e2e/mobile/layout-overflow.spec.ts', true],
    ['/abs/path/apps/web/e2e/mobile/navigation.spec.ts', true],
    ['e2e\\mobile\\navigation.spec.ts', true],
    ['e2e/layout-overflow.spec.ts', false],
    ['e2e/accessibility.spec.ts', false],
    // Anchored on separators, so a top-level spec merely named for a phone stays on the desktop
    // project instead of running three times at three viewports.
    ['e2e/mobile-menu.spec.ts', false],
    ['e2e/is-mobile.spec.ts', false],
  ])('%s is a phone spec: %s', (path, isMobileSpec) => {
    expect(MOBILE_SPECS.test(path)).toBe(isMobileSpec);
  });

  it('keeps one server for every project', () => {
    // Three projects share one `webServer`, and it is still never reused: a run that attached to
    // someone else's server would test a build that is not this working tree (ADR 0014).
    expect(config.webServer).toEqual(expect.objectContaining({ reuseExistingServer: false }));
  });
});

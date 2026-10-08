/**
 * These assertions read a configuration module with no DOM in them, and building a jsdom window is
 * the most expensive thing in a test file that does not need one.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlaywrightTestConfig } from '@playwright/test';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHROMIUM_LAUNCH_ARGS } from '../../e2e/support/chromium-launch-args';
import config, { MOBILE_SPECS, resolvePort } from '../../playwright.config';
import flakeHuntConfig from '../../playwright.flake-hunt.config';
import liveConfig from '../../playwright.live.config';

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
    // Two engines, deliberately: how a modal dialog handles focus differs between Blink and
    // WebKit, and 'Tab and Shift+Tab from the Close button keep focus in the menu, in both engines'
    // in e2e/mobile/navigation.spec.ts runs on both. The mobile-menu rows were written against a
    // `backdrop-filter` header that clipped the menu, which the header has not had since #147.
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

  // Every Playwright config in the repository: the e2e suite's, the nightly hunt's and the live
  // check's.
  const CONFIGS = [
    ['playwright.config.ts', config],
    ['playwright.flake-hunt.config.ts', flakeHuntConfig],
    ['playwright.live.config.ts', liveConfig],
  ] as const;
  // Playwright's own rule for a project's browser: `browserName`, else the device's, else Chromium.
  const engineOf = (project: (typeof projects)[number]) =>
    project.use?.browserName ?? project.use?.defaultBrowserType ?? 'chromium';

  it.each(CONFIGS)(
    "keeps V8's garbage collector on the main thread in %s's Chromium (#223)",
    (_, loaded) => {
      // Without it Chromium 153 hangs for good, now and then, in the reduced-motion walk on `/`.
      const all = loaded.projects ?? [];
      const chromium = all.filter((project) => engineOf(project) === 'chromium');
      expect(chromium.length).toBeGreaterThan(0);
      for (const project of chromium) {
        expect(project.use?.launchOptions?.args, project.name).toEqual([...CHROMIUM_LAUNCH_ARGS]);
      }
      // The flag is V8's: WebKit is launched without it.
      for (const project of all.filter((project) => engineOf(project) !== 'chromium')) {
        expect(project.use?.launchOptions?.args ?? [], project.name).not.toContainEqual(
          expect.stringMatching(/^--js-flags=/),
        );
      }
      // A run-wide setting would reach WebKit too, and a project's own would replace it anyway.
      expect(loaded.use?.launchOptions).toBeUndefined();
    },
  );

  it('puts every V8 flag into the one --js-flags entry (#223)', () => {
    // Chromium keeps only the last of a repeated switch, so a second entry would drop the first.
    const jsFlags = CHROMIUM_LAUNCH_ARGS.filter((arg) => arg.startsWith('--js-flags='));
    expect(jsFlags).toHaveLength(1);
    const [entry = ''] = jsFlags;
    expect(entry.slice('--js-flags='.length).split(/\s+/)).toContain('--single-threaded-gc');
  });

  it('lets no spec drop the launch flags (#223)', () => {
    const appDir = fileURLToPath(new URL('../../', import.meta.url));
    const dirs = new Set(CONFIGS.map(([, loaded]) => join(appDir, loaded.testDir ?? '.')));
    // The module that defines the flags is the one file allowed to spell them out.
    const definition = fileURLToPath(
      new URL('../../e2e/support/chromium-launch-args.ts', import.meta.url),
    );
    const scans = [...dirs].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .map((file) => join(dir, file))
        .filter((path) => /\.[cm]?[jt]sx?$/.test(path) && path !== definition)
        .map((path) => ({ file: relative(appDir, path), ...scanSpec(path) })),
    );
    for (const { file, launchOptions, jsFlags, launches } of scans) {
      // `test.use({ launchOptions })` would replace the projects' flags, and in `e2e/mobile/` it
      // would reach WebKit as well.
      expect(launchOptions, `${file} names launchOptions on these lines`).toEqual([]);
      expect(jsFlags, `${file} sets --js-flags of its own on these lines`).toEqual([]);
      // In a test, Playwright merges the project's launch options into a launch call shallowly, so
      // a call with `args` of its own, as the Lighthouse spec needs for a debugging port, replaces
      // the flags unless it spreads them back in.
      expect(
        launches.filter(({ keepsFlags }) => !keepsFlags).map(({ line }) => line),
        `${file} launches a browser without the flags on these lines`,
      ).toEqual([]);
    }
    // The Lighthouse spec launches Chromium itself, so the scan has a launch call to find.
    expect(scans.flatMap(({ launches }) => launches).length).toBeGreaterThan(0);
  });

  it('runs the Chromium build the launch flags were measured on (ADR 0032)', () => {
    // The flags work around one build, 153.0.8010.12 (Playwright 1.63.0). An upgrade that changes
    // it fails here until someone has decided whether they are still needed: ADR 0032 says how to
    // check, then either remove them or keep them and move this pin. A release that keeps the build
    // passes.
    expect(
      chromiumBuilds(),
      'Chromium changed: is CHROMIUM_LAUNCH_ARGS still needed? ADR 0032',
    ).toEqual({
      chromium: '153.0.8010.12',
      'chromium-headless-shell': '153.0.8010.12',
    });
  });

  it('keeps one server for every project', () => {
    // Three projects share one `webServer`, and it is still never reused: a run that attached to
    // someone else's server would test a build that is not this working tree (ADR 0014).
    expect(config.webServer).toEqual(expect.objectContaining({ reuseExistingServer: false }));
  });
});

/**
 * Loads playwright.config.ts fresh under the current environment. The module reads `process.env`
 * while it is evaluated, so each mode needs its own module instance.
 */
async function loadConfig(ci: string | undefined, port = ''): Promise<PlaywrightTestConfig> {
  vi.stubEnv('CI', ci);
  // The suite's own port must not leak into the assertions: a developer or CI runner that exported
  // PLAYWRIGHT_PORT would otherwise change what `webServer` and `baseURL` come out as. A test that
  // wants an override passes it; everything else gets the fallback.
  vi.stubEnv('PLAYWRIGHT_PORT', port);
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
  // The setting is run-wide, so it covers all three projects, the two phone ones included.
  // Both spellings the config documents as CI, so a runner that exports CI=1 is not left out.
  it.each(['true', '1'])('fails the run on a flaky test under CI=%s', async (ci) => {
    expect((await loadConfig(ci)).failOnFlakyTests).toBe(true);
  });

  // Locally there are no retries, so nothing can pass on one. A stray CI=false or CI=0 is local too.
  it.each([undefined, 'false', '0'])('leaves it off with CI=%s', async (ci) => {
    expect((await loadConfig(ci)).failOnFlakyTests).toBeFalsy();
  });
});

/** `webServer` is typed as one object or an array of them; the assertions here want the object. */
function webServerOf(loaded: PlaywrightTestConfig) {
  const { webServer } = loaded;
  expect(webServer).toBeDefined();
  expect(Array.isArray(webServer)).toBe(false);
  return webServer as Exclude<typeof webServer, readonly unknown[] | undefined>;
}

// Every spelling of CI the config tells apart, with the server each one must get: `CI=true` and
// `CI=1` run the production build, anything else (a stray `false` or `0` included) the dev server,
// exactly as `servesProductionBuild` in e2e/support/build-mode.ts decides.
const MODES: [ci: string | undefined, command: string, distDir: string][] = [
  ['true', 'pnpm start', '.next'],
  ['1', 'pnpm start', '.next'],
  [undefined, 'pnpm dev', '.next-e2e'],
  ['false', 'pnpm dev', '.next-e2e'],
  ['0', 'pnpm dev', '.next-e2e'],
];

describe('playwright.config.ts webServer (ADR 0014)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Reuse was on locally until ADR 0014: a `next start` from another checkout of this same site
  // answered every request convincingly, so the suite passed against a build that was not the
  // working tree. False in every mode, so a taken port aborts the run instead.
  it.each(MODES)('never attaches to a server it did not start (CI=%s)', async (ci) => {
    expect(webServerOf(await loadConfig(ci)).reuseExistingServer).toBe(false);
  });

  // No `cwd`, so Playwright starts the server in the config file's directory, apps/web, where
  // `pnpm start` and `pnpm dev` are the site's own scripts rather than the workspace root's.
  it.each(MODES)('runs the right server under CI=%s: %s', async (ci, command) => {
    const webServer = webServerOf(await loadConfig(ci));
    expect(webServer.command).toBe(command);
    expect(webServer.cwd).toBeUndefined();
  });

  // Set in both modes rather than omitted under CI. Locally the dev server gets a directory of its
  // own, so it never races a `pnpm dev` from the same checkout over apps/web/.next. Under CI the pin
  // is `.next` because that is where the job's `pnpm --filter web build` step writes, and it writes
  // there only because nothing sets NEXT_DIST_DIR for it: a value exported for the whole job would
  // reach that step too, and `next start` would then look in `.next` for a build that went
  // elsewhere. The last test here holds ci.yml to that.
  it.each(MODES)('pins NEXT_DIST_DIR under CI=%s', async (ci, _command, distDir) => {
    expect(webServerOf(await loadConfig(ci)).env?.NEXT_DIST_DIR).toBe(distDir);
  });

  // The server's port, the PORT Next reads and the URL the specs visit all come from one value, with
  // or without the override CI sets (PLAYWRIGHT_PORT=3000 in ci.yml). 3000 is not the fallback, so a
  // config that hard-coded the fallback in any of the three fails the override rows.
  it.each(
    MODES.flatMap(([ci]) => [
      [ci, '', FALLBACK],
      [ci, '3000', 3000],
    ]) as [string | undefined, string, number][],
  )('serves the port it tests (CI=%s, PLAYWRIGHT_PORT=%j)', async (ci, override, port) => {
    const loaded = await loadConfig(ci, override);
    expect(webServerOf(loaded).port).toBe(port);
    expect(webServerOf(loaded).env?.PORT).toBe(String(port));
    expect(loaded.use?.baseURL).toBe(`http://localhost:${port}`);
  });

  it('leaves the CI build step writing the directory the CI server reads', () => {
    const workflow = readFileSync(
      fileURLToPath(new URL('../../../../.github/workflows/ci.yml', import.meta.url)),
      'utf8',
    );
    expect(workflow).toContain('pnpm --filter web build');
    expect(workflow).not.toContain('NEXT_DIST_DIR');
  });
});

/**
 * The Chromium builds the installed Playwright runs, from playwright-core's `browsers.json`. The
 * package does not export that file, so it is read from beside the package's manifest, reached
 * through the packages that depend on it as pnpm lays them out.
 */
function chromiumBuilds(): Record<string, string> {
  let manifest = fileURLToPath(import.meta.url);
  for (const pkg of ['@playwright/test', 'playwright', 'playwright-core']) {
    manifest = createRequire(manifest).resolve(`${pkg}/package.json`);
  }
  const { browsers } = JSON.parse(
    readFileSync(join(dirname(manifest), 'browsers.json'), 'utf8'),
  ) as {
    browsers: { name: string; browserVersion?: string }[];
  };
  return Object.fromEntries(
    browsers
      .filter(({ name }) => name === 'chromium' || name === 'chromium-headless-shell')
      .map(({ name, browserVersion }) => [name, browserVersion ?? '']),
  );
}

const LAUNCH_METHODS = new Set(['launch', 'launchPersistentContext', 'launchServer']);

/**
 * What a spec does with browser launch options, read from its syntax tree, so that a comment or a
 * string (a note about `launchOptions`, a route glob that a regular expression would read as a
 * comment) is never mistaken for code. A launch call keeps the flags when it passes no `args`,
 * since the project's then reach it, or when its `args` is an array, inline or a `const` in the
 * same file, that spreads `CHROMIUM_LAUNCH_ARGS`. Options it cannot read, such as a variable, count
 * as dropping them. Calls on `webkit` or `firefox` are left alone: the flag is V8's.
 */
function scanSpec(file: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const consts = new Map<string, ts.Expression>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      consts.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const spreadsFlags = (value: ts.Expression): boolean => {
    const array = ts.isIdentifier(value) ? consts.get(value.text) : value;
    return (
      array !== undefined &&
      ts.isArrayLiteralExpression(array) &&
      array.elements.some(
        (element) =>
          ts.isSpreadElement(element) &&
          ts.isIdentifier(element.expression) &&
          element.expression.text === 'CHROMIUM_LAUNCH_ARGS',
      )
    );
  };
  const keepsFlags = (call: ts.CallExpression, method: string): boolean => {
    const options = call.arguments[method === 'launchPersistentContext' ? 1 : 0];
    if (options === undefined) return true;
    if (!ts.isObjectLiteralExpression(options)) return false;
    const args = options.properties.find(
      ({ name }) =>
        name !== undefined &&
        (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
        name.text === 'args',
    );
    if (args === undefined) return true;
    if (ts.isPropertyAssignment(args)) return spreadsFlags(args.initializer);
    return ts.isShorthandPropertyAssignment(args) && spreadsFlags(args.name);
  };
  const found = {
    launchOptions: [] as number[],
    jsFlags: [] as number[],
    launches: [] as { line: number; keepsFlags: boolean }[],
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'launchOptions')
      found.launchOptions.push(lineOf(node));
    if (
      (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) &&
      node.text.includes('--js-flags')
    ) {
      found.jsFlags.push(lineOf(node));
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      LAUNCH_METHODS.has(node.expression.name.text) &&
      !(
        ts.isIdentifier(node.expression.expression) &&
        ['webkit', 'firefox'].includes(node.expression.expression.text)
      )
    ) {
      found.launches.push({
        line: lineOf(node),
        keepsFlags: keepsFlags(node, node.expression.name.text),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

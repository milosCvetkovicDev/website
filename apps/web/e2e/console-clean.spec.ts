import { expect, test, type Page } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';

/**
 * Every route must load without the browser reporting anything: no console errors, no console
 * warnings, no uncaught page errors. React hydration mismatches surface here too. In production
 * React logs "Minified React error #418" (markup mismatch) or "#423" (an error React recovered from
 * while hydrating); the dev server spells it out as "Hydration failed".
 */

interface Route {
  path: string;
  /** Status the document itself is expected to answer with. */
  status: number;
}

const routes: Route[] = [
  ...['/', '/about', '/work', '/skills', '/blog', '/contact'].map((path) => ({
    path,
    status: 200,
  })),
  // Derived from the data file, so a new case study is covered without touching this spec.
  ...caseStudies.map(({ slug }) => ({ path: `/work/${slug}`, status: 200 })),
  { path: '/no-such-page', status: 404 },
  { path: '/work/does-not-exist', status: 404 },
];

// Effects, GSAP timelines and React's deferred error reporting all run after the network goes idle.
const SETTLE_MS = 1_000;

interface Problem {
  kind: 'console.error' | 'console.warning' | 'console.assert' | 'pageerror';
  text: string;
  /** Script or resource the message came from, when the browser knows it. */
  url: string;
}

/** Starts collecting browser-reported problems. Must be called before the navigation. */
function collectProblems(page: Page): Problem[] {
  const problems: Problem[] = [];
  page.on('console', (message) => {
    const type = message.type();
    // DevTools shows a failed console.assert as an error; Playwright reports it as its own type.
    if (type === 'error' || type === 'warning' || type === 'assert') {
      problems.push({ kind: `console.${type}`, text: message.text(), url: message.location().url });
    }
  });
  page.on('pageerror', (error) => {
    // The stack names the chunk and line; for a minified React error it also carries the decoder
    // URL. A non-Error throw arrives with an empty stack and name, hence || rather than ??.
    problems.push({
      kind: 'pageerror',
      text: error.stack || `${error.name || 'Error'}: ${error.message}`,
      url: '',
    });
  });
  return problems;
}

// Chromium logs a console error for every 404 response, the document of a not-found page included.
// That single entry is the page working as designed; a 404 for an asset on the same page still
// fails.
function isExpectedDocument404(problem: Problem, route: Route, documentUrl: string): boolean {
  return (
    route.status === 404 &&
    problem.kind === 'console.error' &&
    problem.url === documentUrl &&
    problem.text.includes('the server responded with a status of 404')
  );
}

const describeProblem = ({ kind, text, url }: Problem) =>
  `${kind}: ${text}${url ? ` (${url})` : ''}`;

async function expectCleanConsole(page: Page, route: Route) {
  const problems = collectProblems(page);

  const response = await page.goto(route.path, { waitUntil: 'networkidle' });
  const documentUrl = response?.url() ?? page.url();
  // Soft, so that a wrong status, a redirect or a wrong title still reports the console problems
  // collected below, which usually explain it. The title guards against reuseExistingServer
  // attaching to some other project's dev server on :3000.
  expect.soft(response?.status(), `${route.path} should answer ${route.status}`).toBe(route.status);
  expect.soft(new URL(documentUrl).pathname, `${route.path} should not redirect`).toBe(route.path);
  await expect.soft(page).toHaveTitle(/Milos Cvetkovic/);
  // `/` shows a boot loader until React has hydrated, and hydration errors cannot be reported
  // before that. On every other route the locator matches nothing and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(SETTLE_MS);

  const unexpected = problems.filter(
    (problem) => !isExpectedDocument404(problem, route, documentUrl),
  );
  expect(
    unexpected.map(describeProblem),
    `${route.path} must load with a clean console: no console errors, no console warnings, no ` +
      'page errors. A "Minified React error #418" / "#423" (production) or "Hydration failed" ' +
      '(dev) entry means React hit a hydration mismatch on this page.',
  ).toEqual([]);
}

// The shared config only records a trace on the first retry, which this file never has. Playwright
// only accepts this option at file level.
test.use({ trace: 'retain-on-failure' });

test.describe('Every route', () => {
  // A retry would turn an intermittent console error into a "flaky" pass, which is the one outcome
  // this spec exists to prevent. The budget covers the navigation and loader waits (30 s each).
  test.describe.configure({ retries: 0, timeout: 90_000 });

  for (const route of routes) {
    test(`${route.path} loads with a clean console`, async ({ page }) => {
      await expectCleanConsole(page, route);
    });
  }

  test('/ loads with a clean console under reduced motion', async ({ page }) => {
    // Emulated before the navigation, so the hero's reduced-motion branches are what hydrates.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectCleanConsole(page, { path: '/', status: 200 });
    // Playwright ignores unknown options silently; prove the emulation actually reached the page.
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(await page.evaluate(reduced)).toBe(true);
  });

  test('the case-study routes come from a non-empty data file', () => {
    // An emptied or mis-exported data file would otherwise drop /work/[slug] from coverage
    // silently.
    expect(caseStudies.length).toBeGreaterThan(0);
  });

  test('the collector reports console errors, console warnings and page errors', async ({
    page,
  }) => {
    // Positive control: if Playwright or Chromium stopped surfacing one of the three channels,
    // every route above would pass silently. No server involved.
    const problems = collectProblems(page);
    const script = [
      'console.error("error text");',
      'console.warn("warning text");',
      'console.assert(false, "assert text");',
      'throw new Error("thrown");',
    ].join(' ');
    await page.setContent(`<script>${script}</script>`);
    await expect
      .poll(() => problems.map(({ kind, text }) => `${kind}: ${text.split('\n')[0]}`))
      .toEqual([
        'console.error: error text',
        'console.warning: warning text',
        'console.assert: assert text',
        'pageerror: Error: thrown',
      ]);
  });
});

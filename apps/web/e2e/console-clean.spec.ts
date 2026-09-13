import { expect, test, type Page } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';
import { PAGE_ROUTES, expectedStatus } from './routes';

/**
 * Every route must load without the browser reporting anything: no console errors, no console
 * warnings, no uncaught page errors. React hydration mismatches surface here too. In production
 * React logs "Minified React error #418" (markup mismatch) or "#423" (an error React recovered from
 * while hydrating); the dev server spells it out as "Hydration failed".
 *
 * Every route, in both colour schemes. Until 2026-09-12 the only `emulateMedia` in this file was the
 * reduced-motion one, so all fifteen tests ran in Playwright's default light scheme and a component
 * that threw only under the dark theme would have shipped green. The route list used to be a
 * hand-written copy of `src/app/sitemap.ts`'s; it now comes from `e2e/routes.ts`, which the
 * accessibility gate reads too, so a new route reaches both gates without an edit to either.
 */

interface Route {
  path: string;
  /** Status the document itself is expected to answer with. */
  status: number;
}

const routes: Route[] = [
  // The shared list: the six static routes, every case study derived from the data file, and a 404.
  ...PAGE_ROUTES.map((path) => ({ path, status: expectedStatus(path) })),
  // The second 404 shape, which the shared list does not carry: an unknown *slug* is kept at the
  // routing layer by `dynamicParams = false` rather than reaching a render-time notFound() (ADR 0015),
  // so it is a different path through the app from an unknown route.
  { path: '/work/does-not-exist', status: 404 },
];

const colorSchemes = ['light', 'dark'] as const;

// Effects, GSAP timelines and React's deferred error reporting all run after the network goes idle.
const SETTLE_MS = 1_000;

// Small enough that no section is skipped: each phase's ScrollTrigger runs from `top center` to
// `bottom center` (or the default `bottom top`), so its active range is at least the section's own
// height, and every phase section is `min-h-screen` — 720 px at the project's 1280x720 viewport.
const SCROLL_STEP_PX = 400;
const SCROLL_STEP_MS = 150;
// The gauntlet pipeline is the longest sequence the scroll starts: six stages of 0.5 s to 1.0 s
// with 0.2 s between them, then a 1 s and a 0.3 s timer, so about seven seconds from entering its
// section. Its last callbacks have to land while the collector is still listening.
const STORY_SEQUENCE_MS = 8_000;

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

/**
 * Loads one route with the collector already listening and fails if the browser reported anything.
 * `afterLoad` runs once the page is hydrated and before the final settle, for a route whose code
 * only runs in response to something (scrolling, in the one case that passes it).
 */
async function expectCleanConsole(
  page: Page,
  route: Route,
  afterLoad?: (page: Page) => Promise<void>,
) {
  const problems = collectProblems(page);

  const response = await page.goto(route.path, { waitUntil: 'networkidle' });
  const documentUrl = response?.url() ?? page.url();
  // Soft, so that a wrong status, a redirect or a wrong title still reports the console problems
  // collected below, which usually explain it. The title is only a smoke check that this
  // application rendered; the status and the path above are what catch a wrong page, and the
  // not-found routes below carry this title too.
  expect.soft(response?.status(), `${route.path} should answer ${route.status}`).toBe(route.status);
  expect.soft(new URL(documentUrl).pathname, `${route.path} should not redirect`).toBe(route.path);
  await expect.soft(page).toHaveTitle(/Milos Cvetkovic/);
  // `/` shows a boot loader until React has hydrated, and hydration errors cannot be reported
  // before that. On every other route the locator matches nothing and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  // Captured rather than thrown. A scroll-driven console error is the likeliest reason afterLoad
  // failed, so the collected problems have to reach the report before its exception does. This is
  // the same reason the three checks above are soft.
  let afterLoadError: unknown;
  if (afterLoad) {
    try {
      await afterLoad(page);
    } catch (error) {
      afterLoadError = error;
    }
  }
  // Always the last thing before the assertion, so whatever afterLoad started has a window in which
  // to report.
  if (!page.isClosed()) await page.waitForTimeout(SETTLE_MS);

  const unexpected = problems.filter(
    (problem) => !isExpectedDocument404(problem, route, documentUrl),
  );
  expect(
    unexpected.map(describeProblem),
    `${route.path} must load with a clean console: no console errors, no console warnings, no ` +
      'page errors. A "Minified React error #418" / "#423" (production) or "Hydration failed" ' +
      '(dev) entry means React hit a hydration mismatch on this page.',
  ).toEqual([]);
  // The console was clean, so afterLoad failed for its own reason: report that one.
  if (afterLoadError) throw afterLoadError;
}

/**
 * Walks the home page to the bottom, waits out the sequences the walk starts, and comes back up.
 *
 * Scrolling is what runs the six story sections: each creates its ScrollTrigger with
 * `start: 'top center'`, so its entrance timeline, its `onEnter` and the timers that callback
 * schedules only run once the section reaches the middle of the viewport. Coming back up is the
 * only way to run the other half: the `reverse` toggleAction and the `onLeave` / `onEnterBack` /
 * `onLeaveBack` callbacks. None of it is reachable under reduced motion, where all six effects
 * return early, which is why the reduced-motion case above cannot stand in for this one.
 */
async function walkTheStory(page: Page) {
  // scrollHeight is re-read every step because the page grows as sections animate in: measured
  // 6450 px at the end of the walk and 6692 px eight seconds later.
  const walk = (direction: 'down' | 'up') =>
    page.evaluate(
      async ({ step, pause, up }) => {
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        for (
          let y = up ? document.documentElement.scrollHeight : 0;
          up ? y >= 0 : y <= document.documentElement.scrollHeight;
          y += up ? -step : step
        ) {
          window.scrollTo(0, y);
          await wait(pause);
        }
        // The fixed step lands on `scrollHeight % step` (292 px on the measured page), so without
        // this the walk never restores scroll 0 and the hero's threshold never flips back.
        if (up) {
          window.scrollTo(0, 0);
          await wait(pause);
        }
      },
      { step: SCROLL_STEP_PX, pause: SCROLL_STEP_MS, up: direction === 'up' },
    );

  await walk('down');
  // Let the timer-driven sequences reach their last callback. They keep running while the page sits
  // at the bottom: only the closing section's glow is tied to the scroll position.
  await page.waitForTimeout(STORY_SEQUENCE_MS);

  // Bring the closing section back to the middle. At the very bottom it has been scrolled past, so
  // its `onLeave` has paused the entrance short of the `onComplete` that starts the breathing glow;
  // centring it fires `onEnterBack`, which resumes both. Measured: `box-shadow: none` at the
  // bottom, a real shadow once centred.
  const cta = page.locator('a[href*="linkedin.com/in/"]', { hasText: 'Connect on LinkedIn' });
  await expect(cta).toHaveCount(1);
  await cta.evaluate((el) => el.scrollIntoView({ block: 'center' }));

  // The glow is the proof this walk covered the story rather than scrolling past inert markup: it
  // only appears once the deepest section's entrance has run to completion, which means every
  // trigger above it fired too. `e2e/story.spec.ts` reads the same signal.
  await expect
    .poll(() => cta.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 30_000 })
    .not.toBe('none');

  await walk('up');
}

// The shared config only records a trace on the first retry, which this file never has. Playwright
// only accepts this option at file level.
test.use({ trace: 'retain-on-failure' });

test.describe('Every route', () => {
  // A retry would turn an intermittent console error into a "flaky" pass, which is the one outcome
  // this spec exists to prevent. The budget covers the navigation and loader waits (30 s each).
  test.describe.configure({ retries: 0, timeout: 90_000 });

  for (const colorScheme of colorSchemes) {
    for (const route of routes) {
      test(`${route.path} loads with a clean console in the ${colorScheme} theme`, async ({
        page,
      }) => {
        // Before the navigation: the theme init script in <head> reads prefers-color-scheme for the
        // first paint, so the page hydrates in the scheme a visitor with that preference sees. A
        // component that throws only under one theme is invisible to a single-scheme run.
        await page.emulateMedia({ colorScheme });
        await expectCleanConsole(page, route);
        // Playwright ignores an unknown emulation option silently, and the whole point of doubling
        // these tests is that the two runs differ: prove the scheme reached the page.
        await expect(page.locator('html')).toContainClass(colorScheme);
      });
    }
  }

  test('/ loads with a clean console under reduced motion', async ({ page }) => {
    // Emulated before the navigation, so the hero's reduced-motion branches are what hydrates.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectCleanConsole(page, { path: '/', status: 200 });
    // Playwright ignores unknown options silently; prove the emulation actually reached the page.
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(await page.evaluate(reduced)).toBe(true);
  });

  test('/ stays clean while the story scrolls', async ({ page }) => {
    await expectCleanConsole(page, { path: '/', status: 200 }, walkTheStory);
    // Guard the guard. With motion reduced every phase effect returns early, so this test would
    // scroll past six inert sections and cover none of the code it exists to watch.
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(await page.evaluate(reduced)).toBe(false);
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

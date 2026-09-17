import { expect, test, type Page } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';
import { warmRoutes } from './support/warm-routes';

/**
 * A real client-side navigation, by clicking links.
 *
 * Every other spec reaches a page with `page.goto` or `request.get`, which is a full document load:
 * the App Router's soft navigation — the one the comment at `animated-hero/index.tsx:36` is about —
 * was never executed by any test. That leaves a whole class of bug uncovered. A soft navigation keeps
 * the React tree and the module registry alive, so state that should be per-route survives, an effect
 * that should have torn down keeps running, and a GSAP timeline built on the old DOM can write into
 * nodes React has since replaced. None of that is reachable from a `goto`.
 *
 * Green on arrival, and that is the point: it is the regression floor for #46 to #49, which all
 * change components on this path. The console collector listens for the whole walk, so a hydration
 * mismatch or a stray warning on any hop fails here — `console-clean.spec.ts` only ever sees the
 * first load of each route.
 *
 * Two assertions are about the soft navigation specifically rather than about arriving:
 * every hop must keep the document the walk started in (a property set on `window` before the first
 * click must still be there after each one, and a full load replaces `window`, so a hard navigation
 * dressed up as a soft one fails there), and the story must still run, which is what says the
 * ScrollTriggers were rebuilt for the new DOM rather than left pointing at the old.
 */

interface Problem {
  kind: string;
  text: string;
}

function collectProblems(page: Page): Problem[] {
  const problems: Problem[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning' || type === 'assert') {
      problems.push({ kind: `console.${type}`, text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    problems.push({ kind: 'pageerror', text: error.stack || `${error.name}: ${error.message}` });
  });
  return problems;
}

/** A property only the document the walk started in carries. */
const DOCUMENT_MARKER = '__clientNavigationDocument';

async function markDocument(page: Page): Promise<void> {
  await page.evaluate((key) => {
    (window as unknown as Record<string, unknown>)[key] = true;
  }, DOCUMENT_MARKER);
}

/**
 * Fails when `hop` loaded a new document. Checked once the hop has arrived, so a navigation still
 * in flight cannot pass it by answering from the old `window`.
 */
async function expectSameDocument(page: Page, hop: string): Promise<void> {
  const kept = await page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key] === true,
    DOCUMENT_MARKER,
  );
  expect(kept, `${hop} loaded a new document instead of navigating client-side`).toBe(true);
}

// How long a clicked link may take to commit its URL. A `<Link>` navigation commits the URL only
// once React has rendered the destination, and that is browser main-thread work, not server work.
// In the traced runs (1x, 4x, 8x) the RSC payload arrived in 39-142 ms per hop, and back to `/` the
// URL followed 966 ms after the click. A CPU profile of that hop in a separate run (its URL after
// 0.37 s) found the main thread idle for 97 ms of the 805 ms profiled, the rest spent rendering and
// laying out the story. So the wait stretches with any CPU the browser does not get, which
// `warmRoutes` cannot help with. Measured on the dev server (2026-09-17, an instrumented copy of
// this walk), click to URL per hop: 0.015-0.97 s unthrottled; under CDP CPU throttling at 12x up to
// 6.8 s into `/work` and 7.8 s back to `/`. At 12x the 5 s default failed 16 of 20 runs on those
// two waits, the same two a loaded whole-suite run failed on in 3 of 30. The production build took
// at most 3.7 s for a hop at 12x. 15 s is about twice the slowest hop measured at 12x with the
// machine otherwise quiet (load average under 22). With other suites pushing the load average to
// 50-121, 12x hops took up to 14.2 s from the start of the click, and one of 20 runs failed at a
// load average above 100. That is starvation this wait does not try to absorb. It raises CI's 10 s
// expect timeout for these waits too. The back step keeps the default: the browser commits that URL
// itself on `popstate`, and it took at most 0.54 s at 12x.
const SOFT_NAVIGATION_TIMEOUT_MS = 15_000;

test.describe('client-side navigation', () => {
  // 90 s is the budget for a slow walk, not the sum of the waits. The slowest passing run measured
  // took 79.2 s (dev server, CDP CPU throttling at 12x, load average 56-69), so under that much
  // starvation this budget is close to its limit too. The waits' own limits add up to more than
  // 90 s (a 30 s loader wait, three 15 s URL waits, a 30 s glow poll and several 5 s defaults), so
  // a walk where many of them run long fails on this budget before any one of them runs out. No
  // retries: this is the regression floor for four tasks that all change components on this path,
  // and a retry would turn an intermittent hydration mismatch on a soft navigation — the exact
  // class of bug this exists to catch — into a green "flaky" run.
  test.describe.configure({ retries: 0, timeout: 90_000 });

  // Steps 1 and 2 click into routes this server has not served yet, and a client-side navigation
  // commits its URL only once the destination's RSC payload has arrived. Run alone on the dev server,
  // that first request compiled `/work` and `/work/[slug]` from a deleted `.next-e2e`, and with the
  // cache kept it still ran the case study's static-params worker: one of those two `toHaveURL` waits
  // ran out in 10 of 10 runs with the cache deleted and 5 of 10 with it kept (2026-09-13). Both
  // destinations are requested before the walk (e2e/support/warm-routes.ts).
  test.beforeAll(async ({ playwright }, testInfo) => {
    const [study] = caseStudies;
    await warmRoutes(playwright, testInfo, ['/work', `/work/${study.slug}`]);
  });

  test('walks / to /work to a case study and back by link clicks', async ({ page }) => {
    const [study] = caseStudies;
    const problems = collectProblems(page);

    await page.goto('/');
    await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
    await markDocument(page);

    // The header, scoped as `banner` rather than `navigation`: the `MC` home link is a sibling of the
    // `<nav>`, not inside it, so a `navigation`-scoped query for it resolves nothing and waits out the
    // whole test budget.
    const header = page.getByRole('banner');

    // 1. / -> /work, through the header's own nav link.
    await header.getByRole('link', { name: 'Work' }).click();
    await expect(page).toHaveURL(/\/work$/, { timeout: SOFT_NAVIGATION_TIMEOUT_MS });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectSameDocument(page, 'the Work link');

    // 2. /work -> a case study, by its card.
    await page
      .getByRole('link', { name: new RegExp(study.title, 'i') })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/work/${study.slug}$`), {
      timeout: SOFT_NAVIGATION_TIMEOUT_MS,
    });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(study.title);
    await expectSameDocument(page, 'the case-study card');

    // 3. Back, which is the history entry the soft navigation pushed rather than a fresh load.
    await page.goBack();
    await expect(page).toHaveURL(/\/work$/);
    // The URL changes on `popstate`, before React renders `/work`, so a bare visible `h1` could
    // still be the case study's. This heading is only on `/work`.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Problems solved');
    await expectSameDocument(page, 'going back');

    // 4. Back to /, by the header's home link.
    await header.getByRole('link', { name: 'MC', exact: true }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: SOFT_NAVIGATION_TIMEOUT_MS });

    // The loader must not be up on arrival. That alone cannot tell a remount from a soft
    // navigation: `toBeHidden` retries, and after a full load the loader hides again within the
    // expect timeout. The document marker is what catches a document load.
    await expect(page.getByText('System Boot', { exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('This happened at 3am');
    await expectSameDocument(page, 'the MC home link');

    // The story still runs after arriving softly: its ScrollTriggers were created against this DOM.
    // The closing CTA's breathing glow is the deepest signal on the page — it only starts once the
    // last section's entrance has run to completion, which means every trigger above it fired too.
    // `e2e/story.spec.ts` and `console-clean.spec.ts` read the same one.
    await page.evaluate(() => {
      const step = Math.max(1, Math.round(window.innerHeight * 0.75));
      const bottom = document.documentElement.scrollHeight - window.innerHeight;
      for (let y = 0; y <= bottom; y += step) window.scrollTo({ top: y, behavior: 'instant' });
      window.scrollTo({ top: bottom, behavior: 'instant' });
    });
    const cta = page.locator('a[href*="linkedin.com/in/"]', { hasText: 'Connect on LinkedIn' });
    await expect(cta).toHaveCount(1);
    await cta.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect
      .poll(() => cta.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 30_000 })
      .not.toBe('none');

    // Asserted last, so every hop's messages are in. Soft navigations are where a stale effect writing
    // into a replaced DOM shows up, and it shows up here as a console error, not as a wrong pixel.
    expect(
      problems.map(({ kind, text }) => `${kind}: ${text}`),
      'the whole client-side walk must stay silent: a "Minified React error #418"/"#423" or ' +
        '"Hydration failed" entry means a mismatch on one of the soft navigations.',
    ).toEqual([]);
  });
});

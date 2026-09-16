import { expect, test } from '@playwright/test';
import { NOT_FOUND_ROUTE } from './routes';
import { warmRoutes } from './support/warm-routes';

/**
 * The 404 page's own content.
 *
 * All green. `not-found-shell.spec.ts` already proves both 404 routes are server-rendered through the
 * root layout — that the theme init script reaches the HTML rather than Next's bare recovery shell — and
 * that is a different question from whether the page says anything useful. Greps for `Page not found`,
 * `Go Home` and `View Work` returned nothing before this file: the status and the shell were covered,
 * the page a visitor actually reads was not.
 *
 * Both 404 shapes are checked, because they arrive by different routes: an unknown path has no matching
 * segment at all, while an unknown case-study slug is kept at the routing layer by
 * `dynamicParams = false` rather than reaching a render-time `notFound()` (ADR 0015). They should be
 * indistinguishable to a visitor, and this is what says so.
 *
 * The robots tags on these responses are a separate matter and currently wrong — a 404 emits both
 * `noindex` and `index, follow` — which is row R27 in `e2e/seo-surface.spec.ts`.
 */

test.describe.configure({ retries: 0 });

const NOT_FOUND_PATHS = [NOT_FOUND_ROUTE, '/work/does-not-exist'];

for (const path of NOT_FOUND_PATHS) {
  test(`${path} renders the not-found page with both recovery links`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.status(), `${path} should answer 404`).toBe(404);
    // The status is what identifies a 404: the title matches the site-wide pattern on every page,
    // including this one, so `toHaveTitle` could never tell them apart (CLAUDE.md, Testing).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.getByText(/doesn.t exist or has been moved/)).toBeVisible();

    // Two ways out, and both must actually point somewhere: a recovery page whose links are broken is
    // worse than the bare browser error, because it looks like it worked.
    const home = page.getByRole('link', { name: 'Go Home' });
    await expect(home).toHaveAttribute('href', '/');
    const work = page.getByRole('link', { name: 'View Work' });
    await expect(work).toHaveAttribute('href', '/work');
  });
}

test('the 404 page keeps the site chrome, so a visitor is not stranded', async ({ page }) => {
  await page.goto(NOT_FOUND_ROUTE);

  // The header and footer come from the root layout, which is exactly what `not-found-shell.spec.ts`
  // proves reaches the HTML. This is the visitor-facing half of that: the nav is usable.
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Work' })).toBeVisible();
});

// `View Work` is a client-side navigation into `/work`, whose URL changes only once that route's RSC
// payload has arrived. Run alone on the dev server, the click was the first request for `/work`: 1.1
// to 1.3 s for the payload against 0.04 to 0.7 s for later ones, with `.next-e2e` deleted or kept
// (2026-09-13). It passed all 20 runs, but the same first request is what failed `case-study.spec.ts`,
// where it took 4.1 s. The route is requested before the test (e2e/support/warm-routes.ts), from an
// anonymous group holding only this test.
test.describe(() => {
  test.beforeAll(async ({ playwright }, testInfo) => {
    await warmRoutes(playwright, testInfo, ['/work']);
  });

  test('the recovery links work as client-side navigations', async ({ page }) => {
    await page.goto(NOT_FOUND_ROUTE);

    await page.getByRole('link', { name: 'View Work' }).click();

    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // And the 404 heading is gone, so the navigation replaced the page rather than layering over it.
    await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
  });
});

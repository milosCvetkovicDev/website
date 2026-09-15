import { expect, type Page, type Response } from '@playwright/test';
import { HYDRATION_MARKER_ID } from '../../src/lib/hydration-marker';

/**
 * The one place that knows how a spec tells the page has hydrated.
 *
 * Events fired before React hydrates are lost: a click, a hover or a Tab press lands on server markup
 * with no listeners behind it, and the spec then fails, or passes, for a reason that has nothing to
 * do with what it tests. So a spec that interacts waits here first.
 *
 * The root layout renders `HydrationMarker` on every route: a hidden `#hydration-marker` whose
 * `data-hydrated` is `false` in the served HTML and `true` once React has hydrated
 * (`src/components/hydration-marker.tsx`). The wait is positive, so a route that stops rendering the
 * marker times out here instead of passing at once.
 *
 * The marker hydrates with the layout. Content a page wraps in `<Suspense>`, or puts under a
 * `loading.tsx`, hydrates in a later pass, after the marker flips. No route does either today.
 */

/** How long hydration may take. Locally, the dev server compiles a route on its first request. */
const HYDRATION_TIMEOUT_MS = 30_000;

/** The marker itself, for a spec that asserts on it rather than waiting through it. */
export const hydrationMarker = (page: Page) => page.locator(`#${HYDRATION_MARKER_ID}`);

/** Waits until the current page has hydrated. Call it after a navigation or a reload. */
export async function expectHydrated(page: Page): Promise<void> {
  await expect(
    hydrationMarker(page),
    `the root layout renders #${HYDRATION_MARKER_ID} on every route, and it never read data-hydrated="true"`,
  ).toHaveAttribute('data-hydrated', 'true', { timeout: HYDRATION_TIMEOUT_MS });
  // `/` also keeps its boot loader in the DOM for 600 ms after hydration, and the gates audit the page
  // behind it. So the wait includes it, until #47 (hero-9) deletes the loader and this line with it.
  // On other routes the locator matches nothing and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({
    timeout: HYDRATION_TIMEOUT_MS,
  });
}

/**
 * Navigates to `path` and waits until the page has hydrated. Returns the navigation's response, so
 * a caller can still assert the status and the path it landed on.
 */
export async function gotoHydrated(
  page: Page,
  path: string,
  options?: Parameters<Page['goto']>[1],
): Promise<Response | null> {
  const response = await page.goto(path, options);
  await expectHydrated(page);
  return response;
}

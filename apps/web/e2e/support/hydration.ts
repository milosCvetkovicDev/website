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
 * `loading.tsx`, hydrates in a later pass, after the marker flips. No route puts `<main>` inside a
 * boundary today. The one boundary with content, the decorative `TmuxBackground` on `/`, may
 * hydrate after the marker, and no spec interacts with it.
 */

/**
 * How long each wait may take. Locally, the dev server compiles a route on its first request. The
 * test's own timeout, 30 s by default, still bounds the whole test.
 */
const HYDRATION_TIMEOUT_MS = 30_000;

/** The marker itself, for a spec that asserts on it rather than waiting through it. */
export const hydrationMarker = (page: Page) => page.locator(`#${HYDRATION_MARKER_ID}`);

/**
 * Waits until the current page has hydrated. Call it after `page.goto` or `page.reload`. A soft
 * navigation, such as a `<Link>` click, keeps the layout mounted and the marker `true`, so it needs no
 * wait, and this one would prove nothing there.
 */
export async function expectHydrated(page: Page): Promise<void> {
  const marker = hydrationMarker(page);
  await expect(
    marker,
    `the root layout did not render #${HYDRATION_MARKER_ID} exactly once on this page`,
  ).toHaveCount(1, { timeout: HYDRATION_TIMEOUT_MS });
  await expect(
    marker,
    `#${HYDRATION_MARKER_ID} is on the page but never read data-hydrated="true": ` +
      'hydration did not complete',
  ).toHaveAttribute('data-hydrated', 'true', { timeout: HYDRATION_TIMEOUT_MS });
  // `/` also keeps its boot loader in the DOM for 600 ms after hydration, and the gates audit the page
  // behind it. That timer runs late on a busy machine, so this waits as long as the inline waits it
  // replaced. #47 (hero-9) deletes the loader and this wait with it; on other routes the locator
  // matches nothing and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({
    timeout: HYDRATION_TIMEOUT_MS,
  });
}

/**
 * Navigates to `path` and waits until the page has hydrated. Returns the navigation's response, so
 * a caller can still assert the status and the path it landed on. A 5xx answer fails at once rather
 * than as a hydration timeout.
 */
export async function gotoHydrated(
  page: Page,
  path: string,
  options?: Parameters<Page['goto']>[1],
): Promise<Response | null> {
  const response = await page.goto(path, options);
  const status = response?.status();
  if (status !== undefined && status >= 500) {
    throw new Error(
      `${path} answered ${status}: the page failed on the server, so it cannot hydrate`,
    );
  }
  await expectHydrated(page);
  return response;
}

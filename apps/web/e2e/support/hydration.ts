import { expect, type Page, type Response } from '@playwright/test';

/**
 * The one place that knows how a spec tells the page has hydrated.
 *
 * Events fired before React hydrates are lost: a click, a hover or a Tab press lands on server markup
 * with no listeners behind it, and the spec then fails, or passes, for a reason that has nothing to
 * do with what it tests. So every spec that interacts waits here first, and none writes a wait of its
 * own.
 *
 * Today the marker is the home page's `System Boot` loader, which is removed once React has hydrated
 * and 600 ms have passed. #47 (hero-9) replaces that loader with a hydration marker of its own; when
 * it lands, the body of `expectHydrated` changes and its callers do not.
 *
 * Only `/` has the loader. On every other route the locator matches nothing, so the wait passes at
 * once and costs nothing.
 */

/** How long hydration may take: the loader waits on the dev server's first compile locally. */
const HYDRATION_TIMEOUT_MS = 30_000;

/** Waits until the current page has hydrated. Call it after a navigation or a reload. */
export async function expectHydrated(page: Page): Promise<void> {
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

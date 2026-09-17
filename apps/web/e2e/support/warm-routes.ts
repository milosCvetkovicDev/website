import { expect, type PlaywrightWorkerArgs, type TestInfo } from '@playwright/test';

/**
 * Serves each path once, so the server has done its first-request work for a route before a spec
 * times a navigation into it.
 *
 * `next dev` compiles a route on its first request, and for a route with `generateStaticParams` it
 * also spawns a one-off worker to run that function, once per server process: the persistent cache
 * in `.next-e2e` keeps the compile between runs but not the worker. A client-side navigation commits
 * the new URL only once the destination's RSC payload has arrived, so a click into a route nobody
 * has requested yet spends its `toHaveURL` window waiting on the server. Measured on 2026-09-13 for
 * `/work/[slug]`: 2 to 7 s from the click to the URL depending on machine load, against the 5 s
 * local expect timeout. One document request for the route beforehand brought the RSC request the
 * click makes down to about 0.1 s, from a deleted `.next-e2e` too.
 *
 * Only the dev server needs it. The production build CI serves prerenders the route and
 * `next/link` prefetches it, which development builds never do, so there it costs one static
 * response per path.
 *
 * Call it from a `test.beforeAll` inside a `test.describe` holding only the tests that navigate, so
 * a route that cannot be served fails those tests and no others. A hook's time is not taken from
 * any test's budget. It prepares the server and nothing else: the navigation under test still has
 * to happen by the spec's own means, inside the default expect timeout or inside a longer one that
 * the spec justifies with a measurement. `client-navigation.spec.ts` gives its link-click URL waits
 * 15 s, for the browser's own rendering. A wait that long also absorbs a first request of several
 * seconds, so that spec no longer catches a route this helper stopped warming.
 */

/** How long one first request may take locally: a cold compile plus the static-params worker. */
const FIRST_REQUEST_TIMEOUT_MS = 30_000;

export async function warmRoutes(
  playwright: PlaywrightWorkerArgs['playwright'],
  testInfo: TestInfo,
  paths: readonly string[],
): Promise<void> {
  // The `request` fixture is test-scoped and so unavailable in `beforeAll`, which leaves the
  // project's `baseURL` as the record of which server the tests use.
  const { baseURL } = testInfo.project.use;
  if (!baseURL) {
    throw new Error('warmRoutes needs `use.baseURL` in playwright.config.ts to find the server.');
  }
  // Sized so that a request's own timeout, which names its path, fires before the hook's would.
  // Measured under a load average of 160 to 270, the whole warm-up took 2 to 5 s.
  testInfo.setTimeout(paths.length * FIRST_REQUEST_TIMEOUT_MS);
  const request = await playwright.request.newContext({ baseURL });
  try {
    for (const path of paths) {
      // A redirect is not the route being served, whatever its target answers.
      const response = await request.get(path, {
        maxRedirects: 0,
        timeout: FIRST_REQUEST_TIMEOUT_MS,
      });
      // An error here would otherwise surface later as a navigation that never arrived, which reads
      // like the slow first request this exists to remove.
      await expect(response, `${path} must be served before a spec navigates to it`).toBeOK();
    }
  } finally {
    await request.dispose();
  }
}

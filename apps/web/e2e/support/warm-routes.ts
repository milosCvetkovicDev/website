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
 * local expect timeout, and about 0.1 s once the route had been served.
 *
 * Only the dev server needs it. The production build CI serves prerenders the route and
 * `next/link` prefetches it, which development builds never do, so there it costs one static
 * response per path.
 *
 * Call it from `test.beforeAll`, whose timeout is separate from each test's, so the work is paid
 * outside the budget of the test that navigates. It prepares the server and nothing else: the
 * navigation under test still has to happen by the spec's own means, inside the default expect
 * timeout.
 */

/** How long one first request may take locally: a cold compile plus the static-params worker. */
const FIRST_REQUEST_TIMEOUT_MS = 30_000;

export async function warmRoutes(
  playwright: PlaywrightWorkerArgs['playwright'],
  testInfo: TestInfo,
  paths: readonly string[],
): Promise<void> {
  // The `request` fixture is test-scoped and so unavailable in `beforeAll`.
  const request = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    for (const path of paths) {
      const response = await request.get(path, { timeout: FIRST_REQUEST_TIMEOUT_MS });
      // An error here would otherwise surface later as a navigation that never arrived, which reads
      // like the slow first request this exists to remove.
      await expect(response, `${path} must be served before a spec navigates to it`).toBeOK();
    }
  } finally {
    await request.dispose();
  }
}

import { expect, test, type Response } from '@playwright/test';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from '../e2e/routes';

/**
 * What only the deployed site can show about Web Analytics (ADR 0026), on every route in
 * `e2e/routes.ts` that answers 200:
 *
 * - the page loads Vercel's tracker, the `<script>` the `@vercel/analytics/next` component injects.
 *   Its path is on this origin and built from a seed Vercel draws for each build, so the test reads
 *   it from the tag rather than hard-coding it, and requires the page's own request for it to
 *   answer 200 as JavaScript;
 * - the console logs no error or warning, which includes the Content-Security-Policy refusing the
 *   tracker's script: the browser logs a refusal as an error;
 * - nothing is stored: no response from this origin sends `Set-Cookie`, the browser holds no
 *   cookie, and local and session storage stay empty, the cookieless tracker ADR 0026 chose.
 *
 * It does not reach the tracker's intake: the tracker sends no page view when `navigator.webdriver`
 * is true, as it is under Playwright, so a view, and whether the policy lets it through, is read on
 * the Vercel dashboard (`docs/runbooks/deploy.md`).
 */
const ROUTES = [...STATIC_ROUTES, ...CASE_STUDY_ROUTES];
const TRACKER = 'script[data-sdkn="@vercel/analytics/next"]';

test('there are routes to check', () => {
  expect(STATIC_ROUTES.length).toBeGreaterThan(0);
  expect(CASE_STUDY_ROUTES.length).toBeGreaterThan(0);
});

for (const path of ROUTES) {
  test(`${path} loads Web Analytics, logs nothing and stores nothing`, async ({
    page,
    context,
  }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        problems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    // `allHeaders()`, not `headers()`: the latter leaves out cookie headers by design.
    const responses = new Map<string, Response>();
    const cookieHeaders: Promise<string | undefined>[] = [];
    page.on('response', (response) => {
      responses.set(response.url(), response);
      cookieHeaders.push(
        response
          .allHeaders()
          .then((headers) => (headers['set-cookie'] ? response.url() : undefined)),
      );
    });

    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBe(200);

    const tracker = page.locator(TRACKER);
    await expect(tracker, `${path} has no tracker tag`).toHaveCount(1);
    const src = await tracker.getAttribute('src');
    expect(src, 'the tracker tag has no src').toBeTruthy();
    const scriptUrl = new URL(src as string, page.url());
    expect(scriptUrl.origin, 'the tracker loads from another origin').toBe(
      new URL(page.url()).origin,
    );
    await expect
      .poll(() => responses.get(scriptUrl.href)?.status(), {
        message: `the page's request for ${scriptUrl.pathname}`,
      })
      .toBe(200);
    expect(
      responses.get(scriptUrl.href)?.headers()['content-type'] ?? '(none)',
      `${scriptUrl.pathname} content type`,
    ).toMatch(/javascript/);

    // Let the tracker run, and anything it would log or store happen, before reading either.
    await page.waitForLoadState('networkidle');
    expect(
      (await Promise.all(cookieHeaders)).filter(Boolean),
      `${path}: responses that set a cookie`,
    ).toEqual([]);
    expect(await context.cookies(), `${path} left cookies`).toEqual([]);
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
      `${path}: [localStorage, sessionStorage] entries`,
    ).toEqual([0, 0]);
    expect(problems, `${path} logged to the console`).toEqual([]);
  });
}

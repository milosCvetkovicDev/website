import { expect, test } from '@playwright/test';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from '../e2e/routes';

/**
 * What only the deployed site can show about Web Analytics (ADR 0026), on every page:
 *
 * - the page loads Vercel's tracker, the `<script>` the `@vercel/analytics/next` component injects.
 *   Its path is on this origin and built from a seed Vercel draws for each build, so the test reads
 *   it from the tag rather than hard-coding it, and requires it to answer 200 as JavaScript;
 * - the console stays clean, which also catches the Content-Security-Policy refusing the tracker or
 *   its intake: the browser logs a refusal as an error;
 * - no cookie is set, by the response or by the tracker, which is what `/privacy` tells a visitor.
 *
 * It does not wait for a page view to be sent: the tracker sends none when `navigator.webdriver` is
 * true, as it is under Playwright, so that would fail on a working site. Whether views arrive is
 * read on the Vercel dashboard (`docs/runbooks/deploy.md`).
 */
const ROUTES = [...STATIC_ROUTES, ...CASE_STUDY_ROUTES];
const TRACKER = 'script[data-sdkn="@vercel/analytics/next"]';

for (const path of ROUTES) {
  test(`${path} loads Web Analytics, with a clean console and no cookies`, async ({
    page,
    context,
    request,
  }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        problems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBe(200);
    expect(response?.headers()['set-cookie'], `${path} sets a cookie`).toBeUndefined();

    const tracker = page.locator(TRACKER);
    await expect(tracker, `${path} has no tracker tag`).toHaveCount(1);
    const src = await tracker.getAttribute('src');
    expect(src, 'the tracker tag has no src').toBeTruthy();
    const scriptUrl = new URL(src as string, page.url());
    expect(scriptUrl.origin, 'the tracker loads from another origin').toBe(
      new URL(page.url()).origin,
    );
    const script = await request.get(scriptUrl.href);
    expect(script.status(), `${scriptUrl.pathname} status`).toBe(200);
    expect(script.headers()['content-type']).toMatch(/javascript/);

    // Let the tracker run, and anything it would log or store happen, before reading either.
    await page.waitForLoadState('networkidle');
    expect(await context.cookies(), `${path} left cookies`).toEqual([]);
    expect(problems, `${path} logged to the console`).toEqual([]);
  });
}

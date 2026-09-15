import { expect, test, type Page } from '@playwright/test';
import { HYDRATION_MARKER_ID } from '../src/lib/hydration-marker';
import { PAGE_ROUTES, expectedStatus } from './routes';
import { expectHydrated, hydrationMarker } from './support/hydration';

/**
 * The hydration marker every e2e wait keys on, pinned at both ends on every route.
 *
 * A wait on a marker that is never `false` proves nothing. So the served document must carry exactly
 * one `#hydration-marker` reading `false`, and the live page must reach `true`. With JavaScript off it
 * stays `false`, so nothing but hydration can satisfy `expectHydrated`.
 *
 * `/work/does-not-exist` joins `PAGE_ROUTES` because an unknown slug 404s at the routing layer, by a
 * different path from an unknown URL (ADR 0015), and both have to render the root layout.
 */

test.describe.configure({ retries: 0 });

const UNKNOWN_SLUG = '/work/does-not-exist';
const ROUTES = [...PAGE_ROUTES, UNKNOWN_SLUG];
const statusOf = (path: string) => (path === UNKNOWN_SLUG ? 404 : expectedStatus(path));

/**
 * The `data-hydrated` value of every `#hydration-marker` in `html`, parsed the way a browser parses it,
 * so that only an element with that id counts and not the id's text elsewhere in the response, such as
 * a script. A document made by `DOMParser` runs no scripts, so parsing the response hydrates nothing.
 */
function servedMarkers(page: Page, html: string): Promise<(string | null)[]> {
  return page.evaluate(
    ([markup, id]) =>
      [...new DOMParser().parseFromString(markup, 'text/html').querySelectorAll(`#${id}`)].map(
        (el) => el.getAttribute('data-hydrated'),
      ),
    [html, HYDRATION_MARKER_ID] as const,
  );
}

for (const path of ROUTES) {
  test(`${path} serves the marker unhydrated and hydrates it`, async ({ page, request }) => {
    const served = await request.get(path);
    expect(served.status(), `${path} should answer ${statusOf(path)}`).toBe(statusOf(path));
    expect(
      await servedMarkers(page, await served.text()),
      `the served HTML of ${path} must carry exactly one #${HYDRATION_MARKER_ID} reading "false"`,
    ).toEqual(['false']);

    const response = await page.goto(path);
    expect(response?.status(), `${path} should answer ${statusOf(path)}`).toBe(statusOf(path));
    await expectHydrated(page);
    // `hidden` must take the marker out of layout. A box-based visibility check cannot tell, because
    // an empty span has no height whether or not it is hidden.
    expect(await hydrationMarker(page).evaluate((el) => getComputedStyle(el).display)).toBe('none');
  });
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the marker stays unhydrated', async ({ page }) => {
    await page.goto('/work');
    // Proof that no script in the document ran: the theme init script classes <html> before first
    // paint, and the layout renders it with no class. `page.evaluate` still works, because the driver
    // injects it.
    expect(
      await page.evaluate(() => document.documentElement.className),
      'the theme init script added a class, so scripts are running: `javaScriptEnabled: false` did ' +
        'not take effect and this test is not measuring what it claims to',
    ).toBe('');
    await expect(hydrationMarker(page)).toHaveAttribute('data-hydrated', 'false');
  });
});

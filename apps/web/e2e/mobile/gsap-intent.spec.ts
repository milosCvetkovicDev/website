import { expect, test, type Page } from '@playwright/test';
import { GSAP_FAILED_MARK, GSAP_LOADED_MARK } from '../../src/components/animated-hero/load-gsap';
import { audit, describeViolations, incompleteNodes, passingNodes, ruleIdsThatRan } from '../axe';
import { expectHydrated } from '../support/hydration';

/**
 * The page before GSAP, on a phone.
 *
 * `load-gsap.ts` fetches GSAP on the visitor's first scroll, wheel, touch, pointer press or key
 * press. Lighthouse loads `/` at 412 px and gives no input, so what it scores, for performance and
 * for accessibility alike, is the page before GSAP. `e2e/gsap-lazy.spec.ts` checks both of these at
 * the desktop viewport; this checks them on the two phone projects, where the score is read.
 */

test.describe.configure({ retries: 0, timeout: 90_000 });

/** GSAP's version registry: in its core, minified or not, and in no other script. */
const GSAP_SIGNATURE = 'gsapVersions';

const marksSet = (page: Page) =>
  page.evaluate(
    ([loaded, failed]) =>
      [loaded, failed].filter((name) => performance.getEntriesByName(name, 'mark').length > 0),
    [GSAP_LOADED_MARK, GSAP_FAILED_MARK] as const,
  );

test('nothing requests GSAP on a phone while the visitor only reads, and a tap does', async ({
  page,
}) => {
  const gsapScripts: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('.js')) return;
    const body = await response.text().catch(() => '');
    if (body.includes(GSAP_SIGNATURE)) gsapScripts.push(new URL(response.url()).pathname);
  });
  await page.goto('/');
  await expectHydrated(page);
  await page.waitForTimeout(3_000);
  expect(gsapScripts, 'GSAP was requested with no input').toEqual([]);
  expect(await marksSet(page)).toEqual([]);

  // A tap on the hero's heading: a touch and a pointer press, and nothing it activates.
  await page.getByRole('heading', { level: 1 }).tap();
  await page.waitForFunction(
    (loadedMark) => performance.getEntriesByName(loadedMark, 'mark').length > 0,
    GSAP_LOADED_MARK,
  );
  await expect.poll(() => gsapScripts.length).toBeGreaterThan(0);
});

// The phone gate's floor for `/` (`CONTRAST_FLOOR` in `accessibility.spec.ts` beside this file, 60),
// and no budget of its own: the incomplete count is recorded, not gated.
test('/ has no axe violations before any intent on a phone', async ({ page }) => {
  // Held rather than trusted to stay away: should anything the audit does count as intent, GSAP
  // still cannot arrive and change the page under it.
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes(GSAP_SIGNATURE)) return route.fulfill({ response, body });
    await released;
    await route.abort();
  });
  await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 });
  await expectHydrated(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const results = await audit(page);
  release();
  test.info().annotations.push({
    type: 'colour-contrast incomplete before intent',
    description: String(incompleteNodes(results, 'color-contrast')),
  });
  expect(describeViolations(results.violations)).toEqual([]);
  expect(ruleIdsThatRan(results)).toEqual(expect.arrayContaining(['document-title']));
  expect(passingNodes(results, 'color-contrast')).toBeGreaterThan(60);
});

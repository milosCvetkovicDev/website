import { expect, test, type Page } from '@playwright/test';
import { audit, describeViolations, passingNodes, ruleIdsThatRan } from '../axe';

/**
 * The accessibility gate at a phone viewport.
 *
 * The desktop gate (`e2e/accessibility.spec.ts`) audits ten routes in two schemes, and every one of
 * those passes runs at 1280x720. Lighthouse emulates a phone by default, so the score in
 * `docs/runbooks/deploy.md` was being read against a viewport nothing in the suite tested — and a
 * phone is where the layout actually differs: the header swaps to its `md:hidden` half, every
 * `md:grid-cols-2` collapses to one column, and tap targets have to be reachable with a thumb.
 *
 * Two routes rather than ten, on purpose. Each phone project runs everything in `e2e/mobile/`, so a
 * route here costs two runs, and the `e2e` job has a twenty-minute budget. `/` is where the layout
 * changes most and a case study is the simplest page, which between them cover both shapes; the other
 * eight routes are audited at the desktop viewport, where their content is identical.
 *
 * `target-size` is the rule this pass exists for beyond contrast: it is in the Lighthouse map and is
 * about tap targets, which cannot fail at a desktop viewport with a mouse.
 */

test.describe.configure({ retries: 0, timeout: 90_000 });

const pages = ['/', '/work/self-healing-agent'];

/**
 * Fewest colour-contrast nodes each route must measure on a phone. Lower than the desktop floors
 * because a narrower viewport renders less at once, not because less is acceptable: measured on
 * 2026-09-12 at 393x830 (Pixel 7) and 390x844 (iPhone 13), then set with the same headroom the desktop
 * floors have.
 */
const CONTRAST_FLOOR: Record<string, number> = {
  '/': 60,
  '/work/self-healing-agent': 40,
};

async function openPage(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 });
  expect(response?.status(), `${path} should answer 200`).toBe(200);
  expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path);
  // `/` shows a boot loader until React has hydrated; other routes have no loader, so the locator
  // matches nothing and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

for (const path of pages) {
  test(`${path} has no axe violations at rest on a phone`, async ({ page }) => {
    // This spec only runs on the two phone projects (see MOBILE_SPECS in playwright.config.ts), so a
    // run at a desktop viewport would mean the project wiring broke and the audit is not measuring
    // what its name says. `src/test/playwright-config.test.ts` pins that wiring; this is the check at
    // the point of use.
    const viewport = page.viewportSize();
    expect(viewport, 'no viewport: this spec must run on a phone project').not.toBeNull();
    expect(viewport?.width, 'this spec must run at a phone width').toBeLessThan(500);

    await openPage(page, path);

    const results = await audit(page);
    // Before anything else: prove axe measured *this* document.
    //
    // Once, during a 164-test serial run on a machine that was also running two other agents, the
    // WebKit project came back with 0 passing nodes, 0 incomplete, and violations for
    // `document-title`, `html-has-lang` and `landmark-one-main` — the signature of axe having analysed
    // an empty frame rather than the page, which was itself rendered correctly (title, `<h1>` and a
    // 155 KB body all read back fine from the same page object). It has not reproduced since: three
    // parallel repeats and a one-worker CI-mode run of this whole directory were green.
    //
    // So this assertion is not a fix, it is a label. If that artefact recurs, the run fails saying axe
    // audited a blank document instead of saying the node floor is too high — which is the wrong
    // conclusion and the one that would get the floor lowered.
    expect(
      { ran: ruleIdsThatRan(results).includes('document-title'), titleFailed: false },
      'axe did not measure this document: it reported no title, no lang and no main landmark on a ' +
        'page that has all three. This is an axe injection artefact under load, not a page defect — ' +
        'do not lower the floor below.',
    ).toEqual({
      ran: true,
      titleFailed: results.violations.some(({ id }) => id === 'document-title'),
    });
    await test.info().attach('axe-results', {
      body: JSON.stringify(
        { violations: results.violations, incomplete: results.incomplete },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    expect(
      describeViolations(results.violations),
      `${path} on a phone must have no axe violations. A failure here that the desktop gate does not ` +
        'show is a layout that only exists below `md`: read the token roles in ' +
        'docs/adr/0011-colour-roles-on-scoped-surfaces.md for a contrast failure, and remember that ' +
        '`target-size` can only fail at this viewport.',
    ).toEqual([]);
    expect(
      passingNodes(results, 'color-contrast'),
      `${path} measured far fewer colour-contrast nodes on a phone than it should: content stopped ` +
        'being rendered or became transparent. Find what left the page before adjusting this floor.',
    ).toBeGreaterThan(CONTRAST_FLOOR[path]);
  });
}

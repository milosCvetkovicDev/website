import { expect, test, type Locator } from '@playwright/test';
import { gotoHydrated } from './support/hydration';
import { PAGE_HEADINGS } from './support/page-headings';

/**
 * The visual order of the five routes whose `h1` names their person or subject since #58 (58a):
 * the `h1` first and drawn smaller, the hook right under it and still the largest line, so the
 * page's voice survives the semantics fix. `seo-surface.spec.ts` asserts the same markup over the
 * served HTML; this reads the drawn page, at the desktop project's width and at a 375 px phone
 * width, where the display sizes step down. The owner judges the look from the screenshots in the
 * pull request; this keeps the order and the size relation from drifting afterwards.
 *
 * This file sits outside `e2e/mobile/`, so only the desktop `chromium` project runs it; the phone
 * width is a viewport here, not a device.
 */

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
];

const fontSize = (locator: Locator) =>
  locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const [route, { heading, hook }] of Object.entries(PAGE_HEADINGS)) {
      test(`${route} draws its hook under its h1, larger than it`, async ({ page }) => {
        await gotoHydrated(page, route);
        const h1 = page.getByRole('heading', { level: 1 });
        await expect(h1).toHaveText(heading);
        const hookLine = h1.locator('xpath=following-sibling::p[1]');
        await expect(hookLine).toHaveText(hook);
        await expect(h1).toBeVisible();
        await expect(hookLine).toBeVisible();

        const [headingSize, hookSize] = [await fontSize(h1), await fontSize(hookLine)];
        expect(
          hookSize,
          `the hook is drawn at ${hookSize}px and the h1 at ${headingSize}px: the hook stays the larger line`,
        ).toBeGreaterThan(headingSize);

        const [headingBox, hookBox] = [await h1.boundingBox(), await hookLine.boundingBox()];
        expect(headingBox, 'the h1 has a box').not.toBeNull();
        expect(hookBox, 'the hook has a box').not.toBeNull();
        if (!headingBox || !hookBox) return;
        expect(
          hookBox.y,
          'the hook starts below the bottom of the h1, on lines of its own',
        ).toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 0.5);
      });
    }
  });
}

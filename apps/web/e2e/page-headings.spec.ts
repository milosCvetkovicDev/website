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
 * widths are viewports here, not devices. 320 px is the narrowest phone the site is laid out for
 * (`e2e/mobile/layout-overflow.spec.ts`), where the long lines wrap the most, so each line's text is
 * also held inside the viewport there.
 */

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 568 },
];

const fontSize = (locator: Locator) =>
  locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

/** The box of an element's text, read through a range over its contents. */
const textBox = (locator: Locator) =>
  locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const { left, right } = range.getBoundingClientRect();
    return { left, right };
  });

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
          [headingSize, hookSize].every(Number.isFinite),
          `the font sizes are numbers: the h1 ${headingSize}, the hook ${hookSize}`,
        ).toBe(true);
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

        // Each line's text, not its block, which is as wide as its column whatever the text does.
        for (const [what, line] of [
          ['the h1', h1],
          ['the hook', hookLine],
        ] as const) {
          const text = await textBox(line);
          expect(text.left, `${what} starts off the left edge`).toBeGreaterThanOrEqual(0);
          expect(text.right, `${what} ends past the viewport`).toBeLessThanOrEqual(viewport.width);
        }
      });
    }
  });
}

import { expect, test } from '@playwright/test';

test.describe('Story sections', () => {
  test('scrolling back up reverses the closing section at once', async ({ page }) => {
    await page.goto('/');

    // The footer links to the same profile, so match the closing section's own call to action by
    // the text it carries rather than by the destination.
    const cta = page.locator('a[href*="linkedin.com/in/"]', { hasText: 'Connect on LinkedIn' });
    await expect(cta).toHaveCount(1);
    await cta.scrollIntoViewIfNeeded();

    // The entrance timeline starts the breathing glow from its onComplete, so a box-shadow on the
    // call to action is the signal that the entrance has finished.
    await expect
      .poll(() => cta.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 30_000 })
      .not.toBe('none');

    // Linger. The glow repeats forever, so while it was a child of the entrance timeline the
    // timeline's playhead advanced for as long as the section stayed on screen, and the 'reverse'
    // toggleAction had to rewind all of it before the entrance itself moved.
    await page.waitForTimeout(4_000);

    await page.evaluate(() => window.scrollTo(0, 0));

    // The entrance is 1.4s long, so three seconds is ample for it to have fully reversed. With the
    // glow inside the timeline this fails: four seconds of breathing rewind first.
    await expect(cta).toHaveCSS('opacity', '0', { timeout: 3_000 });
  });
});

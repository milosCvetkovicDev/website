import { expect, test } from '@playwright/test';

test.describe('Story sections', () => {
  test('scrolling back up reverses the closing section at once', async ({ page }) => {
    await page.goto('/');

    const cta = page.getByRole('link', { name: /connect on linkedin/i });
    await cta.scrollIntoViewIfNeeded();

    // The section hydrates on approach, then its entrance timeline runs; the breathing glow is
    // started by that timeline's onComplete, so a box-shadow on the call to action is the signal
    // that the entrance has finished.
    await expect
      .poll(() => cta.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 30_000 })
      .not.toBe('none');

    // Linger. The glow repeats forever, so while it was a child of the entrance timeline the
    // timeline's playhead advanced for as long as the section stayed on screen, and the 'reverse'
    // toggleAction had to rewind all of it before the entrance itself moved.
    await page.waitForTimeout(4_000);

    await page.evaluate(() => window.scrollTo(0, 0));

    // The entrance is 1.4s long, so two seconds is enough for it to have fully reversed. With the
    // glow inside the timeline this assertion fails: four seconds of breathing rewind first.
    await page.waitForTimeout(2_000);
    await expect(cta).toHaveCSS('opacity', '0');
  });
});

import { expect, test } from '@playwright/test';

// The dots name the seven sections of the AnimatedHero story, but `/` keeps going with Featured
// Work, Tech Stack and the footer below it — the story is a little over three quarters of the
// document. Only a real browser can say whether the box the indicator divides is the story's:
// jsdom has no layout, so the unit tests hand the wrapper its metrics as a fixture and cannot see
// a ref that never reached the component, or a positioned ancestor appearing in the layout and
// taking `offsetTop` off the document.
test.describe('Section progress', () => {
  test.beforeEach(async ({ page }) => {
    // Reduced motion makes a dot jump instant, so no assertion here can race a smooth scroll.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // Guard against reuseExistingServer attaching to some other project's dev server on :3000.
    await expect(page).toHaveTitle(/Milos Cvetkovic/);
    // The boot loader is removed once React has hydrated; interactions before that are lost.
    await expect(page.getByText('System Boot')).toBeHidden({ timeout: 30_000 });
  });

  test('sends the last dot to the closing section rather than the footer', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to CTA section' }).click();

    await expect(page.getByRole('link', { name: 'Connect on LinkedIn' })).toBeInViewport();
    await expect(page.getByRole('contentinfo')).not.toBeInViewport();
    await expect(page.getByText('[07/07] CTA')).toBeVisible();
  });

  test('leaves every dot on the section it names', async ({ page }) => {
    // The click target and the active index are two readings of the same proportion, so clicking a
    // dot has to light that dot — whatever the sections inside the story actually measure.
    const labels = ['INIT', 'DISCOVER', 'PLAN', 'BUILD', 'TEST', 'SHIP', 'CTA'];

    for (const [index, label] of labels.entries()) {
      await page.getByRole('button', { name: `Go to ${label} section` }).click();

      await expect(page.getByText(`[0${index + 1}/07] ${label}`)).toBeVisible();
    }
  });

  test('reads the restored position after a reload part-way down the story', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to BUILD section' }).click();
    await expect(page.getByText('[04/07] BUILD')).toBeVisible();
    const scrolled = await page.evaluate(() => window.scrollY);

    await page.reload();
    await expect(page.getByText('System Boot')).toBeHidden({ timeout: 30_000 });

    // The browser puts the page back where it was and tells nobody: scroll restoration dispatches
    // no scroll event the indicator could listen for. Asserting the position first keeps the test
    // honest — a browser that stopped restoring would leave it passing against a page at the top.
    const restored = await page.evaluate(() => window.scrollY);
    expect(Math.abs(restored - scrolled)).toBeLessThan(5);
    await expect(page.getByText('[04/07] BUILD')).toBeVisible();
  });

  test('reads the closing section while it is the section on screen', async ({ page }) => {
    const cta = page.getByRole('link', { name: 'Connect on LinkedIn' });
    // Scrolled to, rather than jumped to. Measured against the document this sits about three
    // quarters of the way down, which left the readout two sections short of the story's end.
    await cta.evaluate((link) => link.scrollIntoView({ block: 'center' }));

    await expect(cta).toBeInViewport();
    await expect(page.getByText('[07/07] CTA')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

test.describe('Featured Work', () => {
  test('cards light up the architecture diagram on hover and keyboard focus', async ({ page }) => {
    await page.goto('/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();

    const cards = section.getByRole('link', {
      name: /Self-Healing Agent|Enterprise B2B Platform|Nx Remote Cache/,
    });
    await expect(cards).toHaveCount(3);
    await expect(section.locator('path[data-active="true"]')).toHaveCount(0);

    await cards.first().hover();
    await expect(section.locator('path[data-active="true"]').first()).toBeAttached();

    await page.mouse.move(0, 0);
    await cards.nth(1).focus();
    await expect(cards.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(3);
  });
});

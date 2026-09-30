import { expect, test } from '@playwright/test';

/**
 * The desktop header: which nav link says it is the current page, and what the logo link is called.
 *
 * The phone half of the header, the menu dialog, is covered in `e2e/mobile/navigation.spec.ts`,
 * which only the two phone projects run. This file sits outside `e2e/mobile/`, so the desktop
 * `chromium` project runs it at 1280x720, where the desktop nav is the one on screen.
 *
 * Nothing here interacts, so no test waits for hydration: `aria-current` and the logo's name are in
 * the server-rendered markup, and hydration must not change them (a mismatch fails
 * `console-clean.spec.ts`).
 */

test.describe('the desktop header', () => {
  // `header nav` matches only the desktop nav: the menu dialog renders after `</header>`, not
  // inside it, so its own links (the Work link current too) are not counted here.
  for (const [path, href] of [
    ['/work/self-healing-agent', '/work'],
    ['/work', '/work'],
    ['/about', '/about'],
  ] as const) {
    test(`marks ${href} as the current page on ${path}`, async ({ page }) => {
      await page.goto(path);
      const current = page.locator('header nav a[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute('href', href);
      // The same rule drives the accent colour, so the link that is current is also the one that
      // looks it: every other desktop link keeps the muted colour.
      const colours = await page
        .locator('header nav a')
        .evaluateAll((links) =>
          links.map((link) => [link.getAttribute('href'), getComputedStyle(link).color] as const),
        );
      const currentColour = colours.find(([linkHref]) => linkHref === href)?.[1];
      const others = colours.filter(([linkHref]) => linkHref !== href).map(([, colour]) => colour);
      expect(others.length).toBeGreaterThan(0);
      expect(others, 'only the current link takes the accent colour').not.toContain(currentColour);
    });
  }

  test('names the logo link after its visible mark and says it goes home', async ({ page }) => {
    await page.goto('/about');
    const logo = page.locator('header').getByRole('link', { name: /MC/ });
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAccessibleName(/home/i);
    await expect(logo).toHaveAttribute('href', '/');
  });

  test('keeps the menu dialog out of the blurred header, closed at this width', async ({
    page,
  }) => {
    await page.goto('/about');
    // A `backdrop-filter` on the sticky header makes it the containing block of its `fixed`
    // descendants, which is what once clipped the menu to the header's 72px. The dialog renders in
    // the top layer when open, and after the header rather than inside it either way.
    await expect(page.locator('header dialog')).toHaveCount(0);
    const dialog = page.locator('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  });
});

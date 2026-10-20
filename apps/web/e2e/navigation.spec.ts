import { expect, test } from '@playwright/test';
import { gotoHydrated } from './support/hydration';

/**
 * The desktop header: which nav link says it is the current page, and what the logo link is called.
 *
 * The phone half of the header, the menu dialog, is covered in `e2e/mobile/navigation.spec.ts`,
 * which only the two phone projects run. This file sits outside `e2e/mobile/`, so the desktop
 * `chromium` project runs it at 1280x720, where the desktop nav is the one on screen.
 *
 * Only the focus test at the end interacts, so only it waits for hydration: `aria-current` and the
 * logo's name are in the server-rendered markup, and hydration must not change them (a mismatch
 * fails `console-clean.spec.ts`).
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
      const { links, accent } = await page.locator('header nav').evaluate((nav) => {
        // `--accent-text` resolved to the same `rgb()` form as a computed `color`, via a probe.
        const probe = document.createElement('span');
        probe.style.color = 'var(--accent-text)';
        nav.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return {
          accent: resolved,
          links: [...nav.querySelectorAll('a')].map((link) => ({
            href: link.getAttribute('href'),
            colour: getComputedStyle(link).color,
            underlined: getComputedStyle(link).textDecorationLine.includes('underline'),
          })),
        };
      });
      const currentLink = links.find((link) => link.href === href);
      expect(currentLink, `no ${href} link in the desktop nav`).toBeDefined();
      expect(currentLink?.colour, 'the current link takes the accent text colour').toBe(accent);
      const others = links.filter((link) => link.href !== href);
      expect(others.length).toBeGreaterThan(0);
      expect(
        others.map((link) => link.colour),
        'only the current link takes the accent colour',
      ).not.toContain(accent);
      // Colour alone is not enough to tell it apart (WCAG 1.4.1): `--accent-text` and `--muted` are
      // under 1.2:1 from each other. The current link is also underlined, and only it.
      expect(currentLink?.underlined, 'the current link is underlined').toBe(true);
      expect(others.filter((link) => link.underlined).map((link) => link.href)).toEqual([]);
    });
  }

  test('names the logo link after its visible mark and says it goes home', async ({ page }) => {
    await page.goto('/about');
    const logo = page.locator('header').getByRole('link', { name: /MC/ });
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAccessibleName(/home/i);
    await expect(logo).toHaveAttribute('href', '/');
  });

  test('keeps the menu dialog out of the header, closed at this width', async ({ page }) => {
    await page.goto('/about');
    // A `backdrop-filter` on the sticky header made it the containing block of its `fixed`
    // descendants, which is what once clipped the menu to the header's 72px. The header has had no
    // filter since #147; the dialog renders in the top layer when open, and after the header rather
    // than inside it either way, so a filter that came back could not clip it.
    await expect(page.locator('header dialog')).toHaveCount(0);
    const dialog = page.locator('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  });

  test('scrolls a link that keyboard focus reaches out from under the header', async ({ page }) => {
    // The header is opaque since #147, so a control that sits behind it is hidden entirely, not
    // merely dimmed. A browser scrolls focus into view only when the control is outside the
    // viewport, and one under a sticky header is inside it: without room reserved for the header,
    // Shift+Tab up the page lands on a link nobody can see (WCAG 2.4.11 Focus Not Obscured).
    await gotoHydrated(page, '/work');
    const pair = await page.evaluate(() => {
      const tabbable = [
        ...document.querySelectorAll<HTMLElement>('main a[href], main button, main [tabindex]'),
      ].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const bottom = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      // A link that can be scrolled to 20px from the top of the viewport, behind the 69px header,
      // and the control after it, from which Shift+Tab goes back to it.
      const index = tabbable.findIndex((element, i) => {
        const top = element.getBoundingClientRect().top + window.scrollY;
        return i + 1 < tabbable.length && top >= 300 && top - 20 <= bottom;
      });
      if (index < 0) return null;
      const [target, next] = [tabbable[index], tabbable[index + 1]];
      target.dataset.focusTarget = '';
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - 20,
        behavior: 'instant',
      });
      next.focus({ preventScroll: true });
      return { target: target.outerHTML.slice(0, 120), top: target.getBoundingClientRect().top };
    });
    expect(pair, 'no link on /work can be scrolled under the header').not.toBeNull();
    const header = await page.locator('body > header').boundingBox();
    expect(header).not.toBeNull();
    expect(pair!.top, `${pair!.target} should start behind the header`).toBeLessThan(
      header!.y + header!.height,
    );

    await page.keyboard.press('Shift+Tab');
    const target = page.locator('[data-focus-target]');
    await expect(target, `Shift+Tab should move focus to ${pair!.target}`).toBeFocused();
    const box = await target.boundingBox();
    expect(
      box!.y,
      `${pair!.target} took focus behind the header, which ends at ${header!.y + header!.height}`,
    ).toBeGreaterThanOrEqual(header!.y + header!.height);

    // The room is reserved for the page's content only. The header's own links always sit in that
    // strip, so reserving it for them too would scroll the page to the top whenever one took focus.
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled, 'the Shift+Tab above should leave the page scrolled').toBeGreaterThan(0);
    await page.locator('body > header a[href="/about"]').focus();
    expect(
      await page.evaluate(() => window.scrollY),
      'focusing a header link must not scroll the page',
    ).toBe(scrolled);
  });
});

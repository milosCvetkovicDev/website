import { expect, test, type Locator, type Page } from '@playwright/test';
import { STATIC_ROUTES } from '../routes';

/**
 * The mobile header and its menu, on a real phone viewport.
 *
 * Nothing tested this before: the header's mobile half and `MobileMenu` are `md:hidden`
 * (`src/components/navigation.tsx:151`, `:76`), and the whole suite ran one 1280x720 project, where
 * that half of the component does not exist. This file runs on the two phone projects only — see
 * `MOBILE_SPECS` in `playwright.config.ts` — so `isMobile` and `hasTouch` are real and `tap()` is a
 * touch event rather than a synthesised click.
 *
 * Half of it is green and half of it is RED. The green half is the regression floor #46 has to keep:
 * the menu opens and closes by its own button, each link navigates, and the mobile theme toggle
 * flips the `<html>` class. The RED half is rows R1 to R9 of the manifest, each an expected failure
 * annotated for #46, so this file is green today and #46's pull request has to delete nine
 * annotations. An expected failure that starts passing fails the run, which is what makes the
 * annotation the stop condition rather than a comment.
 *
 * Two of them are about the same single bug. `<header>` carries `backdrop-blur-sm`
 * (`navigation.tsx:122`), and a `backdrop-filter` makes an element the containing block for its
 * `position: fixed` descendants. `MobileMenu` renders inside that header, so its `fixed inset-0`
 * wrapper, backdrop and drawer are all clipped to the header's own 375x72 box instead of filling the
 * viewport: measured 256x72 for the drawer at 375x812. The links paint over the page text with no
 * drawer behind them (R2) and the backdrop covers nothing, so a tap below the header lands on the
 * page and the menu stays open (R3). It is also why WebKit is here: whether a `backdrop-filter`
 * ancestor becomes that containing block is engine-specific.
 */

/** The loader only exists on `/`; elsewhere the locator matches nothing and this resolves at once. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
}

const menuButton = (page: Page) => page.getByRole('button', { name: 'Open menu' });
const closeButton = (page: Page) => page.getByRole('button', { name: 'Close menu' });

/**
 * The drawer: the innermost element that holds both the close button and the menu links.
 *
 * Defined by what it contains rather than by its classes on purpose. `div.fixed.top-0.right-0` would
 * work today and is exactly the kind of locator that turns #46 into a rebuild of this file: that fix has
 * to restructure this markup — a real dialog, a container that is not clipped by the blurred header — and
 * a class-keyed locator would then resolve nothing, leaving R1, R2, R3 and R8 red for a reason that has
 * nothing to do with the defect. An expected failure that keeps failing after the fix is worse than one
 * that starts passing: it looks like the fix did not work.
 *
 * Ancestors appear before their descendants in document order and nested ancestors run outermost to
 * innermost, so `.last()` on the filtered list is the innermost container of both — the panel itself,
 * whether that is today's `<div>` or tomorrow's `[role="dialog"]`, and not some wrapper further up.
 */
const drawer = (page: Page) =>
  page
    .locator('div, section, aside, nav, dialog')
    .filter({ has: closeButton(page) })
    .filter({ has: page.getByRole('link', { name: 'About' }) })
    .last();

async function openMenu(page: Page) {
  await menuButton(page).tap();
  await expect(closeButton(page)).toBeVisible();
}

/** A locator's box, or a named failure rather than `null` flowing into an assertion. */
async function boxOf(locator: Locator, what: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no bounding box: it is not rendered`);
  return box;
}

test.describe('the mobile header', () => {
  // No retries, for a reason specific to expected failures. CI sets `retries: 2`, and an expected
  // failure that passes on its first attempt is an *unexpected pass* — the signal that says a defect
  // has been fixed and the annotation must go. With retries on, Playwright would run it again, see it
  // fail as annotated, and report the whole thing as flaky rather than as a failure. The one outcome
  // these rows exist to produce would be swallowed. The green tests here want it for the ordinary
  // reason: they are the regression floor for #46 and a retry could hide an intermittent break in it.
  test.describe.configure({ retries: 0 });

  test('opens and closes the menu by its own buttons', async ({ page }) => {
    await open(page, '/');
    await expect(menuButton(page)).toBeVisible();
    await expect(closeButton(page)).toBeHidden();

    await openMenu(page);
    // All six links, including Home, which the desktop nav drops (`navLinks.slice(1)`).
    await expect(drawer(page).getByRole('link')).toHaveCount(STATIC_ROUTES.length);

    await closeButton(page).tap();
    await expect(closeButton(page)).toBeHidden();
    await expect(menuButton(page)).toBeVisible();
  });

  test('navigates by a menu link and closes the menu', async ({ page }) => {
    await open(page, '/');
    await openMenu(page);

    await drawer(page).getByRole('link', { name: 'About' }).tap();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The link's own onClick closes the menu; the panel must not survive the navigation.
    await expect(closeButton(page)).toBeHidden();
  });

  test('switches the theme from the mobile toggle', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '/');
    const html = page.locator('html');
    await expect(html).toContainClass('dark');

    // Two toggles ship, one in the desktop nav and one in the mobile header. Only the mobile one is
    // visible at this viewport, so the visible filter picks it without depending on DOM order.
    const toggle = page.getByRole('button', { name: /Switch to (light|dark) mode/ });
    await toggle.and(page.locator(':visible')).tap();

    await expect(html).toContainClass('light');
    await expect(html).not.toContainClass('dark');
  });

  // ---------------------------------------------------------------------------------------------
  // RED: rows R1 to R9, all fixed by #46. Each is a real measurement of the shipped component.
  // ---------------------------------------------------------------------------------------------

  test('the open menu panel fills the viewport height', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R1, #46' });
    await open(page, '/');
    await openMenu(page);

    const panel = await boxOf(drawer(page), 'the menu drawer');
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport size: this spec must run on a phone project');
    // `h-full` on a panel whose containing block is the 72px-tall blurred header measures 72, not
    // 812. The drawer is `w-64`, so its width is 256 either way; the height is the whole bug.
    expect(panel.height).toBeGreaterThanOrEqual(viewport.height);
  });

  test('every menu link lies inside the panel', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R2, #46' });
    await open(page, '/');
    await openMenu(page);

    const panel = await boxOf(drawer(page), 'the menu drawer');
    // Resolved once and iterated, rather than a `getByRole(..., { name })` per link: the accessible
    // name of every candidate is recomputed on each such call.
    const links = await drawer(page).getByRole('link').all();
    expect(links.length).toBe(STATIC_ROUTES.length);

    const outside: string[] = [];
    for (const link of links) {
      const box = await boxOf(link, 'a menu link');
      const inside =
        box.y >= panel.y &&
        box.y + box.height <= panel.y + panel.height &&
        box.x >= panel.x &&
        box.x + box.width <= panel.x + panel.width;
      if (!inside) outside.push(`${(await link.textContent())?.trim()} at y=${Math.round(box.y)}`);
    }
    // Today the links run from about y=72 to y=320 while the panel ends at y=72, so all six are
    // painted straight over the page content with no drawer behind them.
    expect(
      outside,
      `these menu links are painted outside the drawer (panel y=${Math.round(panel.y)}..` +
        `${Math.round(panel.y + panel.height)}): the drawer is clipped to the blurred header.`,
    ).toEqual([]);
  });

  test('tapping outside the panel closes the menu', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R3, #46' });
    await open(page, '/');
    await openMenu(page);

    // Left of the 256px-wide drawer and well below the header: on a working overlay this is the
    // backdrop. Today the backdrop is clipped to the header's box, so the tap reaches the page.
    await page.touchscreen.tap(40, 500);

    await expect(closeButton(page)).toBeHidden();
  });

  test('the open menu is a modal dialog with an accessible name', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R4, #46' });
    await open(page, '/');
    await openMenu(page);

    // The wrapper is a plain `<div>` (`navigation.tsx:76`), so a screen-reader user gets no
    // announcement that a dialog opened and no boundary for it.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    const name = await page.getByRole('dialog').first().getAttribute('aria-label');
    expect(name?.trim(), 'the dialog needs an accessible name').toBeTruthy();
  });

  test('the menu button reflects whether the menu is open', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R5, #46' });
    await open(page, '/');
    const button = menuButton(page);
    // `navigation.tsx:153` carries `aria-label` only: no `aria-expanded`, no `aria-controls`.
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await openMenu(page);

    await expect(page.getByRole('button', { expanded: true })).toHaveCount(1);
  });

  test('Escape closes the menu', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R6, #46' });
    await open(page, '/');
    await openMenu(page);

    await page.keyboard.press('Escape');

    // `navigation.tsx:70-115` has no keydown handler, so the close button is still attached.
    await expect(closeButton(page)).toBeHidden();
  });

  test('closing the menu returns focus to the menu button', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R7, #46' });
    await open(page, '/');
    await openMenu(page);

    await closeButton(page).tap();
    await expect(closeButton(page)).toBeHidden();

    // Nothing calls focus(), so the element that had focus was removed and activeElement fell back
    // to <body>: a keyboard user is returned to the top of the document.
    await expect(menuButton(page)).toBeFocused();
  });

  test('Tab from the last menu link stays inside the menu', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R8, #46' });
    await open(page, '/');
    await openMenu(page);

    const links = drawer(page).getByRole('link');
    await links.last().focus();
    await page.keyboard.press('Tab');

    // Nothing makes the rest of the page inert, so Tab walks into the content behind the menu.
    const focusedIsInDrawer = await drawer(page).evaluate(
      (panel) => !!document.activeElement && panel.contains(document.activeElement),
    );
    expect(focusedIsInDrawer, 'focus left the open menu').toBe(true);
  });

  test('a case-study route marks a header nav link as the current page', async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R9, #46' });
    await open(page, '/work/self-healing-agent');
    await openMenu(page);

    // `pathname === link.href` (`navigation.tsx:101`) is an exact match, so on /work/<slug> no link
    // is current and the header says nothing about where the visitor is. /work is the section.
    const current = drawer(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', '/work');
  });

  test('the menu marks the current page on a route that is a nav link', async ({ page }) => {
    // The green counterpart of R9: an exact route already works, so R9's fix must not regress it.
    await open(page, '/about');
    await openMenu(page);

    const current = drawer(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', '/about');
  });
});

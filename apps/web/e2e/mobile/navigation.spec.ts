import { expect, test, type Locator, type Page } from '@playwright/test';
import { audit, describeViolations } from '../axe';
import { NAV_ROUTES } from '../routes';
import { servesProductionBuild } from '../support/build-mode';
import { gotoHydrated } from '../support/hydration';
import { warmRoutes } from '../support/warm-routes';

/**
 * The mobile header and its menu, on a real phone viewport.
 *
 * Nothing tested this before: the header's mobile half is `md:hidden` and the menu only opens from
 * it, and the whole suite ran one 1280x720 project, where that half of the component does not
 * exist. This file runs on the two phone projects only — see `MOBILE_SPECS` in
 * `playwright.config.ts` — so `isMobile` and `hasTouch` are real and `tap()` is a touch event
 * rather than a synthesised click.
 *
 * The first tests are the regression floor: the menu opens and closes by its own buttons, each link
 * navigates, the menu does not prefetch the page it is on, and the mobile theme toggle flips the
 * `<html>` class. Rows R1 to R9 of the audit's manifest follow. They were recorded as expected
 * failures against the menu as it first shipped, and they pass now that the menu is a native modal
 * `<dialog>`; each row keeps its manifest ID so the record can be followed back.
 *
 * Two of them are about the same single bug. `<header>` carried `backdrop-blur-sm` then, and a
 * `backdrop-filter` makes an element the containing block for its `position: fixed` descendants.
 * The menu used to render inside that header, so its `fixed inset-0` wrapper, backdrop and drawer
 * were all clipped to the header's own 375x72 box instead of filling the viewport: measured 256x72
 * for the drawer at 375x812. The links painted over the page text with no drawer behind them (R2)
 * and the backdrop covered nothing, so a tap below the header landed on the page and the menu
 * stayed open (R3). A modal dialog renders in the top layer, which no ancestor can clip, and it
 * renders after `</header>` besides. The header itself has had no `backdrop-filter` since #147
 * made it opaque. WebKit runs here too because how a modal dialog handles focus is engine-specific
 * ('Tab and Shift+Tab from the Close button keep focus in the menu, in both engines'); whether a
 * `backdrop-filter` ancestor becomes that containing block was too, when the header had one.
 */

/** Every test here interacts, on `/` and on other routes alike, so each one starts hydrated. */
async function open(page: Page, path: string) {
  await gotoHydrated(page, path);
}

/** The phone size the audit measured the defect at. Both phone projects' devices are larger. */
const PHONE = { width: 375, height: 812 } as const;

const menuButton = (page: Page) => page.getByRole('button', { name: 'Open menu' });
const closeButton = (page: Page) => page.getByRole('button', { name: 'Close menu' });

/**
 * The `<dialog>` element itself, open or closed. `getByRole('dialog')` sees it only while it is
 * open, which is right for what a screen reader is told and useless for checking that it closed.
 */
const menuDialog = (page: Page) => page.locator('dialog');

/**
 * The drawer: the innermost element that holds both the close button and the menu links.
 *
 * Defined by what it contains rather than by its classes on purpose. A class-keyed locator would
 * break the moment the markup is restructured, and every row below would then fail for a reason
 * that has nothing to do with what it measures. The drawer is the panel's inner wrapper, which
 * fills the dialog: a tap on the dialog's `::backdrop` is dispatched to the `<dialog>` element
 * itself, so the wrapper is what tells a point on the panel from a point on the backdrop.
 *
 * Ancestors appear before their descendants in document order and nested ancestors run outermost to
 * innermost, so `.last()` on the filtered list is the innermost container of both — the panel
 * itself, and not some wrapper further up.
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

/** Whether focus is inside the open menu dialog right now, and where it is if not. */
const focusInDialog = (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const active = document.activeElement;
    if (!active) return { inside: false, active: 'nothing' };
    // Sliced, because on <body> the text content is the whole page.
    const name = (active.getAttribute('aria-label') ?? active.textContent?.trim() ?? '').slice(
      0,
      40,
    );
    return {
      inside: !!dialog && active !== dialog && dialog.contains(active),
      active: `${active.tagName.toLowerCase()} ${name}`,
    };
  });

/**
 * Where focus is, as the index of the menu control that holds it (`-1` when it is on no control
 * of the open dialog), with the number of controls and a readable name for the failure message.
 * Controls are identified by position, not by name, so two with the same label stay distinct.
 */
const focusedControl = (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const controls = [...(dialog?.querySelectorAll<HTMLElement>('a[href], button') ?? [])];
    const active = document.activeElement;
    const name = active
      ? `${active.tagName.toLowerCase()} ${(active.getAttribute('aria-label') ?? active.textContent?.trim() ?? '').slice(0, 40)}`
      : 'nothing';
    return {
      index: active instanceof HTMLElement ? controls.indexOf(active) : -1,
      count: controls.length,
      name,
    };
  });

/** Console errors and warnings, and uncaught page errors, from here on. */
function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') problems.push(`console.${type}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

test.describe('the mobile header', () => {
  // No retries. CI sets `retries: 2`, and a retry could hide an intermittent break in the menu's
  // behaviour as a green "flaky" run; this file is the menu's regression floor.
  test.describe.configure({ retries: 0 });

  test('opens and closes the menu by its own buttons', async ({ page }) => {
    await open(page, '/');
    await expect(menuButton(page)).toBeVisible();
    await expect(closeButton(page)).toBeHidden();

    await openMenu(page);
    // All six links, including Home, which the desktop nav drops (`navLinks.slice(1)`).
    await expect(drawer(page).getByRole('link')).toHaveCount(NAV_ROUTES.length);

    await closeButton(page).tap();
    await expect(closeButton(page)).toBeHidden();
    await expect(menuButton(page)).toBeVisible();
  });

  // The About tap is a client-side navigation, whose URL changes only once the RSC payload for
  // `/about` has arrived. Run alone from a deleted `.next-e2e`, it was the dev server's first
  // request for that route: 2.1 s for the payload, 1.7 s of it in Next.js itself (42 ms with the
  // cache kept), against under 0.4 s for later taps (2026-09-13). It passed all 40 runs on both phone
  // projects, but the same kind of first-request wait failed `case-study.spec.ts`. The route is
  // requested before the test, once per worker (e2e/support/warm-routes.ts), from an anonymous group
  // holding only this test.
  test.describe(() => {
    test.beforeAll(async ({ playwright }, testInfo) => {
      await warmRoutes(playwright, testInfo, ['/about']);
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
  });

  // On a phone the header logo is the only link in view at load, and on `/` it prefetched `/`
  // itself: three `?_rsc=` requests racing the page's own, inside the window Lighthouse measures.
  // The control on `/about`, where the logo keeps Next's default, shows that the same wait sees that
  // prefetch. `next dev` prefetches nothing, so there the check on `/` would pass without testing
  // anything: the test runs against the production build only. The menu's own links are in the
  // document too, inside the closed dialog, and a closed dialog is `display: none`, so Next never
  // sees them enter the viewport: this test also proves they prefetch nothing until it opens.
  test('the header logo does not prefetch the page it is on', async ({ page }) => {
    test.skip(!servesProductionBuild(), 'Next prefetches a Link only in a production build');
    const prefetched: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.searchParams.has('_rsc')) prefetched.push(url.pathname);
    });

    await open(page, '/about');
    await page.waitForLoadState('networkidle');
    expect(prefetched, 'on /about the logo should still prefetch /').toContain('/');

    prefetched.length = 0;
    await open(page, '/');
    await page.waitForLoadState('networkidle');
    expect(
      prefetched.filter((path) => path === '/'),
      'on / the header logo prefetched the page it is on',
    ).toEqual([]);
  });

  // The menu's own Home entry did the same once the menu was open: three `/?_rsc=` requests on `/`.
  // The other entries keep Next's default, and prefetching them is the control.
  test('the open menu does not prefetch the page it is on', async ({ page }) => {
    test.skip(!servesProductionBuild(), 'Next prefetches a Link only in a production build');
    const prefetched: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.searchParams.has('_rsc')) prefetched.push(url.pathname);
    });

    await open(page, '/');
    await page.waitForLoadState('networkidle');
    prefetched.length = 0;
    await openMenu(page);
    // The page is already idle, so `networkidle` would not wait. Next schedules the entries'
    // prefetches together once the links are visible, Home's ahead of About's in document order, so
    // About's arriving is the control and the point by which Home's would have been requested.
    await expect
      .poll(() => prefetched, { message: 'the open menu should prefetch the other routes' })
      .toContain('/about');
    expect(
      prefetched.filter((path) => path === '/'),
      'on / the open menu prefetched the page it is on',
    ).toEqual([]);
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
  // Rows R1 to R9: the menu's geometry, its dialog semantics, its focus handling and the current
  // link, each a real measurement of the shipped component.
  // ---------------------------------------------------------------------------------------------

  test('the open menu panel fills the viewport height', async ({ page }) => {
    // R1
    await page.setViewportSize(PHONE);
    await open(page, '/');
    await openMenu(page);

    const geometry = await drawer(page).evaluate((panel) => {
      const { y, height } = panel.getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      const hit = document.elementFromPoint(clientWidth - 20, clientHeight - 50);
      return { y, height, clientHeight, bottomRightIsPanel: !!hit && panel.contains(hit) };
    });
    // Clipped to the 72px blurred header, the panel measured y=0 and 72 tall.
    expect(geometry.y).toBe(0);
    expect(geometry.height).toBeGreaterThanOrEqual(geometry.clientHeight);
    expect(
      geometry.bottomRightIsPanel,
      'the bottom-right corner of the screen should be the menu panel, above all page content',
    ).toBe(true);
  });

  test('every menu link lies inside the panel', async ({ page }) => {
    // R2
    await page.setViewportSize(PHONE);
    await open(page, '/');
    await openMenu(page);

    const panel = await boxOf(drawer(page), 'the menu drawer');
    // Resolved once and iterated, rather than a `getByRole(..., { name })` per link: the accessible
    // name of every candidate is recomputed on each such call.
    const links = await drawer(page).getByRole('link').all();
    expect(links.length).toBe(NAV_ROUTES.length);

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
    expect(
      outside,
      `these menu links are painted outside the drawer (panel y=${Math.round(panel.y)}..` +
        `${Math.round(panel.y + panel.height)}): the drawer is clipped to the blurred header.`,
    ).toEqual([]);
  });

  test('tapping outside the panel closes the menu', async ({ page }) => {
    // R3
    await page.setViewportSize(PHONE);
    await open(page, '/');
    await openMenu(page);

    // Left of the 256px-wide drawer and near the bottom of the screen, where `main` or the footer
    // would be. With the menu open, that point must be the dialog's backdrop, whose events go to
    // the `<dialog>` element itself, and not the page: a tap on page content would prove nothing.
    const point = await page.evaluate(() => ({
      x: 20,
      y: document.documentElement.clientHeight - 100,
    }));
    const target = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return {
        isBackdrop: hit instanceof HTMLDialogElement && hit.matches(':modal'),
        inPage: !!hit?.closest('main, footer'),
      };
    }, point);
    expect(target, `(${point.x}, ${point.y}) should be on the menu's backdrop`).toEqual({
      isBackdrop: true,
      inPage: false,
    });

    await page.touchscreen.tap(point.x, point.y);

    await expect(menuDialog(page)).toHaveJSProperty('open', false);
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(closeButton(page)).toBeHidden();
  });

  test('the open menu is a modal dialog with an accessible name', async ({ page }) => {
    // R4
    await open(page, '/');
    await openMenu(page);

    // The menu used to be a plain `<div>`, so a screen-reader user got no announcement that a
    // dialog opened and no boundary for it.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toHaveAccessibleName(/\S/);
    // `showModal()` does not set `aria-modal`; the component does, for the rows and tools that read
    // the attribute rather than the element's state.
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
  });

  test('the menu button reflects whether the menu is open', async ({ page }) => {
    // R5
    await open(page, '/');
    const button = menuButton(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await openMenu(page);

    await expect(page.getByRole('button', { expanded: true })).toHaveCount(1);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialogId = await menuDialog(page).getAttribute('id');
    expect(dialogId, 'the dialog needs an id for aria-controls to point at').toBeTruthy();
    await expect(button).toHaveAttribute('aria-controls', dialogId ?? '');
  });

  // The gate's rule set with the menu open, in both schemes. The at-rest gates never see the menu,
  // because it is closed there. A case study, so the dialog's Work link is the current one and its
  // accent colour is measured too.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the open menu has no axe violations in the ${colorScheme} theme`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.emulateMedia({ colorScheme });
      await open(page, '/work/self-healing-agent');
      await expect(page.locator('html')).toContainClass(colorScheme);
      await openMenu(page);
      // What is audited: the menu as a modal dialog over an inert page.
      await expect(page.getByRole('dialog')).toBeVisible();

      const results = await audit(page);
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
        `the open menu must have no axe violations in the ${colorScheme} theme`,
      ).toEqual([]);
      // An empty violation list proves nothing unless axe measured the menu. axe 4.13's
      // aria-dialog-name selects an explicit `role="dialog"` only, which the dialog carries so that
      // the rule checks its name rather than skipping it.
      expect(
        results.passes.find(({ id }) => id === 'aria-dialog-name')?.nodes.length ?? 0,
        "axe's aria-dialog-name did not check the open menu",
      ).toBe(1);
      // And every menu link's contrast must have been decided, and passed: a node axe could not
      // decide is listed under `incomplete` instead, so it is missing here. Nodes are resolved from
      // axe's own selectors in the page, rather than matched on its serialised (and truncatable)
      // HTML, and must be links inside the dialog.
      const selectors = (
        results.passes.find(({ id }) => id === 'color-contrast')?.nodes ?? []
      ).flatMap(({ target }) => target.filter((part): part is string => typeof part === 'string'));
      const measured = await page.evaluate((all) => {
        const dialog = document.querySelector('dialog');
        return all.flatMap((selector) => {
          const node = document.querySelector(selector);
          return node instanceof HTMLAnchorElement && dialog?.contains(node)
            ? [node.getAttribute('href')]
            : [];
        });
      }, selectors);
      const menuHrefs = await menuDialog(page)
        .locator('a[href]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
      expect(menuHrefs).toHaveLength(NAV_ROUTES.length);
      expect(
        [...new Set(measured)].sort(),
        "axe did not measure the contrast of every one of the menu's links",
      ).toEqual([...menuHrefs].sort());
    });
  }

  test('Escape closes the menu', async ({ page }) => {
    // R6
    await open(page, '/');
    await openMenu(page);

    // Opening moves focus into the menu (the Close button, its first control).
    expect(await focusInDialog(page)).toMatchObject({ inside: true });

    await page.keyboard.press('Escape');

    await expect(closeButton(page)).toBeHidden();
    await expect(menuDialog(page)).toHaveJSProperty('open', false);
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton(page)).toBeFocused();
  });

  test('closing the menu returns focus to the menu button', async ({ page }) => {
    // R7
    await open(page, '/');
    await openMenu(page);

    await closeButton(page).tap();
    await expect(closeButton(page)).toBeHidden();

    // Without an explicit focus() the element that had focus is hidden and activeElement falls back
    // to <body>: a keyboard user is returned to the top of the document.
    await expect(menuButton(page)).toBeFocused();
  });

  test('Tab from the last menu link stays inside the menu', async ({ page }) => {
    // R8
    await open(page, '/');
    await openMenu(page);

    const links = drawer(page).getByRole('link');
    await links.last().focus();
    await page.keyboard.press('Tab');

    const focusedIsInDrawer = await drawer(page).evaluate(
      (panel) => !!document.activeElement && panel.contains(document.activeElement),
    );
    expect(focusedIsInDrawer, 'focus left the open menu').toBe(true);
  });

  test('ten Tab presses with the menu open never take focus out of it', async ({
    page,
    browserName,
  }) => {
    // AC 5 scopes this row to mobile-chrome, because Safari leaves links out of the tab order by
    // default. The menu now moves focus itself on every Tab, in both engines; the next row is the
    // one that runs on WebKit.
    test.skip(browserName === 'webkit', 'Safari does not tab to links by default');
    await open(page, '/');
    await openMenu(page);

    const visited = new Set<number>();
    let count = 0;
    for (const shift of [false, true]) {
      for (let press = 1; press <= 10; press++) {
        await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
        const focus = await focusedControl(page);
        count = focus.count;
        visited.add(focus.index);
        expect(
          focus.index,
          `${shift ? 'Shift+Tab' : 'Tab'} ${press} took focus out of the menu to ${focus.name}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
    // Ten presses each way over the dialog's controls (Close and six links) must have wrapped at
    // least once, and visited every control.
    expect(count).toBeGreaterThan(1);
    expect(visited.size).toBe(count);
  });

  test('Tab and Shift+Tab from the Close button keep focus in the menu, in both engines', async ({
    page,
  }) => {
    await open(page, '/');
    await openMenu(page);
    // showModal() puts focus on the Close button, the dialog's first control. In WebKit, links are
    // not in the default tab order, so without the menu's own handling Tab from here left the
    // dialog: Close is its first control but not its last.
    await closeButton(page).focus();

    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      const focus = await focusedControl(page);
      expect(
        focus.index,
        `${key} took focus out of the menu to ${focus.name}`,
      ).toBeGreaterThanOrEqual(0);
    }

    // Focus on no control at all, as after a tap on empty panel space, is brought back in too.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    const focus = await focusedControl(page);
    expect(focus.index, `Tab from <body> went to ${focus.name}`).toBeGreaterThanOrEqual(0);
  });

  // A modal dialog makes the page inert, but not unscrollable: scrolling over the backdrop chained
  // to the document and moved the page (and on `/`, the scroll-driven story) behind the open menu.
  // `html:has(dialog:modal)` stops that for every kind of scroll. The row scrolls with the wheel,
  // which moves the page on every runner: a touch gesture synthesised over the DevTools protocol
  // (`Input.synthesizeScrollGesture`) scrolled it on macOS but never on CI's Linux Chromium, where
  // even the closed-menu control stayed at scrollY 0 for 10 s. Mobile WebKit has no wheel.
  test('scrolling over the backdrop does not scroll the page behind the open menu', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Playwright does not support the wheel on mobile WebKit');
    await page.setViewportSize(PHONE);
    await open(page, '/about');
    const scrollAt = async (x: number, y: number) => {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 300);
    };
    const scrollY = () => page.evaluate(() => window.scrollY);
    const point = { x: 20, y: PHONE.height - 100 };

    // The control: with the menu closed, the same scroll moves the page.
    await scrollAt(point.x, point.y);
    await expect.poll(scrollY).toBeGreaterThan(0);
    const before = await scrollY();

    await openMenu(page);
    await scrollAt(point.x, point.y);
    await scrollAt(PHONE.width - 40, PHONE.height - 100);
    // Give a scroll that did chain the frames it needs to land before measuring.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(await scrollY(), 'the page scrolled behind the menu').toBe(before);
    await expect(menuDialog(page)).toHaveJSProperty('open', true);

    // Closed again, the page scrolls as before.
    await closeButton(page).tap();
    await scrollAt(point.x, point.y);
    await expect.poll(scrollY).toBeGreaterThan(before);
  });

  test('a case-study route marks a header nav link as the current page', async ({ page }) => {
    // R9
    await page.setViewportSize(PHONE);
    await open(page, '/work/self-healing-agent');
    await openMenu(page);

    // /work is the section a case study belongs to, so its link is current on /work/<slug> too.
    const current = drawer(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', '/work');
  });

  test('the menu marks the current page on a route that is a nav link', async ({ page }) => {
    // The green counterpart of R9: an exact route must stay current.
    await open(page, '/about');
    await openMenu(page);

    const current = drawer(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', '/about');
  });

  // Two ways the menu has to close without its own buttons, with a console listener across both. A
  // modal dialog makes the rest of the page inert, so one left open behind a layout that no longer
  // shows it would leave a desktop visitor with a page that ignores every click. `/work` is the
  // destination of both soft navigations, so the dev server compiles it first (warm-routes.ts).
  test.describe(() => {
    test.beforeAll(async ({ playwright }, testInfo) => {
      await warmRoutes(playwright, testInfo, ['/work']);
    });

    test('the menu closes on a link tap and when the viewport grows past md', async ({ page }) => {
      const problems = collectProblems(page);
      await page.setViewportSize(PHONE);

      // 1. A link in the open menu navigates and closes it.
      await open(page, '/');
      await openMenu(page);
      await drawer(page).getByRole('link', { name: 'Work' }).tap();
      await expect(page).toHaveURL(/\/work$/);
      await expect(menuDialog(page)).toHaveJSProperty('open', false);
      await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');

      // 2. Growing past Tailwind's `md` with the menu open closes it, and the desktop nav works.
      await open(page, '/about');
      await openMenu(page);
      await page.setViewportSize({ width: 1024, height: PHONE.height });
      await expect(menuDialog(page)).toHaveJSProperty('open', false);
      // The menu button is `md:hidden` now, so focus cannot go back to it; it goes to the header's
      // first control rather than falling to <body>.
      await expect(page.getByRole('banner').getByRole('link', { name: 'MC, home' })).toBeFocused();
      await page.getByRole('banner').getByRole('link', { name: 'Work' }).click();
      await expect(page).toHaveURL(/\/work$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      expect(problems, 'no console error, console warning or page error across both').toEqual([]);
    });
  });
});

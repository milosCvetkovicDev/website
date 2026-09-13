import { expect, test, type Browser, type Page } from '@playwright/test';
import { THEME_STORAGE_KEY } from '../src/lib/theme';

/**
 * A stored theme choice must beat the OS preference before React hydrates.
 *
 * The init script (`src/lib/theme.ts:13`) runs inline in `<head>` and is what makes the first paint
 * correct. It did execute in every Playwright run already — a throw inside it would have surfaced on
 * `console-clean`'s `pageerror` channel — and `theme-provider.test.tsx` covers persistence. What was
 * genuinely unchecked is its *outcome*: whether a visitor who chose light, on a machine set to dark,
 * gets light on the very first frame. `not-found-shell.spec.ts` only asserts the script's presence in
 * the served HTML, which says nothing about what it decides.
 *
 * Green on arrival. The work here is making the assertion be about the pre-hydration paint rather
 * than about what the provider settles on a moment later, because the provider converges on the same
 * answer and would make a naive `expect(html).toContainClass('light')` pass over a script that did
 * nothing at all. The class is therefore *latched* while the document is still parsing, by an
 * `addInitScript` listener that runs before any script in the document, and the latched value is what
 * is asserted. `dataset.themeAtParse` is written by the test, never by the app.
 */

/** Latches `document.documentElement.className` the moment parsing ends, before React hydrates. */
async function latchThemeAtParseTime(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener(
      'readystatechange',
      () => {
        const el = document.documentElement;
        if (!el.dataset.themeAtParse) el.dataset.themeAtParse = el.className;
      },
      { once: true },
    );
  });
}

/** A context on a machine set to dark, optionally with a theme already chosen on this origin. */
async function darkMachine(browser: Browser, storedTheme?: 'light' | 'dark') {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  if (storedTheme) {
    // Seeded through addInitScript rather than page.evaluate: the value has to be in the store before
    // the document's own scripts run, which is the only ordering in which the init script can read it.
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, value);
      },
      [THEME_STORAGE_KEY, storedTheme] as const,
    );
  }
  await latchThemeAtParseTime(page);
  return { context, page };
}

const themeAtParseTime = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.themeAtParse ?? '(never latched)');

test.describe('the pre-paint theme script', () => {
  // No retries: these read a class latched during parsing, and an intermittent failure means the init
  // script did not run before first paint for some visitor. A retry would report that as flaky.
  test.describe.configure({ retries: 0 });

  test('a seeded light choice beats a dark OS preference before hydration', async ({ browser }) => {
    const { context, page } = await darkMachine(browser, 'light');
    try {
      // /about rather than /: no boot loader, so nothing to wait for and no animation in the way.
      await page.goto('/about');

      const latched = await themeAtParseTime(page);
      expect(
        latched,
        'a stored light choice must survive a dark OS preference on the first paint: the inline ' +
          'init script reads localStorage before matchMedia (src/lib/theme.ts).',
      ).toContain('light');
      expect(latched).not.toContain('dark');
    } finally {
      await context.close();
    }
  });

  test('with nothing stored, the OS preference decides before hydration', async ({ browser }) => {
    const { context, page } = await darkMachine(browser);
    try {
      await page.goto('/about');

      const latched = await themeAtParseTime(page);
      // Proves the latch is real rather than always reporting the same word: the same instrument,
      // the same page, the opposite answer.
      expect(latched).toContain('dark');
      expect(latched).not.toContain('light');
    } finally {
      await context.close();
    }
  });

  test('a choice made in the UI survives a reload and a soft navigation', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/about');
    const html = page.locator('html');
    await expect(html).toContainClass('dark');

    await page
      .getByRole('button', { name: /Switch to light mode/ })
      .first()
      .click();
    await expect(html).toContainClass('light');
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe(
      'light',
    );

    await page.reload();
    await expect(html).toContainClass('light');
    await expect(html).not.toContainClass('dark');

    // And across a soft navigation, where the provider is not remounted and the init script does not
    // run again: the class has to survive in the live document.
    await page.getByRole('navigation').getByRole('link', { name: 'Skills' }).click();
    await expect(page).toHaveURL(/\/skills$/);
    await expect(html).toContainClass('light');
  });
});

import { expect, test } from '@playwright/test';
import { gotoHydrated } from '../support/hydration';

/**
 * The hero's decorative chrome, on a phone.
 *
 * Built for a desktop, the chrome crowded a phone: five tmux panes squeezed into 390 px of width, the
 * section-progress corner brackets and readout on top of the hero card, and a scroll indicator over
 * its skill tags. Below `md` the tmux background now shows its first pane only, and below `lg` the
 * corner layer and the scroll indicator are not displayed, all by CSS breakpoints, so the served
 * markup is the same at every width (ADR 0006). The one pane draws no border at the screen edge, and
 * the status bar keeps to one line down to 320 px. The desktop project keeps the full chrome, which
 * `e2e/hero.spec.ts` covers (five panes, the indicator fading on scroll).
 *
 * Both motion settings are checked, because the reduced-motion snapshot renders its own panes.
 */

/** The five pane titles, in the order the panes are laid out. */
const PANE_TITLES = [
  'kubectl — pods',
  'psql — slow query log',
  'gh actions — CI pipeline',
  'nginx — access + error',
  'prometheus — alerts',
];

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`the hero chrome on a phone, reduced motion ${reducedMotion}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await gotoHydrated(page, '/');
    });

    test('shows the first tmux pane only', async ({ page }) => {
      const shown: string[] = [];
      for (const title of PANE_TITLES) {
        const pane = page.getByText(title, { exact: true });
        await expect(pane, `the ${title} pane should be rendered`).toHaveCount(1);
        if (await pane.isVisible()) shown.push(title);
      }
      expect(shown).toEqual([PANE_TITLES[0]]);
    });

    test('draws no border at the screen edge of the one pane it shows', async ({ page }) => {
      // The title sits in the pane's title bar, which is the pane's first child.
      const pane = page.getByText(PANE_TITLES[0], { exact: true }).locator('../..');
      await expect(pane).toHaveCSS('border-right-width', '0px');
    });

    test('keeps the tmux status bar on one line down to 320 px', async ({ page }) => {
      // Wrapped, its spans stand 33 px tall in a 27 px bar and overflow it.
      const bar = page.getByText('[0] production-monitor', { exact: true }).locator('../..');
      for (const width of [320, 360, 375]) {
        await page.setViewportSize({ width, height: 700 });
        const { scrollHeight, clientHeight } = await bar.evaluate((el) => ({
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }));
        expect(scrollHeight, `the status bar wraps at ${width} px`).toBeLessThanOrEqual(
          clientHeight,
        );
      }
    });

    test('does not display the corner brackets or the scroll indicator', async ({ page }) => {
      // The section readout, `[01/07] …`, sits in the corner-bracket layer.
      const readout = page.getByText(/^\[\d{2}\/\d{2}\]/);
      await expect(readout).toHaveCount(1);
      await expect(readout.locator('..')).toHaveCSS('display', 'none');

      const indicator = page.getByText('Scroll', { exact: true }).locator('..');
      await expect(indicator).toHaveCount(1);
      await expect(indicator).toHaveCSS('display', 'none');
    });
  });
}

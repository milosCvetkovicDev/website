import { expect, test } from '@playwright/test';
import { gotoHydrated } from '../support/hydration';

/**
 * The hero's decorative chrome, on a phone.
 *
 * Built for a desktop, the chrome crowded a phone: five tmux panes squeezed into 390 px of width, the
 * section-progress corner brackets and readout on top of the hero card, and a scroll indicator over
 * its skill tags. Below `md` the tmux background is not displayed at all, and below `lg` the corner
 * layer and the scroll indicator are not displayed either, all by CSS breakpoints, so the served
 * markup is the same at every width (ADR 0006). Below `md` the background's clock and log ticks do
 * not run either: its effects start them only while `(min-width: 48rem)` matches. The desktop
 * project keeps the full chrome, which `e2e/hero.spec.ts` covers (five panes, the log lines, the
 * indicator fading on scroll).
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

/** The clock the server renders; it changes only when the background's clock ticks. */
const SERVED_CLOCK = '03:14:07';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`the hero chrome on a phone, reduced motion ${reducedMotion}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await gotoHydrated(page, '/');
    });

    test('does not display the tmux background', async ({ page }) => {
      // The background is the hero's aria-hidden layer that carries the tmux status bar.
      const background = page
        .locator('section > div[aria-hidden="true"]')
        .filter({ has: page.getByText('[0] production-monitor', { exact: true }) });
      await expect(background, 'the tmux background should still be served').toHaveCount(1);
      await expect(background).toHaveCSS('display', 'none');
      await expect(background).toBeHidden();
      for (const title of PANE_TITLES) {
        const pane = page.getByText(title, { exact: true });
        await expect(pane, `the ${title} pane should be served`).toHaveCount(1);
        await expect(pane, `the ${title} pane should not be displayed`).toBeHidden();
      }
    });

    test('runs neither the tmux clock nor its log lines', async ({ page }) => {
      // Displayed, the clock ticks every second and the kubectl pane's first line arrives within
      // an idle callback plus two seconds (`e2e/hero.spec.ts`). Here neither may happen.
      await page.waitForTimeout(3_500);
      await expect(page.getByText(SERVED_CLOCK, { exact: true })).toHaveCount(1);
      // Under reduced motion the static snapshot is served with its lines; with motion allowed the
      // panes only get lines from their ticks.
      const firstLine = page.getByText('$ kubectl get pods -n production -w', { exact: true });
      await expect(firstLine).toHaveCount(reducedMotion === 'reduce' ? 1 : 0);
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

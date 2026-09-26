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

/**
 * Whether the background's ticks run cannot be seen on the page: a root that is not displayed never
 * intersects, and the ticks already skip their DOM work while it does not, so the clock looks
 * stopped either way. So this counts what the page starts instead. The clock's one-second interval
 * is the only `setInterval` in the app, and the background's effects ask for the `md` query before
 * they start any tick. Motion allowed only: under `reduce` the background starts no ticks at all.
 */
test.describe('the tmux ticks on a phone', () => {
  type Recorded = { intervalDelays?: number[]; displayQueries?: number };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const recorded = window as Recorded;
      recorded.intervalDelays = [];
      recorded.displayQueries = 0;
      const setInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => {
        recorded.intervalDelays?.push(timeout ?? 0);
        return setInterval(handler, timeout, ...rest);
      }) as typeof window.setInterval;
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === '(min-width: 48rem)')
          recorded.displayQueries = (recorded.displayQueries ?? 0) + 1;
        return matchMedia(query);
      };
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoHydrated(page, '/');
  });

  test('start only once the viewport reaches md, and then fill the panes', async ({ page }) => {
    const recorded = () =>
      page.evaluate(() => {
        const { intervalDelays = [], displayQueries = 0 } = window as Recorded;
        return { displayQueries, clocks: intervalDelays.filter((delay) => delay === 1000).length };
      });
    // Once one of the background's effects has asked, the effects of that commit have all run, so
    // every clock they were going to start below md has started.
    await expect
      .poll(async () => (await recorded()).displayQueries, {
        message: 'the tmux background never asked whether it is displayed',
      })
      .toBeGreaterThan(0);
    expect((await recorded()).clocks, 'the tmux clock started below md').toBe(0);

    // Past md, as on a phone turned sideways or a narrow window widened, the clock starts and
    // ticks, and the panes fill: the way back from `display: none`, with real layout.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect
      .poll(async () => (await recorded()).clocks, {
        message: 'the tmux clock did not start at md',
      })
      .toBe(1);
    await expect(page.getByText(SERVED_CLOCK, { exact: true })).toHaveCount(0);
    // Lines arrive after an idle callback plus up to two seconds, as in `e2e/hero.spec.ts`.
    await expect(
      page.getByText('$ kubectl get pods -n production -w', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

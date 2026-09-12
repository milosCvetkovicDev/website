import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectHydrated, gotoHydrated } from './support/hydration';

// The dots name the seven sections of the AnimatedHero story, but `/` keeps going with Featured
// Work, Tech Stack and the footer below it — the story is a little over three quarters of the
// document. Only a real browser can say whether the box the indicator divides is the story's:
// jsdom has no layout, so the unit tests hand the wrapper its metrics as a fixture and cannot see
// a ref that never reached the component, or a positioned ancestor appearing in the layout and
// taking `offsetTop` off the document.

/** The dot group's landmark. Named, so it is distinguishable from the header's unnamed <nav>. */
const dots = (page: Page) => page.getByRole('navigation', { name: 'Story sections' });

const dot = (page: Page, label: string) =>
  dots(page).getByRole('button', { name: `Go to ${label} section` });

/** The dot's text label. A direct child, so a future icon span inside the button cannot match. */
const dotLabel = (page: Page, label: string) => dot(page, label).locator('> span');

/**
 * What `value` computes to as a colour, read from a throwaway element beside `near`.
 *
 * A fresh element per reading, never one element written twice: Chromium serves the first
 * computed colour again after an inline property is cleared, which had an earlier version of the
 * control below comparing a value against itself and passing on a page it should have failed.
 * Resolved in place rather than on `body` because ADR 0011 is about tokens rescoped on a subtree,
 * and a body-scoped reading would not see one.
 */
function resolveColor(near: Locator, value: string) {
  return near.evaluate((el, declaration) => {
    const probe = document.createElement('span');
    (el.parentElement ?? document.body).append(probe);
    if (declaration) probe.style.color = declaration;
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, value);
}

/**
 * Tabs until `target` holds focus, and fails naming the count if it never does. Real Tab presses
 * rather than `locator.focus()`: `:focus-visible`, which is what reveals a dot's label, only
 * matches a programmatic focus when Chromium judges the last interaction to have been a keypress,
 * so scripted focus would make the reveal assertions a coin flip. Getting there at all is half of
 * what these tests are about, so the walk is the assertion as much as the setup.
 */
async function tabTo(page: Page, target: Locator, limit = 30) {
  for (let presses = 0; presses < limit; presses++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  // Where focus stopped is the one fact worth having in a CI log for this failure, and the
  // default message does not carry it. The limit is generous: it covers the skip link, every
  // focusable element in the header and the seven dots with room to spare, so running out means
  // focus went somewhere else, not that the walk was too short.
  const stopped = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'nothing';
    return `<${el.tagName.toLowerCase()}> ${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}`;
  });
  throw new Error(
    `focus never reached the target in ${limit} Tab presses; it stopped on ${stopped}`,
  );
}

test.describe('Section progress', () => {
  test.beforeEach(async ({ page }) => {
    // Reduced motion makes a dot jump instant, so no assertion here can race a smooth scroll.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHydrated(page, '/');
    // A smoke check that this application rendered, nothing more. Playwright starts the server it
    // tests and an occupied port aborts the run (ADR 0014), so there is no foreign server left to
    // guard against; status and path are what catch a wrong page.
    await expect(page).toHaveTitle(/Milos Cvetkovic/);
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
    // Without this the test still passes when every dot scrolls nowhere: 0 restores as 0.
    expect(scrolled).toBeGreaterThan(0);

    await page.reload();
    await expectHydrated(page);

    // The browser puts the page back where it was and tells nobody: scroll restoration dispatches
    // no scroll event the indicator could listen for. It is also not ordered against hydration, so
    // poll for it rather than reading once — a single read is 0 on a slow machine and fails the
    // position check for a reason that has nothing to do with the indicator. This is where the
    // test fails, legibly, if this browser ever stops restoring the position.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
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

  /**
   * The three gaps a `ui-reviewer` pass found on #30, none of which the axe gate in
   * `accessibility.spec.ts` could see: none is a contrast failure, and that gate audits the page
   * at rest, where nothing is hovered and nothing is focused.
   */
  test.describe('keyboard and assistive technology', () => {
    test('names the dot group as a landmark distinct from the site navigation', async ({
      page,
    }) => {
      await expect(dots(page)).toBeVisible();
      await expect(dots(page).getByRole('button')).toHaveCount(7);

      // The header's <nav> is unnamed, so this name is the whole of what keeps the two apart in a
      // screen reader's landmark list. axe states that property directly, and `landmark-unique` is
      // a best-practice rule outside the wcag2a/wcag2aa tags `accessibility.spec.ts` selects, so
      // nothing else in the suite would notice it regressing.
      const results = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
      const measured = results.passes.find(({ id }) => id === 'landmark-unique')?.nodes ?? [];

      expect(
        results.violations.flatMap(({ nodes }) => nodes.map(({ html }) => html)),
        'every landmark must be distinguishable by role and accessible name',
      ).toEqual([]);
      // Deliberately not a count of the page's landmarks: a footer nav or a breadcrumb added later
      // is not this test's business, and pinning a census would fail it for an unrelated reason.
      // What has to hold is that the rule reached this landmark rather than going inapplicable,
      // which is the way an assertion about violations goes vacuously green.
      expect(
        measured.some(({ html }) => html.includes('aria-label="Story sections"')),
        'landmark-unique must have measured the dot group',
      ).toBe(true);
      expect(measured.length).toBeGreaterThan(1);
    });

    test('marks the active dot with aria-current and no other', async ({ page }) => {
      // Before any click the story is at its first section, so the first dot carries it.
      await expect(dots(page).locator('[aria-current]')).toHaveCount(1);
      await expect(dot(page, 'INIT')).toHaveAttribute('aria-current', 'location');

      await dot(page, 'BUILD').click();

      await expect(dot(page, 'BUILD')).toHaveAttribute('aria-current', 'location');
      await expect(dots(page).locator('[aria-current]')).toHaveCount(1);
      // Not just "some dot moved": the earlier dots stay filled, so only aria-current separates
      // the one the visitor is on from the four painted the same accent colour. Asserted as
      // absence rather than as "not location", which would still accept a stray `page` or `true`.
      await expect(dot(page, 'INIT')).not.toHaveAttribute('aria-current');
    });

    test('moves the story on Enter, not only on a pointer click', async ({ page }) => {
      const build = dot(page, 'BUILD');
      await tabTo(page, build);

      await page.keyboard.press('Enter');

      // Tabbing to a dot is only half of using one from the keyboard. The readout is aria-hidden
      // chrome, but it is the one place the story's position is written down, so it is the proof
      // the activation actually scrolled rather than the attribute merely being re-rendered.
      await expect(page.getByText('[04/07] BUILD')).toBeVisible();
      await expect(build).toHaveAttribute('aria-current', 'location');
    });

    test('reveals a dot label to a keyboard user, not only to the pointer', async ({ page }) => {
      const build = dotLabel(page, 'BUILD');
      const next = dotLabel(page, 'TEST');
      // INIT is the active section at the top of the page, so its label is already shown; BUILD's
      // is the one that has to be revealed.
      await expect(build).toHaveCSS('opacity', '0');

      await tabTo(page, dot(page, 'BUILD'));

      await expect(build).toHaveCSS('opacity', '1');
      await expect(next).toHaveCSS('opacity', '0');

      // Tab on. That the reveal *moves* is the assertion worth having: a label that is merely
      // hidden until something reveals it passes a one-dot check under a `group-focus-within`
      // regression, or under one that leaves every visited label stuck at 100 — and both of those
      // are what "never rests at a partial value" is protecting.
      await page.keyboard.press('Tab');

      await expect(next).toHaveCSS('opacity', '1');
      await expect(build).toHaveCSS('opacity', '0');

      // Tabbing moves focus through elements the browser may scroll into view, and the active
      // section is derived from scroll position, so a walk that moved the page would change which
      // labels are shown for a reason that has nothing to do with focus. It does not: the dots
      // are inside a `fixed` container and the header above them is sticky.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test('draws the house focus indicator on the focused dot', async ({ page }) => {
      const build = dot(page, 'BUILD');
      // Read before focusing: resolving a token does not depend on focus, and doing it after
      // would be one more thing racing the style recalculation.
      const accent = await resolveColor(build, 'var(--accent)');

      await tabTo(page, build);

      // An outline rather than a box-shadow ring, which is what makes the indicator survive
      // Windows High Contrast / forced-colors mode, and the `--accent` token ADR 0011 assigns to
      // focus. Both halves matter: a `focus-visible:ring-*` regression would still look focused
      // in a screenshot and still leave forced-colors users with nothing.
      //
      // `toHaveCSS` throughout, because it retries: `tabTo` returns the moment the button becomes
      // `document.activeElement`, which is before the style recalculation for `:focus-visible`
      // has necessarily run, and a single-shot read of the outline loses that race under load.
      await expect(build).toHaveCSS('outline-style', 'solid');
      await expect(build).toHaveCSS('outline-width', '2px');
      await expect(build).toHaveCSS('outline-color', accent);
    });

    test('reveals the label at the muted token rather than a dimmed one', async ({ page }) => {
      const label = dotLabel(page, 'BUILD');
      const muted = await resolveColor(label, 'var(--muted)');
      // The same probe with no colour of its own: whatever an element there inherits.
      const inherited = await resolveColor(label, '');

      await tabTo(page, dot(page, 'BUILD'));

      // What the reveal must not become. CLAUDE.md and ADR 0011 allow secondary text to be
      // `--muted` and nothing else: no `text-[var(--muted)]/60`, no resting `opacity-*` under
      // 100. `opacity-0` to `opacity-100` stays legal precisely because it is binary, so this
      // pins the two ends — a full 1 once revealed, and the token itself as the colour. A `/60`
      // on either fails one of the two.
      await expect(label).toHaveCSS('opacity', '1');
      await expect(label).toHaveCSS('color', muted);

      // The control, without which the assertion above passes with the token deleted: an
      // undefined `--muted` makes `color: var(--muted)` invalid at computed-value time, so the
      // probe and the label would both fall back to the inherited colour and compare equal.
      expect(muted).not.toBe(inherited);

      // Not asserted with axe on purpose. The indicator is fixed over the hero's gradient, so
      // `color-contrast` comes back `incomplete` here — "background color could not be determined
      // due to a background gradient" — for the revealed label and for the active one alike. That
      // is also why `accessibility.spec.ts` has never measured these labels, and why pinning the
      // token is the strongest guarantee available: `--muted` is measured everywhere else.
    });
  });
});

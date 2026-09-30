import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectHydrated } from './support/hydration';

// The dots name the seven sections of the AnimatedHero story, but `/` keeps going with Featured
// Work, Tech Stack and the footer below it — the story is a little over three quarters of the
// document. Only a real browser can say whether the box the indicator divides is the story's:
// jsdom has no layout, so the unit tests hand the wrapper its metrics as a fixture and cannot see
// a ref that never reached the component, or a positioned ancestor appearing in the layout and
// taking `offsetTop` off the document.

/**
 * The seven dots, top to bottom. `title` is the title each section shows (for the hero, which shows
 * none, the name its region is announced by): each dot's `Go to … section` name and the readout
 * carry it. `label` is the word of it the dot draws, short enough to keep the column clear of the
 * story at 1280px (`section-progress.tsx`). `region` is the whole name the story section it goes to
 * is announced by, its header row: phase badge and title.
 */
const DOTS = [
  { title: 'HERO', label: 'HERO', region: null },
  { title: 'DISCOVERY', label: 'DISCOVERY', region: 'PHASE 1 DISCOVERY' },
  { title: 'STRATEGY', label: 'STRATEGY', region: 'PHASE 2 STRATEGY' },
  { title: 'EXECUTION', label: 'EXECUTION', region: 'PHASE 3 EXECUTION' },
  { title: 'THE GAUNTLET', label: 'GAUNTLET', region: 'PHASE 4 THE GAUNTLET' },
  { title: 'THE LOOP', label: 'LOOP', region: 'PHASE 5 THE LOOP' },
  { title: 'SESSION COMPLETE', label: 'COMPLETE', region: 'SESSION COMPLETE' },
];

/** The story sections the dots after the hero's go to, each with the whole name of its region. */
const STORY_DOTS = DOTS.flatMap(({ title, region }) => (region ? [{ title, region }] : []));

/** The dot group's landmark. Named, so it is distinguishable from the header's unnamed <nav>. */
const dots = (page: Page) => page.getByRole('navigation', { name: 'Story sections' });

/** A dot's button, by the title of the section it goes to. */
const dot = (page: Page, title: string) =>
  dots(page).getByRole('button', { name: `Go to ${title} section` });

/**
 * The dot's text label, found by the words it shows. The painted dot beside it is a span as well,
 * so an element-name locator would match both.
 */
const dotLabel = (page: Page, title: string) => {
  const entry = DOTS.find((each) => each.title === title);
  if (!entry) throw new Error(`no dot is titled ${title}`);
  return dot(page, title).getByText(entry.label, { exact: true });
};

/**
 * The painted dot inside a dot button: the direct child whose `data-state` says whether it is lit.
 * Scoped to direct children so that no descendant carrying a `data-state` of its own can match.
 */
const dotFill = (page: Page, title: string) => dot(page, title).locator('> [data-state]');

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
  // default message does not carry it. The limit is generous: it covers the skip link, everything
  // focusable in the header and the seven dots with room to spare, so running out means focus went
  // somewhere else, not that the walk was too short.
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
    await page.goto('/');
    // A smoke check that this application rendered, nothing more. Playwright starts the server it
    // tests and a taken port aborts the run (ADR 0014), so no foreign server is left to guard
    // against.
    await expect(page).toHaveTitle(/Milos Cvetkovic/);
    // Interactions before hydration are lost.
    await expectHydrated(page);
  });

  test('sends the last dot to the closing section rather than the footer', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to SESSION COMPLETE section' }).click();

    await expect(page.getByRole('link', { name: 'Connect on LinkedIn' })).toBeInViewport();
    await expect(page.getByRole('contentinfo')).not.toBeInViewport();
    await expect(page.getByText('[07/07] SESSION COMPLETE')).toBeVisible();
  });

  test('leaves every dot on the section it names', async ({ page }) => {
    // The click target and the active index are two readings of the same proportion, so clicking a
    // dot has to light that dot — whatever the sections inside the story actually measure.
    for (const [index, { title }] of DOTS.entries()) {
      await page.getByRole('button', { name: `Go to ${title} section` }).click();

      await expect(page.getByText(`[0${index + 1}/07] ${title}`)).toBeVisible();
    }
  });

  test('names each dot for the title its section shows', async ({ page }) => {
    // The dots said DISCOVER, PLAN, BUILD, TEST, SHIP and CTA beside sections titled DISCOVERY,
    // STRATEGY, EXECUTION, THE GAUNTLET, THE LOOP and SESSION COMPLETE (#47, hero-10): two names for
    // one place. Each name is read against the section it names, so a title renamed on one side
    // only fails here.
    await expect(dots(page).getByRole('button')).toHaveText(DOTS.map(({ label }) => label));

    // The hero shows no title of its own: its dot takes the name its region is announced by.
    await expect(page.getByRole('region', { name: /^Hero\b/ })).toHaveCount(1);
    for (const { title, region: name } of STORY_DOTS) {
      await expect(dot(page, title), `one dot goes to ${title}`).toHaveCount(1);
      // A phase's name is its header row, `PHASE 2 STRATEGY`; the closing section's is its title.
      // Whole and exact, so a name that doubled a word or ran two together fails here.
      const region = page.getByRole('region', { name, exact: true });
      await expect(region, `one story section named ${name}`).toHaveCount(1);
      expect(name.endsWith(title), `${name} ends with the title ${title}`).toBe(true);
      // And the title is drawn in that section's first heading, not only announced there.
      const drawn = region
        .getByRole('heading')
        .first()
        .getByText(title, { exact: true })
        .and(page.locator(':not(.sr-only):not(.sr-only *)'));
      await expect(drawn.first(), `${title} is drawn in its section's heading`).toBeVisible();
    }
  });

  test('keeps the dots clear of the story at a 1280px laptop width', async ({ page }) => {
    // The column is pinned to the right edge and as wide as its widest label, hidden labels
    // included, so a longer label moves every dot left. Drawing SESSION COMPLETE in full put the
    // dots 20px over the story's panels at 1280px; the old labels left them 32px clear.
    await page.setViewportSize({ width: 1280, height: 800 });
    // The whole dot group, not one dot: its left edge is the leftmost thing the column can draw.
    // Each label sits to its dot's right, so today that edge is the dots', but a label or anything
    // else moved to the left would move it too.
    const fill = await dots(page).boundingBox();
    if (!fill) throw new Error('the dot group is not laid out at 1280px');
    for (const { title, region: name } of STORY_DOTS) {
      // Each section's content column, the one child that holds its header row and panels.
      const region = page.getByRole('region', { name, exact: true });
      const column = await region.locator('> div').boundingBox();
      if (!column) throw new Error(`the ${title} section has no content column laid out`);
      expect(
        column.x + column.width,
        `the ${title} column ends left of the dots at ${fill.x}px`,
      ).toBeLessThan(fill.x);
    }
  });

  test('reads the restored position after a reload part-way down the story', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to EXECUTION section' }).click();
    await expect(page.getByText('[04/07] EXECUTION')).toBeVisible();
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
    await expect(page.getByText('[04/07] EXECUTION')).toBeVisible();
  });

  test('reads the closing section while it is the section on screen', async ({ page }) => {
    const cta = page.getByRole('link', { name: 'Connect on LinkedIn' });
    // Scrolled to, rather than jumped to. Measured against the document this sits about three
    // quarters of the way down, which left the readout two sections short of the story's end.
    await cta.evaluate((link) => link.scrollIntoView({ block: 'center' }));

    await expect(cta).toBeInViewport();
    await expect(page.getByText('[07/07] SESSION COMPLETE')).toBeVisible();
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
      await expect(dot(page, 'HERO')).toHaveAttribute('aria-current', 'location');

      await dot(page, 'EXECUTION').click();

      await expect(dot(page, 'EXECUTION')).toHaveAttribute('aria-current', 'location');
      await expect(dots(page).locator('[aria-current]')).toHaveCount(1);
      // Not just "some dot moved": the earlier dots stay filled, so only aria-current separates
      // the one the visitor is on from the four painted the same accent colour. Asserted as
      // absence rather than as "not location", which would still accept a stray `page` or `true`.
      await expect(dot(page, 'HERO')).not.toHaveAttribute('aria-current');
    });

    test('paints the dots up to the current one in the accent and glows the current one alone', async ({
      page,
    }) => {
      // The fill is chosen by a `data-[state=lit]` variant over a `--border` base, and jsdom runs
      // no Tailwind, so only a browser can say that the variant compiled and matches the attribute
      // the component writes. A typo in either leaves every dot in the border colour while every
      // unit test still passes.
      const accent = await resolveColor(dots(page), 'var(--accent)');
      const border = await resolveColor(dots(page), 'var(--border)');
      // The control: were the two tokens to resolve alike, the assertions below could not tell a
      // lit dot from an unlit one.
      expect(accent).not.toBe(border);

      await dot(page, 'EXECUTION').click();
      await expect(dot(page, 'EXECUTION')).toHaveAttribute('aria-current', 'location');

      for (const label of ['HERO', 'DISCOVERY', 'STRATEGY', 'EXECUTION']) {
        await expect(dotFill(page, label)).toHaveAttribute('data-state', 'lit');
        await expect(dotFill(page, label)).toHaveCSS('background-color', accent);
      }
      for (const label of ['THE GAUNTLET', 'THE LOOP', 'SESSION COMPLETE']) {
        await expect(dotFill(page, label)).toHaveAttribute('data-state', 'unlit');
        await expect(dotFill(page, label)).toHaveCSS('background-color', border);
      }

      // The glow marks the current dot alone; the lit trail behind it carries the fill only.
      await expect(dotFill(page, 'EXECUTION')).not.toHaveCSS('box-shadow', 'none');
      await expect(dotFill(page, 'STRATEGY')).toHaveCSS('box-shadow', 'none');
      await expect(dotFill(page, 'THE GAUNTLET')).toHaveCSS('box-shadow', 'none');
    });

    test('moves the story on Enter, not only on a pointer click', async ({ page }) => {
      const execution = dot(page, 'EXECUTION');
      await tabTo(page, execution);

      await page.keyboard.press('Enter');

      // Tabbing to a dot is only half of using one from the keyboard. The readout is aria-hidden
      // chrome, but it is the one place the story's position is written down, so it is the proof
      // the activation actually scrolled rather than the attribute merely being re-rendered.
      await expect(page.getByText('[04/07] EXECUTION')).toBeVisible();
      await expect(execution).toHaveAttribute('aria-current', 'location');
    });

    test('reveals a dot label to a keyboard user, not only to the pointer', async ({ page }) => {
      const execution = dotLabel(page, 'EXECUTION');
      const next = dotLabel(page, 'THE GAUNTLET');
      // HERO is the active section at the top of the page, so its label is already shown;
      // EXECUTION's is the one that has to be revealed.
      await expect(execution).toHaveCSS('opacity', '0');

      await tabTo(page, dot(page, 'EXECUTION'));

      await expect(execution).toHaveCSS('opacity', '1');
      await expect(next).toHaveCSS('opacity', '0');

      // Tab on. That the reveal *moves* is the assertion worth having: a label that is merely
      // hidden until something reveals it passes a one-dot check under a `group-focus-within`
      // regression, or under one that leaves every visited label stuck at 100 — and both of those
      // are what "never rests at a partial value" is protecting.
      await page.keyboard.press('Tab');

      await expect(next).toHaveCSS('opacity', '1');
      await expect(execution).toHaveCSS('opacity', '0');

      // Tabbing moves focus through elements the browser may scroll into view, and the active
      // section is derived from scroll position, so a walk that moved the page would change which
      // labels are shown for a reason that has nothing to do with focus. It does not: the dots
      // are inside a `fixed` container and the header above them is sticky.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test('draws the house focus indicator on the focused dot', async ({ page }) => {
      const execution = dot(page, 'EXECUTION');
      // Read before focusing: resolving a token does not depend on focus, and doing it after
      // would be one more thing racing the style recalculation.
      const accent = await resolveColor(execution, 'var(--accent)');

      await tabTo(page, execution);

      // An outline rather than a box-shadow ring, which is what makes the indicator survive
      // Windows High Contrast / forced-colors mode, and the `--accent` token ADR 0011 assigns to
      // focus. Both halves matter: a `focus-visible:ring-*` regression would still look focused
      // in a screenshot and still leave forced-colors users with nothing.
      //
      // `toHaveCSS` throughout, because it retries: `tabTo` returns the moment the button becomes
      // `document.activeElement`, which is before the style recalculation for `:focus-visible`
      // has necessarily run, and a single-shot read of the outline loses that race under load.
      await expect(execution).toHaveCSS('outline-style', 'solid');
      await expect(execution).toHaveCSS('outline-width', '2px');
      await expect(execution).toHaveCSS('outline-color', accent);
    });

    test('reveals the label at the muted token rather than a dimmed one', async ({ page }) => {
      const label = dotLabel(page, 'EXECUTION');
      const muted = await resolveColor(label, 'var(--muted)');
      // The same probe with no colour of its own: whatever an element there inherits.
      const inherited = await resolveColor(label, '');

      await tabTo(page, dot(page, 'EXECUTION'));

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

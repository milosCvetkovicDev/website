import { expect, test, type Page } from '@playwright/test';

/**
 * The story's accessible names and its heading outline.
 *
 * Rows R14 and R15 of the RED manifest, both fixed by #47. These are the two accessibility defects no
 * axe rule can catch, which is why they are a role-and-name spec rather than another audit pass:
 *
 * - R14. `AnimatedText` splits its text into one `inline-block` span per character
 *   (`animated-text.tsx:159-185`, `:302-328`, `:1004-1030`). Accessible-name computation joins the
 *   spans without separators in the DOM sense but the rendered result reads as spaced letters to a
 *   screen reader, so the Discovery, Execution and Loop `h2`s announce as `M o s t b u g s …`. No axe
 *   rule looks at this: `empty-heading` only asks whether there is text at all.
 * - R15. Each phase is a bare `<section>` with no accessible name, so it maps to no role at all — a
 *   `<section>` becomes a `region` only once it is named — and `getByRole('region', { name })` resolves
 *   nothing. `heading-order` only checks for level jumps, and every phase's own `h2` is its *closing*
 *   statement at the bottom, so Strategy announces `h3 TECH TREE` and `h3 SYNERGIES DETECTED` before
 *   its `h2`, and `game-complete.tsx` has no heading at all.
 *
 * This is the one file that queries by accessible name deliberately, against the query-cost note in
 * CLAUDE.md: the name *is* the subject here.
 *
 * Both run under `reduce`, where every phase renders its finished state on mount (ADR 0009). That is
 * what makes them deterministic — no ScrollTrigger, no reveal, nothing at `opacity: 0` — and it costs
 * nothing, because a name and a heading are not animated.
 */

test.describe.configure({ retries: 0 });

/** The six story sections, by the phase label each one shows and the title it should be named for. */
const PHASES = [
  { label: 'DISCOVERY', name: /discovery/i },
  { label: 'STRATEGY', name: /strategy/i },
  { label: 'EXECUTION', name: /execution/i },
  { label: 'THE GAUNTLET', name: /gauntlet/i },
  { label: 'THE LOOP', name: /loop/i },
  // The closing section has no phase label of its own; `SESSION COMPLETE` is its visible title.
  { label: 'SESSION COMPLETE', name: /session complete|complete/i },
];

/**
 * The three phase-closing `h2`s whose text `AnimatedText` splits into one span per character: the
 * `wave`, `scatter` and `morse` variants (`animated-text.tsx:159-185`, `:302-328`, `:1004-1030`).
 */
const SPLIT_HEADINGS = [
  {
    phase: 'Discovery',
    text: 'Most bugs live in the gap between what you asked for and what you meant.',
  },
  { phase: 'Execution', text: 'The bottleneck was never my typing speed.' },
  { phase: 'Loop', text: 'This happened at 3:14am. Nobody got paged.' },
];

async function openStory(page: Page) {
  // Reduced motion so every phase is in its finished state on mount: no reveal to wait for, nothing
  // transparent, and no dependence on the ~8 s of pipeline timers the scroll would start.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'these assertions need every phase rendered on mount',
  ).toBe(true);
}

test('each story heading exposes its words, not its letters', async ({ page }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R14, #47' });
  await openStory(page);

  const missing: string[] = [];
  for (const { phase, text } of SPLIT_HEADINGS) {
    // By name, on purpose: this is the accessible name computation itself, not a way of finding an
    // element. `level: 2` keeps it to the phase closers.
    const byName = page.getByRole('heading', { level: 2, name: text });
    if ((await byName.count()) !== 1) {
      // Report what the name actually computes to, so the failure is readable rather than a bare 0.
      const heading = page
        .getByRole('heading', { level: 2 })
        .filter({ hasText: text.slice(0, 12) })
        .first();
      const actual =
        (await heading.count()) > 0
          ? await heading.evaluate((el) => el.textContent?.trim().slice(0, 80) ?? '')
          : '(no such heading)';
      missing.push(`${phase}: expected the name "${text}", got "${actual}"`);
    }
  }

  expect(
    missing,
    'each character of these headings is its own inline-block span (animated-text.tsx), so the ' +
      'computed accessible name reads as spaced letters. Keep the per-character animation and give ' +
      'the heading a single text alternative.',
  ).toEqual([]);
});

test('each of the six story sections is a named region whose first heading is its title', async ({
  page,
}) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R15, #47' });
  await openStory(page);

  const problems: string[] = [];
  for (const { label, name } of PHASES) {
    const region = page.getByRole('region', { name });
    const count = await region.count();
    if (count !== 1) {
      problems.push(
        `${label}: expected exactly one region named ${name}, found ${count}. A bare <section> ` +
          'maps to `region` only once it has an accessible name.',
      );
      continue;
    }
    // The region exists and is named: its first heading must carry this phase's visible title, so a
    // screen-reader user hears the same outline a sighted visitor reads. Not a hard-coded copy of the
    // closing statement — the visible phase title.
    const firstHeading = region.getByRole('heading').first();
    if ((await firstHeading.count()) === 0) {
      problems.push(`${label}: the region has no heading at all`);
      continue;
    }
    const headingText = (await firstHeading.textContent())?.trim() ?? '';
    if (!name.test(headingText)) {
      problems.push(`${label}: the region's first heading is "${headingText}", not its own title`);
    }
  }

  expect(
    problems,
    'the six phase sections (discovery-phase.tsx:93, strategy-phase.tsx:136, ' +
      'execution-phase.tsx:249, gauntlet-phase.tsx:194, loop-phase.tsx:145, game-complete.tsx:92) ' +
      "have no accessible name, and each phase's own h2 is its closing statement at the bottom.",
  ).toEqual([]);
});

test('the six story sections are all present and in order', async ({ page }) => {
  // Green, and the floor under both rows above: R14 and R15 would both start passing on a page that
  // had stopped rendering the story, and an unexpected pass fails the run. This says the sections are
  // there and it is only their naming that is missing.
  await openStory(page);

  const labels = PHASES.map(({ label }) => label);
  for (const label of labels) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  // And in document order, which is the outline R15's fix has to name.
  const order = await page.evaluate((wanted) => {
    const text = document.body.innerText;
    return wanted.map((label) => text.indexOf(label));
  }, labels);
  expect(order.every((index) => index >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

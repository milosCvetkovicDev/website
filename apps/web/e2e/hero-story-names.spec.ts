import { expect, test, type Page } from '@playwright/test';
import { expectHydrated } from './support/hydration';

/**
 * The story's accessible names and its heading outline.
 *
 * Rows R14 and R15 of the RED manifest, both fixed by #47. These are the two accessibility defects no
 * axe rule can catch, which is why they are a role-and-name spec rather than another audit pass:
 *
 * - R14, fixed by slice 47d and kept as its guard. `AnimatedText` splits its text into one
 *   `inline-block` span per character, and accessible-name computation puts a space around every box
 *   that is not inline, so the Discovery, Execution and Loop `h2`s announced as `M o s t b u g s …`.
 *   No axe rule looks at this: `empty-heading` only asks whether there is text at all. The split copy
 *   is now `aria-hidden`, beside a visually hidden copy holding the sentence whole (`SplitText` in
 *   `animated-text.tsx`).
 * - R15, fixed by slice 47e and kept as its guard. Each phase was a bare `<section>` with no
 *   accessible name, so it mapped to no role at all — a `<section>` becomes a `region` only once it is
 *   named — and `getByRole('region', { name })` resolved nothing. `heading-order` only checks for
 *   level jumps, and every phase's own `h2` was its *closing* statement at the bottom, so Strategy
 *   announced `h3 TECH TREE` and `h3 SYNERGIES DETECTED` before its `h2`, and `game-complete.tsx` had
 *   no heading at all. Each phase's header row (`PHASE n` and its title) is now an `h2` the
 *   `<section>` is `aria-labelledby`, and `SESSION COMPLETE` is the closing section's. The closing
 *   statements are `h3`s under it, so the title is the one `h2` in each section's outline.
 *
 * This is the one file that queries by accessible name deliberately, against the query-cost note in
 * CLAUDE.md: the name *is* the subject here.
 *
 * Both run under `reduce`, where every phase renders its finished state on mount (ADR 0009). That is
 * what makes them deterministic — no ScrollTrigger, no reveal, nothing at `opacity: 0` — and it costs
 * nothing, because a name and a heading are not animated.
 */

test.describe.configure({ retries: 0 });

/**
 * The six story sections, by the title each one shows and the whole name it is announced by: the
 * header row, phase badge and title. Exact, so a name that doubled a word or ran two together
 * ("PHASE 1DISCOVERY") fails as surely as a missing one.
 */
const PHASES = [
  { label: 'DISCOVERY', name: 'PHASE 1 DISCOVERY' },
  { label: 'STRATEGY', name: 'PHASE 2 STRATEGY' },
  { label: 'EXECUTION', name: 'PHASE 3 EXECUTION' },
  { label: 'THE GAUNTLET', name: 'PHASE 4 THE GAUNTLET' },
  { label: 'THE LOOP', name: 'PHASE 5 THE LOOP' },
  // The closing section has no phase label of its own; `SESSION COMPLETE` is its visible title.
  { label: 'SESSION COMPLETE', name: 'SESSION COMPLETE' },
];

/** A story section by the whole name it is announced by. */
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/**
 * The three phase-closing `h3`s whose text `AnimatedText` splits into one span per character: the
 * `wave`, `scatter` and `morse` variants (`SplitText` in `animated-text.tsx`).
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
  await expectHydrated(page);
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'these assertions need every phase rendered on mount',
  ).toBe(true);
}

test('each story heading exposes its words, not its letters', async ({ page }) => {
  await openStory(page);

  const missing: string[] = [];
  for (const { phase, text } of SPLIT_HEADINGS) {
    // By name, on purpose: this is the accessible name computation itself, not a way of finding an
    // element. `level: 3` keeps it to the phase closers.
    const byName = page.getByRole('heading', { level: 3, name: text });
    if ((await byName.count()) !== 1) {
      // Report what the name actually computes to, so the failure is readable rather than a bare 0.
      const heading = page
        .getByRole('heading', { level: 3 })
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
      'computed accessible name reads as spaced letters unless that split copy is aria-hidden ' +
      'beside a visually hidden copy of the whole sentence (SplitText), with no aria-label.',
  ).toEqual([]);
});

test('selecting a split headline copies its sentence once, as it is drawn', async ({ page }) => {
  // The sentence is in the DOM twice: the visually hidden copy assistive technology reads, and the
  // letters a sighted visitor sees. The hidden one is `select-none`, so a selection, and the copy
  // made from it, holds the drawn sentence only.
  await openStory(page);
  const copied: string[] = [];
  for (const { text } of SPLIT_HEADINGS) {
    const selection = await page
      .getByRole('heading', { level: 3, name: text })
      .evaluate((heading) => {
        const range = document.createRange();
        range.selectNodeContents(heading);
        const selected = getSelection();
        selected?.removeAllRanges();
        selected?.addRange(range);
        return selected?.toString() ?? '';
      });
    copied.push(selection.replace(/\s+/g, ' ').trim());
  }
  expect(copied).toEqual(SPLIT_HEADINGS.map(({ text }) => text));
});

test('each of the six story sections is a named region whose first heading is its title', async ({
  page,
}) => {
  await openStory(page);

  const problems: string[] = [];
  for (const { label, name } of PHASES) {
    const named = region(page, name);
    const count = await named.count();
    if (count !== 1) {
      problems.push(
        `${label}: expected exactly one region named "${name}", found ${count}. A bare <section> ` +
          'maps to `region` only once it has an accessible name.',
      );
      continue;
    }
    // The region exists and is named: its first heading must be the h2 it is named by, drawn with
    // this phase's visible title, so a screen-reader user hears the same outline a sighted visitor
    // reads. Every other heading in it sits below that h2, the closing statement included.
    const outline = await named.evaluate((section) =>
      [...section.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => ({
        level: Number(heading.tagName.slice(1)),
        labels: heading.id !== '' && heading.id === section.getAttribute('aria-labelledby'),
      })),
    );
    if (outline.length === 0) {
      problems.push(`${label}: the region has no heading at all`);
      continue;
    }
    const [first, ...rest] = outline;
    if (!first.labels || first.level !== 2) {
      problems.push(`${label}: the region's first heading is not the h2 it is named by`);
    }
    if (rest.some(({ level }) => level <= 2)) {
      problems.push(`${label}: a heading after the title is at its level, starting a new section`);
    }
    // Drawn, not only announced: the title a sighted visitor reads, outside the visually hidden
    // copy `AnimatedText` keeps for assistive technology.
    const drawn = named
      .getByRole('heading', { level: 2 })
      .getByText(label, { exact: true })
      .and(page.locator(':not(.sr-only):not(.sr-only *)'));
    if (!(await drawn.first().isVisible())) {
      problems.push(`${label}: the title is not drawn in the region's heading`);
    }
  }

  expect(
    problems,
    'each story <section> is aria-labelledby the h2 its header row is (PHASE n and the title), ' +
      'or SESSION COMPLETE in the closing section, that heading comes before its panels, and ' +
      'every other heading in the section is below it.',
  ).toEqual([]);
});

test('the six story sections are all present and in order', async ({ page }) => {
  // The floor under the rows above, written while R15 was an expected failure (one that starts
  // passing fails the run, and so would a page that stopped rendering the story): the sections are
  // there, each showing its title, in the order a sighted visitor reads them, which is the outline
  // R15 holds the names to.
  await openStory(page);

  // Each found by its whole name, so neither the section progress dots beside the story (which carry
  // the same titles, `section-progress.tsx`) nor Featured Work and Tech Stack below it can answer.
  for (const { label, name } of PHASES) {
    // The label a sighted visitor reads, not the visually hidden copy `AnimatedText` puts first for
    // assistive technology: Playwright counts that 1px box as visible, so `.first()` alone would be
    // checking the copy nobody sees.
    const visibleLabel = region(page, name)
      .getByText(label, { exact: true })
      .and(page.locator(':not(.sr-only):not(.sr-only *)'));
    await expect(visibleLabel.first(), `${label} is drawn in its section`).toBeVisible();
  }
  // And in document order, which is the outline R15's fix has to name: each named region's place
  // among the page's sections.
  const order: number[] = [];
  for (const { name } of PHASES) {
    order.push(
      await region(page, name).evaluate((section) =>
        [...document.querySelectorAll<Element>('section')].indexOf(section),
      ),
    );
  }
  expect(order, 'every section is on the page').not.toContain(-1);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

import { expect, test, type Page } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';
import { gotoHydrated } from './support/hydration';
import { warmRoutes } from './support/warm-routes';

/**
 * The `/work` archive cards, and the one thing they disagree with the home page about.
 *
 * Rows R36 and R39 of the RED manifest, both fixed by #49, plus the green floor that R36's fix has to
 * keep.
 *
 * - R36. `work/page.tsx:52` wraps the *whole* card in one `<Link>` — index, category, status, title,
 *   description, challenge teaser, outcomes, tags and metric — so the link's accessible name is the
 *   card's entire text, 636 characters of it. A screen-reader user tabbing the archive hears a
 *   paragraph per link with the useful part buried at character 30. `featured-work.tsx:50-60` already
 *   documents the pattern that fixes it: a stretched title link, whose name is exactly its visible
 *   text, with the overlay carrying the hit area.
 * - R39. The same case study's status string computes to a different colour on `/` than on `/work`. The
 *   featured card uses `text-[var(--tmux-status-ok)]` (`featured-work.tsx:100`) and the archive card
 *   `text-[var(--status-ok)]` (`work/page.tsx:79`), and the two tokens differ in both themes.
 *
 * R39 asserts only that the two routes **agree**, and deliberately pins neither a hex nor a token name.
 * The finding is a scope gap rather than a plain violation: #49 either moves the featured cards onto the
 * ADR 0010 status tokens, or records in a new ADR why the tmux chrome palette is right for a card that
 * lives inside the terminal frame. Both outcomes satisfy this assertion, which is the point — softening
 * or tightening it after the decision would be writing the test to match the answer.
 *
 * Axe is the wrong instrument for R39 twice over: it reports no violation today, and both cards are
 * blurred panels (`featured-work.tsx:67` is `backdrop-blur-md`, `work/page.tsx:54` is
 * `backdrop-blur-sm`), which hides their text from its contrast check on the HudPanel precedent.
 * Nothing needs to be scrolled or hovered either, because `color` is read directly and neither status
 * label is state-dependent — the active/inactive switch at `featured-work/metric-counter.tsx:67` is the
 * metric, not the status.
 */

test.describe.configure({ retries: 0 });

const colorSchemes = ['light', 'dark'] as const;
const MAX_LINK_NAME = 80;

/** The archive card for one case study: the link whose href is that slug. */
const cardFor = (page: Page, slug: string) => page.locator(`a[href="/work/${slug}"]`).first();

/**
 * One element's `color`, normalised to sRGB.
 *
 * Comparing the computed strings directly does not work and would leave R39 unsatisfiable: Chromium
 * serialises a colour in the space it was authored in. `--tmux-status-ok` is a hex (`globals.css:65`) and
 * reads back as `rgb(21, 128, 61)`, while `--status-ok` is `theme(--color-green-800)` (`:32`) and Tailwind
 * v4's palette is OKLCH, so it reads back as `lab(…)`. Two spellings of one colour would fail a string
 * comparison and the test would be measuring syntax rather than colour. Painting each value on a 1x1
 * canvas and reading the pixel back normalises both to sRGB, which is the question the row is actually
 * asking. The same instrument is used in `e2e/hero-contrast.spec.ts`.
 *
 * Measured through it: `LIVE` is `rgba(21, 128, 61)` on `/` and `rgba(1, 102, 48)` on `/work` in light,
 * `rgba(185, 232, 122)` and `rgba(5, 223, 114)` in dark. The clipped red channels are real — green-800 and
 * green-400 in OKLCH sit outside sRGB, so the conversion gamut-clips — and they are what a visitor sees.
 *
 * Equality is exact, not within a tolerance, which assumes #49 settles this by making the two cards read
 * the *same token* rather than by writing the same colour twice in two different colour spaces. That is
 * the fix the finding asks for; if it is ever done the other way, widen this to a per-channel tolerance
 * rather than deleting the row.
 */
async function resolvedColor(page: Page, locator: ReturnType<Page['locator']>): Promise<string> {
  const authored = await locator.evaluate((el) => getComputedStyle(el).color);
  return page.evaluate((value) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context: cannot normalise colours');
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  }, authored);
}

// The two card tests click into every case study. On the dev server the first request for
// `/work/[slug]` took 2 to 7 s, longer than the 5 s `toHaveURL` window under load, so each route is
// served once before either test navigates (e2e/support/warm-routes.ts). The group is anonymous, so
// the tests keep their titles, and it holds only these two, so a route that cannot be served fails
// them without taking the rest of the file down with it.
test.describe(() => {
  test.beforeAll(async ({ playwright }, testInfo) => {
    await warmRoutes(
      playwright,
      testInfo,
      caseStudies.map(({ slug }) => `/work/${slug}`),
    );
  });

  test('every /work card reaches its case study by pointer', async ({ page }) => {
    // Green, and the regression floor R36's fix has to keep. Replacing a whole-card link with a
    // stretched title link can very easily leave the card body unclickable, which is a worse outcome
    // than the long accessible name: clicking a card is the archive's only job.
    for (const { slug, title } of caseStudies) {
      await gotoHydrated(page, '/work');
      const card = cardFor(page, slug);
      await expect(card, `/work must have a card linking to ${slug}`).toHaveCount(1);
      // Clicked on the title, which is inside the card whichever way the link is structured.
      await card.getByText(title, { exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/work/${slug}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
  });

  test('every /work card reaches its case study by keyboard', async ({ page }) => {
    // The other half of the floor. A stretched-link refactor that puts the overlay above the link
    // itself breaks pointer and keyboard access independently, so both are pinned.
    for (const { slug, title } of caseStudies) {
      await gotoHydrated(page, '/work');
      const card = cardFor(page, slug);
      await card.focus();
      await expect(card).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/work/${slug}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
  });
});

test('the first /work card link is named for its title alone', async ({ page }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R36, #49' });

  await page.goto('/work');
  const [study] = caseStudies;
  const card = cardFor(page, study.slug);

  // The accessible name as assistive technology computes it, not the DOM text: for a link with no
  // aria-label that is its normalised content, which here is the entire card.
  const name = ((await card.getAttribute('aria-label')) ?? (await card.innerText()))
    .replace(/\s+/g, ' ')
    .trim();

  // The name must still contain the title — a short name that had lost it would satisfy the bound below
  // while making the link useless — and must then be short enough to be the title and little else.
  expect(name, 'the card link must still be named for its case study').toContain(study.title);
  expect(
    name.length,
    `the link's accessible name is ${name.length} characters: "${name.slice(0, 150)}…". ` +
      "work/page.tsx:52 wraps the whole card in one <Link>, so its name is the card's entire text. " +
      'Use the stretched title-link pattern documented at featured-work.tsx:50-60.',
  ).toBeLessThan(MAX_LINK_NAME);
});

test('a case study status reads as one colour on / and on /work, in both themes', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'fixed-by', description: 'R39, #49' });
  // Four navigations and two waits on the home page's loader, and the loader waits alone may take
  // 30 s each: more than the 30 s default holds, which is why `client-navigation.spec.ts` gives the
  // same shape 90 s. Under the default this ran out of time before the colour comparison on 4 of 5
  // dev-server runs under load (2026-09-13).
  test.setTimeout(90_000);

  const [study] = caseStudies;
  const status = study.highlight.status;
  const disagreements: string[] = [];

  for (const colorScheme of colorSchemes) {
    await page.emulateMedia({ colorScheme });

    // The featured card on `/`, inside its own region so a status string used elsewhere on the page
    // cannot answer for it.
    await gotoHydrated(page, '/');
    await expect(page.locator('html')).toContainClass(colorScheme);
    const featuredSection = page.getByRole('region', { name: /featured work/i });
    await featuredSection.scrollIntoViewIfNeeded();
    const featured = featuredSection.getByText(status, { exact: true }).first();
    await expect(featured).toHaveCount(1);
    const onHome = await resolvedColor(page, featured);

    // The archive card for the same case study.
    await page.goto('/work');
    await expect(page.locator('html')).toContainClass(colorScheme);
    const archive = cardFor(page, study.slug).getByText(status, { exact: true }).first();
    await expect(archive).toHaveCount(1);
    const onArchive = await resolvedColor(page, archive);

    if (onHome !== onArchive) {
      disagreements.push(`${colorScheme}: "${status}" is ${onHome} on / and ${onArchive} on /work`);
    }
  }

  // Expected to fail from here on only. Declared at the top, a prerequisite that fails above (a
  // loader that never hides, a theme class that never lands) would count as the disagreement this
  // row records and pass the run; under the 30 s default it timed out instead, which did not.
  test.fail();
  expect(
    disagreements,
    'the featured card uses --tmux-status-ok (featured-work.tsx:100) and the archive card ' +
      '--status-ok (work/page.tsx:79), and the two differ in both themes. #49 either moves the ' +
      'featured cards onto the ADR 0010 tokens or records in a new ADR why they keep the tmux ' +
      'palette; either way the two routes must agree about one status string.',
  ).toEqual([]);
});

test('both routes render the same status string for the same case study', async ({ page }) => {
  // Green, and the premise of R39: the two elements exist and carry the same text, so the row above is
  // about their colour and not about one of them being absent.

  // Under load on the dev server this test passed in up to 23 s and twice ran out of the 30 s
  // default (2 of 20 runs, 2026-09-16), each time with a bare "Test timeout" naming no step: the
  // call pending at the deadline finished before teardown closed the page, so nothing was left to
  // blame. The largest share of its time goes on the wait for the home page's loader, which may
  // take 30 s on its own, so the test gets room past that wait, and a loader that never hides
  // still fails on its own assertion.
  test.setTimeout(60_000);
  const [study] = caseStudies;
  const status = study.highlight.status;

  await gotoHydrated(page, '/');
  const featuredSection = page.getByRole('region', { name: /featured work/i });
  await featuredSection.scrollIntoViewIfNeeded();
  await expect(featuredSection.getByText(status, { exact: true }).first()).toBeVisible();

  await page.goto('/work');
  await expect(cardFor(page, study.slug).getByText(status, { exact: true }).first()).toBeVisible();
});

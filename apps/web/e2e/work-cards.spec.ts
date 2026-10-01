import { expect, test, type Page } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';
import { gotoHydrated } from './support/hydration';
import { warmRoutes } from './support/warm-routes';
import { cardFor, linkFor } from './support/work-card';

/**
 * The `/work` archive cards, and the one thing they used to disagree with the home page about.
 *
 * Rows R36 and R39 of the RED manifest, both fixed by #49, plus the green floors R36's fix has to
 * keep.
 *
 * - R36. `work/page.tsx` used to wrap the *whole* card in one `<Link>` — index, category, status,
 *   title, description, challenge teaser, outcomes, tags and metric — so the link's accessible name
 *   was the card's entire text, 636 characters of it. A screen-reader user tabbing the archive heard
 *   a paragraph per link with the useful part buried at character 30. The card now uses the
 *   stretched title-link pattern the home page's featured cards use (`components/card-link.ts`): the
 *   link holds only the title, its `::after` overlay carries the hit area and the focus outline, and
 *   the description is attached with `aria-describedby`. The floors below pin that the card is still
 *   one pointer and keyboard target, and that hover and keyboard focus both show its affordance.
 * - R39. The same case study's status string used to compute to a different colour on `/` than on
 *   `/work`: the featured card used the tmux chrome's `--tmux-status-ok` and the archive card the
 *   ADR 0010 `--status-ok`, and the two differ in both themes. #49 moved the featured cards onto the
 *   ADR 0010 token.
 *
 * R39 asserts only that the two routes **agree**, and deliberately pins neither a hex nor a token name.
 * When it was written the finding was a scope gap rather than a plain violation: #49 could either
 * move the featured cards onto the ADR 0010 status tokens, or record in a new ADR why the tmux chrome
 * palette is right for a card that lives inside the terminal frame. Both outcomes satisfied this
 * assertion, which was the point — softening or tightening it after the decision would have been
 * writing the test to match the answer. The token itself is pinned by the unit tests
 * (`featured-work.test.tsx`, `work-page.test.tsx`).
 *
 * Axe is the wrong instrument for R39 twice over: it reported no violation while the colours
 * disagreed, and both cards are blurred panels (the featured card is `backdrop-blur-md`, the archive
 * card `backdrop-blur-sm`), which hides their text from its contrast check on the HudPanel precedent.
 * Nothing needs to be scrolled or hovered either, because `color` is read directly and neither status
 * label is state-dependent — the featured card's active/inactive switch is the metric, not the status.
 */

test.describe.configure({ retries: 0 });

const colorSchemes = ['light', 'dark'] as const;
const MAX_LINK_NAME = 80;

/**
 * The first study whose badge carries a status colour. A retired study's badge is neutral on both
 * routes, so it cannot answer for the status token.
 */
function runningStudy() {
  const study = caseStudies.find(({ highlight }) => highlight.status !== 'RETIRED');
  if (!study) throw new Error('every case study is retired: R39 has no status colour to measure');
  return study;
}

/**
 * One element's `color`, normalised to sRGB.
 *
 * Comparing the computed strings directly does not work: Chromium serialises a colour in the space it
 * was authored in. A hex token such as `--tmux-status-ok` reads back as `rgb(…)`, while `--status-ok` is
 * `theme(--color-green-800)` and Tailwind v4's palette is OKLCH, so it reads back as `lab(…)`. Two
 * spellings of one colour would fail a string comparison and the test would be measuring syntax rather
 * than colour. Painting each value on a 1x1 canvas and reading the pixel back normalises both to sRGB,
 * which is the question the row is actually asking. The same instrument is used in
 * `e2e/hero-contrast.spec.ts`.
 *
 * Measured through it before #49: a running status was `rgba(21, 128, 61)` on `/` and
 * `rgba(1, 102, 48)` on `/work` in light, `rgba(185, 232, 122)` and `rgba(5, 223, 114)` in dark. Both
 * routes now read the second pair. The clipped red channels are real — green-800 and green-400 in
 * OKLCH sit outside sRGB, so the conversion gamut-clips — and they are what a visitor sees.
 *
 * Equality is exact, not within a tolerance, because #49 settled this by making the two cards read the
 * *same token* rather than by writing the same colour twice in two different colour spaces. If that is
 * ever done the other way, widen this to a per-channel tolerance rather than deleting the row.
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

// The card tests click into the case studies. On the dev server the first request for
// `/work/[slug]` took 2 to 7 s, longer than the 5 s `toHaveURL` window under load, so each route is
// served once before any of them navigates (e2e/support/warm-routes.ts). The group is anonymous, so
// the tests keep their titles, and it holds only these three, so a route that cannot be served fails
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
      const link = linkFor(page, slug);
      await expect(link, `/work must have a card linking to ${slug}`).toHaveCount(1);
      // Clicked on the title, which is inside the card whichever way the link is structured.
      await link.getByText(title, { exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/work/${slug}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
  });

  test('every /work card reaches its case study by keyboard', async ({ page }) => {
    // The other half of the floor. A stretched-link refactor that puts the overlay above the link
    // itself breaks pointer and keyboard access independently, so both are pinned.
    for (const { slug, title } of caseStudies) {
      await gotoHydrated(page, '/work');
      const link = linkFor(page, slug);
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/work/${slug}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
  });

  test('a click anywhere on a /work card opens its case study', async ({ page }) => {
    // The pointer floor above clicks the title, which is inside the link however the card is built.
    // This one proves the title link's ::after overlay is the hit area of every whole card, the first
    // card's wide layout and the others' stacked one alike: hit-testing a grid of points across the
    // card, the midpoints of its 1px border ring, and points just outside it, then one real click on
    // each card far from its title. The real click is at coordinates because Playwright's own click
    // on a covered element refuses to press it, which is exactly the behaviour this checks.
    await page.setViewportSize({ width: 1280, height: 1400 });
    for (const { slug, title } of caseStudies) {
      await gotoHydrated(page, '/work');
      const card = cardFor(page, slug);
      await expect(card).toHaveCount(1);
      const { misses, farPoint } = await card.evaluate((element) => {
        const link = element.querySelector('h2 a');
        // Instant, whatever the page's scroll-behavior, with the card's top clear of the fixed site
        // header, which would otherwise answer for the points along the card's top edge.
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().top - 160,
          behavior: 'instant',
        });
        const box = element.getBoundingClientRect();
        if (box.bottom > window.innerHeight) {
          throw new Error(`the card is ${box.height}px tall and does not fit the viewport`);
        }
        const hitsLink = (x: number, y: number) =>
          document.elementFromPoint(x, y)?.closest('a') === link;
        const failures: string[] = [];
        // Inside, 12px clear of the rounded corners: a 7x7 grid covers index, status, description,
        // tags, metric and the read-more row.
        for (let i = 0; i <= 6; i += 1) {
          for (let j = 0; j <= 6; j += 1) {
            const x = box.left + 12 + ((box.width - 24) * i) / 6;
            const y = box.top + 12 + ((box.height - 24) * j) / 6;
            if (!hitsLink(x, y)) failures.push(`inside (${i}, ${j}) misses the link`);
          }
        }
        // The border ring itself, half a pixel in from each edge's midpoint, and 6px outside it.
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const edges: [string, number, number, number, number][] = [
          ['top', cx, box.top + 0.5, cx, box.top - 6],
          ['bottom', cx, box.bottom - 0.5, cx, box.bottom + 6],
          ['left', box.left + 0.5, cy, box.left - 6, cy],
          ['right', box.right - 0.5, cy, box.right + 6, cy],
        ];
        for (const [edge, x, y, outX, outY] of edges) {
          if (!hitsLink(x, y)) failures.push(`the ${edge} border misses the link`);
          // Just outside the edge: the overlay must not escape its card.
          if (hitsLink(outX, outY)) failures.push(`6px past the ${edge} edge still hits the link`);
        }
        return {
          misses: failures,
          farPoint: { x: box.right - 16, y: box.bottom - 16 },
        };
      });
      expect(misses, slug).toEqual([]);
      // The bottom-right corner, the read-more arrow's row: as far from the title as the card goes.
      await page.mouse.click(farPoint.x, farPoint.y);
      await expect(page).toHaveURL(new RegExp(`/work/${slug}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
  });
});

test('the first /work card link is named for its title alone', async ({ page }) => {
  await page.goto('/work');
  const [study] = caseStudies;
  const link = linkFor(page, study.slug);

  // The accessible name as assistive technology computes it: the title, and nothing else of the
  // card. The description is the link's accessible description instead.
  await expect(link).toHaveAccessibleName(study.title);
  await expect(link).toHaveAccessibleDescription(study.description);

  // The same bound read from the DOM, which is what the row was first written against: for a link
  // with no aria-label the name is its normalised content, which used to be the entire card.
  const name = ((await link.getAttribute('aria-label')) ?? (await link.innerText()))
    .replace(/\s+/g, ' ')
    .trim();

  // The name must still contain the title — a short name that had lost it would satisfy the bound below
  // while making the link useless — and must then be short enough to be the title and little else.
  expect(name, 'the card link must still be named for its case study').toContain(study.title);
  expect(
    name.length,
    `the link's accessible name is ${name.length} characters: "${name.slice(0, 150)}…". ` +
      'The card link must hold only the title: the stretched title-link pattern in ' +
      'components/card-link.ts carries the rest of the card as its hit area.',
  ).toBeLessThan(MAX_LINK_NAME);
});

/** The reveals the affordance tests measure on one card, and the overlay's focus outline. */
function cardAffordance(page: Page, slug: string) {
  const card = cardFor(page, slug);
  const link = linkFor(page, slug);
  return {
    card,
    link,
    brackets: card.locator(':scope > svg'),
    arrow: card.getByRole('heading', { level: 2 }).locator('svg'),
    overlayOutline: () =>
      link.evaluate((element) => {
        const after = getComputedStyle(element, '::after');
        return { style: after.outlineStyle, width: after.outlineWidth };
      }),
  };
}

test('hover and keyboard focus both show the first /work card affordance', async ({ page }) => {
  // Before R36's fix the whole card was the link, so focusing it lit every group-hover: reveal
  // through the link itself. With the link reduced to the title, the reveals key off the card, and
  // each needs a keyboard-focus twin or keyboard users lose them. The corner brackets and the title
  // arrow are the reveals measured here, and the focus outline is drawn on the link's overlay so it
  // frames the card.
  const [study] = caseStudies;
  await gotoHydrated(page, '/work');
  const { card, link, brackets, arrow, overlayOutline } = cardAffordance(page, study.slug);
  await expect(brackets).toHaveCount(4);
  await expect(arrow).toHaveCount(1);

  // At rest: nothing revealed, no outline. Only the style is compared here:
  // Chromium reports the initial `medium` width, 3px, for an outline whose style is none.
  await card.scrollIntoViewIfNeeded();
  await expect(brackets.first()).toHaveCSS('opacity', '0');
  await expect(arrow).toHaveCSS('opacity', '0');
  expect((await overlayOutline()).style).toBe('none');

  // Pointer: hovering the card body reveals both.
  await card.hover();
  for (const bracket of await brackets.all()) await expect(bracket).toHaveCSS('opacity', '1');
  await expect(arrow).toHaveCSS('opacity', '1');

  await page.mouse.move(0, 0);
  await expect(brackets.first()).toHaveCSS('opacity', '0');
  await expect(arrow).toHaveCSS('opacity', '0');

  // Keyboard: focus arrives by Tab, so :focus-visible applies. Focus the element before the link,
  // then Tab onto the link.
  await link.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(link).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  expect(await link.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  for (const bracket of await brackets.all()) await expect(bracket).toHaveCSS('opacity', '1');
  await expect(arrow).toHaveCSS('opacity', '1');
  await expect.poll(overlayOutline).toEqual({ style: 'solid', width: '2px' });

  // Forced colors (Windows High Contrast) paints no box-shadow, which is why the indicator is an
  // outline: it must still be drawn there.
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(link).toBeFocused();
  await expect.poll(async () => (await overlayOutline()).style).toBe('solid');
});

test('a mouse-focused /work card link does not keep its card lit', async ({ page }) => {
  // Chromium and Firefox focus a link on mousedown, so a Cmd- or Ctrl-click that opens a case study
  // in a new tab leaves the title link focused on /work. The reveals follow keyboard focus
  // (:focus-visible), not any focus, so once the pointer leaves the card goes back to rest, as it
  // does in Safari, which never focuses a clicked link. The click here has its default prevented,
  // which leaves the page and the focus exactly where that background-tab click leaves them.
  const [study] = caseStudies;
  await gotoHydrated(page, '/work');
  const { card, link, brackets, arrow, overlayOutline } = cardAffordance(page, study.slug);
  await page.evaluate(() =>
    window.addEventListener('click', (event) => event.preventDefault(), { capture: true }),
  );

  await card.scrollIntoViewIfNeeded();
  await link.click();
  await expect(link, 'the premise: Chromium focuses a link it clicks').toBeFocused();
  expect(await link.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
  await expect(page).toHaveURL(/\/work$/);

  await page.mouse.move(0, 0);
  await expect(link).toBeFocused();
  for (const bracket of await brackets.all()) await expect(bracket).toHaveCSS('opacity', '0');
  await expect(arrow).toHaveCSS('opacity', '0');
  expect((await overlayOutline()).style).toBe('none');
});

test('a case study status reads as one colour on / and on /work, in both themes', async ({
  page,
}) => {
  // Four navigations and two hydration waits on the home page, and those waits alone may take
  // 30 s each: more than the 30 s default holds, which is why `client-navigation.spec.ts` gives the
  // same shape 90 s. Under the default this ran out of time before the colour comparison on 4 of 5
  // dev-server runs under load (2026-09-13).
  test.setTimeout(90_000);

  const study = runningStudy();
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

  expect(
    disagreements,
    'the featured card on / and the archive card on /work must colour one status string with one ' +
      'token: the ADR 0010 status token, which the two cards share since #49.',
  ).toEqual([]);
});

test('both routes render the same status string for the same case study', async ({ page }) => {
  // Green, and the premise of R39: the two elements exist and carry the same text, so the row above is
  // about their colour and not about one of them being absent.

  // Under load on the dev server this test passed in up to 23 s and twice ran out of the 30 s
  // default (2 of 20 runs, 2026-09-16), each time with a bare "Test timeout" naming no step: the
  // call pending at the deadline finished before teardown closed the page, so nothing was left to
  // blame. The largest share of its time goes on the home page's hydration wait, which may take
  // 30 s on its own, so the test gets room past that wait, and a page that never hydrates still
  // fails on its own assertion.
  test.setTimeout(60_000);
  const study = runningStudy();
  const status = study.highlight.status;

  await gotoHydrated(page, '/');
  const featuredSection = page.getByRole('region', { name: /featured work/i });
  await featuredSection.scrollIntoViewIfNeeded();
  await expect(featuredSection.getByText(status, { exact: true }).first()).toBeVisible();

  await page.goto('/work');
  await expect(cardFor(page, study.slug).getByText(status, { exact: true }).first()).toBeVisible();
});

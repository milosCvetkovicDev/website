import { expect, test, type Page } from '@playwright/test';
import { expectGsapLoaded } from './support/gsap';
import { gotoHydrated } from './support/hydration';
import { sampleStorySection, type StorySample } from './support/story-print';

/**
 * #190: a print of `/` made after GSAP has built the story shows the whole story.
 *
 * GSAP loads on the visitor's first intent, and every phase then builds its entrance. Each section
 * the visitor has not reached keeps that entrance's from-state: `fromTo()` targets at `opacity: 0`
 * with an offset or a scale, Strategy's two architecture lines hidden by stroke dashing, the four
 * class-hidden closers (`[data-reveal]`) and Execution's code lines, whose inline opacity the count
 * rewrites. Printed as it stands, each of those comes out blank. The fix is one `@media print` rule
 * in `globals.css` that forces every element marked `data-story-reveal` visible, and the dashed
 * lines drawn; this spec emulates print and reads the result.
 *
 * Issue #190's first criterion has the case scroll `/` far enough for GSAP to build every phase.
 * It does not scroll: `expectGsapLoaded` sends the loader's intent at the top of the page, and that
 * first intent builds every phase whatever the depth (`arrived` in `load-gsap.ts`). At the top every
 * phase sits below its `top center` trigger, so every kind of hiding is in force at once, which is
 * the strongest form of "after a scroll". A scripted scroll is avoided on purpose: Chromium undoes
 * one on `/` after Next's post-hydration `replaceState`. A visitor further down holds nothing this
 * misses: a phase that has played sits at its to-state (opacity 1, no transform), which the rule
 * leaves as it is; a tween caught midway is a marked target at an inline partial value, the same
 * inline style the rule overrides here; and the story pins nothing, so no pin-spacer moves a phase.
 *
 * `emulateMedia({ media: 'print' })` checks the cascade, not a paper layout: page boxes, the
 * `beforeprint` resize and the refresh ScrollTrigger runs on it are a manual print preview's job.
 */

// No retries, as on the other gate specs: the check is deterministic once the poll below has seen
// every kind of hiding in force, and a retry would turn an intermittent miss into a green "flaky"
// run instead of a failure to root-cause.
test.describe.configure({ retries: 0 });

/**
 * The six story sections, each by the whole name it is announced by (as `hero-story-names.spec.ts`
 * finds them), with a floor under how many text elements it holds on screen: about 80% of the count
 * measured at the top of the page on 2026-10-08, which follows each floor. A section that stops
 * rendering its text, or whose text the sampler stops finding, fails here rather than passing with
 * nothing measured. The floor guards the screen sample only; the print sample must hold exactly the
 * texts the screen sample holds, so print can drop none of them.
 *
 * `excluded` names the texts left out of a section's sample, each by its whole own text. Only one:
 * Strategy's `LOCKED` label (`strategy-phase.tsx`, `opacity-0 group-hover:opacity-100`), one per
 * tech card, a hover-only decoration that is transparent at rest on screen as well, and hover-only
 * effects are out of #190's scope. AnimatedText's typewriter remainder, the other text drawn at
 * opacity 0, is empty at rest and so is no text element.
 */
const PHASES = [
  { label: 'DISCOVERY', name: 'PHASE 1 DISCOVERY', minTexts: 93, excluded: [] }, // 116
  { label: 'STRATEGY', name: 'PHASE 2 STRATEGY', minTexts: 34, excluded: ['LOCKED'] }, // 43
  { label: 'EXECUTION', name: 'PHASE 3 EXECUTION', minTexts: 71, excluded: [] }, // 89
  { label: 'THE GAUNTLET', name: 'PHASE 4 THE GAUNTLET', minTexts: 29, excluded: [] }, // 36
  { label: 'THE LOOP', name: 'PHASE 5 THE LOOP', minTexts: 114, excluded: [] }, // 143
  { label: 'SESSION COMPLETE', name: 'SESSION COMPLETE', minTexts: 11, excluded: [] }, // 14
] as const;

const regionOf = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

type Sampled = { label: string; minTexts: number; sample: StorySample };

async function sampleStory(page: Page): Promise<Sampled[]> {
  const sampled: Sampled[] = [];
  for (const { label, name, minTexts, excluded } of PHASES) {
    const region = regionOf(page, name);
    await expect(region, `${label}: the region named "${name}"`).toHaveCount(1);
    const sample = await region.evaluate(sampleStorySection, excluded);
    sampled.push({ label, minTexts, sample });
  }
  return sampled;
}

/**
 * The three kinds of hiding that are not a GSAP from-state on a wrapper, each of which the per-phase
 * check below could miss behind the wrappers it does find hidden: the four class-hidden closers and
 * the code lines, which are React state set inside the build callbacks, and the architecture lines,
 * hidden by stroke dashing rather than opacity. Each is looked up inside the story's own sections,
 * never the whole page. The loaded mark follows the last build callback, not React's commit of what
 * those callbacks set, so the spec polls this before it trusts the page.
 *
 * The poll also waits for every phase's own from-state, for the same reason one step down: GSAP can
 * initialise a `fromTo()`'s start lazily. A build that lands between ticker frames parses the
 * target's transform (writing GSAP's `translate/rotate/scale: none` pins) and leaves the from-values
 * themselves, `opacity: 0` and the offset, to its next tick. GameComplete builds last, right before
 * the loaded mark, so its terminal and CTA can sit at the pins alone when the mark is seen, until
 * that tick runs; a sample taken in between finds the section un-hidden.
 */
async function phasesWithoutFromState(page: Page): Promise<string[]> {
  const sampled = await sampleStory(page);
  return sampled
    .filter(({ sample }) => !sample.texts.some(({ opacity }) => opacity < 1))
    .map(({ label }) => label);
}

async function hidingInForce(page: Page) {
  const story = await Promise.all(
    PHASES.map(({ name }) =>
      regionOf(page, name).evaluate((section) => {
        const blocks = [...section.querySelectorAll('[data-reveal]')];
        const lines = [...section.querySelectorAll<HTMLElement>('pre code > span')].filter(
          (span) => (span.textContent ?? '').trim() !== '',
        );
        const archLines = [...section.querySelectorAll('.arch-line')];
        return {
          revealBlocks: blocks.length,
          revealBlocksHidden: blocks.filter((block) => block.classList.contains('opacity-0'))
            .length,
          codeLines: lines.length,
          codeLinesShown: lines.filter((span) => span.style.opacity !== '0').length,
          archLines: archLines.length,
          archLinesDashed: archLines.filter((line) => {
            const offset = Number.parseFloat(getComputedStyle(line).strokeDashoffset);
            return Number.isFinite(offset) && offset !== 0;
          }).length,
        };
      }),
    ),
  );
  const total = (key: keyof (typeof story)[number]) =>
    story.reduce((sum, section) => sum + section[key], 0);
  return {
    revealBlocks: total('revealBlocks'),
    revealBlocksHidden: total('revealBlocksHidden'),
    codeLines: total('codeLines') > 0,
    codeLinesShown: total('codeLinesShown'),
    archLines: total('archLines'),
    archLinesDashed: total('archLinesDashed'),
  };
}

test('a print made after GSAP has built the story shows every phase fully revealed', async ({
  page,
}) => {
  await gotoHydrated(page, '/');
  await expectGsapLoaded(page);
  expect(
    await page.evaluate(() => scrollY),
    'the page must still be at the top, where every phase is ahead of the visitor',
  ).toBe(0);

  // Screen first: every kind of hiding has to be in force, or the print below proves nothing. The
  // commit this waits for can trail the loaded mark by seconds on a loaded machine.
  await expect
    .poll(() => hidingInForce(page), {
      message:
        'GSAP has loaded at the top of the page, so the four closers carry opacity-0, every line ' +
        'of code is at inline opacity 0 and both architecture lines are dashed',
      timeout: 15_000,
    })
    .toEqual({
      revealBlocks: 4,
      revealBlocksHidden: 4,
      codeLines: true,
      codeLinesShown: 0,
      archLines: 2,
      archLinesDashed: 2,
    });
  await expect
    .poll(() => phasesWithoutFromState(page), {
      message: "every phase has a text GSAP's from-state holds below full opacity",
      timeout: 15_000,
    })
    .toEqual([]);
  const onScreen = await sampleStory(page);
  for (const { label, minTexts, sample } of onScreen) {
    expect(sample.texts.length, `${label}: text elements found`).toBeGreaterThanOrEqual(minTexts);
    expect(
      sample.texts.filter(({ opacity }) => opacity < 1).length,
      `${label}: GSAP built no from-state here, so its print proves nothing`,
    ).toBeGreaterThan(0);
  }
  const techCards = await regionOf(page, 'PHASE 2 STRATEGY').locator('.tech-item').count();
  expect(techCards, 'Strategy renders its tech cards').toBeGreaterThan(0);
  expect(
    onScreen.find(({ label }) => label === 'STRATEGY')?.sample.excluded,
    'the LOCKED exclusion matches one label per tech card: delete it, or say what else it hides',
  ).toBe(techCards);

  // Printed: the same texts as on screen, each drawn at full opacity, visible and untransformed;
  // no element held back by an inline style; both lines drawn whole. A text fails with every
  // element that hides or moves it; the texts one element hides are listed once, as the first of
  // them and how many follow, so the list names each element the rule missed.
  await page.emulateMedia({ media: 'print' });
  const printed = await sampleStory(page);
  const blank = new Map<string, { label: string; text: string; more: number; hiddenBy: string }>();
  const lost: string[] = [];
  printed.forEach(({ label, sample }, phase) => {
    const printedIds = new Set(sample.texts.map(({ id }) => id));
    const missing = onScreen[phase].sample.texts.filter(({ id }) => !printedIds.has(id));
    if (missing.length > 0)
      lost.push(`${label}: ${missing.length} texts not drawn in print, from "${missing[0].text}"`);
    for (const { text, hiddenBy } of sample.texts) {
      if (hiddenBy.length === 0) continue;
      const key = `${label} ${hiddenBy.map(({ id }) => id).join(' ')}`;
      const seen = blank.get(key);
      if (seen) seen.more += 1;
      else
        blank.set(key, { label, text, more: 0, hiddenBy: hiddenBy.map((h) => h.what).join(' > ') });
    }
    for (const held of sample.heldBack) {
      blank.set(`${label} held ${held}`, {
        label,
        text: held,
        more: 0,
        hiddenBy: 'its inline style',
      });
    }
    sample.archLines.forEach(({ dasharray, offset }, i) => {
      if (dasharray !== 'none' || Number.parseFloat(offset) !== 0)
        blank.set(`${label} arch ${i}`, {
          label,
          text: `.arch-line ${i + 1}`,
          more: 0,
          hiddenBy: `stroke-dasharray ${dasharray}, stroke-dashoffset ${offset}`,
        });
    });
  });
  expect(lost, 'print draws every text the screen sample found').toEqual([]);
  expect(
    [...blank.values()].map(
      ({ label, text, more, hiddenBy }) =>
        `${label}: "${text}"${more ? ` and ${more} more` : ''}, under ${hiddenBy}`,
    ),
    'every element the story hides for an entrance carries data-story-reveal, which the ' +
      '@media print rule in globals.css forces visible; these texts or elements print hidden or ' +
      'moved, or these lines dashed',
  ).toEqual([]);

  // Back on screen: the rule is print-only, so what was hidden is hidden again. Texts are paired by
  // element, never by position, so a text added or removed elsewhere shifts nothing.
  await page.emulateMedia({ media: 'screen' });
  const again = await sampleStory(page);
  const shown: string[] = [];
  onScreen.forEach(({ label, sample }, phase) => {
    const now = new Map(again[phase].sample.texts.map((text) => [text.id, text]));
    for (const before of sample.texts.filter(({ opacity }) => opacity < 1)) {
      const after = now.get(before.id);
      if (!after) shown.push(`${label}: "${before.text}" is no longer drawn`);
      else if (after.opacity >= 1) shown.push(`${label}: "${before.text}" is shown on screen`);
    }
    again[phase].sample.archLines.forEach(({ offset }, i) => {
      const dash = Number.parseFloat(offset);
      if (!Number.isFinite(dash) || dash === 0)
        shown.push(`${label}: .arch-line ${i + 1} is drawn on screen (offset ${offset})`);
    });
  });
  expect(shown, 'the print rule reached the screen').toEqual([]);
});

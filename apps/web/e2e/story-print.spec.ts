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
 * one on `/` after Next's post-hydration `replaceState`.
 *
 * `emulateMedia({ media: 'print' })` checks the cascade, not a paper layout: page boxes, the
 * `beforeprint` resize and the refresh ScrollTrigger runs on it are a manual print preview's job.
 */

test.describe.configure({ retries: 0 });

/**
 * The six story sections, each by the whole name it is announced by (as `hero-story-names.spec.ts`
 * finds them), with a floor under how many text elements it holds: about 80% of the count measured
 * at the top of the page on 2026-10-08, which follows each floor. A section that stops rendering its
 * text, or whose text the sampler stops finding, fails here rather than passing with nothing measured.
 */
const PHASES = [
  { label: 'DISCOVERY', name: 'PHASE 1 DISCOVERY', minTexts: 96 }, // 120
  { label: 'STRATEGY', name: 'PHASE 2 STRATEGY', minTexts: 35 }, // 44
  { label: 'EXECUTION', name: 'PHASE 3 EXECUTION', minTexts: 72 }, // 91
  { label: 'THE GAUNTLET', name: 'PHASE 4 THE GAUNTLET', minTexts: 30 }, // 38
  { label: 'THE LOOP', name: 'PHASE 5 THE LOOP', minTexts: 116 }, // 146
  { label: 'SESSION COMPLETE', name: 'SESSION COMPLETE', minTexts: 12 }, // 15
] as const;

/**
 * Texts left out of the sample, each by its whole own text. Only one: Strategy's `LOCKED` label
 * (`strategy-phase.tsx`, `opacity-0 group-hover:opacity-100`), a hover-only decoration that is
 * transparent at rest on screen as well, and hover-only effects are out of #190's scope. AnimatedText's
 * typewriter remainder, the other text drawn at opacity 0, is empty at rest and so is no text element.
 */
const EXCLUDED_TEXTS = ['LOCKED'];

type Sampled = { label: string; minTexts: number; sample: StorySample };

async function sampleStory(page: Page): Promise<Sampled[]> {
  const sampled: Sampled[] = [];
  for (const { label, name, minTexts } of PHASES) {
    const region = page.getByRole('region', { name, exact: true });
    const sample = await region.evaluate(sampleStorySection, EXCLUDED_TEXTS);
    sampled.push({ label, minTexts, sample });
  }
  return sampled;
}

/**
 * The three kinds of hiding that are not a GSAP from-state on a wrapper, each of which the per-phase
 * check below could miss behind the wrappers it does find hidden: the four class-hidden closers and
 * the code lines, which are React state set inside the build callbacks, and the architecture lines,
 * hidden by stroke dashing rather than opacity. The loaded mark follows the last build callback, not
 * React's commit of what those callbacks set, so the spec polls this before it trusts the page.
 */
const hidingInForce = (page: Page) =>
  page.evaluate(() => {
    const blocks = [...document.querySelectorAll('[data-reveal]')];
    const lines = [...document.querySelectorAll<HTMLElement>('pre code > span')].filter(
      (span) => span.textContent !== '\n',
    );
    const archLines = [...document.querySelectorAll('.arch-line')];
    return {
      revealBlocks: blocks.length,
      revealBlocksHidden: blocks.filter((block) => block.classList.contains('opacity-0')).length,
      codeLines: lines.length > 0,
      codeLinesShown: lines.filter((span) => span.style.opacity !== '0').length,
      archLines: archLines.length,
      archLinesDashed: archLines.filter(
        (line) => Number.parseFloat(getComputedStyle(line).strokeDashoffset) !== 0,
      ).length,
    };
  });

test('a print made after GSAP has built the story shows every phase fully revealed', async ({
  page,
}) => {
  await gotoHydrated(page, '/');
  await expectGsapLoaded(page);
  expect(
    await page.evaluate(() => scrollY),
    'the page must still be at the top, where every phase is ahead of the visitor',
  ).toBe(0);

  // Screen first: every kind of hiding has to be in force, or the print below proves nothing.
  await expect
    .poll(() => hidingInForce(page), {
      message:
        'GSAP has loaded at the top of the page, so the four closers carry opacity-0, every line ' +
        'of code is at inline opacity 0 and both architecture lines are dashed',
    })
    .toEqual({
      revealBlocks: 4,
      revealBlocksHidden: 4,
      codeLines: true,
      codeLinesShown: 0,
      archLines: 2,
      archLinesDashed: 2,
    });
  const onScreen = await sampleStory(page);
  for (const { label, minTexts, sample } of onScreen) {
    expect(sample.texts.length, `${label}: text elements found`).toBeGreaterThanOrEqual(minTexts);
    expect(
      sample.texts.filter(({ opacity }) => opacity < 1).length,
      `${label}: GSAP built no from-state here, so its print proves nothing`,
    ).toBeGreaterThan(0);
  }
  expect(
    onScreen.find(({ label }) => label === 'STRATEGY')?.sample.excluded,
    'the LOCKED exclusion no longer matches anything: delete it rather than keep a stale one',
  ).toBeGreaterThan(0);

  // Printed: every text drawn at full opacity and untransformed, and both lines drawn whole. A text
  // fails with every element that hides or moves it; the texts one element hides are listed once,
  // as the first of them and how many follow, so the list names each element the rule missed.
  await page.emulateMedia({ media: 'print' });
  const printed = await sampleStory(page);
  const blank = new Map<string, { label: string; text: string; more: number; hiddenBy: string }>();
  for (const { label, sample } of printed) {
    for (const { text, hiddenBy } of sample.texts) {
      if (hiddenBy.length === 0) continue;
      const key = `${label} ${hiddenBy.map(({ id }) => id).join(' ')}`;
      const seen = blank.get(key);
      if (seen) seen.more += 1;
      else
        blank.set(key, { label, text, more: 0, hiddenBy: hiddenBy.map((h) => h.what).join(' > ') });
    }
    sample.archLineOffsets.forEach((offset, i) => {
      if (offset !== 0)
        blank.set(`${label} arch ${i}`, {
          label,
          text: `.arch-line ${i + 1}`,
          more: 0,
          hiddenBy: `stroke-dashoffset ${offset}`,
        });
    });
  }
  expect(
    [...blank.values()].map(
      ({ label, text, more, hiddenBy }) =>
        `${label}: "${text}"${more ? ` and ${more} more` : ''}, under ${hiddenBy}`,
    ),
    'every element the story hides for an entrance carries data-story-reveal, which the ' +
      '@media print rule in globals.css forces visible; these texts print hidden or moved, or ' +
      'these lines dashed',
  ).toEqual([]);

  // Back on screen: the rule is print-only, so what was hidden is hidden again.
  await page.emulateMedia({ media: 'screen' });
  const again = await sampleStory(page);
  const shown: string[] = [];
  onScreen.forEach(({ label, sample }, phase) => {
    const now = again[phase].sample;
    for (const before of sample.texts.filter(({ opacity }) => opacity < 1)) {
      const after = now.texts[before.index];
      if (after?.text !== before.text)
        shown.push(`${label}: "${before.text}" is no longer text element ${before.index}`);
      else if (after.opacity >= 1) shown.push(`${label}: "${before.text}" is shown on screen`);
    }
    now.archLineOffsets.forEach((offset, i) => {
      if (offset === 0) shown.push(`${label}: .arch-line ${i + 1} is drawn on screen`);
    });
  });
  expect(shown, 'the print rule reached the screen').toEqual([]);
});

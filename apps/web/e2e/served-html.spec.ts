import { expect, test } from '@playwright/test';
import { servedText } from './support/served-text';

/**
 * What `/` looks like with JavaScript switched off.
 *
 * Row R16 of the RED manifest (hero-11, #47), plus the green floor that makes it mean something.
 *
 * The page is prerendered, so a crawler or a reader without JavaScript gets every section and
 * panel of the story in the first response, and every line of the code sample. It gets each
 * sequence's starting state, not its end: the pipeline pending, the healing log empty and the
 * Execution counters at zero, because rendering the finished rows on the server would move the
 * layout once a sequence reset them. Some blocks are hidden for an animation to reveal: the
 * closing headline and toast of the Gauntlet and of the Loop, which a GSAP sequence fades in, and
 * the lines of the Execution code sample, which its count types in. Each phase hides them only
 * when GSAP builds with the section still below the viewport (`gauntlet-phase.tsx`,
 * `loop-phase.tsx`, `execution-phase.tsx`), because without JavaScript no reveal ever runs: the
 * served HTML has to show them at full opacity, or it costs the bytes and delivers nothing
 * (`docs/adr/0009-animation-performance-rules.md` refused to drop these sections from the served
 * HTML for what that costs crawlers, no-JS readers, reader mode, find-in-page and print). The green
 * test below is what proves the distinction — the sections and panels *are* in the served HTML — so
 * R16 is measuring hidden content rather than absent content. `e2e/gsap-lazy.spec.ts` checks that a
 * reload with these blocks in view never hides them either.
 *
 * Two mechanics specific to this file:
 *
 * - It waits for nothing. With JavaScript disabled the hydration marker never flips, so the
 *   `expectHydrated` wait every other spec uses would time out here (CLAUDE.md, Testing).
 * - It asserts computed `opacity`, not `toBeVisible()`: this row is about text painted transparent,
 *   which Playwright's visibility check does not measure.
 */

test.describe.configure({ retries: 0 });

test.use({ javaScriptEnabled: false });

/**
 * The blocks a GSAP sequence reveals, each a `[data-reveal]` wrapper in the component, which must
 * be shown until a reveal is armed. `served-story.test.tsx` checks the same four by that attribute.
 */
const GATED_BLOCKS = [
  { what: "the Gauntlet's closing headline", text: '"It worked on my machine" doesn\'t fly here.' },
  { what: "the Gauntlet's achievement toast", text: 'Achievement Unlocked' },
  { what: "the Loop's closing headline", text: 'This happened at 3:14am. Nobody got paged.' },
  { what: "the Loop's protocol toast", text: 'SELF-HEALING PROTOCOL ACTIVE' },
];

/** Markers that must be in the served markup for the opacity assertions to be about hidden content. */
const SERVED_MARKERS = [
  'DISCOVERY',
  'STRATEGY',
  'EXECUTION',
  'THE GAUNTLET',
  'THE LOOP',
  'SESSION COMPLETE',
  'MONITORING DASHBOARD',
  'SELF-HEALING LOG',
];

test('the whole story is in the served markup with JavaScript off', async ({ page, request }) => {
  // Green, and the premise of the row below. Asserted twice over: in the raw response, which is what a
  // crawler reads, and in the rendered document, which is what a reader without JavaScript gets.
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const text = await servedText(page, await response.text());
  for (const marker of SERVED_MARKERS) {
    expect(text, `${marker} must be in the served HTML`).toContain(marker);
  }
  for (const { what, text: blockText } of GATED_BLOCKS) {
    expect(text, `${what} must be in the served HTML`).toContain(blockText);
  }

  await page.goto('/');
  const rendered = await page.evaluate(() => document.body.innerText);
  for (const marker of SERVED_MARKERS) {
    expect(rendered, `${marker} must be in the rendered document`).toContain(marker);
  }
});

test('the hero headline and its paragraphs are on top in the served page', async ({ page }) => {
  // The hero's largest line is the largest contentful paint of `/`: the hook, which was the H1 and
  // since #58 is the paragraph right under the H1 that names who the site is about. Each has to be
  // paintable from the served HTML alone: an overlay the client removes after hydration would hold
  // every visitor's LCP back to hydration time (ADR 0022). With JavaScript off the page is exactly
  // the served HTML, so whatever is topmost at the centre of each is what the first paint shows
  // there.
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  const targets = [
    h1,
    h1.locator('xpath=following-sibling::p[1]'),
    page.getByText('I build systems that inherit chaos'),
  ];
  for (const target of targets) {
    await expect(target).toBeVisible();
    const cover = await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top && element.contains(top) ? null : (top?.outerHTML.slice(0, 160) ?? 'nothing');
    });
    expect(cover, 'another element is painted over the hero text').toBeNull();
  }
});

test('nothing in the story is painted transparent with JavaScript off', async ({ page }) => {
  await page.goto('/');
  // No hydration wait: with JavaScript off the marker never flips, so `expectHydrated` would time out.
  //
  // Instead, prove JavaScript really is off, or this whole file would be measuring an ordinary hydrated
  // page and the row would be green for the wrong reason. The proof is the page's own first script: the
  // inline theme initialiser in `<head>` adds `light` or `dark` to `<html>` before first paint
  // (`src/lib/theme.ts:13`), and `app/layout.tsx` renders `<html lang="en">` with no class of its own.
  // An unclassed root element therefore means no script in the document ran. (`page.evaluate` still
  // works either way — the driver injects it — so it cannot be used to test this.)
  expect(
    await page.evaluate(() => document.documentElement.className),
    'the theme init script added a class, so scripts are running: `javaScriptEnabled: false` did not ' +
      'take effect and nothing in this file is measuring what it claims to',
  ).toBe('');

  const transparent: string[] = [];
  for (const { what, text } of GATED_BLOCKS) {
    const block = page.getByText(text, { exact: false }).first();
    // Computed opacity of the element and of every ancestor: `opacity-0` is on the wrapper, not on the
    // text node's own element, and opacity multiplies down the tree.
    const effective = await block.evaluate((el) => {
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      return opacity;
    });
    if (effective < 1) transparent.push(`${what}: effective opacity ${effective}`);
  }

  // And the code sample, whose lines carry the same starting state as an inline style rather than a
  // class. Every `code > span` is a line: the caret, which pulses its opacity, sits after `<code>`.
  const codeSpanOpacities = await page.evaluate(() => {
    const pre = document.querySelector('pre');
    if (!pre) return [] as number[];
    return [...pre.querySelectorAll<HTMLElement>('code > span')].map((span) =>
      Number(getComputedStyle(span).opacity),
    );
  });
  // `codeLines` in execution-phase.tsx; served-story.test.tsx compares against it directly.
  expect(
    codeSpanOpacities,
    'the code sample lost lines, or no longer renders one span each',
  ).toHaveLength(22);
  const hiddenSpans = codeSpanOpacities.filter((opacity) => opacity < 1).length;
  if (hiddenSpans > 0) {
    transparent.push(
      `the Execution code sample: ${hiddenSpans} of ${codeSpanOpacities.length} spans below ` +
        'opacity 1 (the code lines in execution-phase.tsx)',
    );
  }

  expect(
    transparent,
    'these blocks are server-rendered and then painted transparent, because their visibility is ' +
      'gated on client state that never arrives without hydration. The prerendered response should ' +
      'show its content; hide a block for its reveal only once GSAP builds with it out of view.',
  ).toEqual([]);
});

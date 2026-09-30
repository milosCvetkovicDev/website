import { expect, test, type Page } from '@playwright/test';
import { expectGsapLoaded } from './support/gsap';
import { expectHydrated } from './support/hydration';

/**
 * `/` must not scroll sideways at the tablet and desktop widths either.
 *
 * Row R11 of the RED manifest, an expected failure until #125 fixed it, and a different bug from
 * R10's despite the identical assertion. Here the offender was a GSAP from-state, not a grid track:
 * the Execution phase built `tl.fromTo(statsRef, { opacity: 0, x: 30 }, …)`, and a `fromTo` renders
 * its "from" frame the moment the timeline is built, before any ScrollTrigger has fired. So the
 * stats panel started 30px to the right of where it belongs and pushed the document out: measured
 * 774px at a 768px viewport, 826px at 820px and 1082px at 1080px. It now rises in from `y: 20`, and
 * `story-phases.test.tsx` refuses a positive `x` in any phase's from-state.
 *
 * Four widths, under `no-preference`, sampled on every animation frame rather than read once, and
 * each part of that matters:
 *
 * - From the moment GSAP is in, for two seconds. GSAP arrives on the visitor's first intent
 *   (`load-gsap.ts`), and until then no timeline exists and no from-state is rendered, so the
 *   sampling sends that intent and waits for GSAP first: taken straight after hydration it would
 *   read the server-rendered page and pass for the wrong reason. After that, a single read can
 *   still land between the frame a timeline is built and the frame its tweens first render, so the
 *   worst of every frame in the window is what is asserted.
 * - Again after scrolling past the Execution phase and back to the top. The phase's
 *   `toggleActions` end in `reverse`, so scrolling back above the section plays its entrance
 *   backwards and puts the from-state on screen again: the finding measured the overflow there
 *   too. The walk down and back is sampled on every frame, and so are two more seconds at the top,
 *   because a reverse plays out over time rather than at once: with `x: 30` put back, the first
 *   frame at the top read 0 and the overflow returned about 400 ms later, which a single read
 *   taken on arrival misses.
 * - `no-preference`, because under `reduce` every phase effect returns early (ADR 0009), no timeline
 *   is built, no from-state is rendered, and the page is clean. A reduced-motion run of this
 *   assertion passes and proves nothing, so the emulation is asserted rather than assumed —
 *   Playwright ignores an unknown media option silently.
 * - 768 as the `md` breakpoint itself, where the grid becomes two columns and R10's mechanism stops
 *   applying, so a failure here cannot be confused with that one; 820 because the audit's hero-v1
 *   finding measured 826 there; 1024 and 1080 as ordinary laptop widths, 1080 being narrower than
 *   the project's own 1280 and therefore not covered by any other spec.
 */

// No retries. These were expected failures, and they stay a guard a retry cannot turn into a green
// "flaky" run.
test.describe.configure({ retries: 0 });

const DESKTOP_WIDTHS = [768, 820, 1024, 1080];

/** How long each sampling window runs. */
const SAMPLE_MS = 2_000;

/**
 * The fewest frames a window may read and still count. At 60 frames a second a window reads about
 * 120; one that read almost none was starved rather than clean, and says nothing either way.
 */
const MIN_FRAMES = 10;

/** One sampling window: its worst overflow, the frames it read, and who was past the edge then. */
interface Overflow {
  worst: number;
  frames: number;
  offenders: string[];
}

/**
 * Samples `scrollWidth - clientWidth` on every animation frame: first, when `walk` is set, while
 * scrolling down until the Execution phase has left the top of the viewport and then back up to
 * the top, and then for `SAMPLE_MS` wherever the page is. Each part reports its own worst frame,
 * with the elements reaching past the right edge on it, so a failure names the offender and the
 * moment.
 *
 * The walk moves three quarters of a viewport per step and waits two frames per step, so every
 * ScrollTrigger on the way fires and React commits between moves, as for a visitor scrolling.
 */
async function sampleOverflow(page: Page, walk: boolean) {
  return page.evaluate(
    async ({ walk, sampleMs }) => {
      const root = document.documentElement;
      const nextFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const reachingPastTheEdge = () => {
        const viewport = root.clientWidth;
        const wide: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const box = el.getBoundingClientRect();
          if (box.right <= viewport + 1) continue;
          // A fixed decoration that is off-canvas does not make the document scroll.
          if (getComputedStyle(el).position === 'fixed') continue;
          const className = typeof el.className === 'string' ? el.className.slice(0, 90) : '';
          wide.push(`  ${el.tagName.toLowerCase()}.${className} right=${Math.round(box.right)}`);
        }
        return wide.slice(0, 6);
      };
      const emptyWindow = (): Overflow => ({ worst: 0, frames: 0, offenders: [] });
      const sample = async (into: Overflow) => {
        await nextFrame();
        into.frames += 1;
        const overflow = root.scrollWidth - root.clientWidth;
        if (overflow > into.worst) {
          into.worst = overflow;
          into.offenders = reachingPastTheEdge();
        }
      };

      let walked: Overflow | null = null;
      if (walk) {
        walked = emptyWindow();
        const code = document.querySelector('[aria-label="ErrorAnalyzer source"]');
        const execution = code?.closest('section');
        if (!execution) throw new Error('no section holds the ErrorAnalyzer source on this page');
        const step = Math.max(1, Math.round(window.innerHeight * 0.75));
        let steps = 0;
        while (execution.getBoundingClientRect().bottom > 0) {
          if (++steps > 200) throw new Error('the walk did not pass Execution in 200 steps');
          const before = window.scrollY;
          window.scrollTo({ top: before + step, behavior: 'instant' });
          await sample(walked);
          await sample(walked);
          if (window.scrollY === before) {
            throw new Error('the page ended before the Execution phase left the viewport');
          }
        }
        while (window.scrollY > 0) {
          if (++steps > 400) throw new Error('the walk did not get back to the top in 400 steps');
          window.scrollTo({ top: Math.max(0, window.scrollY - step), behavior: 'instant' });
          await sample(walked);
          await sample(walked);
        }
      }

      const settled = emptyWindow();
      const end = performance.now() + sampleMs;
      while (performance.now() < end) await sample(settled);
      return { walked, settled };
    },
    { walk, sampleMs: SAMPLE_MS },
  );
}

/** Fails when a window saw any overflow, or read too few frames to have looked. */
function expectNoOverflow(seen: Overflow, clientWidth: number, when: string) {
  expect(
    seen.frames,
    `${when}: only ${seen.frames} animation frames were read`,
  ).toBeGreaterThanOrEqual(MIN_FRAMES);
  expect(
    seen.worst,
    `/ overflowed its ${clientWidth}px viewport by up to ${seen.worst}px ${when}. ` +
      `Elements reaching past the right edge on that frame:\n${seen.offenders.join('\n')}`,
  ).toBe(0);
}

for (const width of DESKTOP_WIDTHS) {
  test(`/ does not scroll sideways at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expectHydrated(page);
    // The from-state only exists once GSAP has loaded and the Execution phase has built its
    // timeline.
    await expectGsapLoaded(page);
    // Guard the guard: under `reduce` no from-state is ever rendered and this whole file is green
    // for the wrong reason.
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'this assertion only means something with motion allowed',
    ).toBe(false);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    const atRest = await sampleOverflow(page, false);
    expectNoOverflow(atRest.settled, clientWidth, `in the ${SAMPLE_MS} ms after GSAP loaded`);

    const afterTheStory = await sampleOverflow(page, true);
    if (!afterTheStory.walked) throw new Error('the walk past the Execution phase did not run');
    expectNoOverflow(
      afterTheStory.walked,
      clientWidth,
      'while scrolling past the Execution phase and back to the top',
    );
    expectNoOverflow(
      afterTheStory.settled,
      clientWidth,
      `in the ${SAMPLE_MS} ms after returning to the top`,
    );
  });
}

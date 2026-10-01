import { expect, test } from '@playwright/test';
import { expectHydrated } from './support/hydration';
import { SAMPLE_MS, expectMotion, expectNoOverflow, measureOverflow } from './support/overflow';

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
 * Four widths, under `no-preference`, sampled on every animation frame rather than read once
 * (`e2e/support/overflow.ts`), and each part of that matters:
 *
 * - From hydration until GSAP is in, and for two seconds after. GSAP arrives on the visitor's first
 *   intent (`load-gsap.ts`), and until then no timeline exists and no from-state is rendered, so
 *   the window sends that intent and keeps sampling until GSAP has built the story and 2 s beyond:
 *   a read taken straight after hydration alone would see the server-rendered page and pass for the
 *   wrong reason, and a single read after that can still land between the frame a timeline is
 *   built and the frame its tweens first render. The worst of every frame is what is asserted, and
 *   because sampling starts at hydration, the frames in which the timelines are built are read too.
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
//
// 60 s rather than the 30 s default: the test waits up to `GSAP_SETTLE_TIMEOUT_MS` (17 s) for GSAP
// and then samples three more windows, two of them 2 s long, so on a loaded runner the default
// would end it as a bare "Test timeout" rather than with a message naming the cause. It measured
// about 5 to 6 s per width.
test.describe.configure({ retries: 0, timeout: 60_000 });

const DESKTOP_WIDTHS = [768, 820, 1024, 1080];

for (const width of DESKTOP_WIDTHS) {
  test(`/ does not scroll sideways at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expectHydrated(page);
    // Guard the guard: under `reduce` no from-state is ever rendered and this whole file is green
    // for the wrong reason.
    await expectMotion(page, 'no-preference');

    const seen = await measureOverflow(page, [
      {
        kind: 'gsap',
        label: `from hydration until GSAP had built the story, and ${SAMPLE_MS} ms after`,
        ms: SAMPLE_MS,
      },
      {
        kind: 'walk',
        label: 'while scrolling down past the Execution phase',
        // The Execution phase is the section holding the code sample, found by its accessible
        // name as the phone spec finds it.
        to: { pastSectionOf: '[aria-label="ErrorAnalyzer source"]' },
      },
      { kind: 'walk', label: 'while scrolling back to the top', to: 'top' },
      {
        kind: 'settle',
        label: `in the ${SAMPLE_MS} ms after returning to the top`,
        ms: SAMPLE_MS,
      },
    ]);
    expectNoOverflow(seen, '/');
    expect(seen[1]?.moved, 'the walk past the Execution phase did not move').toBeGreaterThan(0);
  });
}

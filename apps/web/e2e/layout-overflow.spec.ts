import { expect, test } from '@playwright/test';
import { expectGsapLoaded } from './support/gsap';
import { expectHydrated } from './support/hydration';

/**
 * `/` must not scroll sideways at the tablet and desktop widths either.
 *
 * Row R11 of the RED manifest, an expected failure until #46's fix landed, and a different bug from
 * R10's despite the identical assertion. Here the offender was a GSAP from-state, not a grid track:
 * the Execution phase built `tl.fromTo(statsRef, { opacity: 0, x: 30 }, …)`, and a `fromTo` renders
 * its "from" frame the moment the timeline is built, before any ScrollTrigger has fired. So the
 * stats panel started 30px to the right of where it belongs and pushed the document out: measured
 * 774px at a 768px viewport, 826px at 820px and 1082px at 1080px. It now rises in from `y: 20`, and
 * `story-phases.test.tsx` refuses a positive `x` in any phase's from-state.
 *
 * Four widths, at rest, under `no-preference`, and each part of that matters:
 *
 * - At rest, because that is when the from-state is on screen and nothing has scrolled it away. This
 *   is what a visitor sees once the page has settled and they have started to scroll. GSAP arrives
 *   on the visitor's first intent (`load-gsap.ts`), and until then no timeline exists and no
 *   from-state is rendered, so the measurement sends that intent and waits for GSAP: taken straight
 *   after hydration it would read the server-rendered page and pass for the wrong reason.
 * - `no-preference`, because under `reduce` every phase effect returns early (ADR 0009), no timeline
 *   is built, no from-state is rendered, and the page is clean. A reduced-motion run of this
 *   assertion passes and proves nothing, so the emulation is asserted rather than assumed —
 *   Playwright ignores an unknown media option silently.
 * - 768 as the `md` breakpoint itself, where the grid becomes two columns and R10's mechanism stops
 *   applying, so a failure here cannot be confused with that one; 820 because the finding measured
 *   826 there (#46 AC 9); 1024 and 1080 as ordinary laptop widths, 1080 being narrower than the
 *   project's own 1280 and therefore not covered by any other spec.
 */

// No retries. These were expected failures, and they stay a guard a retry cannot turn into a green
// "flaky" run.
test.describe.configure({ retries: 0 });

const DESKTOP_WIDTHS = [768, 820, 1024, 1080];

for (const width of DESKTOP_WIDTHS) {
  test(`/ does not scroll sideways at ${width}px at rest`, async ({ page }) => {
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

    const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const wide: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const box = el.getBoundingClientRect();
        if (box.right <= viewport + 1) continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        const className = typeof el.className === 'string' ? el.className.slice(0, 90) : '';
        wide.push(`  ${el.tagName.toLowerCase()}.${className} right=${Math.round(box.right)}`);
      }
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: viewport,
        offenders: wide.slice(0, 6),
      };
    });

    expect(
      scrollWidth,
      `/ overflows its ${clientWidth}px viewport by ${scrollWidth - clientWidth}px at rest. ` +
        `Elements reaching past the right edge:\n${offenders.join('\n')}`,
    ).toBeLessThanOrEqual(clientWidth);
  });
}

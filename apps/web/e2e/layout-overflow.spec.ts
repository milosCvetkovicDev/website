import { expect, test } from '@playwright/test';

/**
 * `/` must not scroll sideways at the tablet and desktop widths either.
 *
 * Row R11 of the RED manifest, fixed by #46, and a different bug from R10's despite the identical
 * assertion. Here the offender is a GSAP from-state, not a grid track: the Execution phase builds
 * `tl.fromTo(statsRef, { opacity: 0, x: 30 }, …)` (`execution-phase.tsx:184-189`), and a `fromTo`
 * renders its "from" frame the moment the timeline is built — at mount, before any ScrollTrigger has
 * fired. So the stats panel starts 30px to the right of where it belongs and pushes the document out:
 * measured 774px at a 768px viewport and 1082px at 1080px.
 *
 * Three widths, at rest, under `no-preference`, and each part of that matters:
 *
 * - At rest, because that is when the from-state is on screen and nothing has scrolled it away. This
 *   is what a visitor sees on first paint.
 * - `no-preference`, because under `reduce` every phase effect returns early (ADR 0009), no timeline
 *   is built, no from-state is rendered, and the page is clean. A reduced-motion run of this
 *   assertion passes and proves nothing, so the emulation is asserted rather than assumed —
 *   Playwright ignores an unknown media option silently.
 * - 768 as the `md` breakpoint itself, where the grid becomes two columns and R10's mechanism stops
 *   applying, so a failure here cannot be confused with that one; 1024 and 1080 as ordinary laptop
 *   widths, 1080 being narrower than the project's own 1280 and therefore not covered by any other
 *   spec.
 */

// No retries. CI sets `retries: 2`, and an expected failure that passes on its first attempt is the
// signal that the defect is fixed; with retries on, Playwright would run it again, see it fail as
// annotated, and report the pair as flaky instead of failing the run.
test.describe.configure({ retries: 0 });

const DESKTOP_WIDTHS = [768, 1024, 1080];

for (const width of DESKTOP_WIDTHS) {
  test(`/ does not scroll sideways at ${width}px at rest`, async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R11, #46' });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
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

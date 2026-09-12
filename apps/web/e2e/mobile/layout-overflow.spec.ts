import { expect, test, type Page } from '@playwright/test';

/**
 * `/` must not scroll sideways on a phone.
 *
 * Row R10 of the RED manifest, fixed by #46. The Execution phase's grid is
 * `grid gap-8 md:grid-cols-2` (`execution-phase.tsx:261`), so below `md` it is a single track — and a
 * grid track sizes to its content's min-content width, which for the `<pre>` holding the code sample
 * is 438.6px. In a 327px content box that overflows, and the document measures 463px wide at every
 * phone width: the whole page can be dragged sideways, on the one viewport class where that is most
 * obvious and most annoying.
 *
 * Measured at three widths rather than the project's own, because the number to beat is the
 * viewport's and a single width cannot tell a fixed-width overflow from a proportional one: 463 is
 * wider than 320, 375 and 414 alike, which is what says the offender has a hard minimum rather than
 * a percentage. `setViewportSize` narrows the phone project's viewport and leaves `isMobile` and
 * `hasTouch` in place, so the mobile header is still the one being laid out.
 *
 * Asserted after the walk and back up, not at rest, and that is deliberate: at rest the Execution
 * section is still at `opacity: 0`, but an invisible element in the flow lays out and overflows all
 * the same, so the row would be RED either way. Walking is what would also catch a phase that only
 * overflows once its reveal has run, and coming back up catches one that overflows on the way out.
 */

// No retries. CI sets `retries: 2`, and an expected failure that passes on its first attempt is the
// signal that the defect is fixed; with retries on, Playwright would run it again, see it fail as
// annotated, and report the pair as flaky instead of failing the run.
//
// 60 s rather than the 30 s default, and the number is not the walk's cost: the walk itself measured
// 770 ms over 20 steps on Pixel 7 and 1.6 s over 40 on iPhone 13, against a ~10,400 px document. What
// needed the headroom was starting a browser context at all — on a machine running two other agents
// plus this suite at one worker, three of these timed out, one of them explicitly "while setting up
// page". They pass at one worker on an unloaded machine and under three parallel repeats. The budget is
// deliberately not larger: the e2e job has 20 minutes and six of these run across the two projects.
test.describe.configure({ retries: 0, timeout: 60_000 });

const PHONE_WIDTHS = [320, 375, 414];

/** Walks to the bottom and back, two frames per step so React commits between moves. */
async function walkTheStory(page: Page) {
  await page.evaluate(async () => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    const step = Math.max(1, Math.round(window.innerHeight * 0.75));
    if (bottom() <= 0) throw new Error('the page is not taller than the viewport: nothing to walk');
    let steps = 0;
    for (let y = 0; y <= bottom(); y += step) {
      if (++steps > 400) throw new Error('the walk did not reach the bottom in 400 steps');
      window.scrollTo({ top: y, behavior: 'instant' });
      await nextFrame();
    }
    for (let y = bottom(); y >= 0; y -= step) {
      if (++steps > 400) throw new Error('the walk did not get back to the top in 400 steps');
      window.scrollTo({ top: y, behavior: 'instant' });
      await nextFrame();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await nextFrame();
  });
}

/**
 * Every element wider than the viewport, innermost first, so a failure names the offender instead of
 * only its width. Walks the rendered tree rather than guessing at selectors, and skips an element
 * whose own box fits but whose children stick out, because reporting the ancestor of an offender is
 * how an overflow bug gets blamed on the wrong file.
 */
async function widestOffenders(page: Page, limit = 6) {
  return page.evaluate((max) => {
    const viewport = document.documentElement.clientWidth;
    const offenders: { tag: string; className: string; width: number; right: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width <= viewport && box.right <= viewport + 1) continue;
      // A fixed or absolutely positioned decoration that is deliberately off-canvas does not make
      // the document scroll; only elements in the flow do.
      if (getComputedStyle(el).position === 'fixed') continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === 'string' ? el.className.slice(0, 90) : '',
        width: Math.round(box.width),
        right: Math.round(box.right),
      });
    }
    return offenders.sort((a, b) => b.width - a.width).slice(0, max);
  }, limit);
}

for (const width of PHONE_WIDTHS) {
  test(`/ does not scroll sideways at ${width}px`, async ({ page }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R10, #46' });

    // Height from the project's own device, so only the width under test changes.
    const height = page.viewportSize()?.height ?? 812;
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
    await walkTheStory(page);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const offenders = await widestOffenders(page);
    expect(
      scrollWidth,
      `/ overflows its ${clientWidth}px viewport by ${scrollWidth - clientWidth}px. Widest ` +
        `elements:\n${offenders.map((o) => `  ${o.tag}.${o.className} = ${o.width}px (right ${o.right})`).join('\n')}`,
    ).toBeLessThanOrEqual(clientWidth);
  });
}

import { expect, test, type Page } from '@playwright/test';
import { expectGsapLoaded } from '../support/gsap';
import { expectHydrated } from '../support/hydration';

/**
 * `/` must not scroll sideways on a phone.
 *
 * Row R10 of the RED manifest, an expected failure until #46's phone-width fixes landed. The
 * Execution phase's grid was `grid gap-8 md:grid-cols-2`, so below `md` it was a single track, and a
 * grid track sized by content cannot shrink below its content's min-content width, which for the
 * `<pre>` holding the code sample is 438.6px. In a 327px content box that overflowed, and the
 * document measured 463px wide at every phone width: the whole page could be dragged sideways, on
 * the one viewport class where that is most obvious. The three story grids are now
 * `grid-cols-1` (`minmax(0, 1fr)`), and the code sample scrolls inside its own named, focusable
 * region instead (`execution-phase.tsx`).
 *
 * Measured at three widths rather than the project's own, because the number to beat is the
 * viewport's and a single width cannot tell a fixed-width overflow from a proportional one.
 * `setViewportSize` narrows the phone project's viewport and leaves `isMobile` and `hasTouch` in
 * place, so the mobile header is still the one being laid out.
 *
 * Asserted after the walk and back up, not at rest, and that is deliberate: walking is what catches
 * a phase that only overflows once its reveal has run, and coming back up catches one that overflows
 * on the way out. The walk starts once GSAP has loaded, on the intent the helper sends
 * (`load-gsap.ts`): walked before it, a section would be measured in its server-rendered state and
 * no reveal would run.
 *
 * At 320px the story's narrowest parts are checked one by one as well (#46 AC 8), because the
 * document can fit while a panel inside it clips its own text: the code sample, the Execution stats,
 * the Strategy tech cards, the Loop stat cells and the hero headline.
 */

// No retries. These were expected failures, and they stay a guard a retry cannot turn into a green
// "flaky" run.
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
    // Height from the project's own device, so only the width under test changes.
    const height = page.viewportSize()?.height ?? 812;
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expectHydrated(page);
    await expectGsapLoaded(page);
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

test("/ fits the story's narrowest parts into 320px", async ({ page }) => {
  const height = page.viewportSize()?.height ?? 812;
  await page.setViewportSize({ width: 320, height });
  await page.goto('/');
  await expectHydrated(page);
  await expectGsapLoaded(page);
  await walkTheStory(page);

  // The code sample scrolls inside its own box, which a keyboard can reach, rather than widening
  // the page or wrapping.
  const code = page.getByRole('region', { name: 'ErrorAnalyzer source' });
  await expect(code).toHaveAttribute('tabindex', '0');
  const codeBox = await code.boundingBox();
  if (!codeBox) throw new Error('the code sample is not rendered');
  expect(codeBox.x, 'the code sample starts off the left edge').toBeGreaterThanOrEqual(0);
  expect(codeBox.x + codeBox.width, 'the code sample ends past the viewport').toBeLessThanOrEqual(
    320,
  );
  const codeScroll = await code.evaluate((pre) => ({
    scrollWidth: pre.scrollWidth,
    clientWidth: pre.clientWidth,
  }));
  expect(codeScroll.scrollWidth, 'the code sample should scroll sideways').toBeGreaterThan(
    codeScroll.clientWidth,
  );

  const measured = await page.evaluate(() => {
    const byText = (text: string) =>
      [...document.querySelectorAll('span, div')].find((el) => el.textContent?.trim() === text);
    const right = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().right * 10) / 10 : Infinity;
    const overflow = (el: Element) => el.scrollWidth - el.clientWidth;
    return {
      timeElapsed: right(byText('TIME ELAPSED')?.nextElementSibling),
      commitStreak: right(byText('COMMIT STREAK')?.previousElementSibling),
      techItems: [...document.querySelectorAll('.tech-item')].map((item) => ({
        text: item.textContent?.trim().slice(0, 30),
        overflow: overflow(item),
      })),
      loopCells: ['UPTIME', 'AVG LATENCY', 'AUTO-FIXES TODAY'].map((label) => {
        const cell = byText(label)?.parentElement;
        return { label, overflow: cell ? overflow(cell) : Infinity };
      }),
    };
  });
  expect(measured.timeElapsed, 'the TIME ELAPSED value ends past 320px').toBeLessThanOrEqual(320);
  expect(measured.commitStreak, 'the commit streak value ends past 320px').toBeLessThanOrEqual(320);
  expect(measured.techItems.length, 'no Strategy tech card was found').toBeGreaterThan(0);
  expect(measured.techItems.filter((item) => item.overflow > 0)).toEqual([]);
  expect(measured.loopCells.filter((cell) => cell.overflow > 0)).toEqual([]);

  // The headline's text lies inside the hero island. The hero section is `overflow-hidden`, which
  // hides a headline wider than the island from `scrollWidth`, so the text box is measured instead.
  const headline = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const skills = document.querySelector('ul[aria-label="Technical skills"]');
    if (!h1 || !skills) throw new Error('the hero has no h1 or no skill list');
    let island = h1.parentElement;
    while (island && !island.contains(skills)) island = island.parentElement;
    if (!island) throw new Error('no element holds both the headline and the skill tags');
    const range = document.createRange();
    range.selectNodeContents(h1);
    const text = range.getBoundingClientRect();
    const box = island.getBoundingClientRect();
    return {
      text: { left: text.left, right: text.right, top: text.top, bottom: text.bottom },
      island: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
    };
  });
  expect(headline.text.left, 'the headline starts outside the hero island').toBeGreaterThanOrEqual(
    headline.island.left,
  );
  expect(headline.text.right, 'the headline ends outside the hero island').toBeLessThanOrEqual(
    headline.island.right,
  );
  expect(headline.text.top).toBeGreaterThanOrEqual(headline.island.top);
  expect(headline.text.bottom).toBeLessThanOrEqual(headline.island.bottom);
});

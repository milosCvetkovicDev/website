import { expect, test, type Page } from '@playwright/test';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from '../routes';
import { expectGsapLoaded } from '../support/gsap';
import { expectHydrated, gotoHydrated } from '../support/hydration';

/**
 * No page route may scroll sideways on a phone.
 *
 * Row R10 of the RED manifest, an expected failure until #125's phone-width fixes landed. The
 * Execution phase's grid was `grid gap-8 md:grid-cols-2`, so below `md` it was a single track, and a
 * grid track sized by content cannot shrink below its content's min-content width, which for the
 * `<pre>` holding the code sample is 438.6px. In a 327px content box that overflowed, and the
 * document measured 463px wide at every phone width: the whole page could be dragged sideways, on
 * the one viewport class where that is most obvious. The three story grids are now
 * `grid-cols-1` (`minmax(0, 1fr)`), and the code sample scrolls inside its own named, focusable
 * region instead (`execution-phase.tsx`).
 *
 * `/` is measured at three widths rather than the project's own, because the number to beat is the
 * viewport's and a single width cannot tell a fixed-width overflow from a proportional one.
 * `setViewportSize` narrows the phone project's viewport and leaves `isMobile` and `hasTouch` in
 * place, so the mobile header is still the one being laid out. The width compared is
 * `documentElement.clientWidth`, never `innerWidth`: under phone emulation the layout viewport
 * widens to the content (463 against 390 on iPhone 13), so `innerWidth` hides the overflow.
 *
 * `/` is read four times. Right after hydration, before anything has been touched, because that is
 * the page every visitor sees whether they scroll or not. Once GSAP has built the story's
 * timelines, because each from-state is rendered from that moment. Then at the bottom of a walk
 * through the story and again back at the top, and that is deliberate: walking is what catches a
 * phase that only overflows once its reveal has run, and coming back up catches one that overflows
 * on the way out. The walk starts once GSAP has loaded, on the intent the helper sends
 * (`load-gsap.ts`): walked before it, a section would be measured in its server-rendered state and
 * no reveal would run.
 *
 * Every other page route gets the same reads at 320px, the width where fixed-width content
 * overflows first: after hydration, at the bottom and back at the top. They share one test and one
 * page, navigated from route to route, because starting a browser context is what costs here (the
 * timeout note below), and each width read is soft, so one run names every route that overflows.
 *
 * At 320px the story's narrowest parts are checked one by one as well (the audit's hero-1 finding),
 * because the document can fit while a panel inside it clips its own text: the code sample, the
 * Execution stats, the Strategy tech cards, the Loop stat cells and the hero headline.
 */

// No retries. These were expected failures, and they stay a guard a retry cannot turn into a green
// "flaky" run.
//
// 60 s rather than the 30 s default, and the number is not the walk's cost: the walk itself measured
// 770 ms over 20 steps on Pixel 7 and 1.6 s over 40 on iPhone 13, against a ~10,400 px document. What
// needed the headroom was starting a browser context at all — on a machine running two other agents
// plus this suite at one worker, three of these timed out, one of them explicitly "while setting up
// page". They pass at one worker on an unloaded machine and under three parallel repeats. The budget is
// deliberately not larger: the e2e job has 20 minutes and ten of these run across the two projects.
// The every-route test sets its own, per route, below.
test.describe.configure({ retries: 0, timeout: 60_000 });

const PHONE_WIDTHS = [320, 375, 414];

/** Every page route but `/`, which the first three tests below cover at three widths each. */
const OTHER_ROUTES = [...STATIC_ROUTES.filter((route) => route !== '/'), ...CASE_STUDY_ROUTES];

/**
 * Scrolls to the bottom, or from wherever the page is back to the top, three quarters of a viewport
 * per step and two frames per step, so React commits and every scroll-driven reveal fires between
 * moves. Ends exactly at the bottom or the top. Returns how far the page can scroll: 0 means it is
 * no taller than the viewport and there was nothing to walk.
 */
async function walk(page: Page, direction: 'down' | 'up') {
  return page.evaluate(async (direction) => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    const step = Math.max(1, Math.round(window.innerHeight * 0.75));
    let steps = 0;
    if (direction === 'down') {
      for (let y = 0; y < bottom(); y += step) {
        if (++steps > 400) throw new Error('the walk did not reach the bottom in 400 steps');
        window.scrollTo({ top: y, behavior: 'instant' });
        await nextFrame();
      }
      window.scrollTo({ top: bottom(), behavior: 'instant' });
    } else {
      for (let y = window.scrollY - step; y > 0; y -= step) {
        if (++steps > 400) throw new Error('the walk did not get back to the top in 400 steps');
        window.scrollTo({ top: y, behavior: 'instant' });
        await nextFrame();
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    await nextFrame();
    return bottom();
  }, direction);
}

/** Walks `/` to the bottom and back, failing if there was nothing to walk. */
async function walkTheStory(page: Page) {
  const range = await walk(page, 'down');
  expect(range, 'the page is not taller than the viewport: nothing to walk').toBeGreaterThan(0);
  await walk(page, 'up');
}

/**
 * Every element wider than the viewport, innermost first, so a failure names the offender instead of
 * only its width. Walks the rendered tree rather than guessing at selectors, and skips an element
 * whose own box fits but whose children stick out, because reporting the ancestor of an offender is
 * how an overflow bug gets blamed on the wrong file.
 *
 * Text is walked too, because text that runs past a box that fits, such as a `nowrap` heading,
 * widens the document without widening any element: the element holding it is named, marked
 * `(text)`. Anything inside a box that clips or scrolls sideways is skipped, like the code sample's
 * lines inside their own scroller or the text of an `sr-only` label: it cannot widen the document.
 */
async function widestOffenders(page: Page, limit = 6) {
  return page.evaluate((max) => {
    const viewport = document.documentElement.clientWidth;
    const offenders: { tag: string; className: string; width: number; right: number }[] = [];
    const clipped = (from: Element | null) => {
      for (let a = from; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') return true;
      }
      return false;
    };
    // An element is measured against its ancestors' clipping, text against its own element's too.
    const report = (el: Element, box: DOMRect, text: boolean) => {
      if (box.width <= viewport && box.right <= viewport + 1) return;
      // A fixed or absolutely positioned decoration that is deliberately off-canvas does not make
      // the document scroll; only elements in the flow do.
      if (getComputedStyle(el).position === 'fixed') return;
      if (clipped(text ? el : el.parentElement)) return;
      offenders.push({
        tag: el.tagName.toLowerCase() + (text ? ' (text)' : ''),
        className: typeof el.className === 'string' ? el.className.slice(0, 90) : '',
        width: Math.round(box.width),
        right: Math.round(box.right),
      });
    };
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      report(el, el.getBoundingClientRect(), false);
    }
    const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      if (!node.parentElement || !node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      report(node.parentElement, range.getBoundingClientRect(), true);
    }
    return offenders.sort((a, b) => b.width - a.width).slice(0, max);
  }, limit);
}

/**
 * Asserts the document is no wider than its viewport, where the page is now, and names the widest
 * offenders when it is. `where` says which page and which moment, for the failure message. A soft
 * check lets the test go on to the next moment or route and still fail at the end.
 */
async function expectNoSidewaysScroll(page: Page, where: string, { soft = false } = {}) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // Walking the whole tree is the expensive part, so it only runs to explain a failure.
  const offenders = scrollWidth > clientWidth ? await widestOffenders(page) : [];
  (soft ? expect.soft : expect)(
    scrollWidth,
    `${where} overflows its ${clientWidth}px viewport by ${scrollWidth - clientWidth}px. Widest ` +
      `elements:\n${offenders.map((o) => `  ${o.tag}.${o.className} = ${o.width}px (right ${o.right})`).join('\n')}`,
  ).toBeLessThanOrEqual(clientWidth);
}

for (const width of PHONE_WIDTHS) {
  test(`/ does not scroll sideways at ${width}px`, async ({ page }) => {
    // Height from the project's own device, so only the width under test changes.
    const height = page.viewportSize()?.height ?? 812;
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expectHydrated(page);
    await expectNoSidewaysScroll(page, '/ right after hydration');
    await expectGsapLoaded(page);
    await expectNoSidewaysScroll(page, '/ at rest once GSAP has built the story');

    const range = await walk(page, 'down');
    expect(range, 'the page is not taller than the viewport: nothing to walk').toBeGreaterThan(0);
    await expectNoSidewaysScroll(page, '/ at the bottom of the story');
    await walk(page, 'up');
    await expectNoSidewaysScroll(page, '/ back at the top after the story');
  });
}

test('no other page route scrolls sideways at 320px', async ({ page }) => {
  // Each route is a navigation, a hydration wait, two walks and three reads: nine routes measured
  // 5 s together on Pixel 7 against the production build. Five seconds each on top of the file's
  // 30 s for a context leaves room for a loaded machine, and the budget grows with the case studies
  // rather than being retuned by hand.
  test.setTimeout(30_000 + OTHER_ROUTES.length * 5_000);
  const height = page.viewportSize()?.height ?? 812;
  await page.setViewportSize({ width: 320, height });

  for (const route of OTHER_ROUTES) {
    await test.step(route, async () => {
      const response = await gotoHydrated(page, route);
      // A route that answered 404 would be measured on the not-found page and pass for it.
      expect(response?.status(), `${route} did not answer 200`).toBe(200);
      await expectNoSidewaysScroll(page, `${route} right after hydration`, { soft: true });
      await walk(page, 'down');
      await expectNoSidewaysScroll(page, `${route} at the bottom`, { soft: true });
      await walk(page, 'up');
      await expectNoSidewaysScroll(page, `${route} back at the top`, { soft: true });
    });
  }
});

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

import { expect, test, type Page } from '@playwright/test';
import { CASE_STUDY_ROUTES, POST_ROUTES, STATIC_ROUTES } from '../routes';
import { expectGsapLoaded } from '../support/gsap';
import { expectHydrated, gotoHydrated } from '../support/hydration';
import {
  SAMPLE_MS,
  expectMotion,
  expectNoOverflow,
  measureOverflow,
  type OverflowWindow,
} from '../support/overflow';
import { TABLES } from '../support/tables';

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
 * place, so the mobile header is still the one being laid out. How the width is measured, and why
 * against `clientWidth` rather than `innerWidth`, is in `e2e/support/overflow.ts`.
 *
 * Each width runs twice, once with motion allowed and once under `reduce`, set with
 * `page.emulateMedia` and asserted, because each lays out something the other never does. With
 * motion allowed, every frame is sampled from hydration until GSAP has built the story's timelines
 * and two seconds beyond, then every frame of a walk to the bottom, two seconds there, every frame
 * of the walk back up and four seconds at the top: walking is what catches a phase that only
 * overflows once its reveal has run, coming back up catches one whose entrance reverses, and the
 * seconds at either end catch a reveal or a reverse that plays out after the walk has stopped
 * (`REVERSE_MS` has the measurement). The walk starts once GSAP has loaded: walked before it, a
 * section would be measured in its server-rendered state and no reveal would run. Under `reduce` no
 * timeline is built, so the page is read after hydration, walked to the bottom and back, and read
 * at each end.
 *
 * Every other page route gets the same check at 320px, the width where fixed-width content
 * overflows first, under both motion preferences. No GSAP runs off `/`, so there is nothing to wait
 * for. The routes share one test and one page per preference, navigated from route to route,
 * because starting a browser context is what costs here (the timeout note below), and every check
 * is soft, so one run names every route and every moment that overflows.
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
// deliberately not larger: the e2e job has 20 minutes and nine of these run on each phone project.
// The every-route tests set their own, per route, below.
test.describe.configure({ retries: 0, timeout: 60_000 });

const PHONE_WIDTHS = [320, 375, 414];

const MOTIONS = ['no-preference', 'reduce'] as const;

/**
 * How long `/` is sampled back at the top of the story, with motion allowed. Coming up from the
 * bottom, the Execution phase's `reverse` plays its whole timeline backwards, and the stats panel's
 * from-state is the last thing it puts back: with the hero-v1 `x: 30` restored, the overflow
 * returned 2.1 to 2.2 s after the walk reached the top, at 320, 375 and 414px on Pixel 7, so a
 * 2 s window read 0 and passed. Four seconds covers that with room for a slow runner.
 */
const REVERSE_MS = 4_000;

/**
 * Every page route but `/`, which the tests below cover at three widths each. The posts join as they
 * are published: a code block's long line has to scroll inside the block, not the page (#61).
 */
const OTHER_ROUTES = [
  ...STATIC_ROUTES.filter((route) => route !== '/'),
  ...CASE_STUDY_ROUTES,
  ...POST_ROUTES,
];

/** The same windows on any page that runs no GSAP: after hydration, then either end of a walk. */
const READ_AND_WALK: OverflowWindow[] = [
  { kind: 'read', label: 'right after hydration' },
  { kind: 'walk', label: 'on the way to the bottom', to: 'bottom' },
  { kind: 'read', label: 'at the bottom' },
  { kind: 'walk', label: 'on the way back to the top', to: 'top' },
  { kind: 'read', label: 'back at the top' },
];

/** Narrows the phone project's viewport to `width`, keeping its own height. */
async function narrowTo(page: Page, width: number) {
  const height = page.viewportSize()?.height ?? 812;
  await page.setViewportSize({ width, height });
}

for (const motion of MOTIONS) {
  const suffix = motion === 'reduce' ? ' under reduced motion' : '';

  for (const width of PHONE_WIDTHS) {
    test(`/ does not scroll sideways at ${width}px${suffix}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await narrowTo(page, width);
      await page.goto('/');
      await expectHydrated(page);
      await expectMotion(page, motion);

      const seen = await measureOverflow(
        page,
        motion === 'reduce'
          ? READ_AND_WALK
          : [
              {
                kind: 'gsap',
                label: `from hydration until GSAP had built the story, and ${SAMPLE_MS} ms after`,
                ms: SAMPLE_MS,
              },
              { kind: 'walk', label: 'on the way down the story', to: 'bottom' },
              { kind: 'settle', label: `at the bottom, for ${SAMPLE_MS} ms`, ms: SAMPLE_MS },
              { kind: 'walk', label: 'on the way back up the story', to: 'top' },
              { kind: 'settle', label: `back at the top, for ${REVERSE_MS} ms`, ms: REVERSE_MS },
            ],
      );
      expectNoOverflow(seen, '/');
      expect(
        seen.find((window_) => window_.kind === 'walk')?.moved,
        'the page is not taller than the viewport: nothing to walk',
      ).toBeGreaterThan(0);
    });
  }

  test(`no other page route scrolls sideways at 320px${suffix}`, async ({ page }) => {
    // The list is derived, so check it still names what the criterion names: an empty or reshaped
    // list would measure nothing and pass.
    expect(OTHER_ROUTES).toEqual(
      expect.arrayContaining(['/about', '/blog', '/contact', '/skills', '/work']),
    );
    expect(CASE_STUDY_ROUTES.length, 'no case study route to measure').toBeGreaterThan(0);
    // Each route is a navigation, a hydration wait, two walks and three reads: nine routes measured
    // 5 s together on Pixel 7 against the production build. Five seconds each on top of the file's
    // 30 s for a context leaves room for a loaded machine, and the budget grows with the case
    // studies and the posts rather than being retuned by hand.
    test.setTimeout(30_000 + OTHER_ROUTES.length * 5_000);
    await page.emulateMedia({ reducedMotion: motion });
    await narrowTo(page, 320);

    for (const route of OTHER_ROUTES) {
      await test.step(route, async () => {
        const response = await gotoHydrated(page, route);
        // A route that answered 404 would be measured on the not-found page and pass for it. Soft,
        // and the route skipped, so the routes after it are still measured.
        if (!response) {
          expect.soft(response, `${route}: the navigation returned no response`).not.toBeNull();
          return;
        }
        expect.soft(response.status(), `${route} did not answer 200`).toBe(200);
        if (response.status() !== 200) return;
        await expectMotion(page, motion);
        expectNoOverflow(await measureOverflow(page, READ_AND_WALK), route);
      });
    }
  });
}

// #58: the routes that serve a data table, at every phone width rather than 320px alone. No table
// scrolls sideways any more (the owner's decision on #226, 2026-10-03): a wide one (`isWideTable()`)
// stacks each row into a block below 640px, and a narrow one wraps. So the page must not scroll
// sideways at any of the three widths, each table's box must sit inside the viewport, and no table
// may overflow its box, which is a plain card: not a region, not a tab stop, not a scroller.
// `tables.spec.ts` beside this file checks the stacked rows themselves.
test(`the routes with a table do not scroll sideways at ${PHONE_WIDTHS.join(', ')}px`, async ({
  page,
}) => {
  const routes = Object.keys(TABLES);
  expect([...routes].sort(), 'the routes that serve a table').toEqual(
    ['/about', '/skills', ...CASE_STUDY_ROUTES].sort(),
  );
  // As above: a navigation, a hydration wait, two walks and three reads per route, per width.
  test.setTimeout(30_000 + routes.length * PHONE_WIDTHS.length * 5_000);

  for (const width of PHONE_WIDTHS) {
    await narrowTo(page, width);
    for (const route of routes) {
      await test.step(`${route} at ${width}px`, async () => {
        const response = await gotoHydrated(page, route);
        expect.soft(response?.status(), `${route} did not answer 200`).toBe(200);
        if (response?.status() !== 200) return;
        expectNoOverflow(await measureOverflow(page, READ_AND_WALK), `${route} at ${width}px`);

        const tables = TABLES[route] ?? [];
        const boxes = page.locator('main div:has(> table)');
        await expect.soft(boxes, `${route}: one box per table`).toHaveCount(tables.length);
        for (const [index, table] of tables.entries()) {
          const box = boxes.nth(index);
          const name = table.caption;
          const measured = await box.evaluate((element) => ({
            overflowX: getComputedStyle(element).overflowX,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }));
          // The computed style, not a class name: nothing is left to scroll, so nothing scrolls.
          expect.soft(measured.overflowX, `${name}'s box is not a scroller`).toBe('visible');
          expect
            .soft(measured.scrollWidth, `${name} overflows its box at ${width}px`)
            .toBeLessThanOrEqual(measured.clientWidth);
          await expect.soft(box, `${name}'s box is not a region`).not.toHaveAttribute('role');
          await expect.soft(box, `${name}'s box is not a tab stop`).not.toHaveAttribute('tabindex');
          const bounds = await box.boundingBox();
          expect.soft(bounds, `${name} is rendered`).not.toBeNull();
          if (bounds) {
            expect.soft(bounds.x, `${name} starts off the left edge`).toBeGreaterThanOrEqual(0);
            expect
              .soft(bounds.x + bounds.width, `${name} ends past the ${width}px viewport`)
              .toBeLessThanOrEqual(width);
          }
        }
      });
    }
  }
});

test("/ fits the story's narrowest parts into 320px", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await narrowTo(page, 320);
  await page.goto('/');
  await expectHydrated(page);
  await expectMotion(page, 'no-preference');
  await expectGsapLoaded(page);
  // Walked down and back first, so every reveal has run and reversed before the parts are measured.
  const walked = await measureOverflow(page, [
    { kind: 'walk', label: 'on the way down the story', to: 'bottom' },
    { kind: 'walk', label: 'on the way back up the story', to: 'top' },
  ]);
  expectNoOverflow(walked, '/');
  expect(
    walked[0]?.moved,
    'the page is not taller than the viewport: nothing to walk',
  ).toBeGreaterThan(0);

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

  // The headline's text lies inside the hero island: the h1 and, since #58, the hook under it, the
  // largest line and the one that runs out of the island at 320 px if its nowrap breakpoint or its
  // size drifts. The hero section is `overflow-hidden`, which hides a line wider than the island
  // from `scrollWidth`, so each text box is measured instead.
  const headline = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const hook = h1?.nextElementSibling;
    const skills = document.querySelector('ul[aria-label="Technical skills"]');
    if (!h1 || !skills) throw new Error('the hero has no h1 or no skill list');
    if (!hook) throw new Error('no hook under the h1');
    let island = h1.parentElement;
    while (island && !island.contains(skills)) island = island.parentElement;
    if (!island) throw new Error('no element holds both the headline and the skill tags');
    const textBox = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const { left, right, top, bottom } = range.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    const box = island.getBoundingClientRect();
    return {
      lines: [
        { what: 'the h1', text: textBox(h1) },
        { what: 'the hook under the h1', text: textBox(hook) },
      ],
      island: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
    };
  });
  for (const { what, text } of headline.lines) {
    expect(text.left, `${what} starts outside the hero island`).toBeGreaterThanOrEqual(
      headline.island.left,
    );
    expect(text.right, `${what} ends outside the hero island`).toBeLessThanOrEqual(
      headline.island.right,
    );
    expect(text.top, `${what} starts above the hero island`).toBeGreaterThanOrEqual(
      headline.island.top,
    );
    expect(text.bottom, `${what} ends below the hero island`).toBeLessThanOrEqual(
      headline.island.bottom,
    );
  }
});

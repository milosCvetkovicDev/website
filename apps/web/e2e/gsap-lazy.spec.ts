import { expect, test, type Page, type Route } from '@playwright/test';
import { GSAP_FAILED_MARK, GSAP_LOADED_MARK } from '../src/components/animated-hero/load-gsap';
import { HYDRATION_MARKER_ID } from '../src/lib/hydration-marker';
import { audit, describeViolations, incompleteNodes, passingNodes, ruleIdsThatRan } from './axe';
import { expectGsapLoaded, sendIntent } from './support/gsap';
import { expectHydrated } from './support/hydration';

/**
 * GSAP loads on the visitor's first intent instead of in the home page's initial chunk
 * (`src/components/animated-hero/load-gsap.ts`): the first scroll, wheel, touch, pointer press or
 * key press, or at once on a page that loads already scrolled. That makes promises no other spec
 * checks, because every other spec on `/` sends that intent and waits for GSAP before it measures
 * anything:
 *
 * - The served `/` references and preloads no script with GSAP in it, and GSAP arrives in a chunk
 *   of its own, requested after hydration. One static import anywhere the page reaches would undo
 *   that silently; `eslint.config.mjs` refuses the import, and this checks the build.
 * - Nothing requests GSAP until the visitor does something, and each kind of intent does. The page
 *   a visitor who only reads sees, and the one Lighthouse scores, is the page before GSAP, so it
 *   passes the accessibility gate's rule set too. `e2e/mobile/gsap-intent.spec.ts` checks the same
 *   two things on the phone projects.
 * - A section the visitor has already scrolled into view when GSAP arrives keeps what they see.
 *   Each phase's entrance renders an `opacity: 0` from-state the moment it is built, so a build
 *   that lands late would otherwise blank a section someone is reading, and then replay it or leave
 *   it blank until they scroll on.
 * - When GSAP cannot be fetched, the story shows its finished state. Three phases do not
 *   server-render it (R16 in `served-html.spec.ts`): their headlines stay at `opacity-0` until a
 *   sequence GSAP runs reveals them.
 */

// No retries: the second case samples every frame for a blink, and a retry would turn an
// intermittent one into a green "flaky" run.
test.describe.configure({ retries: 0 });

/** GSAP's version registry: in its core, minified or not, and in no other script. */
const GSAP_SIGNATURE = 'gsapVersions';

/** Fetches every script first, and hands the ones that carry GSAP to `onGsap` to hold or refuse. */
async function routeScripts(
  page: Page,
  onGsap: (route: Route, fulfil: () => Promise<void>) => Promise<void>,
) {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const fulfil = () => route.fulfill({ response, body });
    if (body.includes(GSAP_SIGNATURE)) await onGsap(route, fulfil);
    else await fulfil();
  });
}

/** Console errors, console warnings and page errors, as `console-clean.spec.ts` counts them. */
function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

test('keeps GSAP out of every script the served / loads, and fetches it after hydration', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/')).text();
  const served = new Set<string>();
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) served.add(src);
  for (const [link] of html.matchAll(/<link\b[^>]*>/g)) {
    const rel = /\brel="([^"]+)"/.exec(link)?.[1] ?? '';
    const as = /\bas="([^"]+)"/.exec(link)?.[1];
    const href = /\bhref="([^"]+)"/.exec(link)?.[1];
    if (href && (rel === 'modulepreload' || (rel === 'preload' && as === 'script'))) {
      served.add(href);
    }
  }
  // A parse that found nothing would make the loop below pass having read no script at all.
  expect(served.size, 'the served / should reference its scripts').toBeGreaterThan(3);
  for (const src of served) {
    const body = await (await request.get(src)).text();
    expect(body.includes(GSAP_SIGNATURE), `${src} is loaded by the served / and carries GSAP`).toBe(
      false,
    );
  }

  // In the browser: which scripts carry GSAP, and when the hydration marker flipped.
  const gsapScripts: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('.js')) return;
    const body = await response.text().catch(() => '');
    if (body.includes(GSAP_SIGNATURE)) gsapScripts.push(new URL(response.url()).pathname);
  });
  await page.addInitScript((markerId) => {
    new MutationObserver((_, observer) => {
      if (document.getElementById(markerId)?.dataset.hydrated === 'true') {
        (window as { hydratedAt?: number }).hydratedAt = performance.now();
        observer.disconnect();
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  }, HYDRATION_MARKER_ID);
  await page.goto('/');
  await expectHydrated(page);
  await expectGsapLoaded(page);

  await expect
    .poll(() => gsapScripts.length, { message: 'no script carrying GSAP' })
    .toBeGreaterThan(0);
  for (const script of gsapScripts) {
    expect(served.has(script), `${script} carries GSAP and the served / names it`).toBe(false);
  }
  const { hydratedAt, requestedAt } = await page.evaluate(
    (scripts) => ({
      hydratedAt: (window as { hydratedAt?: number }).hydratedAt ?? Infinity,
      requestedAt: Math.min(
        ...performance
          .getEntriesByType('resource')
          .filter((entry) => scripts.some((script) => entry.name.endsWith(script)))
          .map((entry) => entry.startTime),
      ),
    }),
    gsapScripts,
  );
  expect(requestedAt, 'GSAP was requested before the page had hydrated').toBeGreaterThan(
    hydratedAt,
  );
});

// Each phase with its section's top 40% down the viewport, past its `top center` start, where a
// late build used to replay the entrance; and Discovery with its top 75% down, short of the start,
// where a late build used to leave it blank until the visitor scrolled on.
const IN_VIEW = [
  { phase: 'Discovery', label: 'PHASE 1', top: 0.4 },
  { phase: 'Discovery', label: 'PHASE 1', top: 0.75 },
  { phase: 'Strategy', label: 'PHASE 2', top: 0.4 },
  { phase: 'Execution', label: 'PHASE 3', top: 0.4 },
  { phase: 'Gauntlet', label: 'PHASE 4', top: 0.4 },
  { phase: 'Loop', label: 'PHASE 5', top: 0.4 },
  { phase: 'GameComplete', label: 'SESSION COMPLETE', top: 0.4 },
];

for (const { phase, label, top } of IN_VIEW) {
  test(`${phase}, in view ${top * 100}% down when GSAP arrives, hides nothing the visitor sees`, async ({
    page,
  }) => {
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    await routeScripts(page, async (_route, fulfil) => {
      await released;
      await fulfil();
    });
    const problems = collectProblems(page);

    await page.goto('/');
    await expectHydrated(page);

    // Scrolled the way a visitor scrolls. Chromium can put a script-driven scroll back to the top
    // while the page is still loading resources, which a wheel does not suffer.
    const distance = await page.evaluate(
      ([text, fraction]) => {
        const section = [...document.querySelectorAll('section')].find((candidate) =>
          candidate.textContent?.includes(text),
        );
        if (!section) throw new Error(`no section contains ${text}`);
        (window as { storySection?: Element }).storySection = section;
        return Math.round(section.getBoundingClientRect().top - innerHeight * fraction);
      },
      [label, top] as const,
    );
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, distance);
    await page.waitForFunction((target) => Math.abs(scrollY - target) < 2, distance);

    // Every element of the section with no CSS animation of its own, sampled every frame from here
    // until 300 ms after GSAP has arrived: its lowest opacity against where it started. The window
    // closes in the page, not from here, so that the Loop alert's own pulse, 500 ms after its
    // trigger fires, is never in it however slow this machine is.
    await page.evaluate((loadedMark) => {
      const state = window as unknown as {
        storySection: Element;
        sample: { elements: Element[]; start: number[]; lowest: number[]; done: boolean };
        scrolledAt: number;
      };
      const elements = [...state.storySection.querySelectorAll('*')].filter(
        (element) => element.getAnimations().length === 0,
      );
      const start = elements.map((element) => Number(getComputedStyle(element).opacity));
      state.sample = { elements, start, lowest: [...start], done: false };
      state.scrolledAt = performance.now();
      const frame = () => {
        const loaded = performance.getEntriesByName(loadedMark, 'mark')[0];
        if (loaded && performance.now() - loaded.startTime > 300) {
          state.sample.done = true;
          return;
        }
        elements.forEach((element, index) => {
          const opacity = Number(getComputedStyle(element).opacity);
          if (opacity < state.sample.lowest[index]) state.sample.lowest[index] = opacity;
        });
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, GSAP_LOADED_MARK);

    release();
    await expectGsapLoaded(page);
    await page.waitForFunction(
      () => (window as unknown as { sample: { done: boolean } }).sample.done,
    );

    const { hidden, visible, loadedAt, scrolledAt } = await page.evaluate((loadedMark) => {
      const state = window as unknown as {
        sample: { elements: Element[]; start: number[]; lowest: number[] };
        scrolledAt: number;
      };
      const { elements, start, lowest } = state.sample;
      return {
        hidden: elements
          .map((element, index) => ({
            element: `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`,
            from: start[index],
            to: lowest[index],
          }))
          .filter(({ from, to }) => to < from - 0.01),
        visible: start.filter((opacity) => opacity === 1).length,
        loadedAt: performance.getEntriesByName(loadedMark, 'mark')[0].startTime,
        scrolledAt: state.scrolledAt,
      };
    }, GSAP_LOADED_MARK);

    // The case is only a case if GSAP was built after the scroll, on a section with text showing.
    expect(loadedAt, 'GSAP arrived before the section was scrolled into view').toBeGreaterThan(
      scrolledAt,
    );
    expect(visible, 'the sampled section showed nothing to hide').toBeGreaterThan(5);
    expect(hidden, `${phase} dimmed what the visitor could already see`).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('when GSAP cannot be fetched, the story shows its finished state', async ({ page }) => {
  let refused = 0;
  await routeScripts(page, async (route) => {
    refused += 1;
    await route.abort();
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expectHydrated(page);
  await sendIntent(page);
  await page.waitForFunction(
    (failedMark) => performance.getEntriesByName(failedMark, 'mark').length > 0,
    GSAP_FAILED_MARK,
  );
  expect(refused, 'the GSAP chunk was never requested').toBeGreaterThan(0);

  // The two headlines and two toasts that only a GSAP sequence reveals, at full opacity.
  for (const text of [
    "doesn't fly here",
    'Nobody got paged',
    'Achievement Unlocked',
    'SELF-HEALING PROTOCOL ACTIVE',
  ]) {
    const reveal = page.locator('div.mt-6, div.mt-16').filter({ hasText: text }).last();
    await expect(reveal, `${text} should be shown`).toHaveCSS('opacity', '1');
  }
  // Execution's finished build: every line of code, the full counters.
  const execution = page.locator('section').filter({ hasText: 'PHASE 3' });
  await expect(execution.locator('pre code > span').first()).toHaveCSS('opacity', '1');
  await expect(page.getByText('00:14:32')).toBeVisible();
  await expect(page.getByText('DEPLOYMENT SUCCESSFUL')).toBeVisible();
  await expect(page.getByText('RESOLVED', { exact: true })).toBeVisible();

  // The page stays usable: a hover on an animated heading does nothing, and throws nothing.
  await page.locator('h2').filter({ hasText: "doesn't fly here" }).hover();
  expect(pageErrors).toEqual([]);
});

/** Every script response carrying GSAP, by path, as the page receives them. */
function watchGsapScripts(page: Page) {
  const scripts: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('.js')) return;
    const body = await response.text().catch(() => '');
    if (body.includes(GSAP_SIGNATURE)) scripts.push(new URL(response.url()).pathname);
  });
  return scripts;
}

const marksSet = (page: Page) =>
  page.evaluate(
    ([loaded, failed]) =>
      [loaded, failed].filter((name) => performance.getEntriesByName(name, 'mark').length > 0),
    [GSAP_LOADED_MARK, GSAP_FAILED_MARK] as const,
  );

/** Waits for the loaded mark without sending any intent of its own, unlike `expectGsapLoaded`. */
const waitForGsapLoadedMark = (page: Page) =>
  page.waitForFunction(
    (loadedMark) => performance.getEntriesByName(loadedMark, 'mark').length > 0,
    GSAP_LOADED_MARK,
  );

test.describe('the first intent', () => {
  test('nothing requests GSAP while the visitor only reads, and a wheel scroll does', async ({
    page,
  }) => {
    const gsapScripts = watchGsapScripts(page);
    await page.goto('/');
    await expectHydrated(page);
    // Three seconds with no input: long past when the idle load used to land (27-523 ms).
    await page.waitForTimeout(3_000);
    expect(gsapScripts, 'GSAP was requested with no input').toEqual([]);
    expect(await marksSet(page)).toEqual([]);

    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 200);
    await waitForGsapLoadedMark(page);
    await expect
      .poll(() => gsapScripts.length, { message: 'no script carrying GSAP' })
      .toBeGreaterThan(0);
  });

  test('a key press loads GSAP', async ({ page }) => {
    await page.goto('/');
    await expectHydrated(page);
    expect(await marksSet(page)).toEqual([]);
    // A key that does not scroll: an arrow key would scroll the document, and the scroll listener
    // alone would then start the load, so the test could not tell that the key press did.
    await page.keyboard.press('Shift');
    await waitForGsapLoadedMark(page);
    expect(await page.evaluate(() => scrollY), 'the key press scrolled the page').toBe(0);
  });

  test('a reload at a restored scroll position loads GSAP with no further input', async ({
    page,
  }) => {
    await page.goto('/');
    await expectHydrated(page);
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 1_200);
    await page.waitForFunction(() => scrollY > 1_000);

    await page.reload();
    await expectHydrated(page);
    // Chromium restores the position on a reload; the loader finds the page already scrolled, or
    // hears the restoring scroll, and needs nothing from the visitor.
    await waitForGsapLoadedMark(page);
    expect(
      await page.evaluate(() => scrollY),
      'the reload did not restore the scroll position, so this case proves nothing',
    ).toBeGreaterThan(0);
  });

  // What a visitor who has not yet scrolled sees, and what Lighthouse's accessibility audit now
  // scores: the served story, before GSAP has built any from-state. The gate's own rule set, its
  // at-rest floor for `/` (`AT_REST_CONTRAST_FLOOR` in `accessibility.spec.ts`, 80), and no budget
  // of its own: the incomplete count is recorded, not gated.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`/ has no axe violations before any intent in the ${colorScheme} theme`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      // Held rather than trusted to stay away: should anything the audit does count as intent, GSAP
      // still cannot arrive and change the page under it.
      let release = () => {};
      const released = new Promise<void>((resolve) => (release = resolve));
      await routeScripts(page, async (route) => {
        await released;
        await route.abort();
      });
      await page.emulateMedia({ colorScheme });
      await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 });
      await expectHydrated(page);
      await expect(page.locator('html')).toContainClass(colorScheme);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const results = await audit(page);
      release();
      const incomplete = incompleteNodes(results, 'color-contrast');
      test.info().annotations.push({
        type: 'colour-contrast incomplete before intent',
        description: String(incomplete),
      });
      expect(describeViolations(results.violations)).toEqual([]);
      expect(ruleIdsThatRan(results)).toEqual(expect.arrayContaining(['document-title']));
      expect(passingNodes(results, 'color-contrast')).toBeGreaterThan(80);
    });
  }
});

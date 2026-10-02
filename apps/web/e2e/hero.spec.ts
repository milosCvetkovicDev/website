import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { isOnlyEmoji, pictographsIn } from '../src/test/pictographs';
import { expectHydrated, gotoHydrated } from './support/hydration';
import { servedText } from './support/served-text';

/** The tmux background's pane titles, left to right. */
const PANE_TITLES = [
  'kubectl — pods',
  'psql — slow query log',
  'gh actions — CI pipeline',
  'nginx — access + error',
  'prometheus — alerts',
];

/**
 * The tmux background is aria-hidden, so no role query reaches a pane: each pane root carries
 * `data-tmux-pane` (`src/components/animated-hero/tmux-background.tsx`).
 */
const tmuxPanes = (page: Page) => page.locator('[data-tmux-pane]');
const tmuxPane = (page: Page, title: string) =>
  tmuxPanes(page).filter({ has: page.getByText(title, { exact: true }) });

/** The hero `<section>`, by the start of its aria-label. */
const heroSection = (page: Page) => page.locator('section[aria-label^="Hero"]');

/**
 * The Scroll indicator's wrapper: the element that carries the display gate and the fade. The
 * indicator is aria-hidden, so no role query reaches it; its "Scroll" label is found in the hero
 * section, without `.first()`, so a second "Scroll" there fails the locator's strictness rather than
 * being measured in its place.
 */
const scrollIndicator = (page: Page) =>
  heroSection(page).getByText('Scroll', { exact: true }).locator('..');

test.describe('Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    // Wait for hero content to be visible instead of arbitrary timeout
    await page.waitForSelector('h1', { state: 'visible' });
    // A smoke check that this application rendered. It no longer guards against a foreign server:
    // Playwright starts the one it tests, and an occupied port aborts the run before the first test
    // (ADR 0014). It never caught a second checkout of this site either, and the not-found and error
    // pages carry this title too; status and path are what catch a wrong page, in the specs below.
    await expect(page).toHaveTitle(/Milos Cvetkovic/);
    // Interactions before hydration are lost.
    await expectHydrated(page);
  });

  test('renders the headline', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('This happened at 3am');
    await expect(h1).toContainText('Nobody woke up');
  });

  test('renders player card with CV data', async ({ page }) => {
    // exact: true — the subtitle under the headline and the footer also contain the name.
    await expect(page.getByText('Milos Cvetkovic', { exact: true })).toBeVisible();
    await expect(page.getByText('Full Stack Engineer & Architect', { exact: true })).toBeVisible();
    await expect(page.getByText('AI-Native Development', { exact: true })).toBeVisible();
  });

  test('renders all skill tags', async ({ page }) => {
    const tags = [
      'TypeScript',
      'React',
      'NestJS',
      'Azure',
      'Terraform',
      'Claude Code',
      'DDD',
      'Kubernetes',
    ];
    for (const tag of tags) {
      await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
    }
  });

  test('tmux background renders with 5 panes', async ({ page }) => {
    await expect(tmuxPanes(page)).toHaveCount(PANE_TITLES.length);
    // One pane per title, so the count above is five different panes and not one matched twice.
    for (const title of PANE_TITLES) {
      await expect(tmuxPane(page, title), `the ${title} pane`).toHaveCount(1);
      await expect(tmuxPane(page, title), `the ${title} pane`).toBeVisible();
    }
  });

  test('tmux panes are divided by a 2 px border, with none at the right edge', async ({ page }) => {
    const widths: string[] = [];
    for (const title of PANE_TITLES) {
      const pane = tmuxPane(page, title);
      // Named here, because evaluate on a missing pane only times out.
      await expect(pane, `the ${title} pane`).toHaveCount(1);
      widths.push(await pane.evaluate((el) => getComputedStyle(el).borderRightWidth));
    }
    expect(widths).toEqual(
      PANE_TITLES.map((_, i) => (i === PANE_TITLES.length - 1 ? '0px' : '2px')),
    );
  });

  test('the server-rendered tmux background survives hydration', async ({ page }) => {
    // The status bar's `[0] production-monitor` span, recorded as the parser creates it, must be the
    // very node on the page once it has hydrated and settled. While TmuxBackground sat in a lazy
    // Suspense boundary, the theme context changing right after hydration made React give up on
    // hydrating that boundary: it deleted the served background and built a new one, which cost a
    // long task inside the window Lighthouse measures, 8 of 8 times on the production build.
    await page.addInitScript(() => {
      const find = () =>
        [...document.querySelectorAll('span')].find(
          (span) => span.textContent === '[0] production-monitor',
        );
      new MutationObserver((_, observer) => {
        const span = find();
        if (!span) return;
        (window as { servedTmuxStatus?: Element }).servedTmuxStatus = span;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto('/');
    await expectHydrated(page);
    // The lazy chunk used to arrive, and the rebuild to land, a few hundred milliseconds after the
    // marker flipped: wait well past it.
    await page.waitForTimeout(3_000);

    const status = await page.evaluate(() => {
      const served = (window as { servedTmuxStatus?: Element }).servedTmuxStatus;
      const current = [...document.querySelectorAll('span')].find(
        (span) => span.textContent === '[0] production-monitor',
      );
      return {
        recorded: served !== undefined,
        connected: served?.isConnected ?? false,
        same: served !== undefined && served === current,
      };
    });
    expect(status.recorded, 'the served page had no tmux status span').toBe(true);
    expect(status.connected, 'React deleted the server-rendered tmux background').toBe(true);
    expect(status.same, 'the tmux status span on the page is not the one served').toBe(true);
  });

  test('tmux log lines animate into panes', async ({ page }) => {
    // The kubectl pane always starts with the same entries; later ones arrive every ~650 ms.
    await expect(page.getByText('$ kubectl get pods -n production -w').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('api-server-6d7f4c8b9-x2k9p').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('tmux log lines do not shift layout', async ({ page }) => {
    // Lines start arriving after an idle callback plus up to two seconds; the kubectl pane always
    // opens with the same command, so its arrival marks the point where the panes are ticking.
    const firstLine = page.getByText('$ kubectl get pods -n production -w').first();
    await expect(firstLine).toBeVisible({ timeout: 15_000 });
    const slotsBefore = await firstLine.locator('..').innerText();
    const shiftScore = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
            reject(new Error('layout-shift entries are not supported in this browser'));
            return;
          }
          let total = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
              if (!shift.hadRecentInput) total += shift.value;
            }
          });
          observer.observe({ type: 'layout-shift' });
          // Roughly thirty more lines land across the five panes in this window.
          setTimeout(() => {
            observer.disconnect();
            resolve(total);
          }, 4_000);
        }),
    );
    // The window measured something: the pane's text moved on.
    expect(await firstLine.locator('..').innerText()).not.toBe(slotsBefore);
    expect(shiftScore).toBeLessThan(0.005);
  });

  test('story sections stay in the DOM after hydration', async ({ page }) => {
    // Holding each section's Suspense boundary suspended during hydration put the markup in the
    // HTML but let React replace it with the placeholder the moment the page hydrated, so the copy
    // and the closing call to action left the document until the visitor scrolled to them. This is
    // the guard for that: read the live DOM well after hydration, without scrolling.
    await page.goto('/');
    await expectHydrated(page);
    await page.waitForTimeout(3_000);
    for (const copy of ['TECH TREE', 'CI/CD PIPELINE', 'SELF-HEALING LOG']) {
      await expect(page.getByText(copy, { exact: false }).first()).toBeAttached();
    }
    await expect(page.getByRole('link', { name: /connect on linkedin/i })).toBeAttached();
  });

  test('scrolling through the story does not shift visible layout', async ({ page }) => {
    // Reduced motion, deliberately: the phases stage their own content in as they animate (the CI
    // pipeline rows, the healing log), and those are intended movements, not layout instability.
    // With motion off every section renders its end state, so anything that moves while scrolling
    // is the page being unstable — which is what this guard is for. It also makes the measurement
    // independent of machine load, which a run on a busy laptop is not.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Hydrated before it scrolls, so the scroll never races hydration. The measurement still covers
    // the load and the re-render that follows hydration (under `reduce` the phases switch to their
    // end state in it), which visitors get too: `buffered` hands the observer every shift recorded
    // since the navigation started, not only those after this script runs.
    await gotoHydrated(page, '/');
    // Programmatic scrolling is not user input, so nothing here is discounted as recent input.
    const shiftScore = await page.evaluate(async () => {
      let total = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) total += shift.value;
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await wait(150);
      }
      await wait(1_000);
      observer.disconnect();
      return total;
    });
    expect(shiftScore).toBeLessThan(0.02);
  });

  // The indicator is displayed from `lg` and 960 px tall only, so not at the desktop project's
  // 1280x720, where it would cover the hero card (#134; the scan below). An element that is not
  // displayed still computes opacity 1, and then 0, so without a tall enough viewport and the
  // display check this test would pass while showing nothing. The `beforeEach` above loads the
  // page at this size, so the page is laid out at it from the start rather than resized.
  test.describe('at 1280x1024', () => {
    test.use({ viewport: { width: 1280, height: 1024 } });

    test('scroll indicator fades on scroll', async ({ page }) => {
      const indicator = scrollIndicator(page);
      await expect(indicator).toHaveCSS('display', 'flex');
      await expect(indicator).toHaveCSS('opacity', '1');

      // A wheel scroll, as a visitor makes, not window.scrollTo. Chromium can undo a scripted scroll
      // made this soon after hydration: the page snaps back to the top, with no script scrolling it,
      // some 70 ms after Next's post-hydration history.replaceState. A user scroll is never undone.
      // Measured on production builds of this branch and of main alike: 0 of 10 wheel scrolls and 2
      // to 5 of 10 scripted ones snapped back. The boot loader used to hide it, holding every test
      // 600 ms past hydration (ADR 0022).
      await page.mouse.move(640, 360);
      await page.mouse.wheel(0, 500);

      // Playwright counts opacity:0 elements as visible, so assert the computed style the fade
      // produces.
      await expect(indicator).toHaveCSS('opacity', '0');
    });
  });

  test('dark mode toggles hero appearance', async ({ page }) => {
    // Find and click the theme toggle
    const themeToggle = page.getByRole('button', {
      name: /switch to light mode/i,
    });
    await themeToggle.click();

    // Verify the page switched (html should not have .dark class)
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    // Toggle back
    const darkToggle = page.getByRole('button', {
      name: /switch to dark mode/i,
    });
    await darkToggle.click();

    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('has proper semantic HTML', async ({ page }) => {
    // Only one h1 on the page
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Hero section has aria-label
    const heroSection = page.locator(
      'section[aria-label="Hero - Milos Cvetkovic, Senior Full Stack Engineer"]',
    );
    await expect(heroSection).toBeAttached();

    // Skill tags use a list
    const skillList = page.locator('ul[aria-label="Technical skills"]');
    await expect(skillList).toBeAttached();
  });

  test('keeps every emoji out of what the story announces', async ({ page }) => {
    // The story's emoji are decoration beside words that already say the same thing ("Runtime →
    // Bun", "Achievement Unlocked"), so each one sits in an aria-hidden element: it still shows,
    // and a screen reader never names it ("high voltage", "brain", "trophy" ...), as on /about and
    // /skills (`pages.spec.ts`). What counts as an emoji is `src/test/pictographs.ts`, which that
    // spec and the page records' unit test share.
    const main = page.locator('main');
    expect(pictographsIn(await main.ariaSnapshot()), 'pictographs announced on /').toEqual([]);

    // The check above would pass as well on a page that stopped drawing them. Each card of the
    // Strategy phase's tech tree still draws one emoji, visible, in an aria-hidden element of its
    // own, so the card is still read out by its words alone.
    const cards = main
      .getByRole('heading', { name: 'TECH TREE', level: 3 })
      .locator('xpath=following-sibling::*');
    expect(await cards.count(), 'tech cards under TECH TREE').toBeGreaterThan(0);
    for (const card of await cards.all()) {
      const hidden = card.locator('[aria-hidden="true"]');
      const icons = (await hidden.allTextContents()).filter(isOnlyEmoji);
      expect(icons, `one emoji in the tech card "${await card.innerText()}"`).toHaveLength(1);
      await expect(hidden.filter({ hasText: icons[0] })).toBeVisible();
    }
  });
});

type Rect = { x: number; y: number; width: number; height: number };

/** Whether two boxes share any area; boxes that only touch along an edge do not. */
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const describeRect = (r: Rect) =>
  `x ${r.x.toFixed(1)}-${(r.x + r.width).toFixed(1)}, y ${r.y.toFixed(1)}-${(r.y + r.height).toFixed(1)}`;

/**
 * The gate in `hero-section.tsx`, restated so each size knows what it must see: `lg` is 64rem wide,
 * and the height has to reach both 960 px and 60rem. Media-query rems follow the browser's default
 * font size, which is 16 px here unless a case sets another.
 */
const INDICATOR_GATE = { minWidthRem: 64, minHeightPx: 960, minHeightRem: 60 };
const indicatorDisplayed = (width: number, height: number, fontSize: number) =>
  width >= INDICATOR_GATE.minWidthRem * fontSize &&
  height >= Math.max(INDICATOR_GATE.minHeightPx, INDICATOR_GATE.minHeightRem * fontSize);

/**
 * How far above the indicator the card's bottom edge must end wherever the indicator is displayed.
 * The gap was 19.9 px at 1280x960 when #134 was fixed, so the card may grow by about 8 px before
 * this fails, rather than by 20 px, when it would touch the indicator.
 */
const MIN_CLEARANCE_PX = 12;

/**
 * The Scroll indicator is pinned to the viewport, 44 px above its bottom edge, while the hero card is
 * centred in a section one small-viewport tall that starts under the sticky header. Losing height
 * lifts the indicator by the full amount and the card's bottom edge by only half of it, so on short
 * viewports the indicator sat on the card and on its last row of skill tags (#134: the Kubernetes
 * tag at 1280x800). `hero-section.tsx` displays it from `lg` and 960 px and 60rem tall only. This is
 * the guard on that gate, which drifts when the card's height or the header's offset changes:
 *
 * - below the gate the indicator must not be displayed, and the card's own "Scroll to see how." is
 *   in the viewport in its place;
 * - at and above it the indicator is displayed at rest, and its box (the union of its own and its
 *   children's, the bouncing dot included) ends at least `MIN_CLEARANCE_PX` below the card.
 *
 * The sizes: the six #134 measured, 1280x940 just under the gate, the gate itself at the narrowest
 * `lg` width, between it and 1280 and at 1280, a tall `lg` portrait, three tall desktops, and a
 * browser default font of 12 px and of 20 px, where a rem-only or a px-only gate would show the
 * indicator over the card. Chromium only: the desktop project is the only one that runs this spec,
 * and `Page.setFontSizes`, the browser setting a visitor changes, is a Chromium DevTools call.
 *
 * One test per size, each in a context of its own, so every page is laid out at its size from the
 * start rather than resized. Outside 'Hero Section', whose `beforeEach` loads the page at the
 * project's 1280x720 first.
 */
test.describe('scroll indicator clears the hero card at rest', () => {
  const CASES: { width: number; height: number; fontSize?: number }[] = [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 940 },
    { width: 1024, height: 960 },
    { width: 1152, height: 960 },
    { width: 1280, height: 960 },
    { width: 1024, height: 1366 },
    { width: 1280, height: 1024 },
    { width: 1680, height: 1050 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 800, fontSize: 12 },
    { width: 1280, height: 960, fontSize: 12 },
    { width: 1280, height: 1024, fontSize: 20 },
    { width: 1280, height: 1200, fontSize: 20 },
  ];

  for (const { width, height, fontSize = 16 } of CASES) {
    const size = `${width}x${height}${fontSize === 16 ? '' : ` with a ${fontSize} px default font`}`;
    const displayed = indicatorDisplayed(width, height, fontSize);

    test.describe(`at ${size}`, () => {
      test.use({ viewport: { width, height } });

      test(
        displayed
          ? 'the indicator is displayed at rest, clear of the card'
          : 'the indicator is not displayed, and the card invites the scroll',
        async ({ page }) => {
          if (fontSize !== 16) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontSize } });
          }
          await gotoHydrated(page, '/');
          await page.evaluate(async () => {
            await document.fonts.ready;
          });

          const indicator = scrollIndicator(page);
          await expect(indicator).toHaveAttribute('aria-hidden', 'true');
          await expect(indicator).toHaveCSS('position', 'fixed');
          const skills = heroSection(page).getByRole('list', { name: 'Technical skills' });
          await expect(skills.getByRole('listitem')).not.toHaveCount(0);
          // The card is the list's parent; holding the headline proves it is not a wrapper of the list.
          const card = skills.locator('..');
          await expect(card.getByRole('heading', { level: 1 })).toHaveCount(1);

          // Measured before the display is asserted, so a failure also says whether it overlaps.
          const display = await indicator.evaluate((el) => getComputedStyle(el).display);
          let measured = '';
          if (display !== 'none') {
            const indicatorBox = await indicator.evaluate((el) => {
              const rects = [el, ...el.querySelectorAll('*')]
                .map((node) => node.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0);
              const left = Math.min(...rects.map((r) => r.left));
              const top = Math.min(...rects.map((r) => r.top));
              const right = Math.max(...rects.map((r) => r.right));
              const bottom = Math.max(...rects.map((r) => r.bottom));
              return { x: left, y: top, width: right - left, height: bottom - top };
            });
            const { cardBox, tagBoxes } = await skills.evaluate((list) => {
              const box = (el: Element) => {
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
              };
              return {
                cardBox: box(list.parentElement!),
                tagBoxes: [...list.querySelectorAll('li')].map((li) => ({
                  what: `the "${li.textContent}" tag`,
                  box: box(li),
                })),
              };
            });
            const gap = indicatorBox.y - (cardBox.y + cardBox.height);
            const covered = [{ what: 'the hero card', box: cardBox }, ...tagBoxes]
              .filter(({ box }) => intersects(indicatorBox, box))
              .map(({ what, box }) => `${what} (${describeRect(box)})`);
            measured =
              `the Scroll indicator (${describeRect(indicatorBox)}) is ${gap.toFixed(1)} px below ` +
              `the hero card (${describeRect(cardBox)})` +
              (covered.length ? `, covering ${covered.join(', ')}` : '');
            if (displayed) {
              expect(gap, `at ${size} ${measured}`).toBeGreaterThanOrEqual(MIN_CLEARANCE_PX);
            }
          }
          expect(
            display,
            `at ${size} the Scroll indicator must ${displayed ? '' : 'not '}be displayed` +
              (measured ? `; ${measured}` : ''),
          ).toBe(displayed ? 'flex' : 'none');

          if (displayed) {
            await expect(indicator).toHaveCSS('opacity', '1');
          } else {
            await expect(heroSection(page).getByText('Scroll to see how.')).toBeInViewport();
          }
        },
      );
    });
  }
});

/**
 * The served HTML, fetched with `request` rather than a second navigation of the page, and read as
 * text by `servedText` from `<body>` (`support/served-text.ts`). Script, style and template content
 * does not count, so a phrase cannot pass on the RSC payload Next inlines in `<script>` tags (which
 * carries the props of client components, rendered or not), and attributes do not count, so the
 * head's description `<meta>` cannot supply one either. No `beforeEach`: these read the response,
 * not a page, and `servedText` parses it on `about:blank`.
 */
test.describe('Hero Section: served HTML', () => {
  const served = async (page: Page, request: APIRequestContext) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    const html = await response.text();
    return { html, body: await servedText(page, html, { root: 'body' }) };
  };
  const servedBody = async (page: Page, request: APIRequestContext) =>
    (await served(page, request)).body;

  /** The three closing headlines that `AnimatedText` splits into one span per letter. */
  const SPLIT_HEADLINES = [
    'Most bugs live in the gap between what you asked for and what you meant.',
    'The bottleneck was never my typing speed.',
    'This happened at 3:14am. Nobody got paged.',
  ];

  test('story sections are server-rendered', async ({ page, request }) => {
    const { html, body } = await served(page, request);
    // Plain text from four of the six sections, and the three closing headlines.
    for (const copy of [
      'TECH TREE',
      'CI/CD PIPELINE',
      'SELF-HEALING LOG',
      'Connect on LinkedIn',
      ...SPLIT_HEADLINES,
    ]) {
      expect(body).toContain(copy);
    }
    // Reading text nodes joins the split letters back into the sentence, so the body text alone
    // cannot tell the split copy from the whole one. Beside the split copy each headline carries a
    // visually hidden one with the sentence whole, so the sentence is in the response as one run of
    // text, as a crawler or a screen reader reads it.
    for (const headline of SPLIT_HEADLINES) {
      expect(html).toContain(headline);
    }
  });

  test('hero content is SSR-rendered (SEO)', async ({ page, request }) => {
    const body = await servedBody(page, request);
    expect(body).toContain('This happened at 3am');
    expect(body).toContain('Milos Cvetkovic');
    expect(body).toContain('Full Stack Engineer');
    expect(body).toContain('TypeScript');
    // The subtitle under the headline, not the head's description, which says it too.
    expect(body).toContain('specializing in AI-native development');
    // And it survives hydration.
    await gotoHydrated(page, '/');
    await expect(page.getByText(/specializing in AI-native development/)).toBeVisible();
  });
});

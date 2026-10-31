import { expect, test, type Locator, type Page } from '@playwright/test';
import { NODES, getActiveConnections } from '../src/data/architecture-graph';
import { featuredProjects } from '../src/data/featured-projects';
import { expectGsapLoaded } from './support/gsap';
import { gotoHydrated } from './support/hydration';
import { TMUX_LOG_STREAM, tmuxLogStreamProblems } from './support/tmux-log-stream';

/**
 * The decorative text #269 made opaque, read in the browser as it is painted: the log lines of the
 * tmux background behind the hero, and the node labels of the architecture diagram behind the
 * featured work.
 *
 * `src/test/dimmed-text.test.ts` reads the source, and it cannot see what script does: the animated
 * panes set each line's colour from script and give the newest line a Web Animation, and a hovered
 * card's fade is an SVG opacity the scan judges only by where text sits under it. Nothing else reads
 * these at runtime either: `accessibility.spec.ts` and the partial-alpha sweep of
 * `hero-contrast.spec.ts` leave the log stream out, because it streams on a clock. So this reads
 * each line's computed `color` and each label's computed `fill`, rejecting an alpha below 1, and the
 * product of the computed opacity of the element and of every ancestor up to its section, rejecting
 * anything below 1: an opacity on the element, on a wrapper or animated on either fails alike.
 *
 * Every animation frame over a window is read, not one moment: a pane adds a line every few hundred
 * milliseconds, so a fade-in on the newest line, which a single read would meet only now and then,
 * is caught in every run, and so is a label caught partway through the diagram's 700 ms fades.
 *
 * Desktop only, by living outside `e2e/mobile/` (the project split in `playwright.config.ts`): below
 * `md` both backgrounds are hidden by design (`DISPLAYED_QUERY` in `tmux-background.tsx`, `hidden
 * md:block` in `architecture-background.tsx`), so a phone has none of this text to read.
 */

test.describe.configure({ retries: 0 });

const colorSchemes = ['light', 'dark'] as const;

/** The panes start on an idle callback plus up to 2 s (`AnimatedPane`), later under load. */
const STREAM_START_TIMEOUT_MS = 20_000;
/** Long enough for every pane to add several lines, each with its appear animation. */
const STREAM_WINDOW_MS = 3_000;
/** Longer than the diagram's 700 ms fades, which a hover starts. */
const LABEL_WINDOW_MS = 1_200;
/** How long the story's scroll-triggered timers may take to finish; see `featured-work.spec.ts`. */
const STORY_SETTLE_TIMEOUT_MS = 20_000;

/** What a window of frames read under one element. */
interface Reading {
  frames: number;
  /** Elements with text read, summed over the frames. */
  reads: number;
  /** Mutations seen under the element while it was read: a stream that never ticked shows none. */
  changes: number;
  /** Each element that failed, once, at its lowest reading. */
  offenders: string[];
}

/**
 * Reads, on every animation frame for `windowMs`, each element under `scope` that matches `selector`
 * and holds text: the alpha of its computed `paint` colour, and the product of the computed opacity
 * of the element and every ancestor up to and including `scope`. Either below 1 is an offender.
 */
async function readOpacity(
  scope: Locator,
  selector: string,
  paint: 'color' | 'fill',
  windowMs: number,
): Promise<Reading> {
  return scope.evaluate(
    async (root, { selector, paint, windowMs }) => {
      // Colours are resolved by painting them on a 1x1 canvas, as `hero-contrast.spec.ts` does, so
      // every syntax the browser accepts is read the same way.
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const alphaOf = (value: string) => {
        if (!ctx) return Number.NaN;
        ctx.clearRect(0, 0, 1, 1);
        // A value the canvas cannot parse leaves fillStyle unchanged, so the sentinel reads as 0.
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[3] / 255;
      };

      let changes = 0;
      const observer = new MutationObserver((records) => {
        changes += records.length;
      });
      observer.observe(root, { subtree: true, childList: true, characterData: true });

      const worst = new Map<string, { colour: string; alpha: number; opacity: number }>();
      let frames = 0;
      let reads = 0;
      const read = () => {
        frames++;
        for (const element of root.querySelectorAll(selector)) {
          // A blank slot holds a no-break space, which trim() removes.
          const text = element.textContent?.trim();
          if (!text) continue;
          reads++;
          const colour = getComputedStyle(element).getPropertyValue(paint);
          const alpha = alphaOf(colour);
          let opacity = 1;
          for (let node: Element | null = element; node; node = node.parentElement) {
            opacity *= Number(getComputedStyle(node).opacity);
            if (node === root) break;
          }
          if (alpha < 1 || opacity < 1 || Number.isNaN(alpha) || Number.isNaN(opacity)) {
            const key = text.slice(0, 40);
            const seen = worst.get(key);
            if (!seen || alpha * opacity < seen.alpha * seen.opacity) {
              worst.set(key, { colour, alpha, opacity });
            }
          }
        }
      };

      const end = performance.now() + windowMs;
      await new Promise<void>((resolve) => {
        const frame = () => {
          read();
          if (performance.now() < end) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      observer.disconnect();

      return {
        frames,
        reads,
        changes,
        offenders: [...worst].map(
          ([text, { colour, alpha, opacity }]) =>
            `"${text}": ${paint} ${colour} (alpha ${alpha.toFixed(2)}), ` +
            `opacity ${opacity.toFixed(2)} with its ancestors`,
        ),
      };
    },
    { selector, paint, windowMs },
  );
}

const RULE =
  'decorative text is painted opaque at full opacity, in an opaque token that reaches AA on its ' +
  'surface (#269, ADR 0010, 0011): dim the shapes around it, never the text';

async function openHome(
  page: Page,
  colorScheme: (typeof colorSchemes)[number],
  reducedMotion: 'reduce' | 'no-preference',
) {
  // Before the navigation: the theme init script in <head> reads prefers-color-scheme.
  await page.emulateMedia({ colorScheme, reducedMotion });
  await gotoHydrated(page, '/');
  // Playwright ignores an unknown emulation option silently: prove the scheme reached the page.
  await expect(page.locator('html')).toContainClass(colorScheme);
  // Read the page as a visitor who has started to use it, with GSAP's from-states applied.
  await expectGsapLoaded(page);
}

const LINES = `${TMUX_LOG_STREAM} > div`;

for (const colorScheme of colorSchemes) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const panes = reducedMotion === 'reduce' ? 'static panes' : 'streaming panes';
    test(`the tmux log lines are opaque at full opacity in the ${panes}, ${colorScheme} theme`, async ({
      page,
    }) => {
      await openHome(page, colorScheme, reducedMotion);
      const hero = page.locator('section[aria-label^="Hero"]');
      expect(
        await tmuxLogStreamProblems(page),
        `${TMUX_LOG_STREAM} must be the five panes`,
      ).toEqual([]);
      // `StaticPane` renders its lines at once; the animated panes fill theirs as they stream.
      await expect
        .poll(
          () =>
            hero
              .locator(LINES)
              .evaluateAll((lines) => lines.filter((line) => line.textContent?.trim()).length),
          { timeout: STREAM_START_TIMEOUT_MS },
        )
        .toBeGreaterThan(0);

      const reading = await readOpacity(hero, LINES, 'color', STREAM_WINDOW_MS);
      expect(reading.frames, 'the window must span more than one frame').toBeGreaterThan(1);
      expect(reading.reads, 'the window must read the log lines').toBeGreaterThan(0);
      if (reducedMotion === 'no-preference') {
        expect(
          reading.changes,
          'the panes must stream while they are read, or an appear animation has nothing to show',
        ).toBeGreaterThan(0);
      }
      expect(reading.offenders, RULE).toEqual([]);
    });
  }

  test(`the architecture diagram's labels are opaque at full opacity, at rest and under a hovered card, ${colorScheme} theme`, async ({
    page,
  }) => {
    // The hover waits for the story above the section, as `featured-work.spec.ts`'s hover test
    // does and explains: its timers move the section, and the card leaves the pointer.
    test.setTimeout(60_000);
    await openHome(page, colorScheme, 'no-preference');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    await expect(page.getByText('DEPLOYMENT SUCCESSFUL', { exact: true })).toBeVisible({
      timeout: STORY_SETTLE_TIMEOUT_MS,
    });
    await expect(page.getByText('RESOLVED', { exact: true })).toBeVisible({
      timeout: STORY_SETTLE_TIMEOUT_MS,
    });
    await expect(section.locator('svg text')).toHaveCount(NODES.length);

    const atRest = await readOpacity(section, 'svg text', 'fill', LABEL_WINDOW_MS);
    expect(atRest.reads, 'the window must read every label').toBeGreaterThanOrEqual(NODES.length);
    expect(atRest.offenders, `at rest: ${RULE}`).toEqual([]);

    // A hovered card lights the nodes it uses and fades the rest to 0.3 of the faded layer.
    const [first] = featuredProjects;
    const lit = getActiveConnections(first.activeNodes).filter((link) => link.active).length;
    await section.getByRole('link', { name: first.title, exact: true }).hover();
    await expect(section.locator('path[data-active="true"]')).toHaveCount(lit);
    const hovered = await readOpacity(section, 'svg text', 'fill', LABEL_WINDOW_MS);
    expect(hovered.reads, 'the window must read every label').toBeGreaterThanOrEqual(NODES.length);
    expect(hovered.offenders, `with ${first.title} hovered: ${RULE}`).toEqual([]);
  });
}

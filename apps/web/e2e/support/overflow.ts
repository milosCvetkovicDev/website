import { expect, type Page } from '@playwright/test';
import { GSAP_FAILED_MARK, GSAP_LOADED_MARK } from '../../src/components/animated-hero/load-gsap';
import { GSAP_SETTLE_TIMEOUT_MS, expectGsapLoaded } from './gsap';

/**
 * The one place that knows how a spec measures whether a page scrolls sideways
 * (`e2e/layout-overflow.spec.ts` at tablet and desktop widths, `e2e/mobile/layout-overflow.spec.ts`
 * on phones).
 *
 * The number measured is `documentElement.scrollWidth - documentElement.clientWidth`, never
 * `innerWidth`: under phone emulation the layout viewport widens to the content (463 against 390 on
 * iPhone 13), so `innerWidth` hides the overflow. The tolerance is zero, and the offender list below
 * uses the same edge, so a 1px overflow still names something.
 *
 * A spec describes a run as a list of windows, and one `page.evaluate` measures them all, back to
 * back, so no frame falls between two of them:
 *
 * - `read`: one frame, where the page is now.
 * - `settle`: every animation frame for `ms`. A reverse plays out over time rather than at once:
 *   with the hero-v1 from-state put back, the first frame at the top read 0 and the overflow returned
 *   about 400 ms later, which a single read taken on arrival misses.
 * - `gsap`: sends the visitor's first intent (as `expectGsapLoaded` does) and samples every frame
 *   from then until GSAP has built the story, and `ms` more. Started straight after hydration, it
 *   covers the hydrated page before GSAP, the frames in which the timelines are built, and the
 *   from-states they render.
 * - `walk`: every frame of a scroll to the bottom, back to the top, or until a section has left the
 *   top of the viewport, three quarters of a viewport per step and two frames per step, so React
 *   commits and every scroll-driven reveal fires between moves, as for a visitor scrolling.
 *
 * Each window reports its worst frame and the elements reaching past the right edge on that frame,
 * found in the same frame as the measurement. The scan walks the whole tree, so it runs only on a
 * frame whose overflow is worse than any before it, which is a frame that already fails the test.
 */

/** How long a `settle` or `gsap` window samples by default. */
export const SAMPLE_MS = 2_000;

/**
 * The fewest frames a time-based window may read and still count. At 60 frames a second a 2 s
 * window reads about 120; one that read almost none was starved rather than clean, and says nothing
 * either way.
 */
export const MIN_FRAMES = 10;

export type OverflowWindow =
  | { kind: 'read'; label: string }
  | { kind: 'settle'; label: string; ms: number }
  | { kind: 'gsap'; label: string; ms: number }
  | { kind: 'walk'; label: string; to: 'bottom' | 'top' | { pastSectionOf: string } };

export interface OverflowResult {
  label: string;
  kind: OverflowWindow['kind'];
  /** The largest `scrollWidth - clientWidth` of any frame read. */
  worst: number;
  /** Animation frames actually delivered and read. */
  frames: number;
  clientWidth: number;
  /** Who reached past the right edge on the worst frame. */
  offenders: string[];
  /** For a walk: how many steps it took and how far it moved. */
  steps: number;
  moved: number;
  /** For a `gsap` window: whether GSAP arrived before its deadline. */
  gsap?: 'loaded' | 'failed' | 'pending';
  /** Set when the window could not finish; the windows after it did not run. */
  error?: string;
}

/**
 * Runs in the page. Self-contained, because Playwright sends its source text: nothing here may
 * close over this module.
 */
async function measureInPage({
  windows,
  loadedMark,
  failedMark,
  gsapTimeoutMs,
}: {
  windows: OverflowWindow[];
  loadedMark: string;
  failedMark: string;
  gsapTimeoutMs: number;
}): Promise<OverflowResult[]> {
  const root = document.documentElement;

  // An animation frame, or 100 ms, whichever comes first: a page whose frames stop cannot hang the
  // evaluate, and a window that was starved reports its low frame count instead of timing out.
  const frame = () =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 100);
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  // Whether an overflowing box is cut off by an ancestor that clips or scrolls sideways, and so
  // cannot widen the document. Walks the containing-block chain rather than the parent chain: an
  // absolutely positioned box is clipped only by its containing block (the nearest positioned or
  // transformed ancestor) and that block's own clippers, not by static boxes in between, and a
  // fixed one belongs to the viewport and never widens the document. Tailwind 4's `translate-*`,
  // `scale-*` and `rotate-*` set the individual transform properties rather than `transform`, and
  // each of them makes a containing block too.
  const cutOff = (start: Element | null, position: string) => {
    let pos = position;
    for (let a = start; a && a !== document.body && a !== root; a = a.parentElement) {
      if (pos === 'fixed') return true;
      const style = getComputedStyle(a);
      const containing =
        style.position !== 'static' ||
        [style.transform, style.translate, style.scale, style.rotate, style.filter].some(
          (value) => value !== 'none',
        );
      if (pos === 'absolute' && !containing) continue;
      if (style.overflowX !== 'visible') return true;
      pos = style.position;
    }
    return pos === 'fixed';
  };

  // Every element or run of text past the right edge, farthest and innermost first, so a failure
  // names the offender rather than an ancestor that was only stretched by it: blaming the ancestor
  // is how an overflow bug gets pinned on the wrong file. Text counts too, because text running
  // past a box that fits, such as a `nowrap` heading, widens the document without widening any
  // element; the element holding it is named, marked `(text)`.
  const offenders = () => {
    const edge = root.clientWidth;
    const found: { line: string; right: number; depth: number }[] = [];
    const depth = (el: Element) => {
      let d = 0;
      for (let a: Element | null = el; a; a = a.parentElement) d += 1;
      return d;
    };
    const report = (el: Element, box: DOMRect, text: boolean) => {
      if (box.right <= edge) return;
      const clipped = text
        ? cutOff(el, 'static')
        : cutOff(el.parentElement, getComputedStyle(el).position);
      if (clipped) return;
      const className = typeof el.className === 'string' ? el.className.slice(0, 90) : '';
      found.push({
        line:
          `  ${el.tagName.toLowerCase()}${text ? ' (text)' : ''}.${className} = ` +
          `${Math.round(box.width)}px (right ${Math.round(box.right)})`,
        right: box.right,
        depth: depth(el),
      });
    };
    for (const el of document.querySelectorAll('body *')) {
      report(el, el.getBoundingClientRect(), false);
    }
    const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      if (!node.parentElement || !node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      report(node.parentElement, range.getBoundingClientRect(), true);
    }
    return found
      .sort((a, b) => b.right - a.right || b.depth - a.depth)
      .slice(0, 6)
      .map((o) => o.line);
  };

  const results: OverflowResult[] = [];
  for (const window_ of windows) {
    const result: OverflowResult = {
      label: window_.label,
      kind: window_.kind,
      worst: 0,
      frames: 0,
      clientWidth: root.clientWidth,
      offenders: [],
      steps: 0,
      moved: 0,
    };
    results.push(result);
    const sample = async () => {
      if (await frame()) result.frames += 1;
      const overflow = root.scrollWidth - root.clientWidth;
      if (overflow > result.worst) {
        result.worst = overflow;
        result.clientWidth = root.clientWidth;
        result.offenders = offenders();
      }
    };
    const sampleFor = async (ms: number) => {
      const end = performance.now() + ms;
      while (performance.now() < end) await sample();
    };

    try {
      if (window_.kind === 'read') {
        await sample();
      } else if (window_.kind === 'settle') {
        await sampleFor(window_.ms);
      } else if (window_.kind === 'gsap') {
        window.dispatchEvent(new Event('scroll'));
        const deadline = performance.now() + gsapTimeoutMs;
        const marked = (name: string) => performance.getEntriesByName(name, 'mark').length > 0;
        result.gsap = 'pending';
        while (performance.now() < deadline) {
          await sample();
          if (marked(loadedMark)) result.gsap = 'loaded';
          else if (marked(failedMark)) result.gsap = 'failed';
          if (result.gsap !== 'pending') break;
        }
        if (result.gsap === 'loaded') await sampleFor(window_.ms);
      } else {
        const to = window_.to;
        const bottom = () => root.scrollHeight - window.innerHeight;
        const step = Math.max(1, Math.round(window.innerHeight * 0.75));
        const start = window.scrollY;
        const section =
          typeof to === 'object'
            ? document.querySelector(to.pastSectionOf)?.closest('section')
            : undefined;
        if (typeof to === 'object' && !section) {
          throw new Error(`no section holds ${to.pastSectionOf} on this page`);
        }
        if (to === 'top' && start <= 0 && bottom() > 0) {
          throw new Error(
            'the walk back up started at the top: the scroll that should have left the page ' +
              'lower down was undone, so nothing would be walked back',
          );
        }
        const arrived = () =>
          section
            ? section.getBoundingClientRect().bottom <= 0
            : to === 'bottom'
              ? window.scrollY >= bottom() - 1
              : window.scrollY <= 0;
        const down = to !== 'top';
        let undone = 0;
        while (!arrived()) {
          if (++result.steps > 400) {
            throw new Error(`did not arrive in 400 steps (at ${window.scrollY} of ${bottom()})`);
          }
          const before = window.scrollY;
          const next = down ? Math.min(before + step, bottom()) : Math.max(0, before - step);
          window.scrollTo({ top: next, behavior: 'instant' });
          await sample();
          await sample();
          const now = window.scrollY;
          if (down ? now < before : now > before) {
            // The browser put the scroll position back, which is not the page ending. Walk on
            // from where it is, a few times, then say what happened rather than blame the layout.
            if (++undone > 3) {
              throw new Error(
                `the scroll was undone ${undone} times, last ${before} -> ${now}: the browser ` +
                  'reset the scroll position, the page did not end',
              );
            }
          } else if (now === before) {
            throw new Error(
              typeof to === 'object'
                ? `the page ended at ${now}px before the section holding ${to.pastSectionOf} ` +
                    'left the viewport'
                : `the page stopped scrolling at ${now}px, short of ${to === 'top' ? 0 : bottom()}`,
            );
          }
        }
        result.moved = Math.abs(window.scrollY - start);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      break;
    }
  }
  return results;
}

/**
 * Measures the windows in order, in one evaluate, and returns what each saw. Asserts nothing about
 * overflow: pass each result to `expectNoOverflow`. A `gsap` window that did not see GSAP arrive
 * fails here, with `expectGsapLoaded`'s message.
 */
export async function measureOverflow(
  page: Page,
  windows: OverflowWindow[],
): Promise<OverflowResult[]> {
  const results = await page.evaluate(measureInPage, {
    windows,
    loadedMark: GSAP_LOADED_MARK,
    failedMark: GSAP_FAILED_MARK,
    gsapTimeoutMs: GSAP_SETTLE_TIMEOUT_MS,
  });
  if (results.some((result) => result.gsap !== undefined && result.gsap !== 'loaded')) {
    await expectGsapLoaded(page);
    throw new Error('GSAP arrived only after its sampling window had ended');
  }
  return results;
}

/**
 * Fails, softly so the run goes on to the next window or route, when a window saw any overflow or
 * read too few frames to have looked, and hard when a window could not finish. `where` names the
 * page. The overflow is checked first: a window that saw it has failed however few frames it read.
 */
export function expectNoOverflow(results: OverflowResult[], where: string) {
  for (const seen of results) {
    expect
      .soft(
        seen.worst,
        `${where} overflowed its ${seen.clientWidth}px viewport by up to ${seen.worst}px ` +
          `${seen.label}. Reaching past the right edge on that frame:\n${seen.offenders.join('\n')}`,
      )
      .toBe(0);
    // A read or a walk is measured whether or not a frame arrived: only a time-based window can
    // have been starved into looking at nothing.
    const minFrames = seen.kind === 'settle' || seen.kind === 'gsap' ? MIN_FRAMES : 0;
    expect
      .soft(seen.frames, `${where} ${seen.label}: only ${seen.frames} animation frames were read`)
      .toBeGreaterThanOrEqual(minFrames);
    if (seen.error) throw new Error(`${where} ${seen.label}: ${seen.error}`);
  }
}

/**
 * Asserts the page really runs under `motion`, after `page.emulateMedia` and a navigation.
 * Playwright ignores an unknown media option silently, and a run under the wrong preference passes
 * for the wrong reason: under `reduce` every story phase returns early, so no from-state or reverse
 * is ever rendered, and with motion allowed a `reduce` branch is never laid out.
 */
export async function expectMotion(page: Page, motion: 'no-preference' | 'reduce') {
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    `this run is meant to measure the page under prefers-reduced-motion: ${motion}`,
  ).toBe(motion === 'reduce');
}

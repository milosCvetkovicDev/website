import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap } from '../gsap-runtime';
import { requestGsap } from '../load-gsap';
import { AnimatedText } from '../animated-text';

/**
 * `AnimatedText`'s fourteen hover variants, characterised before any of them changes (#47, AC 13).
 *
 * #47 rewrites `animated-text.tsx`: it gives the split headings a word-level accessible name, makes
 * the hover inert under reduced motion, and folds the fourteen copies of one split-and-cleanup
 * scaffold into a shared component and hook. This table pins what a visitor sees today, so it has to
 * pass unchanged on both sides of that refactor. It therefore asserts on state, never on which GSAP
 * calls built it or in what order:
 *
 * - a hover changes what is drawn, so no variant passes by doing nothing;
 * - once the pointer has left and the effect has run to completion, the text reads as it did before,
 *   the markup is back as it was, and no element keeps an inline transform or opacity that moves,
 *   turns, scales or fades it;
 * - after unmount no tween is left on any element the effect could have animated, and none on
 *   anything else either (three variants tween a plain object rather than an element).
 *
 * One mount per variant walks the whole lifecycle, because every tween reads its start value through
 * jsdom's `getComputedStyle` and a mount per assertion would multiply that cost. The unmount comes
 * after the hover has finished, so it pins that nothing is left running, not that the cleanup stops a
 * hover in flight: `magnetic` has no unmount cleanup today, and an unmount mid-hover leaves its tween
 * live, so that step belongs with the change that gives every variant one shared cleanup.
 */

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-runtime registers it at
// import time, so the stub must exist before the imports above are evaluated. Motion is allowed:
// what the variants do under `reduce` belongs to the rows that make them inert there.
const media = vi.hoisted(() => {
  type Listener = (event: MediaQueryListEvent) => void;
  const listeners = new Set<Listener>();
  const state = { reduce: false, listenerCount: () => listeners.size };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const reducedMotionQuery = query === '(prefers-reduced-motion: reduce)';
      return {
        get matches() {
          return reducedMotionQuery && state.reduce;
        },
        media: query,
        addEventListener(type: string, listener: Listener) {
          if (reducedMotionQuery && type === 'change') listeners.add(listener);
        },
        removeEventListener(_type: string, listener: Listener) {
          listeners.delete(listener);
        },
      };
    },
  });
  return state;
});

// Registering ScrollTrigger schedules a refresh, which restores the scroll position through
// window.scrollTo, and jsdom does not implement it: the call would build an Error and print its stack
// through the virtual console. beforeAll runs that refresh before any walk, so a no-op is defined for
// the file's whole lifetime rather than per test.
vi.hoisted(() => {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

type Animation = ComponentProps<typeof AnimatedText>['animation'];

/**
 * Every variant, with what its hover does. A `Record` over the prop's union has to name each member
 * exactly once, so a variant added to or removed from `AnimationType` fails the typecheck here until
 * this table follows it.
 */
const VARIANTS: Record<Animation, string> = {
  scramble: 'shuffles the characters, then reveals them left to right',
  wave: 'bobs each letter up and down in turn',
  magnetic: 'pulls the text towards the pointer, then springs back',
  scatter: 'throws the letters outward, then pulls them back',
  glitch: 'shakes the text with offset copies',
  typewriter: 'retypes the text one character at a time',
  elastic: 'squashes and stretches the text',
  'stagger-up': 'slides each letter out and back in',
  rainbow: 'recolours and grows each letter in turn',
  perspective: 'flips the text over in 3D',
  gravity: 'drops the letters and bounces them back',
  'blur-reveal': 'blurs the text, then sharpens it',
  highlight: 'sweeps a highlight across the text',
  morse: 'blinks the letters in a morse-like pattern',
};

const ANIMATIONS = Object.keys(VARIANTS) as Animation[];

/** Three words, so the variants that split per letter also render their whitespace spans. */
const TEXT = 'Ship it twice';

/** Long enough into a hover that every variant has visibly started, and none has finished. */
const MID_HOVER_SECONDS = 0.1;
/** Well past the longest variant (morse, about 0.9 s on `TEXT`). */
const SETTLE_SECONDS = 5;

/**
 * The text a sighted visitor reads, which is every text node under the hover target today. When the
 * split variants gain a visually hidden copy for assistive technology, this is the one place that
 * learns to skip it.
 */
function visibleText(root: Element): string {
  return root.textContent ?? '';
}

/**
 * Whether an inline `transform` draws the element exactly where and how it would be without one.
 * GSAP does not clear the property when a tween returns to rest: it writes the identity out, as
 * `translate(0, 0)`, so both an empty value and a list of identity functions (`translate`, `rotate`,
 * `skew` at zero, `scale` at one, in any of their forms) count as no transform.
 */
function isIdentityTransform(transform: string): boolean {
  if (transform === '' || transform === 'none') return true;
  const transformFunction = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
  // Anything but a list of functions, such as a keyword or a variable, is not known to be identity.
  if (transform.replace(transformFunction, '').trim() !== '') return false;
  return [...transform.matchAll(transformFunction)].every(([, name, args]) => {
    const values = args.split(',').map((arg) => parseFloat(arg));
    if (values.some(Number.isNaN)) return false;
    if (/^scale/.test(name)) return values.every((value) => value === 1);
    if (/^(translate|rotate|skew)/.test(name)) return values.every((value) => value === 0);
    return false;
  });
}

/** The inline transforms and opacities under `root`, itself included, that are not at rest. */
function residue(root: HTMLElement): string[] {
  return [root, ...root.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
    const { transform, opacity } = element.style;
    const left: string[] = [];
    if (!isIdentityTransform(transform)) left.push(`transform: ${transform}`);
    if (opacity !== '' && opacity !== '1') left.push(`opacity: ${opacity}`);
    return left.map((declaration) => `<${element.tagName.toLowerCase()}> ${declaration}`);
  });
}

/**
 * The rendered markup without inline styles, which `residue` judges instead: what the hover adds for
 * its duration, such as the typewriter's cursor and hidden remainder, the glitch's copies or the
 * highlight's sweep, has to be gone again once it has finished.
 */
function markup(root: Element): string {
  const copy = root.cloneNode(true) as Element;
  [copy, ...copy.querySelectorAll('[style]')].forEach((element) =>
    element.removeAttribute('style'),
  );
  return copy.outerHTML;
}

/** Every tween, delayed call and timeline GSAP is still running, wherever it is nested. */
const liveAnimations = () => gsap.globalTimeline.getChildren(true, true, true);

/** Renders every GSAP tween as if `seconds` had elapsed; the ticker is detached in beforeEach. */
function elapse(seconds: number) {
  act(() => {
    gsap.updateRoot(gsap.globalTimeline.time() + seconds);
  });
}

describe('AnimatedText', () => {
  // The hover handlers ask load-gsap.ts for GSAP, which arrives on the visitor's first intent.
  // Requested outright and waited for once: from then on a hover plays synchronously, as it does in
  // the browser once GSAP has arrived.
  beforeAll(async () => {
    await requestGsap();
    // ScrollTrigger's start-up delayed calls, its first refresh among them, run now rather than in
    // the middle of the first walk.
    gsap.updateRoot(gsap.globalTimeline.time() + SETTLE_SECONDS);
  });

  beforeEach(() => {
    media.reduce = false;
    // Drive GSAP by hand instead of from requestAnimationFrame, so every hover is deterministic.
    gsap.ticker.remove(gsap.updateRoot);
    // Scatter, glitch, gravity, morse and scramble draw from Math.random: pin it, so every run
    // animates the same way and the mid-hover check never meets a letter that has not moved yet.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
  });

  afterEach(() => {
    cleanup();
    gsap.ticker.add(gsap.updateRoot);
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  it('lists every variant of the animation prop', () => {
    expect(ANIMATIONS).toHaveLength(14);
  });

  it.each(ANIMATIONS)(
    '%s: a hover plays, the text comes back whole and unmoved, and unmount leaves no tween',
    (animation) => {
      // Whatever GSAP is already running belongs to something else; the checks below look past it.
      const running = new Set(liveAnimations());
      const startedHere = () => liveAnimations().filter((live) => !running.has(live));

      const { container, unmount } = render(
        <AnimatedText animation={animation}>{TEXT}</AnimatedText>,
      );
      // The element carrying the hover handlers is the one the component renders; found by
      // position, not by a class or tag, both of which #47 changes.
      const root = container.firstElementChild as HTMLElement;
      const atRest = root.outerHTML;
      const restingMarkup = markup(root);
      expect(visibleText(root)).toBe(TEXT);

      // Every element seen during the walk, so that unmount can check each one GSAP could target.
      const seen = new Set<Element>();
      const collect = () => [root, ...root.querySelectorAll('*')].forEach((el) => seen.add(el));
      collect();

      // The pointer enters and moves: only magnetic follows the move, and the others ignore it.
      fireEvent.mouseEnter(root);
      fireEvent.mouseMove(root, { clientX: 100, clientY: 50 });
      elapse(MID_HOVER_SECONDS);
      collect();
      expect(root.outerHTML, `${VARIANTS[animation]}: the hover changed nothing`).not.toBe(atRest);

      fireEvent.mouseLeave(root);
      elapse(SETTLE_SECONDS);
      collect();
      expect(visibleText(root)).toBe(TEXT);
      expect(markup(root), 'markup left behind after the hover').toBe(restingMarkup);
      expect(residue(root), 'inline styles left behind after the hover').toEqual([]);

      unmount();
      const tweened = [...seen].filter((el) => gsap.getTweensOf(el).length > 0);
      expect(tweened, 'elements still tweened after unmount').toEqual([]);
      expect(startedHere(), 'animations still running after unmount').toEqual([]);
    },
  );
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap } from '../gsap-runtime';
import { LOAD_TIMEOUT_MS, requestGsap } from '../load-gsap';
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
 * - a hover changes what is drawn and is still running a moment in, so no variant passes by doing
 *   nothing;
 * - once the pointer has left and the effect has run to completion, the text reads as it did before,
 *   the markup is back as it was, and every inline style is either the one the element rested with
 *   or a value that draws it exactly as no declaration would (`isNeutral`);
 * - the same holds when the pointer stays until the effect has finished, and after a burst of quick
 *   enters and leaves that re-enters every effect mid-flight;
 * - after unmount no tween is left on any element the effect could have animated, and none on
 *   anything else either (three variants tween a plain object rather than an element), whether the
 *   hover had finished or was still in flight. `magnetic`'s mid-hover row was an expected failure,
 *   with no unmount cleanup, until #47's shared hover hook (slice 47k) gave it one.
 *
 * Two more tables pin what #47's slice 47d added (AC 3 and AC 4): a heading around any variant is
 * named for its sentence, at rest and mid-hover, and under `prefers-reduced-motion: reduce` the
 * markup is the same while a hover or a pointer move starts nothing and moves nothing.
 *
 * Each row walks one mount through its lifecycle, because every tween reads its start value through
 * jsdom's `getComputedStyle` and a mount per assertion would multiply that cost.
 */

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-runtime registers it at
// import time, so the stub must exist before the imports above are evaluated. Motion is allowed
// unless a row turns the preference on, before its mount (`media.reduce`) or after it
// (`media.set`, which notifies the listeners `usePrefersReducedMotion` subscribed). Every
// subscription is recorded with its query and type, through either API, and only an exact match
// removes one, so a listener leaked on any query is counted. ScrollTrigger holds one for the page's
// lifetime, on `(orientation: portrait)` through the legacy `addListener`, so each test checks the
// count against the one it started with.
const media = vi.hoisted(() => {
  type Listener = (event: MediaQueryListEvent) => void;
  type Subscription = { query: string; type: string; listener: Listener };
  const subscriptions: Subscription[] = [];
  const find = (query: string, type: string, listener: Listener) =>
    subscriptions.findIndex((s) => s.query === query && s.type === type && s.listener === listener);
  const subscribe = (query: string, type: string, listener: Listener) => {
    if (find(query, type, listener) === -1) subscriptions.push({ query, type, listener });
  };
  const unsubscribe = (query: string, type: string, listener: Listener) => {
    const index = find(query, type, listener);
    if (index !== -1) subscriptions.splice(index, 1);
  };
  const state = {
    reduce: false,
    listenerCount: () => subscriptions.length,
    /** Changes the reduced-motion preference and tells every listener, as the browser would. */
    set(reduce: boolean) {
      state.reduce = reduce;
      const query = '(prefers-reduced-motion: reduce)';
      subscriptions
        .filter((s) => s.query === query && s.type === 'change')
        .forEach((s) => s.listener({ matches: reduce, media: query } as MediaQueryListEvent));
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query === '(prefers-reduced-motion: reduce)' && state.reduce;
      },
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: Listener) => subscribe(query, type, listener),
      removeEventListener: (type: string, listener: Listener) => unsubscribe(query, type, listener),
      addListener: (listener: Listener) => subscribe(query, 'change', listener),
      removeListener: (listener: Listener) => unsubscribe(query, 'change', listener),
    }),
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
  glitch: 'shakes the text with token-coloured offsets',
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

/** One frame at 60 Hz: `elapse` steps GSAP frame by frame, as the browser's ticker would. */
const FRAME_SECONDS = 1 / 60;
/** Long enough into a hover that every variant has visibly started, and none has finished. */
const MID_HOVER_SECONDS = 0.1;
/** Well past the longest variant (morse, about 0.9 s on `TEXT`). */
const SETTLE_SECONDS = 5;
/** A quick enter or leave, shorter than every variant, so the next event lands mid-effect. */
const FLICK_SECONDS = 0.05;

/**
 * The hover target's box. jsdom lays nothing out, so every box is empty at (0, 0); magnetic aims from
 * the box's centre, (100, 20) here, and the pointer below sits off it on both axes.
 */
const BOX = { x: 40, y: 10, width: 120, height: 20 };
const POINTER = { clientX: 160, clientY: 30 };

/**
 * Math.random for the rows that repeat a hover: boundary values and both sides of every `> 0.5`
 * branch (morse's pattern, glitch's direction), and a different value for each letter in turn, so
 * scatter, gravity and scramble do not move every letter alike.
 */
const RANDOM_SEQUENCE = [0, 0.75, 0.9999999, 0.5, 0.25];

/**
 * The text a sighted visitor reads: every text node under the hover target except the visually
 * hidden copy (`sr-only`) the split, scramble and typewriter variants carry for assistive technology.
 */
function visibleText(root: Element): string {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
}

/**
 * Whether an inline `transform` draws the element exactly where and how it would be without one.
 * GSAP does not clear the property when a tween returns to rest: it writes the identity out, as
 * `translate(0, 0)`, so both an empty value and a list of identity functions count as no transform:
 * `translate`, `rotate` and `skew` at zero and `scale` at one in any of their forms, `matrix` and
 * `matrix3d` as the identity matrix, and `perspective`, which only changes points off the element's
 * plane and so none of an otherwise untransformed element. A function whose arguments nest another
 * function (`calc()`, `var()`), a keyword or a variable is not known to be identity, so it is
 * reported rather than passed.
 */
function isIdentityTransform(transform: string): boolean {
  if (transform === '' || transform === 'none') return true;
  const transformFunction = /([a-zA-Z0-9]+)\(([^()]*)\)/g;
  if (transform.replace(transformFunction, '').trim() !== '') return false;
  return [...transform.matchAll(transformFunction)].every(([, name, args]) => {
    const values = args.split(',').map((arg) => parseFloat(arg));
    if (values.some(Number.isNaN)) return false;
    if (name === 'perspective') return true;
    if (name === 'matrix') return values.join() === '1,0,0,1,0,0';
    if (name === 'matrix3d') return values.join() === '1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1';
    if (/^scale/.test(name)) return values.every((value) => value === 1);
    if (/^(translate|rotate|skew)/.test(name)) return values.every((value) => value === 0);
    return false;
  });
}

/**
 * Whether an inline declaration draws the element exactly as no declaration would. These are the
 * rest values GSAP writes out instead of clearing a property: the identity transform, the
 * individual `translate`, `rotate` and `scale` at `none`, full opacity, an unblurred filter, and a
 * colour or visibility handed back to the parent with `inherit`, which is what both inherit anyway.
 */
function isNeutral(property: string, value: string): boolean {
  switch (property) {
    case 'transform':
      return isIdentityTransform(value);
    case 'translate':
    case 'rotate':
    case 'scale':
      return value === 'none';
    case 'opacity':
      return value === '1';
    case 'filter':
      return value === 'none' || /^blur\(0(px)?\)$/.test(value);
    case 'color':
    case 'visibility':
      return value === 'inherit';
    default:
      return false;
  }
}

/** Every element from `root` down, `root` first, in document order. */
function elementsOf(root: HTMLElement): HTMLElement[] {
  return [root, ...root.querySelectorAll<HTMLElement>('*')];
}

/** The inline declarations of each element under `root`, in document order. */
function inlineStyles(root: HTMLElement): Map<string, string>[] {
  return elementsOf(root).map((element) => {
    const { style } = element;
    return new Map(
      Array.from({ length: style.length }, (_, i) => {
        const property = style.item(i);
        return [property, style.getPropertyValue(property)] as const;
      }),
    );
  });
}

/**
 * The inline declarations under `root` that are neither what the element rested with nor neutral,
 * and the resting ones it has lost. Elements are paired with their resting selves by document order,
 * which `markup` has already checked is unchanged, so this holds even where React re-created a node.
 */
function residue(root: HTMLElement, resting: Map<string, string>[]): string[] {
  const elements = elementsOf(root);
  return inlineStyles(root).flatMap((declarations, index) => {
    const before = resting[index] ?? new Map<string, string>();
    const left: string[] = [];
    declarations.forEach((value, property) => {
      if (before.get(property) !== value && !isNeutral(property, value)) {
        left.push(`${property}: ${value}`);
      }
    });
    before.forEach((value, property) => {
      if (!declarations.has(property)) left.push(`${property}: ${value} (lost)`);
    });
    const tag = elements[index].tagName.toLowerCase();
    return left.map((declaration) => `<${tag}> ${declaration}`);
  });
}

/**
 * The rendered markup without inline styles, which `residue` judges instead: what the hover adds for
 * its duration, such as the typewriter's cursor and hidden remainder or the highlight's sweep, has
 * to be gone again once it has finished.
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

/**
 * Renders GSAP as if `seconds` had elapsed, one frame at a time, so every per-frame callback runs and
 * anything a callback starts is rendered on the frames after it. The ticker is detached in beforeAll.
 */
function elapse(seconds: number) {
  act(() => {
    const start = gsap.globalTimeline.time();
    const frames = Math.ceil(seconds / FRAME_SECONDS - 1e-9);
    for (let frame = 1; frame <= frames; frame++) {
      gsap.updateRoot(start + Math.min(frame * FRAME_SECONDS, seconds));
    }
  });
}

/**
 * Mounts one variant and returns what a walk needs: the hover target, with a real box, and checks
 * that remember everything the walk has seen and everything GSAP was already running. With
 * `inHeading` the variant sits inside an `<h2>`, as the story's closing headlines do.
 */
function mount(animation: Animation, { inHeading = false } = {}) {
  // Whatever GSAP is already running belongs to something else; the checks below look past it.
  const running = new Set(liveAnimations());
  const startedHere = () => liveAnimations().filter((live) => !running.has(live));

  const text = <AnimatedText animation={animation}>{TEXT}</AnimatedText>;
  const view = render(inHeading ? <h2>{text}</h2> : text);
  // The element carrying the hover handlers is the one the component renders; found by position,
  // not by a class or tag, both of which #47 changes.
  const root = inHeading
    ? view.container.firstElementChild?.firstElementChild
    : view.container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error(`${animation}: rendered no element`);
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect(BOX));

  const restingMarkup = markup(root);
  const restingStyles = inlineStyles(root);
  expect(visibleText(root)).toBe(TEXT);

  // Every element seen during the walk, so that unmount can check each one GSAP could target.
  const seen = new Set<Element>();
  const collect = () => elementsOf(root).forEach((el) => seen.add(el));
  collect();

  return {
    root,
    restingMarkup,
    startedHere,
    collect,
    enter() {
      fireEvent.mouseEnter(root);
      fireEvent.mouseMove(root, POINTER);
      collect();
    },
    leave() {
      fireEvent.mouseLeave(root);
      collect();
    },
    /** Lets every effect run out, then checks that nothing the hover did is left on the page. */
    expectBackAtRest(after: string) {
      elapse(SETTLE_SECONDS);
      this.expectAtRestNow(after);
    },
    /** Checks, without letting any time pass, that nothing the hover did is left on the page. */
    expectAtRestNow(after: string) {
      collect();
      expect(visibleText(root), `text after ${after}`).toBe(TEXT);
      expect(markup(root), `markup left behind after ${after}`).toBe(restingMarkup);
      expect(residue(root, restingStyles), `inline styles left behind after ${after}`).toEqual([]);
    },
    /** Unmounts, then checks that no tween outlives the component. */
    expectNothingLiveAfterUnmount() {
      collect();
      view.unmount();
      const tweened = [...seen].filter((el) => gsap.getTweensOf(el).length > 0);
      expect(tweened, 'elements still tweened after unmount').toEqual([]);
      expect(startedHere(), 'animations still running after unmount').toEqual([]);
    },
  };
}

describe('AnimatedText', () => {
  // The hover handlers ask load-gsap.ts for GSAP, which arrives on the visitor's first intent.
  // Requested outright and waited for once: from then on a hover plays synchronously, as it does in
  // the browser once GSAP has arrived. The path where a hover lands before GSAP, or GSAP never
  // arrives, is lazy-gsap.test.tsx's and lazy-gsap-failure.test.tsx's. The hook's deadline is the
  // loader's own, so a stalled import fails with the loader's error rather than a generic timeout.
  beforeAll(async () => {
    // Drive GSAP by hand instead of from requestAnimationFrame, so every hover is deterministic.
    // Detached for the whole file: re-attached between tests, the ticker would render the root at
    // wall-clock time, seconds behind the time the walks have moved it to.
    gsap.ticker.remove(gsap.updateRoot);
    await requestGsap();
    // ScrollTrigger's start-up delayed calls, its first refresh among them, run now rather than in
    // the middle of the first walk.
    gsap.updateRoot(gsap.globalTimeline.time() + SETTLE_SECONDS);
  }, LOAD_TIMEOUT_MS + 1_000);

  afterAll(() => {
    gsap.ticker.add(gsap.updateRoot);
  });

  let subscriptionsBefore = 0;

  beforeEach(() => {
    media.reduce = false;
    subscriptionsBefore = media.listenerCount();
    // Scatter, glitch, gravity, morse and scramble draw from Math.random: pin it, so every run
    // animates the same way and the mid-hover check never meets a letter that has not moved yet.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
  });

  afterEach(() => {
    try {
      cleanup();
    } finally {
      vi.restoreAllMocks();
    }
    // Asserted last: a throw here must not skip the restoration above it.
    expect(media.listenerCount(), 'matchMedia listeners left behind').toBe(subscriptionsBefore);
  });

  it('lists every variant of the animation prop', () => {
    expect(ANIMATIONS).toHaveLength(14);
  });

  it.each(ANIMATIONS)(
    '%s: a hover plays, the text comes back whole and unmoved, and unmount leaves no tween',
    (animation) => {
      const walk = mount(animation);
      const atRest = walk.root.outerHTML;

      walk.enter();
      elapse(MID_HOVER_SECONDS);
      walk.collect();
      expect(walk.root.outerHTML, `${VARIANTS[animation]}: the hover changed nothing`).not.toBe(
        atRest,
      );
      expect(walk.startedHere(), 'the hover had already finished').not.toEqual([]);
      expect(walk.root.outerHTML, 'a style was computed from nothing').not.toMatch(/NaN|Infinity/);

      walk.leave();
      walk.expectBackAtRest('the hover');
      walk.expectNothingLiveAfterUnmount();
    },
  );

  it.each(ANIMATIONS)(
    '%s: a hover held to the end, and hovers re-entered mid-effect, also come back to rest',
    (animation) => {
      let draw = 0;
      vi.mocked(Math.random).mockImplementation(
        () => RANDOM_SEQUENCE[draw++ % RANDOM_SEQUENCE.length],
      );
      const walk = mount(animation);

      // The pointer stays until the effect has run out, then leaves.
      walk.enter();
      elapse(SETTLE_SECONDS);
      walk.leave();
      walk.expectBackAtRest('a hover held to the end');

      // Quick passes over the text: each enter lands while the last effect is still running.
      for (let pass = 0; pass < 3; pass++) {
        walk.enter();
        elapse(FLICK_SECONDS);
        walk.leave();
        elapse(FLICK_SECONDS);
      }
      walk.enter();
      elapse(MID_HOVER_SECONDS);
      walk.leave();
      walk.expectBackAtRest('hovers re-entered mid-effect');

      walk.expectNothingLiveAfterUnmount();
    },
  );

  /** Unmounts while the hover is still playing: the component's cleanup has to stop it. */
  function unmountMidHover(animation: Animation) {
    const walk = mount(animation);
    walk.enter();
    elapse(MID_HOVER_SECONDS);
    expect(walk.startedHere(), 'the hover had already finished').not.toEqual([]);
    walk.expectNothingLiveAfterUnmount();
  }

  it.each(ANIMATIONS)('%s: an unmount mid-hover leaves no tween', unmountMidHover);

  // New text on a mounted variant: what a sighted visitor reads and what the visually hidden copy
  // says must agree, and a hover must play the new text and come back to it.
  it.each(ANIMATIONS)('%s: new text replaces the old one everywhere it is drawn', (animation) => {
    const NEXT = 'Ship it once more';
    const view = render(<AnimatedText animation={animation}>{TEXT}</AnimatedText>);
    view.rerender(<AnimatedText animation={animation}>{NEXT}</AnimatedText>);
    const root = view.container.firstElementChild;
    if (!(root instanceof HTMLElement)) throw new Error(`${animation}: rendered no element`);
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect(BOX));
    const hidden = root.querySelector('.sr-only');

    expect(visibleText(root), 'the visible text').toBe(NEXT);
    if (hidden) expect(hidden.textContent, 'the visually hidden copy').toBe(NEXT);
    expect(root.querySelector('.animate-pulse'), 'a caret left at rest').toBeNull();
    fireEvent.mouseEnter(root);
    fireEvent.mouseMove(root, POINTER);
    elapse(SETTLE_SECONDS);
    fireEvent.mouseLeave(root);
    elapse(SETTLE_SECONDS);
    expect(visibleText(root), 'the visible text after a hover').toBe(NEXT);
    expect(root.querySelector('.animate-pulse'), 'a caret left typing').toBeNull();
    view.unmount();
  });

  // A character outside the Basic Multilingual Plane is two UTF-16 code units: split between them,
  // each half would be drawn as a replacement glyph beside a hidden copy that reads correctly.
  it.each(['wave', 'scatter', 'scramble'] as const)(
    '%s: a character outside the BMP is drawn whole, at rest and after a hover, and hovers replay',
    (animation) => {
      const ROCKET = 'Ship \u{1F680}';
      const view = render(<AnimatedText animation={animation}>{ROCKET}</AnimatedText>);
      const root = view.container.firstElementChild;
      if (!(root instanceof HTMLElement)) throw new Error(`${animation}: rendered no element`);
      const loneSurrogate =
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
      const drawn = () =>
        [...root.querySelectorAll('[aria-hidden="true"] *, [aria-hidden="true"]')].map(
          (el) => el.textContent ?? '',
        );
      expect(visibleText(root)).toBe(ROCKET);
      expect(
        drawn().filter((text) => loneSurrogate.test(text)),
        'half a character',
      ).toEqual([]);

      fireEvent.mouseEnter(root);
      elapse(SETTLE_SECONDS);
      fireEvent.mouseLeave(root);
      elapse(SETTLE_SECONDS);
      expect(visibleText(root)).toBe(ROCKET);

      // Scatter counts its letters to know when it has finished: counted differently from the
      // split, its busy flag would never clear and the next hover would do nothing.
      const atRest = root.outerHTML;
      fireEvent.mouseEnter(root);
      elapse(MID_HOVER_SECONDS);
      expect(root.outerHTML, 'the second hover changed nothing').not.toBe(atRest);
      elapse(SETTLE_SECONDS);
      view.unmount();
    },
  );

  describe('accessible names (#47, AC 3)', () => {
    // jsdom has no Tailwind, so it would lay every letter span out inline and name a heading from the
    // letters run together, which happens to read as the sentence. A browser lays each letter out as
    // an `inline-block`, and the accessible name computation puts a space around every box that is
    // not inline: Chromium named the story's split h2s `M o s t b u g s …` (#43, R14). These are
    // Tailwind's rules for the two classes the name depends on, so jsdom computes the same `display`.
    let tailwind: HTMLStyleElement;
    beforeAll(() => {
      tailwind = document.createElement('style');
      tailwind.textContent =
        '.inline-block { display: inline-block; } ' +
        '.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; ' +
        'overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0; }';
      document.head.append(tailwind);
    });
    afterAll(() => tailwind.remove());

    it.each(ANIMATIONS)(
      '%s: a heading around it is named for its sentence, at rest and mid-hover',
      (animation) => {
        const walk = mount(animation, { inHeading: true });
        const heading = walk.root.parentElement;
        // By name, on purpose: the accessible name is what this row is about.
        expect(screen.getByRole('heading', { level: 2, name: TEXT }), 'at rest').toBe(heading);

        walk.enter();
        elapse(MID_HOVER_SECONDS);
        expect(walk.startedHere(), 'the hover had already finished').not.toEqual([]);
        expect(screen.getByRole('heading', { level: 2, name: TEXT }), 'mid-hover').toBe(heading);

        walk.leave();
        walk.expectBackAtRest('the hover');
        walk.expectNothingLiveAfterUnmount();
      },
    );
  });

  describe('under prefers-reduced-motion: reduce (#47, AC 4)', () => {
    /** What a mount renders with motion allowed, for the mount under `reduce` to match. */
    function markupWithMotion(animation: Animation): string {
      const view = render(<AnimatedText animation={animation}>{TEXT}</AnimatedText>);
      const html = view.container.innerHTML;
      view.unmount();
      return html;
    }

    /**
     * Enters, moves over and leaves the text, and checks that none of it started an animation or
     * changed anything drawn: no transform, opacity, colour, text or node, inline styles included.
     */
    function expectInert(walk: ReturnType<typeof mount>, when: string) {
      const before = walk.root.outerHTML;
      walk.enter();
      elapse(MID_HOVER_SECONDS);
      expect(walk.startedHere(), `a hover ${when} started an animation`).toEqual([]);
      expect(walk.root.outerHTML, `a hover ${when} changed what is drawn`).toBe(before);
      walk.leave();
      elapse(SETTLE_SECONDS);
      expect(walk.startedHere(), `a leave ${when} started an animation`).toEqual([]);
      expect(walk.root.outerHTML, `a leave ${when} changed what is drawn`).toBe(before);
    }

    it.each(ANIMATIONS)(
      '%s: renders the same markup, and a hover or a pointer move starts nothing',
      (animation) => {
        const withMotion = markupWithMotion(animation);
        media.reduce = true;
        const walk = mount(animation);
        // The preference reads `false` during hydration (ADR 0006), so markup that depended on it
        // would be rewritten right after hydration, and the scrolled axe pass would count less.
        expect(walk.root.parentElement?.innerHTML, 'the markup depends on the preference').toBe(
          withMotion,
        );
        expectInert(walk, 'under reduce');
        walk.expectNothingLiveAfterUnmount();
      },
    );

    it.each(ANIMATIONS)(
      '%s: a preference switched on after mount makes the next hover inert',
      (animation) => {
        const walk = mount(animation);
        act(() => media.set(true));
        expect(markup(walk.root), 'the markup changed with the preference').toBe(
          walk.restingMarkup,
        );
        expectInert(walk, 'after the preference was switched on');
        walk.expectNothingLiveAfterUnmount();
      },
    );

    // A hover already playing when the preference is switched on stops at once, back at rest, rather
    // than playing on for up to a second (scatter, gravity, morse, the typewriter) after the visitor
    // asked for less motion. At rest means the text, the markup and the inline styles, so the
    // rainbow's letter colours are cleared as well; magnetic's own pull is the row below.
    it.each(ANIMATIONS)(
      '%s: a preference switched on mid-hover stops the hover at once, back at rest',
      (animation) => {
        const walk = mount(animation);
        walk.enter();
        elapse(MID_HOVER_SECONDS);
        expect(walk.startedHere(), 'the hover had already finished').not.toEqual([]);

        act(() => media.set(true));
        expect(walk.startedHere(), 'the hover played on under reduce').toEqual([]);
        walk.expectAtRestNow('the preference switched on mid-hover');

        walk.leave();
        walk.expectBackAtRest('the leave under reduce');
        walk.expectNothingLiveAfterUnmount();
      },
    );

    // `usePrefersReducedMotion` reads `false` until hydration has finished (ADR 0006), and a store
    // that has not been told of a change keeps its old value. A hover in that window is inert too:
    // the handlers read the preference from the browser as well.
    it.each(ANIMATIONS)(
      '%s: a hover is inert when the browser reports reduce before the hook has caught up',
      (animation) => {
        const walk = mount(animation);
        // Changed without telling the listeners, so the hook still returns `false`.
        media.reduce = true;
        expectInert(walk, 'before the hook caught up');
        walk.expectNothingLiveAfterUnmount();
      },
    );

    // The one variant whose rest depends on a later event: its leave is what brings the text back.
    // Gated under `reduce` like every other handler, it would strand text the pointer had pulled
    // before the preference changed, so the change itself puts the text back.
    it('magnetic: a preference switched on mid-pull puts the text back, and the leave starts nothing', () => {
      const walk = mount('magnetic');
      walk.enter();
      elapse(SETTLE_SECONDS);
      const text = walk.root.firstElementChild;
      if (!(text instanceof HTMLElement)) throw new Error('magnetic: no text span');
      expect(isIdentityTransform(text.style.transform), 'the pointer did not pull the text').toBe(
        false,
      );

      act(() => media.set(true));
      walk.leave();
      expect(walk.startedHere(), 'the leave started an animation under reduce').toEqual([]);
      expect(
        isIdentityTransform(text.style.transform),
        `the text was left at ${text.style.transform}`,
      ).toBe(true);
      walk.expectBackAtRest('the preference switched on mid-pull');
      walk.expectNothingLiveAfterUnmount();
    });
  });
});

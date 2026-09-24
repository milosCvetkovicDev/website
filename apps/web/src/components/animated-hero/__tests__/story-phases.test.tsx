import { act, cleanup, render, screen } from '@testing-library/react';
import { useLayoutEffect, type ComponentType } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gsapRuntime from '../gsap-runtime';
import { gsap, ScrollTrigger } from '../gsap-runtime';
import { loadGsap, runWithGsap, type GsapRuntime } from '../load-gsap';
import { DiscoveryPhase } from '../discovery-phase';
import { StrategyPhase } from '../strategy-phase';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { LoopPhase } from '../loop-phase';
import { GameComplete } from '../game-complete';
import { cssTransitions, gsapCssConflicts, tweenedElements } from './gsap-css-conflicts';

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-runtime registers it
// at import time, so the stub must exist before the imports above are evaluated.
const media = vi.hoisted(() => {
  type Listener = (event: MediaQueryListEvent) => void;
  const listeners = new Set<Listener>();
  const state = {
    reduce: false,
    /** Flips the preference and notifies subscribers, as the OS toggle would. */
    set(reduce: boolean) {
      state.reduce = reduce;
      listeners.forEach((listener) => listener({ matches: reduce } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
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

// runWithGsap passes through to the real loader, so a test can hold the builds a mount asks for and
// run them itself, as GSAP arriving at a moment of its choosing would.
vi.mock('../load-gsap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../load-gsap')>();
  return { ...actual, runWithGsap: vi.fn(actual.runWithGsap) };
});

// The phases do not import GSAP: they ask load-gsap.ts for it, which fetches it once the browser is
// idle after hydration. Every test here is about what a phase does with GSAP, so the file waits for
// that load once, with real timers, before any test installs fake ones. From then on each phase
// builds its timeline synchronously on mount, as it does in the browser once GSAP has arrived. A
// phase mounted before the load is lazy-gsap.test.tsx's subject.
beforeAll(async () => {
  await loadGsap();
});

// All six story sections, so the shared lifecycle below covers every one of them. LoopPhase was the
// one omission: its own defects are pinned in `loop-phase.test.tsx` (rows R20 and R21), and this list
// is what says its build/teardown/rebuild behaves like its five siblings'.
const phases = [
  { name: 'DiscoveryPhase', Phase: DiscoveryPhase },
  { name: 'StrategyPhase', Phase: StrategyPhase },
  { name: 'ExecutionPhase', Phase: ExecutionPhase },
  { name: 'GauntletPhase', Phase: GauntletPhase },
  { name: 'LoopPhase', Phase: LoopPhase },
  { name: 'GameComplete', Phase: GameComplete },
];

/** Ticks GSAP from the layout phase of the commit that mounts it. */
function TickGsapOnMount() {
  useLayoutEffect(() => {
    gsap.ticker.tick();
  }, []);
  return null;
}

/**
 * The phase, or in its place a GSAP tick. Swapping one for the other in a single render reproduces
 * a soft navigation away from `/`: React detaches the phase's refs in that commit and ticks GSAP in
 * its layout phase, before the phase's passive effect cleanup runs.
 */
function PhaseOrTick({ Phase, show }: { Phase: ComponentType; show: boolean }) {
  return show ? <Phase /> : <TickGsapOnMount />;
}

/** Fires a phase's trigger again, as scrolling back above the section and down does. */
function enterAgain() {
  const trigger = ScrollTrigger.getAll().find((candidate) => candidate.vars.onEnter);
  trigger?.vars.onEnter?.(trigger);
}

describe.each(phases)('$name', ({ Phase }) => {
  beforeEach(() => {
    media.reduce = false;
    // jsdom lays nothing out, so every trigger starts in view and GauntletPhase schedules timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  it('creates no scroll animation under reduced motion', () => {
    media.reduce = true;
    render(<Phase />);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  // One mount, walked through the whole preference lifecycle, rather than four mounts asserting a
  // step each. Building the timeline is by far the most expensive thing these tests do -- GSAP
  // reads every tween's start value through getComputedStyle, and jsdom answers each read by
  // matching its user-agent stylesheet against the element, because the write GSAP makes right
  // after invalidates the document's style cache. Four mounts per phase cost five builds
  // between them; this costs two.
  //
  // It swaps which unmount is covered rather than adding one: the old tests unmounted a
  // first-generation context, this unmounts a rebuilt one. The first-generation teardown is still
  // exercised, by the switch to reduced motion -- React calls the same effect cleanup either way.
  //
  // The explicit timeout is the one place in the suite the 5s default is too tight. The test
  // itself takes ~0.5s, and 0.8s on a two-core CI runner, but it is the first GSAP mount in the
  // file and so also pays the worker's one-off JIT warm-up of GSAP, React and jsdom's CSS
  // cascade. On a developer machine running the suite across twelve workers, fifteen of which are
  // importing jsdom at once, that has been measured at 5.5s. Raising the global default would hide
  // a genuinely slow test appearing anywhere else in the suite.
  it('builds, tears down and rebuilds its scroll animations, and removes them on unmount', () => {
    // ScrollTrigger's registry is global, so a count only means anything from a clean start.
    expect(ScrollTrigger.getAll()).toHaveLength(0);

    const { unmount } = render(<Phase />);
    const built = ScrollTrigger.getAll().length;
    expect(built).toBeGreaterThan(0);

    act(() => media.set(true));
    expect(ScrollTrigger.getAll()).toHaveLength(0);

    act(() => media.set(false));
    // Exactly what it built the first time. A rebuild that stacked a second context on the first
    // would leak on every preference flip and still be "greater than zero".
    expect(ScrollTrigger.getAll()).toHaveLength(built);

    unmount();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  }, 15_000);

  // A soft navigation away from `/` removes the section in one commit. React detaches its refs in
  // that commit but runs this effect's cleanup a frame later, and a GSAP tick can land in between.
  // ScrollTrigger defers a timeline trigger's first refresh by 0.01 s, and GSAP runs the deferred
  // call inside the context that created it. So when GSAP had arrived just before the navigation,
  // that refresh ran with `sectionRef.current` already null, and a context scoped to the ref logged
  // "Invalid scope" (1 in 10 runs of the client-navigation walk).
  it('logs nothing when GSAP ticks after the commit that removes it', () => {
    // ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom
    // does not implement.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn');

    const { rerender } = render(<PhaseOrTick Phase={Phase} show />);
    // The deferred refresh is 0.01 s away in GSAP time, and GSAP's clock is the real Date.now it
    // captured at load, which fake timers do not move. Waiting 20 ms guarantees the tick fires it.
    const built = Date.now();
    while (Date.now() - built < 20) {
      // Busy-wait: nothing may run between the build and the swap.
    }
    rerender(<PhaseOrTick Phase={Phase} show={false} />);

    expect(warn).not.toHaveBeenCalled();
  });

  // The same frame from the other side: GSAP arrives after the commit that removed the section but
  // before the cleanup that would have cancelled the build, so the build finds its refs null. Each
  // build is held and its cancel does nothing, then run after the unmount has nulled the refs.
  it('builds nothing when GSAP arrives after the commit that removes it', () => {
    const held = vi.mocked(runWithGsap);
    const passThrough = held.getMockImplementation();
    const builds: ((runtime: GsapRuntime) => void)[] = [];
    held.mockImplementation((run) => {
      builds.push(run);
      return () => {};
    });
    const warn = vi.spyOn(console, 'warn');
    try {
      const { unmount } = render(<Phase />);
      unmount();
      expect(builds.length).toBeGreaterThan(0);
      for (const build of builds) build(gsapRuntime);
    } finally {
      // vi.restoreAllMocks() restores spies only, not a vi.fn's implementation.
      held.mockImplementation(passThrough!);
    }

    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

/** Long enough for every timer-driven sequence to create its last reveal: Gauntlet's runs 6.6 s. */
const WHOLE_SEQUENCE_MS = 10_000;
/** Just past the loop alert's pulse at 500 ms, while it still reads ERROR DETECTED. */
const EARLY_MS = 600;

// What each phase tweens that CSS used to fight, and must now leave alone: the discovery tags and the
// strategy tech cards (a transition and a hover transform each), the loop alert and the closing CTA
// (a transition each). Execution's commit-streak counter and Gauntlet's deploy panel never were;
// they are listed so the check is seen to pass elements that were always fine, and Gauntlet's also
// shows a transition on a child is fine. Each must be among the elements the check inspects, with
// exactly the properties listed, so the check cannot pass by inspecting nothing.
const tweenedTargets = [
  {
    name: 'DiscoveryPhase',
    Phase: DiscoveryPhase,
    targets: (root: HTMLElement) => [...root.querySelectorAll('.requirement-reveal')],
    count: 4,
    tweens: ['opacity', 'transform'],
  },
  {
    name: 'StrategyPhase',
    Phase: StrategyPhase,
    targets: (root: HTMLElement) => [...root.querySelectorAll('.tech-reveal')],
    count: 4,
    tweens: ['opacity', 'transform'],
  },
  {
    name: 'ExecutionPhase',
    Phase: ExecutionPhase,
    targets: () => [screen.getByText('COMMIT STREAK').parentElement],
    count: 1,
    tweens: ['opacity', 'transform'],
  },
  {
    name: 'GauntletPhase',
    Phase: GauntletPhase,
    targets: () => [screen.getByText('DEPLOYMENT SUCCESSFUL').closest('.mt-6')],
    count: 1,
    tweens: ['opacity', 'transform'],
  },
  {
    name: 'LoopPhase',
    Phase: LoopPhase,
    targets: () => [screen.getByText(/^(ERROR DETECTED|RESOLVED)$/).closest('.border')],
    count: 1,
    tweens: ['opacity', 'transform'],
  },
  {
    name: 'GameComplete',
    Phase: GameComplete,
    targets: () => [screen.getByRole('link', { name: /connect on linkedin/i })],
    count: 1,
    tweens: ['opacity', 'transform', 'box-shadow'],
  },
];

describe.each(tweenedTargets)('$name against CSS', ({ name, Phase, targets, count, tweens }) => {
  beforeEach(() => {
    media.reduce = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Nothing plays by itself, so no tween completes and leaves GSAP's timeline before it is read.
    gsap.ticker.remove(gsap.updateRoot);
    // ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom does
    // not implement.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      cleanup();
    } finally {
      // Restored even when an unmount throws, so the next test does not start with GSAP stopped.
      gsap.ticker.add(gsap.updateRoot);
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  it('leaves every property it tweens to GSAP: no CSS transition, animation or state rule on it', async () => {
    const warn = vi.spyOn(console, 'warn');
    const { container } = render(<Phase />);
    // Timeline-bound triggers measure on refresh; the timer-driven sequences then create their reveals.
    act(() => ScrollTrigger.refresh());
    act(() => vi.advanceTimersByTime(EARLY_MS));
    expect(await gsapCssConflicts(container), 'mid-sequence').toEqual([]);
    act(() => vi.advanceTimersByTime(WHOLE_SEQUENCE_MS - EARLY_MS));
    expect(vi.getTimerCount(), 'every scheduled step has run').toBe(0);

    const tweened = tweenedElements(container);
    const expected = targets(container);
    expect(expected).toHaveLength(count);
    for (const target of expected) {
      expect(target, `${name}: a target is missing`).not.toBeNull();
      expect(
        tweened.get(target as Element),
        `${name}: what GSAP tweens on ${target?.className}`,
      ).toEqual(new Set(tweens));
    }
    expect(await gsapCssConflicts(container), 'after the whole sequence').toEqual([]);
    // A target GSAP could not find is only a console warning.
    expect(warn.mock.calls.filter(([message]) => String(message).includes('GSAP'))).toEqual([]);

    if (name === 'GauntletPhase') {
      // The panel's child keeps the transition it always had; only the element GSAP writes matters.
      expect(await cssTransitions((expected[0] as Element).firstElementChild as Element)).toContain(
        'all',
      );
    }

    // And the check can fail on these very elements: the class this fix removed is flagged again.
    (expected[0] as Element).classList.add('transition-all');
    expect(await gsapCssConflicts(container)).toContainEqual(
      expect.stringMatching(/GSAP tweens \S+, which .*\.transition-all/),
    );
  });
});

// A phase built after the visitor has scrolled its section into view, because GSAP arrived late or
// a soft navigation back restored the scroll position, finishes its entrance at once: nothing the
// visitor is already reading is hidden behind a from-state (isAlreadyReached in load-gsap.ts). At
// the top of the page, where every build above happens, the entrances wait for the scroll.
describe.each(phases)('$name, built with its section already in view', ({ Phase }) => {
  let scrollY: PropertyDescriptor | undefined;

  beforeEach(() => {
    media.reduce = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // jsdom lays nothing out: scrolled two screens down, with every box's top on screen.
    scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 2400 });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 120, width: 1024, height: 900 }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (scrollY) Object.defineProperty(window, 'scrollY', scrollY);
    else delete (window as { scrollY?: number }).scrollY;
  });

  it('finishes its entrance instead of hiding the section', () => {
    const timeline = vi.spyOn(gsap, 'timeline');
    const fromTo = vi.spyOn(gsap, 'fromTo');
    render(<Phase />);

    const entrances = [...timeline.mock.results, ...fromTo.mock.results].map(
      (result) => result.value as gsap.core.Timeline | gsap.core.Tween,
    );
    expect(entrances.length).toBeGreaterThan(0);
    const targets: unknown[] = [];
    for (const entrance of entrances) {
      expect(entrance.progress()).toBe(1);
      const tweens =
        'getChildren' in entrance
          ? (entrance.getChildren(true, true, false) as gsap.core.Tween[])
          : [entrance];
      for (const tween of tweens) targets.push(...tween.targets());
    }
    // Every element an entrance fades is at full opacity, not at its from-state.
    const faded = targets.filter(
      (target): target is HTMLElement => target instanceof HTMLElement && !!target.style.opacity,
    );
    expect(faded.length).toBeGreaterThan(0);
    for (const element of faded) expect(element.style.opacity).toBe('1');
  });
});

describe('ExecutionPhase', () => {
  beforeEach(() => {
    media.reduce = false;
    // ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom
    // does not implement: every call builds an Error, captures a stack and prints it through the
    // virtual console. A no-op is what ScrollTrigger already gets, without the noise.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  /** Mounts the phase and lets ScrollTrigger measure, which starts the stats count. */
  function mountCounting() {
    const toSpy = vi.spyOn(gsap, 'to');
    const utils = render(<ExecutionPhase />);
    // A trigger bound to a timeline measures on refresh (GSAP runs one after load in a browser);
    // in jsdom the section is then "in view" and onEnter starts the stats tween on a plain object.
    act(() => ScrollTrigger.refresh());
    const [statsTarget] = toSpy.mock.calls[0];
    const statsTween = toSpy.mock.results[0].value;
    return { ...utils, toSpy, statsTarget, statsTween };
  }

  it('renders the finished build stats under reduced motion', () => {
    media.reduce = true;
    render(<ExecutionPhase />);

    expect(screen.getAllByText('100%')).toHaveLength(3);
    expect(screen.getByText('00:14:32')).toBeInTheDocument();
    expect(screen.getByText('x12')).toBeInTheDocument();
  });

  it('stops the build stats tween when unmounted mid-count', () => {
    const { unmount, statsTarget } = mountCounting();
    expect(gsap.getTweensOf(statsTarget)).toHaveLength(1);

    unmount();

    expect(gsap.getTweensOf(statsTarget)).toHaveLength(0);
  });

  it('restarts the count instead of running two when the section is entered again', () => {
    const { toSpy, statsTarget } = mountCounting();

    act(() => enterAgain());

    expect(toSpy).toHaveBeenCalledTimes(2);
    expect(gsap.getTweensOf(statsTarget)).toHaveLength(0);
  });

  it('shows the finished stats when reduced motion arrives during a second count', () => {
    const { toSpy, statsTween } = mountCounting();
    // Let the first count finish, so animationComplete latches and React renders the totals.
    act(() => {
      statsTween.progress(1);
    });
    expect(screen.getByText('00:14:32')).toBeInTheDocument();

    // Entering again restarts the count, which writes its own numbers back over the totals.
    act(() => enterAgain());
    act(() => {
      toSpy.mock.results[1].value.progress(0.5);
    });
    expect(screen.queryByText('00:14:32')).not.toBeInTheDocument();

    act(() => media.set(true));

    expect(screen.getAllByText('100%')).toHaveLength(3);
    expect(screen.getByText('00:14:32')).toBeInTheDocument();
  });

  it('shows the finished stats, not the values the count had reached, when reduced motion is switched on', () => {
    const { statsTarget, statsTween } = mountCounting();
    // Half way through the count has written its own numbers straight into the value spans.
    act(() => {
      statsTween.progress(0.5);
    });
    expect(screen.queryByText('00:14:32')).not.toBeInTheDocument();

    act(() => media.set(true));

    expect(gsap.getTweensOf(statsTarget)).toHaveLength(0);
    expect(screen.getAllByText('100%')).toHaveLength(3);
    expect(screen.getByText('00:14:32')).toBeInTheDocument();
    expect(screen.getByText('x12')).toBeInTheDocument();
  });
});

describe('GameComplete', () => {
  beforeEach(() => {
    media.reduce = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderWithTimeline() {
    const timelineSpy = vi.spyOn(gsap, 'timeline');
    const view = render(<GameComplete />);
    const cta = screen.getByRole('link', { name: /connect on linkedin/i });
    const entrance = timelineSpy.mock.results[0].value as gsap.core.Timeline;
    const glow = gsap.getTweensOf(cta).find((tween) => tween.vars.repeat === -1);
    if (!glow) throw new Error('the CTA glow tween was not created');
    return { ...view, cta, entrance, glow };
  }

  it('keeps the endless glow out of the entrance timeline', () => {
    const { entrance, glow } = renderWithTimeline();

    // A `repeat: -1` child would give the timeline a duration of 1e10 seconds, and the `reverse`
    // toggleAction would then rewind every second the glow had been breathing before the entrance
    // began to un-play. The entrance is the two fromTo steps and nothing else.
    expect(entrance.duration()).toBeCloseTo(1.4, 5);
    expect(glow.parent).not.toBe(entrance);
  });

  it('holds the glow until the entrance has finished', () => {
    const { entrance, glow } = renderWithTimeline();
    expect(glow.paused()).toBe(true);

    act(() => {
      entrance.totalTime(entrance.duration());
    });

    expect(glow.paused()).toBe(false);
  });

  it('stops the glow when the section is scrolled past', () => {
    const { entrance, glow } = renderWithTimeline();
    act(() => {
      entrance.totalTime(entrance.duration());
    });
    expect(glow.paused()).toBe(false);

    act(() => ScrollTrigger.getAll()[0].vars.onLeave?.(ScrollTrigger.getAll()[0]));

    expect(glow.paused()).toBe(true);
  });

  it('kills the glow on unmount', () => {
    const { cta, glow, unmount } = renderWithTimeline();
    expect(gsap.getTweensOf(cta)).toContain(glow);

    unmount();

    expect(gsap.getTweensOf(cta)).toHaveLength(0);
  });
});

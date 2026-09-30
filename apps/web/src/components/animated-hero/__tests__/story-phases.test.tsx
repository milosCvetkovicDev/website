import { act, cleanup, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useLayoutEffect, type ComponentType } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { homePage, storyClosings } from '@/data/pages/home';
import * as gsapRuntime from '../gsap-runtime';
import { gsap, ScrollTrigger } from '../gsap-runtime';
import { requestGsap, runWithGsap, type GsapRuntime } from '../load-gsap';
import { DiscoveryPhase } from '../discovery-phase';
import { StrategyPhase } from '../strategy-phase';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { LoopPhase } from '../loop-phase';
import { GameComplete } from '../game-complete';
import { AnimatedHero } from '..';
import { cssTransitions, gsapCssConflicts, tweenedElements } from './gsap-css-conflicts';
import { countTweens, pickTween, progressDriver } from './gsap-tweens';

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

// ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom does
// not implement: every call builds an Error and prints its stack through the virtual console. A
// no-op defined once for the file's whole lifetime covers every block, so no block has to know
// whether the phase it mounts refreshes. vi.restoreAllMocks() does not undo a property definition,
// so the blocks' own restores leave it in place.
vi.hoisted(() => {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

// runWithGsap passes through to the real loader, so a test can hold the builds a mount asks for and
// run them itself, as GSAP arriving at a moment of its choosing would.
vi.mock('../load-gsap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../load-gsap')>();
  return { ...actual, runWithGsap: vi.fn(actual.runWithGsap) };
});

// The phases do not import GSAP: they ask load-gsap.ts for it, which fetches it on the visitor's
// first scroll, tap or key. Every test here is about what a phase does with GSAP, so the file
// requests that load outright and waits for it once, with real timers, before any test installs
// fake ones. From then on each phase builds its timeline synchronously on mount, as it does in the
// browser once GSAP has arrived. A phase mounted before the load is lazy-gsap.test.tsx's subject.
beforeAll(async () => {
  await requestGsap();
});

// All six story sections, so the shared lifecycle below covers every one of them. LoopPhase was the
// one omission: its own defects are pinned in `loop-phase.test.tsx` (rows R20 and R21), and this list
// is what says its build/teardown/rebuild behaves like its five siblings'.
//
// `timelineTrigger`: its entrance is a timeline with a scrollTrigger, whose first refresh
// ScrollTrigger defers. `timerSequence`: its trigger starts a sequence of timers.
const phases = [
  { name: 'DiscoveryPhase', Phase: DiscoveryPhase, timelineTrigger: true, timerSequence: false },
  { name: 'StrategyPhase', Phase: StrategyPhase, timelineTrigger: true, timerSequence: false },
  { name: 'ExecutionPhase', Phase: ExecutionPhase, timelineTrigger: true, timerSequence: false },
  { name: 'GauntletPhase', Phase: GauntletPhase, timelineTrigger: false, timerSequence: true },
  { name: 'LoopPhase', Phase: LoopPhase, timelineTrigger: false, timerSequence: true },
  { name: 'GameComplete', Phase: GameComplete, timelineTrigger: true, timerSequence: false },
];

/** Runs `action` in the layout phase of the commit that mounts it. */
function InRemovingCommit({ action }: { action: () => void }) {
  useLayoutEffect(() => action(), [action]);
  return null;
}

/**
 * The phase, or in its place `action`. Swapping one for the other in a single render reproduces a
 * soft navigation away from `/`: React detaches the phase's refs in that commit and runs `action`
 * in its layout phase, before the phase's passive effect cleanup. RTL's `rerender` runs inside
 * `act`, which flushes passive effects before it returns, so the layout phase is the only gap.
 */
function PhaseOr({ Phase, action }: { Phase: ComponentType; action?: () => void }) {
  return action ? <InRemovingCommit action={action} /> : <Phase />;
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
});

/** Long enough for every timer-driven sequence to create its last reveal: Gauntlet's runs 6.6 s. */
const WHOLE_SEQUENCE_MS = 10_000;
/** Just past the loop alert's pulse at 500 ms, while it still reads ERROR DETECTED. */
const EARLY_MS = 600;

// A soft navigation away from `/` removes the section in one commit. React detaches its refs in
// that commit, but a navigation is a transition, and React yields to the browser before it runs a
// transition's passive effects, where this section's cleanup cancels or reverts its build. GSAP's
// arrival, a GSAP tick or a due timer can land in between: the client-navigation walk logged
// "Invalid scope" in 1 run in 10 on it. Each test runs one of the three in the removing commit.
describe.each(phases)(
  '$name, removed by a soft navigation',
  ({ Phase, timelineTrigger, timerSequence }) => {
    beforeEach(() => {
      media.reduce = false;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      try {
        cleanup();
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
      // Asserted last: a throw here must not skip the global restoration above it.
      expect(media.listenerCount()).toBe(0);
    });

    // ScrollTrigger defers the first refresh of a timeline's trigger by 0.01 s, and every refresh
    // resolves the trigger through the scope of the context that created it. A context scoped to
    // sectionRef found the ref null there and logged "Invalid scope".
    it.runIf(timelineTrigger)('logs nothing when GSAP ticks in that commit', () => {
      const warn = vi.spyOn(console, 'warn');
      const delayedCall = vi.spyOn(gsap, 'delayedCall');
      const { rerender } = render(<PhaseOr Phase={Phase} />);
      const deferred = delayedCall.mock.calls.flatMap(([delay], call) =>
        delay === 0.01 ? [delayedCall.mock.results[call].value as gsap.core.Tween] : [],
      );
      expect(deferred.length, 'the build deferred a refresh').toBeGreaterThan(0);

      // GSAP's clock is the real Date.now it captured at load, which fake timers do not move.
      // Waiting 20 ms puts the deferred refresh behind the next tick.
      const built = Date.now();
      while (Date.now() - built < 20) {
        // Busy-wait: nothing may run between the build and the swap.
      }
      let progressInCommit: number[] = [];
      rerender(
        <PhaseOr
          Phase={Phase}
          action={() => {
            gsap.ticker.tick();
            progressInCommit = deferred.map((call) => call.progress());
          }}
        />,
      );

      expect(progressInCommit, 'the deferred refresh ran in the removing commit').toEqual(
        deferred.map(() => 1),
      );
      expect(warn).not.toHaveBeenCalled();
    });

    // GSAP arriving in that commit: the build it had queued runs with the refs already null, before
    // the cleanup that would revert it. Each build is held, and its cancel does nothing, because
    // by the time the cleanup calls it the build has already run.
    it('builds nothing when GSAP arrives in that commit', () => {
      const held = vi.mocked(runWithGsap);
      const passThrough = held.getMockImplementation();
      const builds: ((runtime: GsapRuntime) => void)[] = [];
      held.mockImplementation((run) => {
        builds.push(run);
        return () => {};
      });
      const warn = vi.spyOn(console, 'warn');
      let triggersBuilt = -1;
      try {
        const { rerender } = render(<PhaseOr Phase={Phase} />);
        expect(builds.length, 'the mount asked for a build').toBeGreaterThan(0);
        rerender(
          <PhaseOr
            Phase={Phase}
            action={() => {
              for (const build of builds) build(gsapRuntime);
              triggersBuilt = ScrollTrigger.getAll().length;
            }}
          />,
        );
      } finally {
        // vi.restoreAllMocks() restores spies only, not a vi.fn's implementation.
        held.mockImplementation(passThrough!);
      }

      expect(triggersBuilt).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    });

    // A timer coming due in that commit: the Gauntlet's and the Loop's sequences reveal their
    // panels from timers that read refs when they fire, outside any context.
    it.runIf(timerSequence)('logs nothing when its sequence timers come due in that commit', () => {
      const warn = vi.spyOn(console, 'warn');
      const { rerender } = render(<PhaseOr Phase={Phase} />);
      // jsdom lays nothing out, so the trigger starts in view and the sequence has begun.
      expect(vi.getTimerCount(), 'the sequence scheduled its timers').toBeGreaterThan(0);

      let timersLeft = -1;
      rerender(
        <PhaseOr
          Phase={Phase}
          action={() => {
            vi.advanceTimersByTime(WHOLE_SEQUENCE_MS);
            timersLeft = vi.getTimerCount();
            // A tween those timers made initialises on the next tick and can warn then, which
            // would land in whichever test ticks next.
            gsap.ticker.tick();
          }}
        />,
      );

      expect(timersLeft, 'every timer came due in the removing commit').toBe(0);
      expect(warn).not.toHaveBeenCalled();
    });
  },
);

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
    targets: () => [screen.getByText('DEPLOYMENT SUCCESSFUL').closest('[data-gauntlet="deploy"]')],
    count: 1,
    tweens: ['opacity', 'transform'],
  },
  {
    name: 'LoopPhase',
    Phase: LoopPhase,
    targets: () => [screen.getByText(/^(ERROR DETECTED|RESOLVED)$/).closest('[data-loop="alert"]')],
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  /** The stats count: a 3 s tween of a plain object whose onUpdate writes the numbers. */
  const statsCount = progressDriver(3);

  /** Mounts the phase and lets ScrollTrigger measure, which starts the stats count. */
  function mountCounting() {
    const toSpy = vi.spyOn(gsap, 'to');
    const utils = render(<ExecutionPhase />);
    // A trigger bound to a timeline measures on refresh (GSAP runs one after load in a browser);
    // in jsdom the section is then "in view" and onEnter starts the stats tween on a plain object.
    act(() => ScrollTrigger.refresh());
    const { target: statsTarget, tween: statsTween } = pickTween(toSpy, statsCount);
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

    expect(countTweens(toSpy, statsCount), 'one count per entry').toBe(2);
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
    expect(countTweens(toSpy, statsCount), 'one count per entry').toBe(2);
    const { tween: secondCount } = pickTween(toSpy, statsCount, { latest: true });
    expect(secondCount, 'the re-entry started a count of its own').not.toBe(statsTween);
    act(() => {
      secondCount.progress(0.5);
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

// The audit's hero-v1 finding, fixed in #125. A from-state is drawn the moment its timeline is
// built, before any trigger fires, so an element that starts to the right of where it belongs
// widens the page by that much for as long as it waits: the Execution stats panel's `x: 30`
// measured 774 px at a 768 px viewport (row R11). Every entrance, the timer-driven reveals
// included, starts in place or from the left.
describe.each(phases)('$name, its from-states', ({ Phase }) => {
  beforeEach(() => {
    media.reduce = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  it('start no element to the right of where it belongs', () => {
    const spies = [
      vi.spyOn(gsap, 'fromTo'),
      vi.spyOn(gsap, 'from'),
      vi.spyOn(gsap.core.Timeline.prototype, 'fromTo'),
      vi.spyOn(gsap.core.Timeline.prototype, 'from'),
    ];
    render(<Phase />);
    // Timeline-bound triggers measure on refresh; the timer-driven sequences then build their reveals.
    act(() => ScrollTrigger.refresh());
    act(() => vi.advanceTimersByTime(WHOLE_SEQUENCE_MS));

    // Each spy's second argument is the from-state: `fromTo(targets, from, to)` and
    // `from(targets, from)`, on gsap and on a timeline alike.
    const fromStates = spies
      .flatMap((spy) => spy.mock.calls as unknown[][])
      .map((call) => call[1] as gsap.TweenVars | undefined);
    expect(fromStates.length, 'the phase built no entrance at all').toBeGreaterThan(0);
    const rightward = fromStates.filter(
      (from) => from !== undefined && Number.parseFloat(String(from.x ?? 0)) > 0,
    );
    expect(rightward).toEqual([]);
  });
});

// #59 AC 10. Each story section closes on a headline and the line under it, and both are read from
// the home page record, whose sections `pageToMarkdown` turns into the page's Markdown twin
// (`data/pages/__tests__/home.test.ts`): what a visitor reads and what the twin carries are one pair
// of strings. Each pair is found by its place in the markup rather than by its text, so a phase that
// rendered anything but its record's strings would fail here.
const closings = [
  {
    name: 'DiscoveryPhase',
    Phase: DiscoveryPhase,
    closing: storyClosings.discovery,
    headline: 'h2',
  },
  {
    name: 'StrategyPhase',
    Phase: StrategyPhase,
    closing: storyClosings.strategy,
    headline: 'h2',
  },
  {
    name: 'ExecutionPhase',
    Phase: ExecutionPhase,
    closing: storyClosings.execution,
    headline: 'h2',
  },
  {
    name: 'GauntletPhase',
    Phase: GauntletPhase,
    closing: storyClosings.gauntlet,
    headline: 'h2',
  },
  {
    name: 'LoopPhase',
    Phase: LoopPhase,
    closing: storyClosings.loop,
    headline: 'h2',
  },
  // The last section closes inside its terminal, on a paragraph rather than a heading: its one
  // heading is its title, SESSION COMPLETE (#47, hero-10).
  {
    name: 'GameComplete',
    Phase: GameComplete,
    closing: storyClosings.complete,
    headline: 'p.text-xl',
  },
];

/** An element's text with every descendant matching `selector` left out. */
function textWithout(root: Element, selector: string): string {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll(selector).forEach((node) => node.remove());
  return copy.textContent ?? '';
}

describe.each(closings)('$name, its closing lines', ({ Phase, closing, headline }) => {
  beforeEach(() => {
    // jsdom lays nothing out, so with motion every trigger starts in view and GauntletPhase
    // schedules timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    media.reduce = false;
    // Asserted last: a throw here must not skip the cleanup above it.
    expect(media.listenerCount()).toBe(0);
  });

  // Reduced motion renders every gated block shown; with motion the gated blocks start hidden, but
  // their text is in the markup from the first render, which is what the served HTML carries.
  it.each([
    { motion: 'reduced motion', reduce: true },
    { motion: 'motion', reduce: false },
  ])(
    'renders its headline and the line under it from the home page record, under $motion',
    ({ reduce }) => {
      media.reduce = reduce;
      const { container } = render(<Phase />);
      // Each section is named by its title, an h2 of its own at the top (#47, hero-10): the closing
      // headline is the one match that is not the title, and it comes below it.
      const labelledBy = container.querySelector('section')?.getAttribute('aria-labelledby');
      const title = labelledBy ? document.getElementById(labelledBy) : null;
      expect(title?.tagName, 'the section is named by a heading of its own').toBe('H2');
      if (!title) throw new Error('no heading names the section');
      const headlines = [...container.querySelectorAll(headline)].filter((el) => el !== title);
      expect(headlines, `exactly one ${headline} closes the section`).toHaveLength(1);
      expect(
        title.compareDocumentPosition(headlines[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the title comes before the closing headline',
      ).toBeTruthy();
      const line = headlines[0].nextElementSibling;
      expect(line?.tagName, 'the line under the headline').toBe('P');

      // `AnimatedText` draws split text `aria-hidden` beside a visually hidden copy of the whole
      // text (#47, slice 47d), so `textContent` holds a split line twice. Read both lines both ways
      // instead: the drawn text a sighted visitor sees, and the text assistive technology reads.
      expect(textWithout(headlines[0], '.sr-only'), 'the drawn headline').toBe(closing.heading);
      expect(textWithout(headlines[0], '[aria-hidden="true"]'), 'the spoken headline').toBe(
        closing.heading,
      );
      // Every paragraph the record holds, so a second line the phase did not render would fail here.
      if (!line) throw new Error('no line under the headline');
      expect([textWithout(line, '.sr-only')], 'the drawn line').toEqual([...closing.paragraphs]);
      expect([textWithout(line, '[aria-hidden="true"]')], 'the spoken line').toEqual([
        ...closing.paragraphs,
      ]);
    },
  );
});

it('the closing-line tests cover every pair in the home page record', () => {
  expect(closings.map(({ closing }) => closing)).toEqual(Object.values(storyClosings));
});

it('the story renders the closing pairs in the order the home page record lists them', () => {
  media.reduce = true;
  try {
    const { container } = render(<AnimatedHero />);
    const text = container.textContent ?? '';
    const positions = homePage.sections.map(({ heading }) => text.indexOf(heading));
    expect(positions, 'every headline is on the page').not.toContain(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  } finally {
    cleanup();
    media.reduce = false;
  }
});

it('no module in the story declares a closing line itself', () => {
  // Every source module beside the phases, read as JSX renders it: entities and escaped quotes
  // decoded, JSX string expressions such as {' '} unwrapped, line breaks collapsed. Each sentence is
  // looked for on its own, so restating half of a line is found too.
  const directory = join(dirname(fileURLToPath(import.meta.url)), '..');
  const modules = readdirSync(directory).filter((file) => /\.tsx?$/.test(file));
  expect(modules, 'the check reads the phases').toContain('game-complete.tsx');
  const sentences = Object.values(storyClosings)
    .flatMap(({ heading, paragraphs }) => [heading, ...paragraphs])
    .flatMap((text) => text.split(/(?<=[.!?])\s+/));
  const restated = modules.flatMap((module) => {
    const source = readFileSync(join(directory, module), 'utf8')
      .replace(/\\(['"])/g, '$1')
      .replace(/&(?:apos|#0*39|#x0*27|rsquo|lsquo);/gi, "'")
      .replace(/&(?:quot|#0*34|#x0*22|ldquo|rdquo);/gi, '"')
      .replace(/\{\s*(['"`])((?:(?!\1).)*)\1\s*\}/g, '$2')
      .replace(/\s+/g, ' ');
    return sentences.filter((sentence) => source.includes(sentence)).map((s) => `${module}: ${s}`);
  });
  expect(restated).toEqual([]);
});

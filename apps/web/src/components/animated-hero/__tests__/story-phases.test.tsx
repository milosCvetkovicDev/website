import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../use-gsap-scroll';
import { DiscoveryPhase } from '../discovery-phase';
import { StrategyPhase } from '../strategy-phase';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { GameComplete } from '../game-complete';
import { counterTweens, latestCounterTween, onlyCounterTween } from './support/tweens';

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and use-gsap-scroll registers
// it at import time, so the stub must exist before the imports above are evaluated.
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

// ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom does not
// implement: every call builds an Error, captures a stack and prints it through the virtual console.
// A no-op defined for the file's whole lifetime, before the imports register ScrollTrigger, covers
// every block: any phase that measures on refresh reaches it, and which of them do is not this file's
// business. Not a spy restored after each test: a refresh GSAP's ticker runs after that restore
// reaches jsdom's own method again, between tests. vi.restoreAllMocks() does not undo a property
// definition.
vi.hoisted(() => {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

// The describe.each block restores nothing of its own, so the file owns the restoration. Vitest runs
// the inner hooks first, so a block that also restores its own spies still does.
afterEach(() => {
  vi.restoreAllMocks();
});

const phases = [
  { name: 'DiscoveryPhase', Phase: DiscoveryPhase },
  { name: 'StrategyPhase', Phase: StrategyPhase },
  { name: 'ExecutionPhase', Phase: ExecutionPhase },
  { name: 'GauntletPhase', Phase: GauntletPhase },
  { name: 'GameComplete', Phase: GameComplete },
];

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

  /** Mounts the phase and lets ScrollTrigger measure, which starts the stats count. */
  function mountCounting() {
    const toSpy = vi.spyOn(gsap, 'to');
    const utils = render(<ExecutionPhase />);
    // A trigger bound to a timeline measures on refresh (GSAP runs one after load in a browser);
    // in jsdom the section is then "in view" and onEnter starts the stats tween on a plain object.
    act(() => ScrollTrigger.refresh());
    const { target: statsTarget, tween: statsTween } = onlyCounterTween(toSpy);
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

    // Two counts, and the first one's target is no longer tweening: a restart, not a second run
    // stacked on the first.
    expect(counterTweens(toSpy)).toHaveLength(2);
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
      latestCounterTween(toSpy).tween.progress(0.5);
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

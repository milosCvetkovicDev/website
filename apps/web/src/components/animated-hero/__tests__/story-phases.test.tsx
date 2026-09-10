import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../use-gsap-scroll';
import { DiscoveryPhase } from '../discovery-phase';
import { StrategyPhase } from '../strategy-phase';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { GameComplete } from '../game-complete';

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

  it('creates its scroll animations when motion is allowed and removes them on unmount', () => {
    const { unmount } = render(<Phase />);
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);

    unmount();

    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('creates no scroll animation under reduced motion', () => {
    media.reduce = true;
    render(<Phase />);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('tears its scroll animations down when reduced motion is switched on', () => {
    render(<Phase />);
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);

    act(() => media.set(true));

    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('rebuilds its scroll animations when motion is allowed again', () => {
    render(<Phase />);
    act(() => media.set(true));
    expect(ScrollTrigger.getAll()).toHaveLength(0);

    act(() => media.set(false));

    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
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

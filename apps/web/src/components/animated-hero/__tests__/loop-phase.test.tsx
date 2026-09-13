import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../use-gsap-scroll';
import { LoopPhase } from '../loop-phase';

/**
 * `LoopPhase`'s healing sequence.
 *
 * Rows R20 and R21 of the RED manifest, both fixed by #47, plus the green assertions that hold what
 * already works. `LoopPhase` was the one story phase with no test of its own; it is also the phase whose
 * sequence is driven entirely by `setTimeout` rather than by a GSAP timeline, which is why both defects
 * live here and not in its four siblings.
 *
 * `GauntletPhase` is the same shape done right, and the comparison is the point of both rows:
 *
 * - R20. `animateHealing` (`loop-phase.tsx:46-89`) schedules the sequence but never resets
 *   `visibleEvents`, `alertStatus` or `showProtocol` (`:35-37`). Entering the section a second time
 *   therefore continues from wherever the last run finished: the log already holds all seven rows and
 *   the alert already reads RESOLVED while the sequence starts over. `GauntletPhase` resets its stage
 *   states on every entry, which is why its own restart test is green.
 * - R21. The three reveals (`loop-phase.tsx:49`, `:70`, `:77`) are created *inside* the `later` timers,
 *   which fire long after `gsap.context` (`:97`) has closed. A context only owns what was created while
 *   it was open, so `ctx.revert()` in the cleanup (`:121-125`) cannot see them: an unmount mid-run
 *   leaves a live tween writing into a detached element, and the inline opacity it wrote stays behind.
 *   `GauntletPhase` tracks its reveals in a ref and reverts them by hand (`gauntlet-phase.tsx:47`,
 *   `:51-58`).
 */

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and use-gsap-scroll registers it at
// import time, so the stub must exist before the imports above are evaluated.
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

const EVENT_COUNT = 7;
/** The first row lands at 800 ms and each one after it 400 ms later. */
const FIRST_EVENT_MS = 800;
const ALL_EVENTS_MS = FIRST_EVENT_MS + (EVENT_COUNT - 1) * 400;
/** The last event schedules the resolve, which schedules the protocol toast: 500 ms each. */
const WHOLE_SEQUENCE_MS = ALL_EVENTS_MS + 1_000;

const lastEvent = () => screen.queryByText('Awaiting human approval');
const firstEvent = () => screen.queryByText('NullPointerException in /api/orders');
const alertLabel = () => screen.getByText(/^(ERROR DETECTED|RESOLVED)$/);
const protocolToast = () => screen.getByText('SELF-HEALING PROTOCOL ACTIVE').closest('.mt-6');

/** Mounts the phase and lets ScrollTrigger measure; jsdom lays nothing out, so it starts in view. */
function mount() {
  const utils = render(<LoopPhase />);
  act(() => ScrollTrigger.refresh());
  return utils;
}

/** Fires the healing trigger again, as scrolling back above the section and down does. */
function enterAgain() {
  const trigger = ScrollTrigger.getAll().find((candidate) => candidate.vars.onEnter);
  trigger?.vars.onEnter?.(trigger);
}

describe('LoopPhase', () => {
  beforeEach(() => {
    media.reduce = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Drive GSAP by hand instead of from requestAnimationFrame, so the reveals are deterministic.
    gsap.ticker.remove(gsap.updateRoot);
    // ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom does
    // not implement: every call builds an Error and prints it through the virtual console.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    gsap.ticker.add(gsap.updateRoot);
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  it('renders the finished log under reduced motion without scheduling anything', () => {
    media.reduce = true;
    mount();

    expect(lastEvent()).toBeInTheDocument();
    expect(alertLabel()).toHaveTextContent('RESOLVED');
    expect(protocolToast()).not.toHaveClass('opacity-0');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reveals the log one event at a time once the section enters', () => {
    mount();
    expect(firstEvent()).not.toBeInTheDocument();
    expect(alertLabel()).toHaveTextContent('ERROR DETECTED');

    act(() => vi.advanceTimersByTime(FIRST_EVENT_MS));
    expect(firstEvent()).toBeInTheDocument();
    expect(lastEvent()).not.toBeInTheDocument();
    // The "Processing..." row marks a run in progress, and is the signal that only exists mid-sequence.
    expect(screen.getByText('Processing...')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(WHOLE_SEQUENCE_MS));
    expect(lastEvent()).toBeInTheDocument();
    expect(alertLabel()).toHaveTextContent('RESOLVED');
    expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
  });

  it('clears every pending timer when unmounted mid-sequence', () => {
    const { unmount } = mount();
    act(() => vi.advanceTimersByTime(FIRST_EVENT_MS));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it.fails(
    'R20 (#47): re-entering the section restarts the healing log from an empty state',
    () => {
      mount();
      // A whole run, so every piece of state is at its finished value.
      act(() => vi.advanceTimersByTime(WHOLE_SEQUENCE_MS));
      expect(lastEvent()).toBeInTheDocument();
      expect(alertLabel()).toHaveTextContent('RESOLVED');

      act(() => enterAgain());

      // Nothing has advanced yet, so a correct restart shows the state the first entry started from:
      // an empty log, a live alert, no protocol toast. Today all three carry over, so the replay opens
      // with all seven rows already listed under a RESOLVED banner and then starts filling them in
      // again — the animation plays over its own finished output.
      expect(firstEvent(), 'the log must be empty again').not.toBeInTheDocument();
      expect(alertLabel(), 'the alert must be live again').toHaveTextContent('ERROR DETECTED');
      expect(protocolToast(), 'the protocol toast must be hidden again').toHaveClass('opacity-0');
    },
  );

  it.fails(
    'R21 (#47): an unmount mid-run leaves no live tween and no inline opacity behind',
    () => {
      const { unmount } = mount();
      // Spied after mount, so the first call is the alert reveal the 500 ms timer creates — the one that
      // is built after `gsap.context` has already closed.
      const fromToSpy = vi.spyOn(gsap, 'fromTo');
      act(() => vi.advanceTimersByTime(500));
      expect(fromToSpy, 'the alert reveal must have been created by the timer').toHaveBeenCalled();
      // `gsap.fromTo`'s first parameter is a TweenTarget union; here it is always `alertRef.current`.
      const target = fromToSpy.mock.calls[0][0] as HTMLElement;
      expect(gsap.getTweensOf(target)).toHaveLength(1);

      unmount();

      // `ctx.revert()` only owns what was created while the context was open, and this tween was not.
      expect(
        gsap.getTweensOf(target),
        'a tween created inside a timer outlives the context revert: track the reveals in a ref and ' +
          'revert them in the cleanup, as GauntletPhase does (gauntlet-phase.tsx:47, :51-58).',
      ).toHaveLength(0);
      // And the inline style the fromTo wrote is still on the element, so a remount inherits it.
      expect(
        target.style.opacity,
        'the reveal left an inline opacity behind after the revert',
      ).toBe('');
    },
  );
});

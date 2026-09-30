import { act, cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { gsap, ScrollTrigger } from '../gsap-runtime';
import { requestGsap } from '../load-gsap';
import { LoopPhase } from '../loop-phase';

/**
 * `LoopPhase`'s healing sequence.
 *
 * `LoopPhase` is the story phase whose sequence is driven entirely by `setTimeout` rather than by a
 * GSAP timeline, so its lifecycle is pinned here as well as in the shared table in
 * `story-phases.test.tsx`. `GauntletPhase` is the same shape, and this file follows
 * `gauntlet-phase.test.tsx`.
 *
 * Rows R20 and R21 of the RED manifest, both fixed by #47 (hero-7):
 *
 * - R20. Entering the section again restarts the run from no log rows, ERROR DETECTED and no
 *   protocol toast. `animateHealing` once scheduled the sequence without resetting `visibleEvents`,
 *   `alertStatus` or `showProtocol`, so a second run played over the finished output of the first:
 *   all seven rows under a RESOLVED banner while the log started filling in again.
 * - R21. The three reveals (the alert, the protocol toast, the headline) are created *inside* the
 *   `later` timers, long after `gsap.context` has closed. A context only owns what was created while
 *   it was open, so `ctx.revert()` cannot see them; the phase tracks them in a ref and reverts them
 *   itself (`cancelSequence`), as `GauntletPhase` does, so an unmount mid-run leaves no live tween
 *   writing into a detached element and no inline opacity behind.
 *
 * The rest (tests-2): the finished state under reduced motion with nothing scheduled, the run once
 * the section enters, no timer left after an unmount or a switch to reduce, and a run that starts
 * from nothing, rather than stacking on one in progress or on a finished one, whenever the trigger
 * fires again.
 */

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-runtime registers it at
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
/** The panel the alert's reveal tweens, found by its data hook rather than by call order. */
const alertPanel = () => alertLabel().closest('[data-loop="alert"]') as HTMLElement;
const protocolToast = () => screen.getByText('SELF-HEALING PROTOCOL ACTIVE').closest('.mt-6');

/** Mounts the phase and lets ScrollTrigger measure; jsdom lays nothing out, so it starts in view. */
function mount() {
  const utils = render(<LoopPhase />);
  act(() => ScrollTrigger.refresh());
  return utils;
}

/** Every `ScrollTrigger.create` call, so `enterAgain` can reach a trigger that is already gone. */
let createSpy: MockInstance<typeof ScrollTrigger.create>;

/**
 * Runs the healing trigger's `onEnter` again, as a second entry would.
 *
 * The trigger is `once: true`, so it never fires twice by itself: it kills itself when it first
 * updates past its end, as it does at once in jsdom, which lays nothing out, and otherwise it
 * drops its `onEnter`. `ScrollTrigger.getAll()` therefore has nothing to fire here, and a lookup
 * there did nothing without saying so. A second run comes from a rebuilt trigger instead (motion
 * allowed again, below), and any second run comes down to the same call: `animateHealing` over
 * whatever the first run left. So the callback the phase last handed `ScrollTrigger.create` is
 * called directly, and the helper throws when there is none rather than passing on a no-op.
 */
function enterAgain() {
  const healing = createSpy.mock.calls.flatMap(([vars], call) => (vars.onEnter ? [call] : []));
  if (healing.length === 0) throw new Error('LoopPhase created no ScrollTrigger with an onEnter');
  const call = healing[healing.length - 1];
  const result = createSpy.mock.results[call];
  if (result.type !== 'return') throw new Error('ScrollTrigger.create did not return a trigger');
  createSpy.mock.calls[call][0].onEnter?.(result.value);
}

describe('LoopPhase', () => {
  // The phase asks load-gsap.ts for GSAP, which arrives on the visitor's first scroll, tap or key.
  // Requested outright and waited for once, with real timers, before beforeEach fakes setTimeout:
  // from then on the phase builds its trigger synchronously on mount, as it does in the browser once
  // GSAP has arrived, and R20 and R21 below describe the same component they did when GSAP was
  // imported statically.
  beforeAll(async () => {
    await requestGsap();
  });

  beforeEach(() => {
    media.reduce = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Drive GSAP by hand instead of from requestAnimationFrame, so the reveals are deterministic.
    gsap.ticker.remove(gsap.updateRoot);
    // ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom does
    // not implement: every call builds an Error and prints it through the virtual console.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // A pass-through spy: the phase still builds its triggers, and enterAgain reads what it passed.
    createSpy = vi.spyOn(ScrollTrigger, 'create');
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

  it('R20 (#47): re-entering the section restarts the healing log from an empty state', () => {
    mount();
    // A whole run, so every piece of state is at its finished value.
    act(() => vi.advanceTimersByTime(WHOLE_SEQUENCE_MS));
    expect(lastEvent()).toBeInTheDocument();
    expect(alertLabel()).toHaveTextContent('RESOLVED');

    act(() => enterAgain());

    // Nothing has advanced yet, so a correct restart shows the state the first entry started from:
    // an empty log, a live alert, no protocol toast. When all three carried over, the replay opened
    // with all seven rows already listed under a RESOLVED banner and then started filling them in
    // again — the animation played over its own finished output.
    expect(firstEvent(), 'the log must be empty again').not.toBeInTheDocument();
    expect(alertLabel(), 'the alert must be live again').toHaveTextContent('ERROR DETECTED');
    expect(protocolToast(), 'the protocol toast must be hidden again').toHaveClass('opacity-0');
  });

  it('R21 (#47): an unmount mid-run leaves no live tween and no inline opacity behind', () => {
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
        'revert them in the cleanup, as GauntletPhase does (revealTweensRef, cancelSequence).',
    ).toHaveLength(0);
    // Reverted, not killed: the inline style the fromTo wrote goes too, so a remount inherits none.
    expect(target.style.opacity, 'the reveal left an inline opacity behind after the revert').toBe(
      '',
    );
  });

  it('cancels a run in progress when the section is entered again, instead of stacking a second', () => {
    mount();
    const oneRun = vi.getTimerCount();
    // Past the alert's reveal and the first row: timers are pending and a timer has built a reveal.
    act(() => vi.advanceTimersByTime(FIRST_EVENT_MS));
    expect(vi.getTimerCount()).toBe(oneRun - 2);
    expect(firstEvent()).toBeInTheDocument();
    const alert = alertPanel();
    expect(gsap.getTweensOf(alert)).toHaveLength(1);

    act(() => enterAgain());

    // Exactly one run is scheduled, from its start, and the aborted run's reveal is undone.
    expect(vi.getTimerCount(), 'one run is scheduled, not two').toBe(oneRun);
    expect(firstEvent(), 'the log must be empty again').not.toBeInTheDocument();
    expect(gsap.getTweensOf(alert), 'the aborted run left its alert reveal live').toHaveLength(0);
    expect(alert.style.opacity, 'the aborted run left an inline opacity on the alert').toBe('');
  });

  it('cancels the running sequence and shows the finished log when reduced motion is switched on', () => {
    mount();
    act(() => vi.advanceTimersByTime(FIRST_EVENT_MS));
    const alert = alertPanel();
    expect(gsap.getTweensOf(alert)).toHaveLength(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    act(() => media.set(true));

    expect(vi.getTimerCount()).toBe(0);
    expect(gsap.getTweensOf(alert), 'the switch left the alert reveal live').toHaveLength(0);
    expect(alert.style.opacity, 'the switch left an inline opacity on the alert').toBe('');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(lastEvent()).toBeInTheDocument();
    expect(alertLabel()).toHaveTextContent('RESOLVED');
    expect(protocolToast()).not.toHaveClass('opacity-0');
  });

  it('starts from an empty log when motion is allowed again after a finished run', () => {
    mount();
    act(() => vi.advanceTimersByTime(WHOLE_SEQUENCE_MS));
    act(() => media.set(true));
    expect(lastEvent()).toBeInTheDocument();

    act(() => media.set(false));
    act(() => ScrollTrigger.refresh());

    // The path the manifest's R20 names and the one the issue reproduced in a browser. `once: true`
    // binds one trigger, not the section: the rebuilt trigger is in view and fires again, so the run
    // starts over, from no rows, a live alert and no toast, with one run scheduled.
    expect(firstEvent(), 'the log must start empty').not.toBeInTheDocument();
    expect(alertLabel(), 'the alert must start live').toHaveTextContent('ERROR DETECTED');
    expect(protocolToast(), 'the protocol toast must start hidden').toHaveClass('opacity-0');
    expect(vi.getTimerCount(), 'the alert reveal and one timer per row').toBe(EVENT_COUNT + 1);
  });
});

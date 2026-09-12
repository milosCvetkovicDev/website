import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../use-gsap-scroll';
import { GauntletPhase } from '../gauntlet-phase';
import { onlyCounterTween } from './support/tweens';

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

// mount() calls ScrollTrigger.refresh(), which restores the scroll position through window.scrollTo,
// and jsdom does not implement it: every call builds an Error, captures a stack and prints it through
// the virtual console, twelve of them per run of this file. The no-op is defined for the file's whole
// lifetime, before the imports register ScrollTrigger, rather than spied per test: afterEach hands
// GSAP its ticker back and then restores every mock, and a refresh the ticker ran after that restore
// reached jsdom's own method again, between tests, where no spy could catch it. vi.restoreAllMocks()
// does not undo a property definition.
vi.hoisted(() => {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

const STAGE_COUNT = 6;
// The six stages run back to back with a 0.2s gap; deployment starts once the last one ends.
const PIPELINE_MS = 5300;

const achievement = () => document.querySelector('[data-gauntlet="achievement"]');
const pendingStages = () => screen.getAllByText('○');
const passedStages = () => screen.getAllByText('●');

/** Mounts the phase and lets ScrollTrigger measure; jsdom lays nothing out, so it starts in view. */
function mount() {
  const utils = render(<GauntletPhase />);
  act(() => ScrollTrigger.refresh());
  return utils;
}

/** Fires the pipeline trigger again, as scrolling back above the section and down does. */
function enterAgain() {
  const trigger = ScrollTrigger.getAll().find((candidate) => candidate.vars.onEnter);
  trigger?.vars.onEnter?.(trigger);
}

/** Renders every GSAP tween as if `seconds` had elapsed; the ticker is detached in beforeEach. */
function elapse(seconds: number) {
  gsap.updateRoot(gsap.globalTimeline.time() + seconds);
}

describe('GauntletPhase', () => {
  beforeEach(() => {
    media.reduce = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Drive GSAP by hand instead of from requestAnimationFrame, so stage progress is deterministic.
    gsap.ticker.remove(gsap.updateRoot);
  });

  afterEach(() => {
    cleanup();
    gsap.ticker.add(gsap.updateRoot);
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Asserted last: a throw here must not skip the global restoration above it.
    expect(media.listenerCount()).toBe(0);
  });

  it('renders the finished pipeline under reduced motion without scheduling anything', () => {
    media.reduce = true;
    mount();

    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
    expect(passedStages()).toHaveLength(STAGE_COUNT);
    expect(achievement()).not.toHaveClass('opacity-0');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs the pipeline once the section enters, passing every stage and deploying', () => {
    mount();
    expect(pendingStages()).toHaveLength(STAGE_COUNT);
    expect(screen.queryByText('DEPLOYMENT SUCCESSFUL')).not.toBeInTheDocument();
    expect(achievement()).toHaveClass('opacity-0');

    act(() => vi.advanceTimersByTime(PIPELINE_MS));
    expect(screen.getByText('DEPLOYING TO PRODUCTION...')).toBeInTheDocument();

    act(() => vi.runAllTimers());
    act(() => elapse(PIPELINE_MS / 1000));

    expect(passedStages()).toHaveLength(STAGE_COUNT);
    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
    expect(achievement()).not.toHaveClass('opacity-0');
  });

  it('clears every pending timer and tween when unmounted mid-sequence', () => {
    const { unmount } = mount();
    // Spy after mount: the first timer creates the LINT stage's progress tween on a plain object.
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    const { target: progressTarget } = onlyCounterTween(toSpy);
    expect(gsap.getTweensOf(progressTarget)).toHaveLength(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(gsap.getTweensOf(progressTarget)).toHaveLength(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('restarts from pending instead of stacking a second run when the section is entered again', () => {
    mount();
    const oneRun = vi.getTimerCount();
    act(() => vi.advanceTimersByTime(1));
    expect(vi.getTimerCount()).toBe(oneRun - 1);
    expect(pendingStages()).toHaveLength(STAGE_COUNT - 1);

    act(() => enterAgain());

    expect(vi.getTimerCount()).toBe(oneRun);
    expect(pendingStages()).toHaveLength(STAGE_COUNT);
  });

  it('cancels the running sequence and shows the finished pipeline when reduced motion is switched on', () => {
    mount();
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    const { target: progressTarget } = onlyCounterTween(toSpy);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    act(() => media.set(true));

    expect(vi.getTimerCount()).toBe(0);
    expect(gsap.getTweensOf(progressTarget)).toHaveLength(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(passedStages()).toHaveLength(STAGE_COUNT);
    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
  });

  it('starts a fresh run rather than resuming a half-finished one when motion is allowed again', () => {
    mount();
    act(() => vi.advanceTimersByTime(1));
    act(() => media.set(true));
    expect(passedStages()).toHaveLength(STAGE_COUNT);

    act(() => media.set(false));
    act(() => ScrollTrigger.refresh());

    // The trigger is rebuilt in view and fires again: every stage is pending, nothing is deployed.
    expect(pendingStages()).toHaveLength(STAGE_COUNT);
    expect(screen.queryByText('DEPLOYMENT SUCCESSFUL')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(STAGE_COUNT + 1);
  });
});

import { act, cleanup, render, screen } from '@testing-library/react';
import { Profiler, type ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../gsap-runtime';
import { requestGsap } from '../load-gsap';
import { GauntletPhase } from '../gauntlet-phase';
import { pickTween, progressDriver } from './gsap-tweens';
import { fillScale, stageFill } from './pipeline-fill';

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

// mount() calls ScrollTrigger.refresh(), which restores the scroll position through
// window.scrollTo, and jsdom does not implement it: every call builds an Error and prints its stack
// through the virtual console. The no-op is defined once, for the file's whole lifetime, as in
// story-phases.test.tsx, so no test has to know whether what it mounts refreshes; no test here
// asserts on the calls. vi.restoreAllMocks() in afterEach does not undo a property definition.
vi.hoisted(() => {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

const STAGE_COUNT = 6;
// The stages' names, in order (`pipelineStages` in gauntlet-phase.tsx).
const STAGE_NAMES = ['LINT', 'TYPE CHECK', 'UNIT TESTS', 'E2E TESTS', 'SECURITY', 'BUILD'];
// The six stages run back to back with a 0.2s gap; deployment starts once the last one ends.
const PIPELINE_MS = 5300;
// LINT, the first stage, runs its progress tween for 0.5 s (`pipelineStages` in gauntlet-phase.tsx).
// SECURITY runs for 0.5 s too, so this picks LINT only before SECURITY starts, about 3.7 s in: a
// later pick finds two matches and throws, and { latest: true } would return SECURITY's tween.
const lintProgress = progressDriver(0.5);

const achievement = () =>
  screen.getByText('Achievement Unlocked').closest('[data-gauntlet="achievement"]');
const pendingStages = () => screen.getAllByText('○');
const passedStages = () => screen.getAllByText('●');

/** Mounts the phase and lets ScrollTrigger measure; jsdom lays nothing out, so it starts in view. */
function mount(ui: ReactElement = <GauntletPhase />) {
  const utils = render(ui);
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
  // The phase asks load-gsap.ts for GSAP, which arrives on the visitor's first scroll, tap or key.
  // Requested outright and waited for once, with real timers, before beforeEach fakes setTimeout:
  // from then on the phase builds its trigger synchronously on mount, as it does in the browser once
  // GSAP has arrived.
  beforeAll(async () => {
    await requestGsap();
  });

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
    // The first timer starts the LINT stage, whose progress tween runs on a plain object.
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    const { target: progressTarget } = pickTween(toSpy, lintProgress);
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
    const { target: progressTarget } = pickTween(toSpy, lintProgress);
    expect(gsap.getTweensOf(progressTarget)).toHaveLength(1);
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

  // hero-12. The progress tween draws the stage by writing its fill's transform through a ref, so
  // its frames cost React nothing: the phase commits when a stage starts running and when it
  // passes, for the status colour and icon, and at no frame in between.
  it('draws a running stage through its fill ref and commits nothing until the stage completes', () => {
    let commits = 0;
    mount(
      <Profiler
        id="gauntlet"
        onRender={() => {
          commits += 1;
        }}
      >
        <GauntletPhase />
      </Profiler>,
    );
    const toSpy = vi.spyOn(gsap, 'to');
    // The first timer starts LINT: one commit shows it running, and its progress tween begins.
    act(() => vi.advanceTimersByTime(1));
    const { tween } = pickTween(toSpy, lintProgress);
    const fill = stageFill('LINT');
    commits = 0;

    for (let step = 1; step < 10; step += 1) {
      act(() => {
        tween.progress(step / 10);
      });
      expect(commits, `commits by step ${step} of 10`).toBe(0);
      expect(fillScale(fill), `the fill at step ${step} of 10`).toBeCloseTo(step / 10, 5);
    }

    act(() => {
      tween.progress(1);
    });
    expect(commits, 'commits once the stage completes').toBe(1);
    expect(passedStages()).toHaveLength(1);
    expect(fillScale(fill)).toBe(1);
  });

  // React rewrites an inline style only when the value it renders changes, and a running stage
  // renders an empty fill from start to finish. So what the tween drew is emptied by hand when the
  // run restarts, and filled by React when the pipeline is shown finished instead.
  it('empties a half-drawn fill when the run restarts and fills it when reduced motion finishes the run', () => {
    mount();
    const toSpy = vi.spyOn(gsap, 'to');
    const fill = stageFill('LINT');
    act(() => vi.advanceTimersByTime(1));
    act(() => {
      pickTween(toSpy, lintProgress).tween.progress(0.5);
    });
    expect(fillScale(fill)).toBeCloseTo(0.5, 5);

    act(() => enterAgain());
    expect(pendingStages()).toHaveLength(STAGE_COUNT);
    expect(fillScale(fill)).toBe(0);

    act(() => vi.advanceTimersByTime(1));
    act(() => {
      pickTween(toSpy, lintProgress, { latest: true }).tween.progress(0.5);
    });
    expect(fillScale(fill)).toBeCloseTo(0.5, 5);

    act(() => media.set(true));
    expect(passedStages()).toHaveLength(STAGE_COUNT);
    expect(fillScale(fill)).toBe(1);
  });

  // A running stage renders the same empty fill from start to finish, so a render in the middle of
  // its tween writes nothing, and what the tween drew survives it.
  it('keeps what the tween drew when the phase re-renders in the middle of a stage', () => {
    const { rerender } = mount();
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    act(() => {
      pickTween(toSpy, lintProgress).tween.progress(0.5);
    });
    const fill = stageFill('LINT');

    rerender(<GauntletPhase />);

    expect(fillScale(fill)).toBeCloseTo(0.5, 5);
  });

  // The restart empties every fill, not just the first stage's: one that passed (React renders it
  // empty again) and one caught half drawn (React renders it empty throughout, so only the reset
  // can). Motion switched off and on again then leaves every stage pending and empty too.
  it('empties every fill when a later stage is restarted mid-tween, and after motion is allowed again', () => {
    mount();
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    act(() => {
      pickTween(toSpy, lintProgress).tween.progress(1);
    });
    // TYPE CHECK starts 0.7 s in: LINT's 0.5 s and the 0.2 s gap.
    act(() => vi.advanceTimersByTime(700));
    act(() => {
      pickTween(toSpy, progressDriver(0.6)).tween.progress(0.5);
    });
    expect(fillScale(stageFill('LINT'))).toBe(1);
    expect(fillScale(stageFill('TYPE CHECK'))).toBeCloseTo(0.5, 5);

    act(() => enterAgain());
    expect(pendingStages()).toHaveLength(STAGE_COUNT);
    for (const name of STAGE_NAMES) expect(fillScale(stageFill(name)), name).toBe(0);

    act(() => vi.advanceTimersByTime(1));
    act(() => {
      pickTween(toSpy, lintProgress, { latest: true }).tween.progress(0.5);
    });
    act(() => media.set(true));
    act(() => media.set(false));
    act(() => ScrollTrigger.refresh());
    expect(pendingStages()).toHaveLength(STAGE_COUNT);
    for (const name of STAGE_NAMES) expect(fillScale(stageFill(name)), name).toBe(0);
  });

  // The tween reads the fill's ref on every frame, so a frame rendered after the section is gone
  // finds the ref null and draws nothing, rather than throwing or writing to a detached node.
  it('draws nothing and throws nothing when a stage tween renders after the section unmounts', () => {
    const { unmount } = mount();
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    const { tween } = pickTween(toSpy, lintProgress);
    const fill = stageFill('LINT');
    unmount();

    expect(() => tween.progress(0.7)).not.toThrow();
    expect(fill.style.transform).toBe('scaleX(0)');
  });
});

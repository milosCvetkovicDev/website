import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../use-gsap-scroll';
import { GauntletPhase } from '../gauntlet-phase';

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

// The six stages run back to back with a 0.2s gap; deployment starts once the last one ends.
const PIPELINE_MS = 5300;

const achievement = () => screen.getByText('Achievement Unlocked').closest('.mt-6');

describe('GauntletPhase', () => {
  beforeEach(() => {
    media.reduce = false;
    // jsdom lays nothing out, so the ScrollTrigger starts in view and the sequence begins at mount.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the finished pipeline under reduced motion without scheduling anything', () => {
    media.reduce = true;
    render(<GauntletPhase />);

    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
    expect(screen.getAllByText('●')).toHaveLength(6);
    expect(achievement()).not.toHaveClass('opacity-0');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs the pipeline once the section enters and ends with a successful deployment', () => {
    render(<GauntletPhase />);
    expect(screen.queryByText('DEPLOYMENT SUCCESSFUL')).not.toBeInTheDocument();
    expect(achievement()).toHaveClass('opacity-0');

    act(() => vi.advanceTimersByTime(PIPELINE_MS));
    expect(screen.getByText('DEPLOYING TO PRODUCTION...')).toBeInTheDocument();

    act(() => vi.runAllTimers());
    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
    expect(achievement()).not.toHaveClass('opacity-0');
  });

  it('clears every pending timer and tween when unmounted mid-sequence', () => {
    const { unmount } = render(<GauntletPhase />);
    // Spy after mount: the first timer creates the LINT stage's progress tween on a plain object.
    const toSpy = vi.spyOn(gsap, 'to');
    act(() => vi.advanceTimersByTime(1));
    const [progressTarget] = toSpy.mock.calls[0];
    expect(gsap.getTweensOf(progressTarget)).toHaveLength(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(gsap.getTweensOf(progressTarget)).toHaveLength(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('cancels the running sequence and shows the finished pipeline when reduced motion is switched on', () => {
    render(<GauntletPhase />);
    act(() => vi.advanceTimersByTime(1));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    act(() => media.set(true));

    expect(vi.getTimerCount()).toBe(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
  });
});

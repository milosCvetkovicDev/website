import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricCounter } from '../metric-counter';

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  });
}

/** Queues rAF callbacks instead of running them, so a test drives the animation frame by frame. */
function stubAnimationFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  const cancel = vi.fn((handle: number) => pending.delete(handle));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    pending.set(handle, callback);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    cancel,
    pendingCount: () => pending.size,
    /** Runs every queued callback once with the given timestamp, flushing the resulting render. */
    advance(timestamp: number) {
      const due = [...pending.entries()];
      pending.clear();
      act(() => {
        for (const [, callback] of due) callback(timestamp);
      });
    },
  };
}

describe('MetricCounter', () => {
  beforeEach(() => stubMatchMedia(false));

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('shows the final value when idle', () => {
    stubAnimationFrames();
    render(<MetricCounter value={73} suffix="%" label="faster resolution" active={false} />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('starts at zero, passes through a partial value, and lands on the real one', () => {
    const frames = stubAnimationFrames();
    render(<MetricCounter value={73} suffix="%" label="faster resolution" active />);
    expect(screen.getByText('0%')).toBeInTheDocument();

    frames.advance(0);
    frames.advance(450);
    const midway = Number(screen.getByText(/%$/).textContent?.replace('%', ''));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(73);

    frames.advance(2000);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('honours prefix and decimals', () => {
    stubAnimationFrames();
    render(
      <MetricCounter
        value={1.5}
        prefix="~"
        suffix="x"
        decimals={1}
        label="throughput"
        active={false}
      />,
    );
    expect(screen.getByText('~1.5x')).toBeInTheDocument();
  });

  it('cancels its pending frame on unmount', () => {
    const frames = stubAnimationFrames();
    const { unmount } = render(
      <MetricCounter value={73} suffix="%" label="faster resolution" active />,
    );
    frames.advance(0);
    unmount();
    expect(frames.cancel).toHaveBeenCalled();
  });

  it('never animates under reduced motion', () => {
    stubMatchMedia(true);
    const frames = stubAnimationFrames();
    render(<MetricCounter value={5} suffix="×" label="faster builds" active />);
    expect(screen.getByText('5×')).toBeInTheDocument();
    expect(frames.pendingCount()).toBe(0);
  });
});

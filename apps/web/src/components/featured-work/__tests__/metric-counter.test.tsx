import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricCounter } from '../metric-counter';

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  });
}

describe('MetricCounter', () => {
  beforeEach(() => {
    // Run the whole animation in one frame so the test is deterministic.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now() + 10_000);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('shows the final value when idle', () => {
    stubMatchMedia(false);
    render(<MetricCounter value={73} suffix="%" label="faster resolution" active={false} />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('counts up to the real value when active', () => {
    stubMatchMedia(false);
    render(<MetricCounter value={73} suffix="%" label="faster resolution" active />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('never animates under reduced motion', () => {
    stubMatchMedia(true);
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    render(<MetricCounter value={5} suffix="×" label="faster builds" active />);
    expect(screen.getByText('5×')).toBeInTheDocument();
    expect(raf).not.toHaveBeenCalled();
  });
});

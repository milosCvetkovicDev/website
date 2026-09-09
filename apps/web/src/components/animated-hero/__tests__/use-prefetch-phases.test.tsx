import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefetchPhases } from '../use-prefetch-phases';

describe('usePrefetchPhases', () => {
  const loaders = [vi.fn(() => Promise.resolve()), vi.fn(() => Promise.resolve())] as const;
  const calls = () => loaders[0].mock.calls.length + loaders[1].mock.calls.length;

  beforeEach(() => {
    vi.useFakeTimers();
    loaders.forEach((load) => load.mockClear());
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) =>
      setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0),
    );
    vi.stubGlobal('cancelIdleCallback', clearTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('ignores intent during the first second, then prefetches once on the first intent event', () => {
    renderHook(() => usePrefetchPhases(loaders));
    act(() => {
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(calls()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(600);
      window.dispatchEvent(new Event('pointermove'));
      window.dispatchEvent(new Event('scroll'));
    });
    expect(calls()).toBe(2);
  });

  it('prefetches after three idle seconds without any intent', () => {
    renderHook(() => usePrefetchPhases(loaders));
    act(() => vi.advanceTimersByTime(2999));
    expect(calls()).toBe(0);
    act(() => vi.advanceTimersByTime(2));
    expect(calls()).toBe(2);
  });

  it('does nothing after unmount', () => {
    const { unmount } = renderHook(() => usePrefetchPhases(loaders));
    act(() => vi.advanceTimersByTime(1500));
    unmount();
    act(() => {
      window.dispatchEvent(new Event('wheel'));
      vi.advanceTimersByTime(5000);
    });
    expect(calls()).toBe(0);
  });

  it('skips the prefetch entirely under Data Saver', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
    renderHook(() => usePrefetchPhases(loaders));
    act(() => {
      vi.advanceTimersByTime(1500);
      window.dispatchEvent(new Event('touchstart'));
      vi.advanceTimersByTime(5000);
    });
    expect(calls()).toBe(0);
    Reflect.deleteProperty(navigator, 'connection');
  });
});

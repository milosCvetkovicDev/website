import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion';

type ChangeListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  const mediaQueryList = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.delete(listener);
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mediaQueryList),
  });
  return {
    setMatches(next: boolean) {
      mediaQueryList.matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('reports the current media query state', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates when the preference changes and unsubscribes on unmount', () => {
    const media = installMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.setMatches(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('reports false in a browser without window.matchMedia', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});

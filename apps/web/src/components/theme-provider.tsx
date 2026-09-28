'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useIsHydrated } from '@/hooks/use-is-hydrated';
import { DARK_COLOR_SCHEME_QUERY, THEME_STORAGE_KEY } from '@/lib/theme';

type Theme = 'light' | 'dark';

export { THEME_STORAGE_KEY };
const DARK_QUERY = DARK_COLOR_SCHEME_QUERY;

// The theme lives outside React (localStorage + OS preference); React subscribes to it.
const listeners = new Set<() => void>();

// Used only when localStorage is blocked (private mode, site data disabled, quota exceeded).
let memoryTheme: Theme | null = null;

const canMatchMedia = () => typeof window.matchMedia === 'function';

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mediaQueryList = canMatchMedia() ? window.matchMedia(DARK_QUERY) : null;
  const onStorage = (event: StorageEvent) => {
    // key === null means the whole store was cleared from another tab.
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  mediaQueryList?.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    mediaQueryList?.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function readStoredTheme(): Theme | null {
  if (memoryTheme) return memoryTheme;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function readTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  return canMatchMedia() && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

const getServerTheme = (): Theme => 'dark';

function writeTheme(next: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    memoryTheme = next;
  }
  listeners.forEach((listener) => listener());
}

function toggleTheme() {
  writeTheme(readTheme() === 'dark' ? 'light' : 'dark');
}

/**
 * Mirrors the theme onto `<html>`. It deliberately provides no React context: the theme and
 * `mounted` both change right after hydration, and a context value that changes then reaches every
 * Suspense boundary below it that has not hydrated yet, which React can then no longer hydrate. It
 * deletes the server-rendered markup and renders the boundary again on the client. `useTheme` reads
 * the same external store instead, so only the components that show the theme render again.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);
  const mounted = useIsHydrated();

  // Mirror the theme onto <html> once hydrated. The inline script in layout.tsx does the same
  // before first paint, so nothing flips during the hydration commit itself.
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme, mounted]);

  return children;
}

/**
 * The theme, a stable `toggleTheme`, and `mounted`, which is `false` while server-rendering and
 * hydrating: both `theme` and `mounted` read their server values until then, so the served markup
 * and the hydration render agree.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void; mounted: boolean } {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);
  const mounted = useIsHydrated();
  return { theme, toggleTheme, mounted };
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useIsHydrated } from '@/hooks/use-is-hydrated';

type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  mounted: false,
});

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

  const toggleTheme = useCallback(() => {
    writeTheme(readTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, mounted }), [theme, toggleTheme, mounted]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

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

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mediaQueryList = window.matchMedia(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  mediaQueryList.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    mediaQueryList.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

const getServerTheme = (): Theme => 'dark';

function writeTheme(next: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, next);
  listeners.forEach((listener) => listener());
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);
  const mounted = useIsHydrated();

  // Mirror the theme onto <html>. The inline script in layout.tsx does the same before first paint.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    writeTheme(readTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, mounted }), [theme, toggleTheme, mounted]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

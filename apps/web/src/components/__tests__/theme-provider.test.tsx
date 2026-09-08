import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from '../theme-provider';

function Probe() {
  const { theme, toggleTheme, mounted } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme}:{mounted ? 'mounted' : 'pending'}
    </button>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
  });

  it('uses the stored theme and mirrors it onto <html>', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('light:mounted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('toggles and persists the theme', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('light:mounted');

    act(() => screen.getByRole('button').click());

    expect(screen.getByRole('button')).toHaveTextContent('dark:mounted');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('ThemeProvider with blocked storage', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the OS preference and still toggles in memory', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('dark:mounted');

    act(() => screen.getByRole('button').click());

    expect(screen.getByRole('button')).toHaveTextContent('light:mounted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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

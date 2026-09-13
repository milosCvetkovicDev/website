import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ProviderModule = typeof import('../theme-provider');

// `theme-provider.tsx` keeps state at module level: `memoryTheme`, which a toggle writes when
// localStorage throws, and which `readStoredTheme` returns *before* it reads localStorage. That is
// right for a page, where storage that is blocked stays blocked, and wrong for a test file: Vitest
// isolates files, not cases, so once a blocked-storage toggle has run, every later case in the same
// worker reads the leaked value instead of the storage it set up. Every case therefore mounts a fresh
// copy of the module, loaded here, and the last case below proves both the leak and the reset.
let ThemeProvider: ProviderModule['ThemeProvider'];
let useTheme: ProviderModule['useTheme'];
let THEME_STORAGE_KEY: ProviderModule['THEME_STORAGE_KEY'];

async function loadFreshProvider() {
  vi.resetModules();
  ({ ThemeProvider, useTheme, THEME_STORAGE_KEY } = await import('../theme-provider'));
}

function Probe() {
  const { theme, toggleTheme, mounted } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme}:{mounted ? 'mounted' : 'pending'}
    </button>
  );
}

function mount() {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  return screen.getByRole('button');
}

function stubColorScheme(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches: prefersDark, addEventListener() {}, removeEventListener() {} }),
  });
}

function blockStorage() {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.className = '';
  await loadFreshProvider();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    stubColorScheme(false);
  });

  it('uses the stored theme and mirrors it onto <html>', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(mount()).toHaveTextContent('light:mounted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('toggles and persists the theme', () => {
    const button = mount();
    expect(button).toHaveTextContent('light:mounted');

    act(() => button.click());

    expect(button).toHaveTextContent('dark:mounted');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('ThemeProvider with blocked storage', () => {
  it('falls back to the OS preference and still toggles in memory', () => {
    stubColorScheme(true);
    blockStorage();

    const button = mount();
    expect(button).toHaveTextContent('dark:mounted');

    act(() => button.click());

    expect(button).toHaveTextContent('light:mounted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('does not carry an in-memory toggle into a case that loads the module afresh', async () => {
    // A light OS preference, so the blocked toggle writes `dark` into memory and the storage seeded
    // afterwards says `light`: the two sources disagree, and the rendered theme names the one read.
    stubColorScheme(false);
    blockStorage();
    const blocked = mount();
    act(() => blocked.click());
    expect(blocked).toHaveTextContent('dark:mounted');
    cleanup();

    vi.restoreAllMocks();
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    // Precondition, not a requirement on the provider: the memory fallback outlives the mount and
    // wins over storage, which is the leak the per-case reset exists for. If the provider stops
    // doing this, this line fails and `loadFreshProvider` is no longer needed for isolation.
    expect(mount(), 'the in-memory theme should outlive the mount that wrote it').toHaveTextContent(
      'dark:mounted',
    );
    cleanup();

    // What every case gets from the top-level `beforeEach`: a fresh module reads storage.
    await loadFreshProvider();
    expect(mount()).toHaveTextContent('light:mounted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});

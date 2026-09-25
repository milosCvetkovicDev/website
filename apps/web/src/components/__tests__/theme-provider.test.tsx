import { act, cleanup, render, screen } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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

describe('ThemeProvider through hydration', () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    host?.remove();
    host = undefined;
  });

  function Inner() {
    return <p id="inner">server-rendered</p>;
  }

  it('leaves a Suspense boundary that is still hydrating on its server markup', async () => {
    // The stored theme differs from the server snapshot, `dark`, so the theme changes right after
    // hydration, and `mounted` flips as it always does. When that change reached the boundary
    // through context, React could no longer hydrate the boundary and rendered it on the client
    // instead: it deleted the server markup, showed the fallback, and built the content again once
    // its code arrived. That is what happened to the tmux background on `/` while it was lazy.
    stubColorScheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    // The boundary sits inside an element, as it does on the page. React propagates a context
    // change lazily, from a parent that bails out of rendering, so a boundary rendered straight
    // below the provider would not see the change at all.
    const tree = (inner: React.ReactNode) => (
      <ThemeProvider>
        <Probe />
        <div>
          <Suspense fallback={null}>{inner}</Suspense>
        </div>
      </ThemeProvider>
    );

    // Exactly the markup the server sends, parsed without running scripts, as in
    // `hydration-marker.test.tsx`.
    const served = new DOMParser().parseFromString(renderToString(tree(<Inner />)), 'text/html');
    host = document.createElement('div');
    host.append(...served.body.childNodes);
    document.body.append(host);
    const serverNode = host.querySelector('#inner');
    expect(serverNode, 'the server render should contain the boundary content').not.toBeNull();
    expect(host.querySelector('button')).toHaveTextContent('dark:pending');

    // On the client the boundary's code has not arrived yet, so it stays dehydrated.
    let arrive: (module: { default: typeof Inner }) => void = () => {};
    const LazyInner = lazy(
      () => new Promise<{ default: typeof Inner }>((resolve) => (arrive = resolve)),
    );
    await act(async () => {
      root = hydrateRoot(host!, tree(<LazyInner />), { onRecoverableError: () => {} });
    });

    // The theme did change above the boundary...
    expect(host.querySelector('button')).toHaveTextContent('light:mounted');
    // ...and the boundary kept the node the server rendered.
    expect(serverNode!.isConnected, 'the server-rendered boundary content was deleted').toBe(true);
    expect(host.querySelector('#inner')).toBe(serverNode);

    await act(async () => arrive({ default: Inner }));

    expect(serverNode!.isConnected, 'the boundary content was rebuilt when it hydrated').toBe(true);
    expect(host.querySelector('#inner')).toBe(serverNode);
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

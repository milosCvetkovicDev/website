import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAYED_QUERY, TmuxBackground } from '../tmux-background';

/**
 * The width Tailwind compiles `md:` to: `globals.css`'s own `--breakpoint-md` if it sets one, else
 * the one in Tailwind's theme, resolved the way the build resolves the package.
 */
function tailwindMdWidth(): string | undefined {
  const breakpoint = (file: string) =>
    /--breakpoint-md:\s*([^;]+);/.exec(readFileSync(file, 'utf8'))?.[1]?.trim();
  return (
    breakpoint(join(dirname(fileURLToPath(import.meta.url)), '../../../app/globals.css')) ??
    breakpoint(createRequire(import.meta.url).resolve('tailwindcss/theme.css'))
  );
}

/**
 * A `matchMedia` whose answers the tests set: the reduced-motion preference and whether the viewport
 * is at least `md`, where the background is displayed. Hoisted so it exists before the component
 * module is imported; each `beforeEach` installs it afresh. Every list it hands out shares one set
 * of `change` listeners per query, so a width change reaches every pane.
 */
const media = vi.hoisted(() => {
  const state = { reducedMotion: false, wide: true };
  const listeners = new Map<string, Set<() => void>>();
  const matches = (query: string) =>
    query === '(prefers-reduced-motion: reduce)'
      ? state.reducedMotion
      : query === '(min-width: 48rem)'
        ? state.wide
        : false;
  const matchMedia = (query: string) => {
    let own = listeners.get(query);
    if (!own) {
      own = new Set();
      listeners.set(query, own);
    }
    return {
      get matches() {
        return matches(query);
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, listener: () => void) => own.add(listener),
      removeEventListener: (_type: string, listener: () => void) => own.delete(listener),
      dispatchEvent: () => false,
    };
  };
  return {
    state,
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
    install() {
      state.reducedMotion = false;
      state.wide = true;
      listeners.clear();
      Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
    },
    /** Moves the viewport across `md`, as a resize or a rotation does, and tells every listener. */
    setWide(wide: boolean) {
      state.wide = wide;
      for (const listener of [...(listeners.get('(min-width: 48rem)') ?? [])]) listener();
    },
  };
});

// Mock IntersectionObserver as a proper class
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  static lastCallback: IntersectionObserverCallback | undefined;
  constructor(callback: IntersectionObserverCallback) {
    MockIntersectionObserver.lastCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
  root = null;
  rootMargin = '';
  thresholds = [0];
  takeRecords = vi.fn().mockReturnValue([]);
}

beforeEach(() => {
  mockObserve.mockClear();
  mockDisconnect.mockClear();
  MockIntersectionObserver.lastCallback = undefined;

  // Mock IntersectionObserver
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  // Default: no reduced motion, at a width where the background is displayed.
  media.install();
});

describe('TmuxBackground', () => {
  it('renders the tmux tab bar with tab names', () => {
    render(<TmuxBackground />);
    // "production-monitor" appears in both the tab bar and status bar
    const productionMonitorMatches = screen.getAllByText(/production-monitor/);
    expect(productionMonitorMatches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/staging/)).toBeInTheDocument();
    expect(screen.getByText(/logs/)).toBeInTheDocument();
  });

  it('renders 5 terminal panes with correct titles', () => {
    render(<TmuxBackground />);
    // Use exact pane title strings to avoid matching status bar text
    expect(screen.getByText(/kubectl \u2014 pods/)).toBeInTheDocument();
    expect(screen.getByText(/psql \u2014 slow query log/)).toBeInTheDocument();
    expect(screen.getByText(/gh actions \u2014 CI pipeline/)).toBeInTheDocument();
    expect(screen.getByText(/nginx \u2014 access \+ error/)).toBeInTheDocument();
    expect(screen.getByText(/prometheus \u2014 alerts/)).toBeInTheDocument();
  });

  it('renders the bottom status bar with pane count and uptime', () => {
    render(<TmuxBackground />);
    expect(screen.getByText('5 panes')).toBeInTheDocument();
    expect(screen.getByText(/99\.97%/)).toBeInTheDocument();
  });

  it('has aria-hidden on root container', () => {
    const { container } = render(<TmuxBackground />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
  });

  it('displays the clock starting at 03:14:07', () => {
    render(<TmuxBackground />);
    // The clock appears in both TabBar and StatusBar
    const clockElements = screen.getAllByText('03:14:07');
    expect(clockElements.length).toBeGreaterThanOrEqual(1);
  });

  it('displays the user identifier in the tab bar', () => {
    render(<TmuxBackground />);
    expect(screen.getByText('milos@obsidian22')).toBeInTheDocument();
  });

  it('renders host names for each pane', () => {
    render(<TmuxBackground />);
    expect(screen.getByText('prod-k8s-master')).toBeInTheDocument();
    expect(screen.getByText('prod-db-primary')).toBeInTheDocument();
    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.getByText('prod-lb-01')).toBeInTheDocument();
    expect(screen.getByText('monitoring')).toBeInTheDocument();
  });

  it('renders static panes with pre-rendered log lines when prefers-reduced-motion', () => {
    media.state.reducedMotion = true;

    render(<TmuxBackground />);
    // StaticPane renders the first ~15 lines of each pane's seq as static text
    // The first pane (kubectl) starts with "$ kubectl get pods -n production -w"
    expect(screen.getByText('$ kubectl get pods -n production -w')).toBeInTheDocument();
  });

  it('renders alert count and region in the status bar', () => {
    render(<TmuxBackground />);
    expect(screen.getByText(/3 alerts/)).toBeInTheDocument();
    expect(screen.getByText('us-east-1')).toBeInTheDocument();
  });

  it('sets up IntersectionObserver for visibility tracking', () => {
    render(<TmuxBackground />);
    expect(mockObserve).toHaveBeenCalled();
  });
});

describe('AnimatedPane log slots', () => {
  const PANE_HEIGHT = 300; // (300 - 6) / 23.1 -> 13 slots, the first clipped above the pane
  const LINE_HEIGHT_PX = 14 * 1.65;
  const FIRST_LINE = '$ kubectl get pods -n production -w';

  // Each pane observes its own viewport, so callbacks are kept per observed element.
  class ImmediateResizeObserver {
    static byTarget = new Map<Element, ResizeObserverCallback>();
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      ImmediateResizeObserver.byTarget.set(target, this.callback);
      this.callback(
        [{ target, contentRect: { height: PANE_HEIGHT } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }

  function resizeTo(slots: HTMLElement, height: number) {
    const viewport = slots.parentElement;
    const callback = viewport && ImmediateResizeObserver.byTarget.get(viewport);
    if (!callback) throw new Error('pane viewport is not observed');
    act(() =>
      callback(
        [{ target: viewport, contentRect: { height } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      ),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    ImmediateResizeObserver.byTarget.clear();
    vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
    // Make the idle path explicit; jsdom has no requestIdleCallback of its own.
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) =>
      setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0),
    );
    vi.stubGlobal('cancelIdleCallback', clearTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function kubectlSlots() {
    const pane = screen.getByText(/kubectl \u2014 pods/).closest('.flex-col');
    const slots = pane?.querySelector('.whitespace-nowrap');
    if (!(slots instanceof HTMLElement)) throw new Error('slot container not rendered');
    return slots;
  }

  // The idle callback fires at once, then the first tick waits a random (mocked 0.5) 0-2 s delay.
  const firstTick = () => act(() => vi.advanceTimersByTime(1000));
  // The kubectl pane ticks every 650 ms (jitter is zero with Math.random mocked to 0.5).
  const nextTick = () => act(() => vi.advanceTimersByTime(650));

  it('rotates lines through a fixed set of slots instead of appending elements', () => {
    render(<TmuxBackground />);
    const slots = kubectlSlots();
    expect(slots.children).toHaveLength(13);
    expect((slots.children[0] as HTMLElement).style.height).toBe(`${LINE_HEIGHT_PX}px`);

    firstTick();
    expect(slots.children).toHaveLength(13);
    expect(slots.lastElementChild?.textContent).toBe(FIRST_LINE);

    nextTick();
    expect(slots.children).toHaveLength(13);
    expect(slots.children[11].textContent).toBe(FIRST_LINE);
    expect(slots.lastElementChild?.textContent).toMatch(/^NAME\s+READY/);
    expect(slots.children[0].textContent).toBe('\u00A0');
  });

  it('adds and removes slots at the front when the pane resizes, keeping the newest line last', () => {
    render(<TmuxBackground />);
    const slots = kubectlSlots();
    firstTick();
    nextTick();
    const newest = slots.lastElementChild;

    resizeTo(slots, 150); // (150 - 6) / 23.1 -> 7 slots
    expect(slots.children).toHaveLength(7);
    expect(slots.lastElementChild).toBe(newest);
    expect(slots.children[5].textContent).toBe(FIRST_LINE);

    resizeTo(slots, 1200); // capped at MAX_LINES
    expect(slots.children).toHaveLength(40);
    expect(slots.lastElementChild).toBe(newest);
    expect(slots.children[38].textContent).toBe(FIRST_LINE);
    expect(slots.children[0].textContent).toBe('\u00A0');
  });

  it('skips ticks while the background is off screen and resumes when it is back', () => {
    render(<TmuxBackground />);
    const observerCallback = MockIntersectionObserver.lastCallback;
    expect(observerCallback).toBeDefined();
    const slots = kubectlSlots();
    const setVisible = (isIntersecting: boolean) =>
      act(() =>
        observerCallback?.(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      );

    setVisible(false);
    firstTick();
    nextTick();
    expect(slots.lastElementChild?.textContent).toBe('\u00A0');

    setVisible(true);
    nextTick();
    expect(slots.lastElementChild?.textContent).toBe(FIRST_LINE);
  });

  describe('below md, where the background is not displayed', () => {
    it('asks for the same width as the root class, `md:flex`', () => {
      const { container } = render(<TmuxBackground />);
      // Read from the stylesheets, so a changed `md` breakpoint fails here rather than showing the
      // background at one width and starting its ticks at another.
      expect(DISPLAYED_QUERY).toBe(`(min-width: ${tailwindMdWidth()})`);
      expect(container.firstElementChild?.className).toMatch(/(^| )hidden( |$)/);
      expect(container.firstElementChild?.className).toMatch(/(^| )md:flex( |$)/);
    });

    it('runs no clock and no log ticks, and starts both once the viewport crosses md', () => {
      media.setWide(false);
      const setInterval = vi.spyOn(window, 'setInterval');
      render(<TmuxBackground />);
      const slots = kubectlSlots();

      // Not displayed: no interval, no idle callback, no slots, and nothing changes over 10 s.
      act(() => vi.advanceTimersByTime(10_000));
      expect(setInterval).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(slots.children).toHaveLength(0);
      expect(screen.getAllByText('03:14:07').length).toBeGreaterThanOrEqual(1);

      // Rotated or resized to md: the panes fit their slots and tick, and the clock runs.
      act(() => media.setWide(true));
      expect(slots.children).toHaveLength(13);
      firstTick();
      expect(slots.lastElementChild?.textContent).toBe(FIRST_LINE);
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryAllByText('03:14:07')).toHaveLength(0);
    });

    it('stops every timer when the viewport drops below md, and resumes where it was', () => {
      render(<TmuxBackground />);
      const slots = kubectlSlots();
      firstTick();
      nextTick();
      expect(slots.lastElementChild?.textContent).toMatch(/^NAME\s+READY/);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      act(() => media.setWide(false));
      expect(vi.getTimerCount()).toBe(0);
      const clockText = screen.getAllByText(/^\d{2}:\d{2}:\d{2}$/)[0].textContent;
      act(() => vi.advanceTimersByTime(10_000));
      expect(slots.lastElementChild?.textContent).toMatch(/^NAME\s+READY/);
      expect(screen.getAllByText(/^\d{2}:\d{2}:\d{2}$/)[0].textContent).toBe(clockText);

      act(() => media.setWide(true));
      firstTick();
      expect(slots.lastElementChild?.textContent).toMatch(/^api-server-6d7f4c8b9-x2k9p/);
    });

    it('removes its media listeners on unmount', () => {
      const { unmount } = render(<TmuxBackground />);
      // One for the clock and one for each of the five panes.
      expect(media.listenerCount(DISPLAYED_QUERY)).toBe(6);
      unmount();
      expect(media.listenerCount(DISPLAYED_QUERY)).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('under reduced motion runs no timers at any width', () => {
      media.state.reducedMotion = true;
      media.setWide(false);
      render(<TmuxBackground />);
      expect(screen.getByText('$ kubectl get pods -n production -w')).toBeInTheDocument();
      act(() => media.setWide(true));
      act(() => vi.advanceTimersByTime(5000));
      expect(vi.getTimerCount()).toBe(0);
      expect(screen.getAllByText('03:14:07').length).toBeGreaterThanOrEqual(1);
    });
  });
});

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TmuxBackground } from '../tmux-background';

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

  // Mock IntersectionObserver
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  // Mock matchMedia -- default: no reduced motion
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
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
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

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
  const PANE_HEIGHT = 300; // usable 288px -> 13 slots of 23.1px, the first clipped above the pane

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    class ImmediateResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { height: PANE_HEIGHT } } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
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

  it('rotates lines through a fixed set of slots instead of appending elements', () => {
    render(<TmuxBackground />);
    const slots = kubectlSlots();
    expect(slots.children).toHaveLength(13);
    expect(parseFloat(slots.style.top)).toBeCloseTo(288 - 13 * 23.1, 3);

    // No requestIdleCallback in jsdom: the fallback waits 1200ms, then a random (mocked 0.5) 0-2s delay.
    act(() => vi.advanceTimersByTime(1200 + 1000));
    expect(slots.children).toHaveLength(13);
    expect(slots.lastElementChild?.textContent).toBe('$ kubectl get pods -n production -w');

    // The kubectl pane ticks every 650ms (jitter is zero with Math.random mocked to 0.5).
    act(() => vi.advanceTimersByTime(650));
    expect(slots.children).toHaveLength(13);
    expect(slots.children[11].textContent).toBe('$ kubectl get pods -n production -w');
    expect(slots.lastElementChild?.textContent).toMatch(/^NAME\s+READY/);
    expect(slots.children[0].textContent).toBe('\u00A0');
  });

  it('skips ticks while the background is off screen', () => {
    render(<TmuxBackground />);
    const observerCallback = MockIntersectionObserver.lastCallback;
    const slots = kubectlSlots();
    act(() =>
      observerCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    act(() => vi.advanceTimersByTime(1200 + 1000 + 650));
    expect(slots.lastElementChild?.textContent).toBe('\u00A0');
  });
});

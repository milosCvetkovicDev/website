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
  MockIntersectionObserver.lastCallback = undefined;

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

  it('observes its own root for visibility, not some other element', () => {
    const { container } = render(<TmuxBackground />);
    const root = container.querySelector('[data-tmux-background]');
    expect(root).toBeInTheDocument();
    // Which element is observed is the whole point: the panes stop ticking when the hero scrolls
    // out of view, so an observer pointed at the wrong node leaves them running off-screen.
    expect(mockObserve).toHaveBeenCalledTimes(1);
    expect(mockObserve).toHaveBeenCalledWith(root);
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
    // The tree is aria-hidden, so there is no role to query. `data-pane` names the pane and
    // `data-pane-slots` its rotating slot container, instead of the layout classes this used to
    // reach through -- `.flex-col` and `.whitespace-nowrap` both match several elements.
    const pane = document.querySelector('[data-pane="kubectl \u2014 pods"]');
    const slots = pane?.querySelector('[data-pane-slots]');
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
});

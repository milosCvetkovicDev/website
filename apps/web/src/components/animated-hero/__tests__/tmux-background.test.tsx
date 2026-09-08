import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TmuxBackground } from '../tmux-background';

// Mock IntersectionObserver as a proper class
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
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

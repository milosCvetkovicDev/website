import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionProgress } from '../section-progress';

// A 7,000px document in a 1,000px viewport, so 6,000px of scroll range. The component maps its
// seven dots onto the whole document rather than onto the hero alone, which is what these fixtures
// reproduce; the page really does render Featured Work and Tech Stack after the hero.
const SCROLL_HEIGHT = 7000;
const VIEWPORT_HEIGHT = 1000;
const SCROLL_RANGE = SCROLL_HEIGHT - VIEWPORT_HEIGHT;

// jsdom defines scrollY as an own accessor; it is replaced per test and restored afterwards.
const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
const originalInnerHeight = window.innerHeight;

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && reduce,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function setScrollHeight(height: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: height,
  });
}

/** Moves the window to `y` and runs the animation frame the scroll handler schedules. */
function scrollWindowTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y });
  act(() => {
    // The handler drops frames within 33ms of the last update, so let that much pass first.
    vi.advanceTimersByTime(34);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
  });
}

const mobileBar = () => document.querySelector<HTMLElement>('.will-change-\\[width\\]');
const progressLine = () => document.querySelector<HTMLElement>('.will-change-\\[height\\]');
const dot = (label: string) =>
  screen.getByRole('button', { name: `Go to ${label} section` }).firstElementChild;

describe('SectionProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    setScrollHeight(SCROLL_HEIGHT);
    window.innerHeight = VIEWPORT_HEIGHT;
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');
    window.innerHeight = originalInnerHeight;
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('advances the readout, dots and progress bars on scroll under reduced motion', () => {
    installMatchMedia(true);
    render(<SectionProgress />);
    const readout = screen.getByText('[01/07] INIT');

    // A quarter of the way down: the bar follows the scroll fraction, the line the section index.
    scrollWindowTo(SCROLL_RANGE / 4);

    expect(readout).toHaveTextContent('[02/07] DISCOVER');
    expect(dot('DISCOVER')).toHaveClass('bg-[var(--accent)]');
    expect(dot('PLAN')).toHaveClass('bg-[var(--border)]');
    expect(mobileBar()?.style.width).toBe('25%');
    expect(progressLine()?.style.height).toBe(`${(1 / 6) * 100}%`);

    scrollWindowTo(SCROLL_RANGE / 2);

    expect(readout).toHaveTextContent('[04/07] BUILD');
    expect(mobileBar()?.style.width).toBe('50%');
  });

  it('tracks the scroll position in a browser without window.matchMedia', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    render(<SectionProgress />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(SCROLL_RANGE);

    expect(readout).toHaveTextContent('[07/07] CTA');
  });

  it('stays on the first section when the page does not scroll', () => {
    setScrollHeight(VIEWPORT_HEIGHT);
    const { container } = render(<SectionProgress />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(0);

    expect(readout).toHaveTextContent('[01/07] INIT');
    expect(container.textContent).not.toContain('NaN');
    expect(mobileBar()?.style.width).toBe('0%');
  });

  it('clamps a rubber-band scroll past the bottom to the last section', () => {
    render(<SectionProgress />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(SCROLL_RANGE + 120);

    expect(readout).toHaveTextContent('[07/07] CTA');
    expect(mobileBar()?.style.width).toBe('100%');
  });

  it('clamps a rubber-band scroll above the top to the first section', () => {
    render(<SectionProgress />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(-120);

    expect(readout).toHaveTextContent('[01/07] INIT');
    expect(mobileBar()?.style.width).toBe('0%');
  });

  it('jumps to a section without smooth scrolling under reduced motion', () => {
    installMatchMedia(true);
    render(<SectionProgress />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to TEST section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: (4 / 6) * SCROLL_RANGE,
      behavior: 'instant',
    });
  });

  it('scrolls smoothly to a section when motion is allowed', () => {
    render(<SectionProgress />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to TEST section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: (4 / 6) * SCROLL_RANGE,
      behavior: 'smooth',
    });
  });
});

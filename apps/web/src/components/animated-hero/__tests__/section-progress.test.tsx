import { StrictMode, useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionProgress } from '../section-progress';

// The seven dots name the seven sections of the hero story, so the geometry that matters is the
// story's, not the document's. `/` renders the story under a sticky nav and then keeps going with
// Featured Work, Tech Stack and the footer, so these fixtures put a 7,000px story 320px down a
// 12,320px document, seen through a 1,000px viewport: 6,000px of story scroll inside 11,320px of
// document scroll. Anything that divides the document instead lands in the wrong place.
const STORY_TOP = 320;
const STORY_HEIGHT = 7000;
const VIEWPORT_HEIGHT = 1000;
const STORY_RANGE = STORY_HEIGHT - VIEWPORT_HEIGHT;
const DOCUMENT_HEIGHT = STORY_TOP + STORY_HEIGHT + 5000;
const DOCUMENT_RANGE = DOCUMENT_HEIGHT - VIEWPORT_HEIGHT;

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

/**
 * Mirrors how AnimatedHero mounts the indicator: a wrapper around the story, measured through a
 * ref. jsdom reports an all-zero box for every element, so the wrapper's is stubbed on attach — the
 * ref callback runs in the commit phase, before the component's effects read it. The stub is a
 * function of the current scroll position, because a real rect is viewport-relative and moves as
 * the page scrolls; `top` is where the story sits in the document.
 */
function Story({ top = STORY_TOP, height = STORY_HEIGHT }: { top?: number; height?: number }) {
  const storyRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={(node) => {
        storyRef.current = node;
        if (!node) return;
        Object.defineProperty(node, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ top: top - window.scrollY, height }) as DOMRect,
        });
      }}
    >
      <SectionProgress storyRef={storyRef} />
    </div>
  );
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y });
}

/** Runs a single animation frame, which is where the component takes its measurements. */
function runFrame() {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

/**
 * Runs frames until everything the component has scheduled has been applied. A measurement that
 * lands inside the throttle window waits the window out a frame at a time rather than dropping, so
 * the indicator settles within a window plus a frame at worst. 200ms is well past that.
 */
function settle() {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

/** Moves the window to `y` and dispatches the scroll event, leaving the frames to the caller. */
function dispatchScrollTo(y: number) {
  setScrollY(y);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

/** Moves the window to `y` and lets the indicator catch up. */
function scrollWindowTo(y: number) {
  dispatchScrollTo(y);
  settle();
}

/** Rotates or resizes the viewport to `height` and lets the indicator catch up. */
function resizeViewportTo(height: number) {
  window.innerHeight = height;
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  settle();
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
    setScrollHeight(DOCUMENT_HEIGHT);
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
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    // A quarter of the way down: the bar follows the scroll fraction, the line the section index.
    scrollWindowTo(STORY_TOP + STORY_RANGE / 4);

    expect(readout).toHaveTextContent('[02/07] DISCOVER');
    expect(dot('DISCOVER')).toHaveClass('bg-[var(--accent)]');
    expect(dot('PLAN')).toHaveClass('bg-[var(--border)]');
    expect(mobileBar()?.style.width).toBe('25%');
    expect(progressLine()?.style.height).toBe(`${(1 / 6) * 100}%`);

    scrollWindowTo(STORY_TOP + STORY_RANGE / 2);

    expect(readout).toHaveTextContent('[04/07] BUILD');
    expect(mobileBar()?.style.width).toBe('50%');
  });

  it('measures the restored scroll position on mount, before any scroll event', () => {
    // A reload part-way down the story, and a back-navigation to it, both arrive already scrolled:
    // the browser restores the position and dispatches nothing to announce it.
    setScrollY(STORY_TOP + STORY_RANGE / 2);
    render(<Story />);
    settle();

    expect(screen.getByText('[04/07] BUILD')).toBeInTheDocument();
    expect(dot('BUILD')).toHaveClass('bg-[var(--accent)]');
    expect(mobileBar()?.style.width).toBe('50%');
    expect(progressLine()?.style.height).toBe('50%');
  });

  it('applies the last update of a scroll stream that ends inside the throttle window', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');
    settle();

    // One update, which opens a throttle window the next one has to wait out.
    dispatchScrollTo(STORY_TOP + STORY_RANGE / 4);
    runFrame();
    expect(readout).toHaveTextContent('[02/07] DISCOVER');

    // The frame right after an update falls inside that window. Nothing follows this event —
    // momentum has settled, or `scrollTo({ behavior: 'instant' })` dispatched its single event —
    // so an update deferred here is the last chance to be right.
    dispatchScrollTo(STORY_TOP + STORY_RANGE);
    runFrame();
    settle();

    expect(readout).toHaveTextContent('[07/07] CTA');
    expect(mobileBar()?.style.width).toBe('100%');
  });

  it('keeps measuring after a re-run of the effect, as StrictMode does in development', () => {
    // StrictMode mounts, tears down and mounts again, which `next dev` turns on for every page. A
    // teardown that cancels the pending frame without clearing the handle leaves the guard in
    // `scheduleMeasure` looking at a cancelled one: it would return early for the rest of the
    // component's life and never schedule another frame.
    render(
      <StrictMode>
        <Story />
      </StrictMode>,
    );
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[07/07] CTA');
    expect(mobileBar()?.style.width).toBe('100%');
  });

  it('re-measures the story when the viewport is resized', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(STORY_TOP + STORY_RANGE / 2);

    expect(readout).toHaveTextContent('[04/07] BUILD');
    expect(mobileBar()?.style.width).toBe('50%');

    // A viewport twice as tall leaves 5,000px of story to scroll rather than 6,000, so the same
    // position is 60% of the way through it instead of half way.
    resizeViewportTo(VIEWPORT_HEIGHT * 2);

    expect(readout).toHaveTextContent('[05/07] TEST');
    expect(mobileBar()?.style.width).toBe('60%');
  });

  it('tracks the scroll position in a browser without window.matchMedia', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[07/07] CTA');
  });

  it('reaches the last section at the end of the story, not the end of the document', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    // Still less than 56% of the way down the document, where Featured Work and Tech Stack follow.
    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[07/07] CTA');
    expect(mobileBar()?.style.width).toBe('100%');
  });

  it('holds the first section until the story reaches the top of the viewport', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    // Scrolled past the nav but not yet into the story.
    scrollWindowTo(STORY_TOP);

    expect(readout).toHaveTextContent('[01/07] INIT');
    expect(mobileBar()?.style.width).toBe('0%');
  });

  it('stays on the last section once the story is behind the viewport', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(DOCUMENT_RANGE);

    expect(readout).toHaveTextContent('[07/07] CTA');
    expect(mobileBar()?.style.width).toBe('100%');
  });

  it('stays on the first section when the story fits the viewport', () => {
    const { container } = render(<Story height={VIEWPORT_HEIGHT} />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(STORY_TOP);

    expect(readout).toHaveTextContent('[01/07] INIT');
    expect(container.textContent).not.toContain('NaN');
    expect(mobileBar()?.style.width).toBe('0%');
  });

  it('stays put and scrolls nowhere until the story wrapper has been laid out', () => {
    render(<SectionProgress storyRef={{ current: null }} />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[01/07] INIT');
    expect(mobileBar()?.style.width).toBe('0%');

    fireEvent.click(screen.getByRole('button', { name: 'Go to CTA section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('clamps a rubber-band scroll past the bottom to the last section', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(DOCUMENT_RANGE + 120);

    expect(readout).toHaveTextContent('[07/07] CTA');
    expect(mobileBar()?.style.width).toBe('100%');
  });

  it('clamps a rubber-band scroll above the top to the first section', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] INIT');

    scrollWindowTo(-120);

    expect(readout).toHaveTextContent('[01/07] INIT');
    expect(mobileBar()?.style.width).toBe('0%');
  });

  it('jumps to a section without smooth scrolling under reduced motion', () => {
    installMatchMedia(true);
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to TEST section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: STORY_TOP + (4 / 6) * STORY_RANGE,
      behavior: 'instant',
    });
  });

  it('scrolls smoothly to a section when motion is allowed', () => {
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to TEST section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: STORY_TOP + (4 / 6) * STORY_RANGE,
      behavior: 'smooth',
    });
  });

  it('sends the first dot to the top of the story rather than the top of the document', () => {
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to INIT section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: STORY_TOP, behavior: 'smooth' });
  });

  it('sends the last dot to the end of the story rather than the footer', () => {
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to CTA section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: STORY_TOP + STORY_RANGE,
      behavior: 'smooth',
    });
    expect(window.scrollTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ top: DOCUMENT_RANGE }),
    );
  });
});

import { StrictMode, useRef } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEASURE_THROTTLE_MS, SectionProgress } from '../section-progress';

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
 * the indicator settles within a window plus a frame at worst; four windows leaves room to spare.
 */
function settle() {
  act(() => {
    vi.advanceTimersByTime(MEASURE_THROTTLE_MS * 4);
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

/**
 * The one element under `root` matching `selector`. It fails naming `what` when there is none or
 * more than one, so a missing hook, or a second element carrying it, cannot leave an assertion
 * reading the wrong node.
 */
function only(root: ParentNode, selector: string, what: string) {
  const found = root.querySelectorAll<HTMLElement>(selector);
  if (found.length !== 1) throw new Error(`expected one ${what}, found ${found.length}`);
  return found[0];
}

const mobileBar = () => only(document, '[data-progress="bar"]', 'phone progress bar');
const progressLine = () => only(document, '[data-progress="line"]', 'progress line');
const dotButton = (label: string) => screen.getByRole('button', { name: `Go to ${label} section` });

/**
 * The dot inside a button: its direct child carrying `data-state`, which drives the fill. Direct
 * children only, so a descendant with a `data-state` of its own cannot stand in for it.
 */
const dot = (label: string) =>
  only(dotButton(label), ':scope > [data-state]', `dot in the ${label} button`);

const currentDots = () =>
  screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-current'));

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
    const readout = screen.getByText('[01/07] HERO');

    // A quarter of the way down: the bar follows the scroll fraction, the line the section index.
    scrollWindowTo(STORY_TOP + STORY_RANGE / 4);

    expect(readout).toHaveTextContent('[02/07] DISCOVERY');
    expect(dot('DISCOVERY')).toHaveAttribute('data-state', 'lit');
    expect(dot('STRATEGY')).toHaveAttribute('data-state', 'unlit');
    expect(mobileBar().style.width).toBe('25%');
    expect(progressLine().style.height).toBe(`${(1 / 6) * 100}%`);

    scrollWindowTo(STORY_TOP + STORY_RANGE / 2);

    expect(readout).toHaveTextContent('[04/07] EXECUTION');
    expect(mobileBar().style.width).toBe('50%');
  });

  it('measures the restored scroll position on mount, before any scroll event', () => {
    // A reload part-way down the story, and a back-navigation to it, both arrive already scrolled:
    // the browser restores the position and dispatches nothing to announce it.
    setScrollY(STORY_TOP + STORY_RANGE / 2);
    render(<Story />);
    settle();

    expect(screen.getByText('[04/07] EXECUTION')).toBeInTheDocument();
    const [discoveryDot, executionDot, gauntletDot] = [
      'DISCOVERY',
      'EXECUTION',
      'THE GAUNTLET',
    ].map(dot);
    expect(executionDot).toHaveAttribute('data-state', 'lit');
    // The dot after it stays unlit: reaching a section is not the same as lighting them all.
    expect(gauntletDot).toHaveAttribute('data-state', 'unlit');
    // The attribute drives the fill, through a `data-[state=lit]` variant, so a lit dot and an
    // unlit one that are both off the current section carry the same classes: the fill is not
    // chosen in JavaScript. That the variant paints it is pinned in a browser, where the CSS runs
    // (`e2e/section-progress.spec.ts`).
    expect(discoveryDot).toHaveAttribute('data-state', 'lit');
    expect(discoveryDot.className).toBe(gauntletDot.className);
    expect(mobileBar().style.width).toBe('50%');
    expect(progressLine().style.height).toBe('50%');
  });

  it('applies the last update of a scroll stream that ends inside the throttle window', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');
    settle();

    // One update, which opens a throttle window the next one has to wait out.
    dispatchScrollTo(STORY_TOP + STORY_RANGE / 4);
    runFrame();
    expect(readout).toHaveTextContent('[02/07] DISCOVERY');

    // The frame right after an update falls inside that window. Nothing follows this event —
    // momentum has settled, or `scrollTo({ behavior: 'instant' })` dispatched its single event —
    // so an update deferred here is the last chance to be right.
    dispatchScrollTo(STORY_TOP + STORY_RANGE);
    runFrame();

    // Still on the previous value, because this frame is inside the window. Without the throttle
    // the indicator would already be at the end of the story here, so this is what pins the
    // throttle itself; the assertions below are what pin its trailing edge.
    expect(readout).toHaveTextContent('[02/07] DISCOVERY');
    expect(mobileBar().style.width).toBe('25%');

    settle();

    expect(readout).toHaveTextContent('[07/07] SESSION COMPLETE');
    expect(mobileBar().style.width).toBe('100%');
  });

  it('stops measuring once it is unmounted', () => {
    const { unmount } = render(<Story />);

    scrollWindowTo(STORY_TOP + STORY_RANGE / 4);
    expect(mobileBar().style.width).toBe('25%');

    unmount();
    const scheduled = vi.spyOn(window, 'requestAnimationFrame');
    setScrollY(STORY_TOP + STORY_RANGE);
    window.innerHeight = VIEWPORT_HEIGHT * 2;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });

    // Both listeners went with the component, so neither event schedules any work. The `resize`
    // one is new here and would otherwise leak on every unmount with nothing to notice.
    expect(scheduled).not.toHaveBeenCalled();
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
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[07/07] SESSION COMPLETE');
    expect(mobileBar().style.width).toBe('100%');
  });

  it('re-measures the story when the viewport is resized', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(STORY_TOP + STORY_RANGE / 2);

    expect(readout).toHaveTextContent('[04/07] EXECUTION');
    expect(mobileBar().style.width).toBe('50%');

    // A viewport twice as tall leaves 5,000px of story to scroll rather than 6,000, so the same
    // position is 60% of the way through it instead of half way.
    resizeViewportTo(VIEWPORT_HEIGHT * 2);

    expect(readout).toHaveTextContent('[05/07] THE GAUNTLET');
    expect(mobileBar().style.width).toBe('60%');
  });

  it('moves aria-current with the active section and leaves it on exactly one dot', () => {
    // The fill colour and the glow that mark the active dot reach nobody using assistive
    // technology, and every dot up to the active one shares the fill, so `aria-current` is the
    // only thing that says which of them the visitor is on.
    render(<Story />);
    // Resolved once: a name-filtered role query recomputes every candidate's accessible name.
    const hero = dotButton('HERO');
    const execution = dotButton('EXECUTION');

    expect(currentDots()).toEqual([hero]);
    expect(hero).toHaveAttribute('aria-current', 'location');

    scrollWindowTo(STORY_TOP + STORY_RANGE / 2);

    expect(currentDots()).toEqual([execution]);
    expect(hero).not.toHaveAttribute('aria-current');
  });

  it('keeps aria-current on the last dot once the story is behind the viewport', () => {
    // The readout clamps to the last section past the end of the story, and `aria-current` is
    // derived from the same index, so it has to clamp with it rather than disappearing.
    render(<Story />);

    scrollWindowTo(DOCUMENT_RANGE);

    expect(currentDots()).toEqual([dotButton('SESSION COMPLETE')]);
  });

  it('names each dot for the title its section shows, and draws a word of it', () => {
    // The dots said DISCOVER, PLAN, BUILD, TEST, SHIP and CTA beside sections titled DISCOVERY,
    // STRATEGY, EXECUTION, THE GAUNTLET, THE LOOP and SESSION COMPLETE (#47, hero-10). The hero
    // shows no title of its own, so its dot takes the name its region is announced by.
    const titles = [
      'HERO',
      'DISCOVERY',
      'STRATEGY',
      'EXECUTION',
      'THE GAUNTLET',
      'THE LOOP',
      'SESSION COMPLETE',
    ];
    // What each dot draws: the title's last word, so the column stays as narrow as it was.
    const labels = ['HERO', 'DISCOVERY', 'STRATEGY', 'EXECUTION', 'GAUNTLET', 'LOOP', 'COMPLETE'];
    render(<Story />);

    const buttons = within(screen.getByRole('navigation', { name: 'Story sections' })).getAllByRole(
      'button',
    );

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      titles.map((title) => `Go to ${title} section`),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(labels);
    // Label in Name (WCAG 2.5.3): a voice-control user says the words drawn, and they have to be
    // inside the name the button is announced by, as a whole word of the title.
    for (const [index, button] of buttons.entries()) {
      const drawn = button.textContent ?? '';
      expect(drawn, 'the dot draws a label').not.toBe('');
      expect(titles[index].split(' '), `${drawn} is a word of the name`).toContain(drawn);
    }
    expect(screen.getByText(`[01/07] ${titles[0]}`)).toBeInTheDocument();
  });

  it('names the dot group and gives it the set semantics of a list', () => {
    render(<Story />);

    const group = screen.getByRole('navigation', { name: 'Story sections' });

    expect(group).toContainElement(dotButton('HERO'));
    expect(group).toContainElement(dotButton('SESSION COMPLETE'));
    // The list is what makes a screen reader announce "4 of 7"; the `[04/07]` readout that says
    // so on screen is aria-hidden, so without it the ordinal reaches nobody.
    expect(within(group).getByRole('list')).toBeInTheDocument();
    expect(within(group).getAllByRole('listitem')).toHaveLength(7);
  });

  it('tracks the scroll position in a browser without window.matchMedia', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[07/07] SESSION COMPLETE');
  });

  it('reaches the last section at the end of the story, not the end of the document', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    // Still less than 56% of the way down the document, where Featured Work and Tech Stack follow.
    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[07/07] SESSION COMPLETE');
    expect(mobileBar().style.width).toBe('100%');
  });

  it('holds the first section until the story reaches the top of the viewport', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    // Scrolled past the nav but not yet into the story.
    scrollWindowTo(STORY_TOP);

    expect(readout).toHaveTextContent('[01/07] HERO');
    expect(mobileBar().style.width).toBe('0%');
  });

  it('stays on the last section once the story is behind the viewport', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(DOCUMENT_RANGE);

    expect(readout).toHaveTextContent('[07/07] SESSION COMPLETE');
    expect(mobileBar().style.width).toBe('100%');
  });

  it('stays on the first section when the story fits the viewport', () => {
    const { container } = render(<Story height={VIEWPORT_HEIGHT} />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(STORY_TOP);

    expect(readout).toHaveTextContent('[01/07] HERO');
    expect(container.textContent).not.toContain('NaN');
    expect(mobileBar().style.width).toBe('0%');
  });

  it('stays put and scrolls nowhere until the story wrapper has been laid out', () => {
    render(<SectionProgress storyRef={{ current: null }} />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(STORY_TOP + STORY_RANGE);

    expect(readout).toHaveTextContent('[01/07] HERO');
    expect(mobileBar().style.width).toBe('0%');

    fireEvent.click(screen.getByRole('button', { name: 'Go to SESSION COMPLETE section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('clamps a rubber-band scroll past the bottom to the last section', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(DOCUMENT_RANGE + 120);

    expect(readout).toHaveTextContent('[07/07] SESSION COMPLETE');
    expect(mobileBar().style.width).toBe('100%');
  });

  it('clamps a rubber-band scroll above the top to the first section', () => {
    render(<Story />);
    const readout = screen.getByText('[01/07] HERO');

    scrollWindowTo(-120);

    expect(readout).toHaveTextContent('[01/07] HERO');
    expect(mobileBar().style.width).toBe('0%');
  });

  it('jumps to a section without smooth scrolling under reduced motion', () => {
    installMatchMedia(true);
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to THE GAUNTLET section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: STORY_TOP + (4 / 6) * STORY_RANGE,
      behavior: 'instant',
    });
  });

  it('scrolls smoothly to a section when motion is allowed', () => {
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to THE GAUNTLET section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: STORY_TOP + (4 / 6) * STORY_RANGE,
      behavior: 'smooth',
    });
  });

  it('sends the first dot to the top of the story rather than the top of the document', () => {
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to HERO section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: STORY_TOP, behavior: 'smooth' });
  });

  it('sends the last dot to the end of the story rather than the footer', () => {
    render(<Story />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to SESSION COMPLETE section' }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: STORY_TOP + STORY_RANGE,
      behavior: 'smooth',
    });
    expect(window.scrollTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ top: DOCUMENT_RANGE }),
    );
  });
});

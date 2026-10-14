import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroSection } from '../hero-section';

// The tmux background has tests of its own and is the costly part of a mount; what is tested here is
// the hero's own chrome.
vi.mock('../tmux-background', () => ({ TmuxBackground: () => null }));

// jsdom defines scrollY as an own accessor; it is replaced per test and restored afterwards.
const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

/** The Scroll indicator's wrapper, which carries the fade, and the dot that bounces inside it. */
function scrollIndicator() {
  const wrapper = screen.getByText('Scroll', { exact: true }).parentElement!;
  const dots = wrapper.querySelectorAll<HTMLElement>('.animate-hero-scroll-bounce');
  expect(dots, 'one bouncing dot in the indicator').toHaveLength(1);
  return { wrapper, dot: dots[0] };
}

afterEach(() => {
  if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HeroSection', () => {
  it('pauses the scroll dot whenever the indicator is hidden, and runs it again at the top', () => {
    // Nothing may be logged as the dot pauses and resumes: React logs an error in development when
    // some inline shorthand and longhand pairs change on one element, and any console error fails
    // console-clean.spec.ts in the dev-server run. The test below keeps the shorthand out.
    const consoleError = vi.spyOn(console, 'error');
    render(<HeroSection />);
    const { wrapper, dot } = scrollIndicator();

    // At the top the indicator shows and the dot bounces. Nothing inline either way: a `running`
    // written here would outrank the stylesheet's pause for an unseen hero section.
    expect(wrapper).toHaveClass('opacity-100');
    expect(dot.style.animationPlayState).toBe('');

    // Scrolled past the threshold the indicator fades to opacity 0, so the dot is invisible and
    // must not keep the main thread resolving its style every frame (ADR 0009 rule 4).
    scrollTo(400);
    expect(wrapper).toHaveClass('opacity-0');
    expect(dot.style.animationPlayState).toBe('paused');

    scrollTo(0);
    expect(wrapper).toHaveClass('opacity-100');
    expect(dot.style.animationPlayState).toBe('');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('runs its endless animations from classes, never an inline shorthand the stylesheet cannot pause', () => {
    const { container } = render(<HeroSection />);
    const styled = [...container.querySelectorAll<HTMLElement>('[style]')];
    expect(styled.length, 'the hero still draws its glow, fades and dot').toBeGreaterThan(0);
    for (const el of styled) {
      expect(el.getAttribute('style')).not.toMatch(/(^|;)\s*animation\s*:/);
    }
    expect(container.querySelectorAll('.animate-hero-breathe')).toHaveLength(1);
  });

  it('hands its section to the story visibility observer', () => {
    const observed: Element[] = [];
    let report: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          report = callback;
        }
        observe(target: Element) {
          observed.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(<HeroSection />);
    const section = container.querySelector('section');
    expect(observed).toEqual([section]);

    const deliver = (isIntersecting: boolean) =>
      act(() =>
        report(
          [{ target: section, isIntersecting } as unknown as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      );
    deliver(false);
    expect(section).toHaveAttribute('data-story-visible', 'false');
    deliver(true);
    expect(section).toHaveAttribute('data-story-visible', 'true');
  });
});

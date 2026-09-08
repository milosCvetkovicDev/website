import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeaturedWork } from '../featured-work';
import { featuredProjects } from '@/data/featured-projects';

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  });
}

function stubIntersectionObserver() {
  let callback: IntersectionObserverCallback = () => {};
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(observerCallback: IntersectionObserverCallback) {
        callback = observerCallback;
      }
      observe() {}
      disconnect() {}
    },
  );
  return (isIntersecting: boolean) =>
    act(() =>
      callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
}

const renderFeaturedWork = () => render(<FeaturedWork projects={featuredProjects} />);
const linkFor = (title: string) => screen.getByRole('link', { name: title });

describe('FeaturedWork', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('renders one link per featured project named by its case-study title', () => {
    stubMatchMedia(true);
    renderFeaturedWork();
    for (const project of featuredProjects) {
      expect(linkFor(project.title)).toHaveAttribute('href', `/work/${project.slug}`);
    }
  });

  it('activates a project and its architecture nodes on keyboard focus', () => {
    stubMatchMedia(true);
    const { container } = renderFeaturedWork();
    const [first, second] = featuredProjects;
    const secondCard = linkFor(second.title);

    fireEvent.focus(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'true');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(3);

    fireEvent.blur(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'false');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(0);

    fireEvent.mouseEnter(linkFor(first.title));
    expect(container.querySelectorAll('g[data-active="true"]')).toHaveLength(
      first.activeNodes.length,
    );
  });

  it('keeps the focused card active when the mouse leaves another card', () => {
    stubMatchMedia(true);
    renderFeaturedWork();
    const [first, second] = featuredProjects;

    fireEvent.mouseEnter(linkFor(first.title));
    fireEvent.focus(linkFor(second.title));
    fireEvent.mouseLeave(linkFor(first.title));

    expect(linkFor(second.title)).toHaveAttribute('data-active', 'true');
  });

  it('runs packet animations only while the section is on screen', () => {
    stubMatchMedia(false);
    const intersect = stubIntersectionObserver();
    const { container } = renderFeaturedWork();
    expect(container.querySelectorAll('animateMotion')).toHaveLength(0);

    intersect(true);
    expect(container.querySelectorAll('animateMotion').length).toBeGreaterThan(0);

    intersect(false);
    expect(container.querySelectorAll('animateMotion')).toHaveLength(0);
  });

  it('renders no SMIL animations under reduced motion', () => {
    stubMatchMedia(true);
    const intersect = stubIntersectionObserver();
    const { container } = renderFeaturedWork();
    intersect(true);
    fireEvent.focus(linkFor(featuredProjects[1].title));
    expect(container.querySelectorAll('animateMotion, animate')).toHaveLength(0);
  });

  it('is labelled as a landmark region', () => {
    stubMatchMedia(true);
    renderFeaturedWork();
    expect(screen.getByRole('region', { name: /featured work/i })).toBeInTheDocument();
  });
});

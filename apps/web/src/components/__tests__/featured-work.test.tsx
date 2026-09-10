import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeaturedWork } from '../featured-work';
import { getActiveConnections } from '@/data/architecture-graph';
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
const litConnections = (project: (typeof featuredProjects)[number]) =>
  getActiveConnections(project.activeNodes).filter((connection) => connection.active).length;

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

  it('names each card link by its visible text alone, with the description attached', () => {
    // WCAG 2.5.3 (Label in Name): the accessible name must contain the visible label. The card is
    // one click target through the link's ::after overlay, so the link itself holds only the title.
    stubMatchMedia(true);
    renderFeaturedWork();
    for (const project of featuredProjects) {
      const link = linkFor(project.title);
      expect(link).toHaveAccessibleName(project.title);
      expect(link.textContent).toBe(project.title);
      expect(link).not.toHaveAttribute('aria-labelledby');
      expect(link).not.toHaveAttribute('aria-label');
      expect(link).toHaveAccessibleDescription(project.description);
    }
  });

  it('renders nothing when there are no projects', () => {
    stubMatchMedia(true);
    const { container } = render(<FeaturedWork projects={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('activates a project and its architecture nodes on keyboard focus', () => {
    stubMatchMedia(true);
    const { container } = renderFeaturedWork();
    const [first, second] = featuredProjects;
    const secondCard = linkFor(second.title);

    fireEvent.focus(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'true');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(
      litConnections(second),
    );

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

  it('keeps the focused card active when the mouse only passes over another card', () => {
    stubMatchMedia(true);
    renderFeaturedWork();
    const [first, second] = featuredProjects;

    // Focus first, then hover elsewhere and leave: the keyboard focus must survive.
    fireEvent.focus(linkFor(second.title));
    fireEvent.mouseEnter(linkFor(first.title));
    expect(linkFor(first.title)).toHaveAttribute('data-active', 'true');

    fireEvent.mouseLeave(linkFor(first.title));
    expect(linkFor(second.title)).toHaveAttribute('data-active', 'true');
    expect(linkFor(first.title)).toHaveAttribute('data-active', 'false');
  });

  it('keeps the hovered card active when focus moves away', () => {
    stubMatchMedia(true);
    renderFeaturedWork();
    const [first, second] = featuredProjects;

    fireEvent.mouseEnter(linkFor(first.title));
    fireEvent.focus(linkFor(second.title));
    fireEvent.blur(linkFor(second.title));

    expect(linkFor(first.title)).toHaveAttribute('data-active', 'true');
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

  it('exposes the section and both lists to assistive technology', () => {
    stubMatchMedia(true);
    renderFeaturedWork();
    expect(screen.getByRole('region', { name: /featured work/i })).toBeInTheDocument();
    expect(screen.getAllByRole('list').length).toBeGreaterThanOrEqual(featuredProjects.length + 1);
  });
});

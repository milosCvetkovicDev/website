import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeaturedWork } from '../featured-work';
import { featuredProjects } from '@/data/featured-projects';

describe('FeaturedWork', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
  });

  it('renders one link per featured project with its case-study title', () => {
    render(<FeaturedWork />);
    for (const project of featuredProjects) {
      expect(screen.getByRole('link', { name: new RegExp(project.title) })).toHaveAttribute(
        'href',
        `/work/${project.slug}`,
      );
    }
  });

  it('activates a project and its architecture nodes on keyboard focus', () => {
    const { container } = render(<FeaturedWork />);
    const [first, second] = featuredProjects;
    const secondCard = screen.getByRole('link', { name: new RegExp(second.title) });

    fireEvent.focus(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'true');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(3);

    fireEvent.blur(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'false');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(0);

    fireEvent.mouseEnter(screen.getByRole('link', { name: new RegExp(first.title) }));
    expect(container.querySelectorAll('g[data-active="true"]')).toHaveLength(
      first.activeNodes.length,
    );
  });

  it('is labelled as a landmark region', () => {
    render(<FeaturedWork />);
    expect(screen.getByRole('region', { name: /featured work/i })).toBeInTheDocument();
  });
});

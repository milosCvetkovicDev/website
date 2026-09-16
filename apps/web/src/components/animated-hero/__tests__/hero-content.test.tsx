import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeroContent } from '../hero-content';

describe('HeroContent', () => {
  it('renders the h1 headline', () => {
    render(<HeroContent />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('This happened at 3am.');
    expect(h1).toHaveTextContent('Nobody woke up.');
  });

  it('renders the player card with correct CV data', () => {
    render(<HeroContent />);
    expect(screen.getByText('Milos Cvetkovic')).toBeInTheDocument();
    expect(screen.getByText('Full Stack Engineer & Architect')).toBeInTheDocument();
    expect(screen.getByText('AI-Native Development')).toBeInTheDocument();
    expect(screen.getByText(/13 years/)).toBeInTheDocument();
    expect(screen.getByText(/Building at Obsidian 22/)).toBeInTheDocument();
  });

  it('renders all 8 skill tags', () => {
    render(<HeroContent />);
    const skillList = screen.getByRole('list', { name: /technical skills/i });
    expect(skillList).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);

    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('NestJS')).toBeInTheDocument();
    expect(screen.getByText('Azure')).toBeInTheDocument();
    expect(screen.getByText('Terraform')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('DDD')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
  });

  it('renders sr-only SEO text for crawlers as a separate paragraph', () => {
    render(<HeroContent />);
    // Found by its text, then checked for what makes it sr-only text: a paragraph of its own,
    // visually hidden. The class is the assertion here, not the locator.
    const srOnly = screen.getByText(/Senior Full Stack Engineer/);
    expect(srOnly.tagName).toBe('P');
    expect(srOnly).toHaveClass('sr-only');
    expect(srOnly.textContent).toContain('AI-native development');
    expect(srOnly.textContent).toContain('TypeScript');
    expect(srOnly.textContent).toContain('React');
  });

  it('uses semantic HTML for player card (dl/dt/dd)', () => {
    render(<HeroContent />);
    const dl = document.querySelector('dl');
    expect(dl).toBeInTheDocument();

    // 4 PLAYER_STATS entries + 1 hardcoded STATUS row = 5 dt elements
    const dts = document.querySelectorAll('dt');
    expect(dts).toHaveLength(5);

    const dds = document.querySelectorAll('dd');
    expect(dds).toHaveLength(5);
  });

  it('renders the subtitle with CTA', () => {
    render(<HeroContent />);
    expect(screen.getByText(/inherit chaos and ship clarity/)).toBeInTheDocument();
    expect(screen.getByText('Scroll to see how.')).toBeInTheDocument();
  });

  it('renders the player card header dots (decorative)', () => {
    const { container } = render(<HeroContent />);
    // The window chrome is decoration with no role or name, so it is named rather than found by
    // being the first aria-hidden element in the tree.
    const chrome = container.querySelector('[data-decoration="window-controls"]');
    expect(chrome).toBeInTheDocument();
    expect(chrome).toHaveAttribute('aria-hidden', 'true');
    expect(chrome?.querySelectorAll('[data-window-control]')).toHaveLength(3);
    // The three controls are all that is in there: a fourth child would be content hidden from
    // assistive technology, which is what aria-hidden decoration must never carry.
    expect(chrome?.children).toHaveLength(3);
  });
});

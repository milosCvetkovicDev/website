import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { yearsOfExperience } from '@/data/profile';
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
    expect(
      screen.getByText(`${yearsOfExperience()} years · 6 domains · 3 clouds`),
    ).toBeInTheDocument();
    expect(screen.getByText(/Building at Obsidian 22/)).toBeInTheDocument();
  });

  it('reads the years of experience from the profile, not from a number of its own (#49)', () => {
    // A later year proves the figure is derived: a hard-coded count would still print this year's.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
      render(<HeroContent />);
      const xp = screen.getByText('XP').nextElementSibling;
      expect(xp, 'the XP term is followed by its definition').not.toBeNull();
      expect(xp?.textContent).toBe(`${yearsOfExperience()} years · 6 domains · 3 clouds`);
      expect(xp?.textContent).toMatch(/^18 years/);
    } finally {
      vi.useRealTimers();
    }
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

  it('says who this is in a visible line under the headline, hiding nothing from sighted readers', () => {
    render(<HeroContent />);
    const subtitle = screen.getByRole('heading', { level: 1 }).nextElementSibling;
    expect(subtitle?.tagName).toBe('P');
    expect(subtitle?.textContent).toContain('Milos Cvetkovic, Senior Full Stack Engineer');
    expect(subtitle?.textContent).toContain('AI-native development');
    expect(subtitle?.textContent).toContain('TypeScript');
    expect(subtitle?.textContent).toContain('React');
    // Text only crawlers see is hidden text in Google's sense; the hero carries none.
    expect(document.querySelector('.sr-only')).toBeNull();
  });

  it('uses semantic HTML for player card (dl/dt/dd)', () => {
    render(<HeroContent />);
    const dl = document.querySelector('dl');
    expect(dl).toBeInTheDocument();

    // 4 player stat rows + 1 hardcoded STATUS row = 5 dt elements
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
    // The three window controls in the card header are decoration, so the row that holds them is
    // hidden from assistive technology as a whole.
    const controls = container.querySelector('[data-window-controls]');
    expect(controls).toHaveAttribute('aria-hidden', 'true');
    expect(controls?.querySelectorAll('[data-window-dot]')).toHaveLength(3);
  });
});

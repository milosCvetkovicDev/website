import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { yearsOfExperience } from '@/data/profile';
import { HeroContent } from '../hero-content';

/** The owner's line of 2026-10-02 (#58): the h1 says who the site is about. */
const HEADLINE =
  'Milos Cvetkovic — senior full-stack engineer and architect building AI-native systems';

describe('HeroContent', () => {
  it('names who the site is about in the h1, with the hook as the paragraph right under it (#58)', () => {
    render(<HeroContent />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(HEADLINE);
    const hook = h1.nextElementSibling;
    expect(hook?.tagName).toBe('P');
    // `textContent` joins the text nodes with nothing, as a crawler's extraction does, so the
    // sentences only read apart because the markup puts a space before the line break.
    expect(hook?.textContent).toBe('This happened at 3am. Nobody woke up.');
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

    const items = within(skillList).getAllByRole('listitem');
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

  it('says who this is in the visible h1 and the specialisation in a visible line under the hook, hiding nothing from sighted readers', () => {
    render(<HeroContent />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Milos Cvetkovic');
    // The h1 carries the name and the role, so the line under the hook says only what it adds
    // (the owner's decision of 2026-10-02).
    const line = screen.getByText(
      'Specializing in AI-native development, TypeScript, React, and cloud architecture.',
    );
    expect(line.tagName).toBe('P');
    expect(line.previousElementSibling, 'the line comes right after the hook').toBe(
      h1.nextElementSibling,
    );
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

  it('keeps the space between the subtitle sentences in its text, across the line break (#58)', () => {
    render(<HeroContent />);
    const subtitle = screen.getByText('Scroll to see how.').parentElement;
    expect(subtitle?.tagName).toBe('P');
    expect(subtitle?.textContent).toBe(
      'I build systems that inherit chaos and ship clarity. Scroll to see how.',
    );
  });

  it('renders the player card header dots (decorative)', () => {
    const { container } = render(<HeroContent />);
    // The three window controls in the card header are decoration, so the row that holds them is
    // hidden from assistive technology as a whole.
    const rows = container.querySelectorAll('[data-window-controls]');
    expect(rows, 'the card header holds one window-control row').toHaveLength(1);
    const controls = rows[0];
    expect(controls).toHaveAttribute('aria-hidden', 'true');
    expect(controls.querySelectorAll('[data-window-dot]')).toHaveLength(3);
  });
});

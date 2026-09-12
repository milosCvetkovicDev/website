import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from '../footer';

/**
 * The footer's three social links and its copyright line.
 *
 * Row R38 of the RED manifest, fixed by #49, plus the green assertions that are the floor under it. The
 * footer's links were asserted nowhere before this file.
 *
 * The green half deliberately pins the *count and the shape*, not all three names. `footer.tsx:26`
 * still calls the X profile "Twitter", and that string is also the link's `aria-label` (`:82`); #49
 * renames it. Pinning three literal names here would make that rename read as a regression, so the X
 * profile is identified by its `x.com` href and the literal names are kept only for LinkedIn and
 * GitHub — which is the shape the task's Green-on-arrival notes ask for.
 */

/** The three profiles, by the href that identifies each one whatever its label says today. */
const PROFILES = [
  { what: 'LinkedIn', href: 'https://www.linkedin.com/in/milos-cvetkovic-dev', name: 'LinkedIn' },
  { what: 'GitHub', href: 'https://github.com/milosCvetkovicDev', name: 'GitHub' },
  // No expected name: "Twitter" today, something else after #49.
  { what: 'the X profile', href: 'https://x.com/milos_dev', name: undefined },
];

describe('Footer', () => {
  it('renders exactly three social links, one per profile', () => {
    render(<Footer />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(PROFILES.length);
    // By href, so a renamed label cannot make this fail and a *missing profile* still does.
    expect(links.map((link) => link.getAttribute('href')).sort()).toEqual(
      PROFILES.map(({ href }) => href).sort(),
    );
  });

  it('gives every social link a non-empty accessible name', () => {
    render(<Footer />);

    // Each link's only content is an `<svg>`, so without a label it is an unnamed link — the exact
    // failure `label-content-name-mismatch` and `link-name` exist for. The name is read here rather
    // than queried by, so a rename cannot turn this into a false failure.
    for (const link of screen.getAllByRole('link')) {
      const name = link.getAttribute('aria-label') ?? link.textContent ?? '';
      expect(name.trim(), `${link.getAttribute('href')} must have an accessible name`).not.toBe('');
    }
  });

  it('names the LinkedIn and GitHub links for their platforms', () => {
    render(<Footer />);

    // These two names are settled and are not part of R38's rename, so they are pinned literally.
    for (const { href, name } of PROFILES.filter((profile) => profile.name)) {
      const link = screen.getByRole('link', { name: name as string });
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('opens every profile in a new tab without leaking the referrer window', () => {
    render(<Footer />);

    // `target="_blank"` without `rel="noopener"` hands the opened page a live `window.opener`. Both
    // attributes are on every link today; this is the floor that keeps them there through the rename.
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it.fails('R38 (#49): the copyright line carries a © mark and the X link is named for X', () => {
    render(<Footer />);

    const problems: string[] = [];

    // The shape, not the year. The footer is a prerendered server component, so `getFullYear()` is
    // frozen at build time and a test pinning a literal year would pass in jsdom while saying nothing
    // about what visitors see; what that year should be is #49's decision. `footer.tsx:72` renders
    // "2026 Milos Cvetkovic. Built with Next.js." — the only thing missing is the mark itself.
    const copyright = screen.getByText(/Milos Cvetkovic\./).textContent ?? '';
    if (!/^© \d{4} Milos Cvetkovic\./.test(copyright.trim())) {
      problems.push(`the copyright line reads "${copyright.trim()}"`);
    }

    // And the label. "Twitter" has not been the name of that product since 2023, and the glyph next to
    // it (`footer.tsx:40`) is still the old bird.
    const xLink = screen.getByRole('link', { name: /twitter|^x$|x \(formerly twitter\)/i });
    const xName = xLink.getAttribute('aria-label') ?? '';
    if (/twitter/i.test(xName) && !/\bx\b/i.test(xName.replace(/twitter/gi, ''))) {
      problems.push(`the x.com link is still labelled "${xName}"`);
    }

    expect(problems).toEqual([]);
  });
});

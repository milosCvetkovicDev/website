import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from '../footer';

/**
 * The footer's three social links, its link to /privacy and its copyright line.
 *
 * Row R38 of the RED manifest, fixed by #49, plus the green assertions that are the floor under it. The
 * footer's links were asserted nowhere before this file.
 *
 * The profiles come from `data/social.ts` (#49, AC 15), but the hrefs and names below are literals on
 * purpose: they are the oracle, and a test that compared the footer with the module it reads could not
 * notice a profile typed wrong in that module. `data/__tests__/social.test.ts` pins the module itself.
 */

/** The three profiles, in the order the footer lists them, and the name each link carries. */
const PROFILES = [
  { href: 'https://www.linkedin.com/in/milos-cvetkovic-dev', name: 'LinkedIn' },
  { href: 'https://github.com/milosCvetkovicDev', name: 'GitHub' },
  { href: 'https://x.com/milos_dev', name: 'X' },
];

/**
 * The start of the X mark's path, the glyph `/contact` draws too. The bird it replaced started
 * `M22 4s`; pinning the new mark's first command is enough to tell the two apart.
 */
const X_MARK_PATH_START = 'M18.244 2.25h3.308';

/**
 * The social links: every footer link except the one to /privacy. Excluding the known internal link,
 * rather than selecting `https://` hrefs, keeps an `http://` or protocol-relative profile link in scope
 * of the target and rel checks below.
 */
const socialLinks = () =>
  screen.getAllByRole('link').filter((link) => link.getAttribute('href') !== '/privacy');

describe('Footer', () => {
  it('renders exactly three social links, one per profile, in the shared order', () => {
    render(<Footer />);

    const links = socialLinks();
    expect(links).toHaveLength(PROFILES.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      PROFILES.map(({ href }) => href),
    );
  });

  it('gives every social link a non-empty accessible name', () => {
    render(<Footer />);

    // Each link's only content is an `<svg>`, so without a label it is an unnamed link — the exact
    // failure `label-content-name-mismatch` and `link-name` exist for. The name is read here rather
    // than queried by, so a rename cannot turn this into a false failure.
    for (const link of socialLinks()) {
      const name = link.getAttribute('aria-label') ?? link.textContent ?? '';
      expect(name.trim(), `${link.getAttribute('href')} must have an accessible name`).not.toBe('');
    }
  });

  it("hides each social link's mark from assistive technology, so the link's label alone names it", () => {
    render(<Footer />);

    // The label is the whole name; an exposed `<svg>` inside the link can still be announced as an
    // unnamed graphic by some screen reader and browser pairs.
    for (const link of socialLinks()) {
      const marks = link.querySelectorAll('svg');
      expect(marks.length, `${link.getAttribute('href')} draws a mark`).toBeGreaterThan(0);
      for (const mark of marks) expect(mark).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('names every social link for its platform', () => {
    render(<Footer />);

    for (const { href, name } of PROFILES) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('opens every profile in a new tab without leaking the referrer window', () => {
    render(<Footer />);

    // `target="_blank"` without `rel="noopener"` hands the opened page a live `window.opener`. Both
    // attributes are on every link today; this is the floor that keeps them there through the rename.
    for (const link of socialLinks()) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('links to the privacy notice in the same tab, and to nothing else on the site', () => {
    render(<Footer />);

    // Every page carries the footer, so this is how a visitor finds the notice. An internal link
    // opening a new tab would be surprising, and would slip past the social-link scoping above.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(PROFILES.length + 1);
    const privacy = screen.getByRole('link', { name: 'Privacy' });
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(privacy).not.toHaveAttribute('target');
  });

  it('R38 (#49): the copyright line carries a © mark and the X link is named and drawn for X', () => {
    const { container } = render(<Footer />);

    const problems: string[] = [];

    // The shape, not the year. The footer is a prerendered server component, so the year is whatever
    // the source says; `footer.tsx` holds it as a constant, the owner's decision, and a test pinning
    // that literal would only restate it.
    const copyright = screen.getByText(/Milos Cvetkovic\./).textContent ?? '';
    if (!/^© \d{4} Milos Cvetkovic\./.test(copyright.trim())) {
      problems.push(`the copyright line reads "${copyright.trim()}"`);
    }

    // And the label. "Twitter" has not been the name of that product since 2023: the x.com link is
    // named "X" exactly, and no footer link names Twitter at all.
    const xName = container
      .querySelector('a[href="https://x.com/milos_dev"]')
      ?.getAttribute('aria-label');
    if (xName !== 'X') problems.push(`the x.com link is labelled "${xName ?? 'nothing'}"`);
    for (const link of screen.getAllByRole('link')) {
      const name = link.getAttribute('aria-label') ?? link.textContent ?? '';
      if (/twitter/i.test(name)) problems.push(`a footer link is labelled "${name}"`);
    }

    // And the glyph beside it, which was the old bird.
    const xPath = container.querySelector('a[href="https://x.com/milos_dev"] svg path');
    if (!xPath?.getAttribute('d')?.startsWith(X_MARK_PATH_START)) {
      problems.push(
        `the x.com link draws "${xPath?.getAttribute('d')?.slice(0, 16) ?? 'nothing'}…"`,
      );
    }

    expect(problems).toEqual([]);
  });
});

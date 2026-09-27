import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../privacy/page';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

/**
 * The privacy notice's body. The metadata is pinned in `page-metadata.test.ts` and the page's
 * colours and console by the e2e gates; this file pins what those cannot see: that the notice still
 * says what it is for, dates itself from the one date the sitemap sends, and points at its source
 * and at a way to ask.
 */
describe('PrivacyPage', () => {
  it('shows the notice, the data it lists, its date, its source and the way to ask', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Page-view statistics', 'Hosting', 'Your browser', 'Questions']);
    // The list of what Vercel receives: Vercel's table has ten fields, folded into these lines.
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(6);

    // "Last updated" and the sitemap's lastmod are one value, so neither can drift from the other.
    const updated = STATIC_ROUTE_UPDATED['/privacy'];
    const time = screen.getByText(updated);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', updated);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://vercel.com/docs/analytics/privacy-policy',
      '/contact',
    ]);
  });
});

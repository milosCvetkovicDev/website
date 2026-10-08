import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../privacy/page';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { formatContentDate } from '@/lib/content-date';

/** A day as the case studies write theirs, spelled out here rather than read from the month table. */
const DAY_AS_WRITTEN =
  /^\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/;

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

    // "Last updated" and the sitemap's lastmod are one value, so neither can drift from the other:
    // the attribute holds the stored day, the text that day as the case studies write theirs (#57).
    const updated = STATIC_ROUTE_UPDATED['/privacy'];
    const line = screen.getByText((_, element) =>
      Boolean(element?.matches('p') && element.textContent?.startsWith('Last updated')),
    );
    const time = line.querySelector('time');
    expect(time, 'the "Last updated" line dates itself with a <time>').not.toBeNull();
    expect(time?.textContent).toBe(formatContentDate(updated));
    expect(time?.textContent).toMatch(DAY_AS_WRITTEN);
    expect(time).toHaveAttribute('dateTime', updated);
    expect(line.textContent).toBe(`Last updated ${time?.textContent}.`);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://vercel.com/docs/analytics/privacy-policy',
      '/contact',
    ]);
  });
});

/**
 * The static routes' content dates. `src/app/__tests__/sitemap.test.ts` checks that each is a real
 * calendar date and that the sitemap sends it; this checks it is one a page may carry today.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { isPublishableContentDate } from '@/lib/content-date';
import { STATIC_ROUTE_UPDATED } from '../static-routes';

describe('STATIC_ROUTE_UPDATED', () => {
  // The live clock is deliberate: "not in the future" is a statement about the day the suite runs,
  // and a future date is a defect Google's publication-dates guidance names outright.
  it('dates every static route with a real day on or before today', () => {
    const now = new Date();
    const problems = Object.entries(STATIC_ROUTE_UPDATED)
      .filter(([, date]) => !isPublishableContentDate(date, now))
      .map(([route, date]) => `${route}: ${date} is not a real day on or before today`);
    expect(problems).toEqual([]);
    expect(
      Object.keys(STATIC_ROUTE_UPDATED).length,
      'an emptied table would be vacuous',
    ).toBeGreaterThan(0);
  });
});

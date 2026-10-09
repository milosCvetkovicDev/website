/**
 * The independent check the "Last updated" tests share (`content-day.ts`), proved on the day as the
 * pages write it and on the shapes it must refuse.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { DAY_AS_WRITTEN } from './content-day';

describe('DAY_AS_WRITTEN', () => {
  it('accepts a day written out, from the 1st to the 31st', () => {
    for (const day of [
      '1 January 2000',
      '7 October 2026',
      '29 February 2024',
      '31 December 2026',
    ]) {
      expect(day, day).toMatch(DAY_AS_WRITTEN);
    }
  });

  it('refuses the stored form, a padded or impossible day, and a month it does not name', () => {
    for (const day of [
      '2026-10-07',
      '07 October 2026',
      '0 October 2026',
      '32 October 2026',
      '7 Oct 2026',
      '7 october 2026',
      '7 October 26',
      'Last updated 7 October 2026',
      '',
    ]) {
      expect(day, JSON.stringify(day)).not.toMatch(DAY_AS_WRITTEN);
    }
  });
});

/**
 * The visible date string and the checks every stored content date has to pass. Pure functions over
 * strings, so there is no DOM here and no reason to pay for a jsdom window. The data files' own dates
 * are checked where the data is tested: `src/data/__tests__/case-studies.test.ts` and
 * `static-routes.test.ts`.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { formatContentDate, formatContentDates, isPublishableContentDate } from '../content-date';

/** Strings that are not a real `YYYY-MM-DD` day from 2000 on, each with why. */
const NOT_A_DAY: [string, string][] = [
  ['', 'empty'],
  ['TBD', 'a word'],
  ['2026-9-9', 'unpadded'],
  ['26-09-09', 'a two-digit year'],
  ['09/09/2026', 'another order'],
  [' 2026-09-09', 'a leading space'],
  ['2026-09-09\n', 'a trailing newline'],
  ['2026-02-30', 'a day the month does not have'],
  ['2025-02-29', 'the 29th of February in a common year'],
  ['2026-13-01', 'month 13'],
  ['2026-00-10', 'month zero'],
  ['2026-09-00', 'day zero'],
  ['2026-09-09T00:00:00', 'a bare local timestamp, which the build machine would resolve'],
  ['2026-09-09T00:00:00Z', 'a timestamp, which the stored grammar does not allow'],
  ['0026-09-09', 'a year typed without its century, which would print as "9 September 26"'],
  ['0000-01-01', 'year zero'],
  ['1999-12-31', 'a year before anything on this site'],
];

describe('formatContentDate', () => {
  it('writes a stored date as the day, the month name and the year', () => {
    expect(formatContentDate('2026-09-09')).toBe('9 September 2026');
    expect(formatContentDate('2026-09-25')).toBe('25 September 2026');
    expect(formatContentDate('2024-01-01')).toBe('1 January 2024');
    expect(formatContentDate('2025-12-31')).toBe('31 December 2025');
    expect(formatContentDate('2024-02-29')).toBe('29 February 2024');
    expect(formatContentDate('2000-01-01')).toBe('1 January 2000');
  });

  // The string is frozen into prerendered HTML, so reading the build machine's zone would let a
  // change of build environment change published text. The classic failure is a UTC-midnight date
  // read back with local getters west of Greenwich, which prints the day before.
  it('prints the same string whatever timezone the build machine is in', () => {
    const saved = process.env.TZ;
    // The local offset at one fixed instant, in minutes: proof that each switch of zone took effect
    // in this worker, so the loop cannot pass by running every round in the same zone.
    const offset = () => new Date('2026-01-01T00:00:00Z').getTimezoneOffset();
    const offsets = new Map<string, number>();
    try {
      for (const zone of [
        'Pacific/Kiritimati',
        'Pacific/Pago_Pago',
        'America/Los_Angeles',
        'UTC',
      ]) {
        process.env.TZ = zone;
        offsets.set(zone, offset());
        expect(formatContentDate('2026-09-09'), zone).toBe('9 September 2026');
        expect(formatContentDate('2026-01-01'), zone).toBe('1 January 2026');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
    expect(Object.fromEntries(offsets), 'every zone switch took effect').toEqual({
      'Pacific/Kiritimati': -840,
      'Pacific/Pago_Pago': 660,
      'America/Los_Angeles': 480,
      UTC: 0,
    });
  });

  it.each(NOT_A_DAY)('returns null, not a half-built string, for %j (%s)', (date) => {
    expect(formatContentDate(date)).toBeNull();
  });
});

describe('formatContentDates', () => {
  it('formats a clean pair, and one published and updated on the same day', () => {
    expect(formatContentDates('/work/x', '2026-09-09', '2026-09-25')).toEqual({
      published: '9 September 2026',
      updated: '25 September 2026',
    });
    expect(formatContentDates('/work/x', '2026-09-28', '2026-09-28')).toEqual({
      published: '28 September 2026',
      updated: '28 September 2026',
    });
  });

  // The page used to drop its visible line on a date like these while the TechArticle still marked
  // the raw value up. Throwing fails the prerender, so that mismatch cannot ship.
  it.each([
    ['2026-09-31', '2026-10-01', 'a published date the page cannot show'],
    ['2026-09-09', '2026-09-31', 'an updated date the page cannot show'],
    ['2026-09-09', '0026-09-25', 'an updated year without its century'],
  ])('throws, naming the page and both values, for %j and %j (%s)', (publishedAt, updatedAt) => {
    expect(() => formatContentDates('/work/x', publishedAt, updatedAt)).toThrow(
      `/work/x: content dates must be real YYYY-MM-DD days from 2000 on, got publishedAt "${publishedAt}" and updatedAt "${updatedAt}"`,
    );
  });

  it('throws for a pair updated before it was published', () => {
    expect(() => formatContentDates('/work/x', '2026-09-25', '2026-09-09')).toThrow(
      '/work/x: updatedAt 2026-09-09 is before publishedAt 2026-09-25',
    );
  });
});

describe('isPublishableContentDate', () => {
  const now = new Date('2026-09-28T12:00:00Z');

  it('accepts a real day up to and including today', () => {
    expect(isPublishableContentDate('2026-09-09', now)).toBe(true);
    expect(isPublishableContentDate('2026-09-28', now)).toBe(true);
    expect(isPublishableContentDate('2000-01-01', now)).toBe(true);
  });

  it('rejects a day that has not begun anywhere yet', () => {
    expect(isPublishableContentDate('2026-09-30', now)).toBe(false);
    expect(isPublishableContentDate('2027-09-28', now)).toBe(false);
  });

  // A bare date names a calendar day, not an instant, and the first zone to reach a day is UTC+14.
  // Judging against the UTC date instead would fail a commit dated just after local midnight east of
  // Greenwich, in CI too, for hours. The cost, accepted: for up to 14 hours after that, a reader
  // west of UTC+14 sees a date that is still tomorrow where they are.
  it('counts tomorrow as begun once UTC+14 has reached it', () => {
    expect(isPublishableContentDate('2026-09-29', new Date('2026-09-28T09:59:59Z'))).toBe(false);
    expect(isPublishableContentDate('2026-09-29', new Date('2026-09-28T10:00:00Z'))).toBe(true);
  });

  it.each(NOT_A_DAY)('rejects %j (%s)', (date) => {
    expect(isPublishableContentDate(date, now)).toBe(false);
  });

  it('rejects everything when the clock itself is not a real time', () => {
    expect(isPublishableContentDate('2026-09-09', new Date(Number.NaN))).toBe(false);
  });
});

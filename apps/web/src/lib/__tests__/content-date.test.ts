/**
 * The visible date string and the checks every stored content date has to pass. Pure functions over
 * strings, so there is no DOM here and no reason to pay for a jsdom window.
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { formatContentDate, isContentDate } from '../content-date';

/** Strings that are not a real `YYYY-MM-DD` day, each with why. */
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
];

describe('formatContentDate', () => {
  it('writes a stored date as the day, the month name and the year', () => {
    expect(formatContentDate('2026-09-09')).toBe('9 September 2026');
    expect(formatContentDate('2026-09-25')).toBe('25 September 2026');
    expect(formatContentDate('2024-01-01')).toBe('1 January 2024');
    expect(formatContentDate('2025-12-31')).toBe('31 December 2025');
    expect(formatContentDate('2024-02-29')).toBe('29 February 2024');
  });

  // The string is frozen into prerendered HTML, so reading the build machine's zone would let a
  // change of build environment change published text. The classic failure is a UTC-midnight date
  // read back with local getters west of Greenwich, which prints the day before.
  it('prints the same string whatever timezone the build machine is in', () => {
    const saved = process.env.TZ;
    try {
      for (const zone of [
        'Pacific/Kiritimati',
        'Pacific/Pago_Pago',
        'America/Los_Angeles',
        'UTC',
      ]) {
        process.env.TZ = zone;
        expect(formatContentDate('2026-09-09'), zone).toBe('9 September 2026');
        expect(formatContentDate('2026-01-01'), zone).toBe('1 January 2026');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it.each(NOT_A_DAY)('returns null, not a half-built string, for %j (%s)', (date) => {
    expect(formatContentDate(date)).toBeNull();
  });
});

describe('isContentDate', () => {
  const now = new Date('2026-09-28T12:00:00Z');

  it('accepts a real day up to and including today', () => {
    expect(isContentDate('2026-09-09', now)).toBe(true);
    expect(isContentDate('2026-09-28', now)).toBe(true);
    expect(isContentDate('2000-01-01', now)).toBe(true);
  });

  it('rejects a day that has not begun anywhere yet', () => {
    expect(isContentDate('2026-09-30', now)).toBe(false);
    expect(isContentDate('2027-09-28', now)).toBe(false);
  });

  // A bare date names a calendar day, not an instant, and the first zone to reach a day is UTC+14.
  // Judging against the UTC date instead would fail a commit dated just after local midnight east of
  // Greenwich, in CI too, for hours.
  it('counts tomorrow as begun once UTC+14 has reached it', () => {
    expect(isContentDate('2026-09-29', new Date('2026-09-28T09:59:59Z'))).toBe(false);
    expect(isContentDate('2026-09-29', new Date('2026-09-28T10:00:00Z'))).toBe(true);
  });

  it.each(NOT_A_DAY)('rejects %j (%s)', (date) => {
    expect(isContentDate(date, now)).toBe(false);
  });

  it('rejects everything when the clock itself is not a real time', () => {
    expect(isContentDate('2026-09-09', new Date(Number.NaN))).toBe(false);
  });
});

/**
 * Everything wrong with one page's pair of dates, judged at the current clock: each must be a real
 * day that has begun, and the page cannot have changed before it was published.
 */
function datePairProblems(page: string, publishedAt: string, updatedAt: string): string[] {
  const now = new Date();
  const problems: string[] = [];
  const fields: [string, string][] = [
    ['publishedAt', publishedAt],
    ['updatedAt', updatedAt],
  ];
  for (const [field, date] of fields) {
    if (!isContentDate(date, now)) {
      problems.push(
        `${page}: ${field} ${JSON.stringify(date)} is not a real day on or before today`,
      );
    }
  }
  if (updatedAt < publishedAt) {
    problems.push(`${page}: updatedAt ${updatedAt} is before publishedAt ${publishedAt}`);
  }
  return problems;
}

describe('the content dates in src/data', () => {
  // The live clock is deliberate: "not in the future" is a statement about the day the suite runs,
  // and a future date is a defect Google's publication-dates guidance names outright.
  it('dates every case study with real days that have begun, updated no earlier than published', () => {
    const problems = caseStudies.flatMap(({ slug, publishedAt, updatedAt }) =>
      datePairProblems(`/work/${slug}`, publishedAt, updatedAt),
    );
    expect(problems).toEqual([]);
  });

  it('dates every static route with a real day that has begun', () => {
    const problems = Object.entries(STATIC_ROUTE_UPDATED)
      .filter(([, date]) => !isContentDate(date, new Date()))
      .map(([route, date]) => `${route}: ${date} is not a real day on or before today`);
    expect(problems).toEqual([]);
  });
});

describe('the pair check, proved on fixtures at a fixed clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a clean pair, and one published and updated on the same day', () => {
    expect(datePairProblems('fixture', '2026-09-09', '2026-09-25')).toEqual([]);
    expect(datePairProblems('fixture', '2026-09-28', '2026-09-28')).toEqual([]);
  });

  it('flags an update dated after today', () => {
    expect(datePairProblems('fixture', '2026-09-09', '2026-10-01')).toEqual([
      'fixture: updatedAt "2026-10-01" is not a real day on or before today',
    ]);
  });

  it('flags a pair updated before it was published', () => {
    expect(datePairProblems('fixture', '2026-09-25', '2026-09-09')).toEqual([
      'fixture: updatedAt 2026-09-09 is before publishedAt 2026-09-25',
    ]);
  });

  it('flags a bare local timestamp', () => {
    expect(datePairProblems('fixture', '2026-09-09T10:00:00', '2026-09-25')).toEqual([
      'fixture: publishedAt "2026-09-09T10:00:00" is not a real day on or before today',
    ]);
  });
});

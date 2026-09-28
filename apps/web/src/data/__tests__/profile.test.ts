/**
 * The years of experience, derived from one constant (#49, pages-9 and live-14).
 *
 * The site used to state the figure by hand in four places, as two different numbers: a fixed count
 * in the Person JSON-LD and the hero's player card, and `10+` in the About description and quick
 * facts. A fixed count also goes stale every January. `profile.ts` holds the year the career starts
 * and derives the total from it, and every page reads the total from there.
 *
 * Pure data with no DOM in it, so it runs in node rather than paying for a jsdom window.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { facts, timeline } from '../pages/about';
import { CAREER_START_YEAR, experienceFact, yearsOfExperience } from '../profile';

afterEach(() => {
  vi.useRealTimers();
});

describe('yearsOfExperience', () => {
  it('counts the calendar years since the career started in 2013', () => {
    expect(CAREER_START_YEAR).toBe(2013);
    expect(yearsOfExperience(new Date('2026-09-28T12:00:00Z'))).toBe(13);
  });

  it('reads the clock when it is given no date, so the figure moves on by itself each January', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
    expect(yearsOfExperience()).toBe(18);
  });

  it('turns over at midnight UTC on 1 January, whatever time zone the build runs in', () => {
    expect(yearsOfExperience(new Date('2026-12-31T23:59:59.999Z'))).toBe(13);
    expect(yearsOfExperience(new Date('2027-01-01T00:00:00.000Z'))).toBe(14);
  });

  it('starts where the /about timeline starts', () => {
    // The count is only as true as its start. The About page shows the career from its first role,
    // so a start year that disagreed with that row would contradict the page it is printed on.
    const firstRole = Math.min(...timeline.map(({ year }) => Number(year)));
    expect(firstRole).toBe(CAREER_START_YEAR);
  });
});

describe('the quick fact that states it', () => {
  it('prints the derived figure', () => {
    expect(experienceFact(new Date('2026-09-28T12:00:00Z'))).toEqual({
      label: 'Years shipping code',
      value: '13',
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
    expect(experienceFact().value).toBe('18');
  });

  it('is the fact the /about record lists, whole', () => {
    expect(facts).toContainEqual(experienceFact());
  });
});

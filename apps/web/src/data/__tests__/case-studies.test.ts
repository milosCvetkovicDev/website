/**
 * These are pure data assertions with no DOM in them, and building a jsdom window is the most
 * expensive thing in a test file that does not need one -- importing the module alone costs about
 * two seconds in every worker.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { isContentDate } from '@/lib/content-date';
import { adjacentCaseStudies, caseStudies, formatMetric } from '../case-studies';

describe('formatMetric', () => {
  it('renders a whole number with a suffix', () => {
    expect(formatMetric({ value: 73, suffix: '%', label: 'faster resolution' })).toBe('73%');
  });

  it('renders a prefix, decimals and a suffix together', () => {
    expect(formatMetric({ value: 1.25, prefix: '~', suffix: 'x', decimals: 1, label: 'x' })).toBe(
      '~1.3x',
    );
  });

  it('renders a bare number when there is no prefix or suffix', () => {
    expect(formatMetric({ value: 12, label: 'services' })).toBe('12');
  });

  // `not.toThrow()` alone would also pass for a formatMetric that returned the empty string, so the
  // rendered strings are asserted. The clamp is to 0..20, a cap chosen inside the 0..100 that
  // `toFixed` accepts: past 20 digits a double shows only rounding noise.
  it('clamps an out-of-range decimals value instead of throwing', () => {
    expect(formatMetric({ value: 5, decimals: -1, label: 'x' })).toBe('5');
    expect(formatMetric({ value: 5, decimals: -1000, label: 'x' })).toBe('5');
    expect(formatMetric({ value: 5, decimals: 500, label: 'x' })).toBe(`5.${'0'.repeat(20)}`);
    expect(formatMetric({ value: 5, decimals: Infinity, label: 'x' })).toBe(`5.${'0'.repeat(20)}`);
    expect(formatMetric({ value: 5, decimals: -Infinity, label: 'x' })).toBe('5');
    // The sign of the value survives a clamped count.
    expect(formatMetric({ value: -5, decimals: 500, label: 'x' })).toBe(`-5.${'0'.repeat(20)}`);
    // A fractional count renders its whole digits: 2.9 gives two, not the three rounding would.
    expect(formatMetric({ value: 5, decimals: 2.9, label: 'x' })).toBe('5.00');
    // A NaN count renders no decimals rather than throwing: `toFixed` reads NaN as 0 digits.
    expect(formatMetric({ value: 5, decimals: Number.NaN, label: 'x' })).toBe('5');
  });

  it('does not print NaN or Infinity', () => {
    expect(formatMetric({ value: Number.NaN, suffix: '%', label: 'x' })).toBe('—');
    expect(formatMetric({ value: Number.POSITIVE_INFINITY, suffix: '%', label: 'x' })).toBe('—');
  });
});

describe('caseStudies', () => {
  it('has unique slugs', () => {
    expect(new Set(caseStudies.map((study) => study.slug)).size).toBe(caseStudies.length);
  });

  it('dates every study with real calendar dates, none in the future, updated no earlier than published', () => {
    // The live clock is deliberate: "not in the future" is a statement about the day the suite runs.
    // Google's publication-dates guidance forbids a future date, and the page now shows these.
    const now = new Date();
    for (const { slug, publishedAt, updatedAt } of caseStudies) {
      for (const date of [publishedAt, updatedAt]) {
        expect(date, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), slug).toBe(date);
        expect(isContentDate(date, now), `${slug}: ${date} is in the future`).toBe(true);
      }
      expect(updatedAt >= publishedAt, `${slug}: updatedAt before publishedAt`).toBe(true);
    }
  });

  it('states every headline metric as a finite number', () => {
    for (const study of caseStudies) {
      expect(Number.isFinite(study.highlight.metric.value)).toBe(true);
      expect(study.highlight.metric.label.length).toBeGreaterThan(0);
    }
  });
});

describe('adjacentCaseStudies', () => {
  it('links every study to the studies either side of it, never to itself', () => {
    const count = caseStudies.length;
    caseStudies.forEach(({ slug }, index) => {
      const adjacent = adjacentCaseStudies(slug);
      expect(adjacent.map(({ study }) => study.slug)).not.toContain(slug);
      expect(adjacent).toEqual([
        { direction: 'previous', study: caseStudies[(index - 1 + count) % count] },
        { direction: 'next', study: caseStudies[(index + 1) % count] },
      ]);
    });
    expect(count, 'with three studies, previous and next are the other two').toBe(3);
  });

  it('reaches every study from some other study, so none is left without an inbound link', () => {
    const linked = new Set(
      caseStudies.flatMap(({ slug }) => adjacentCaseStudies(slug).map(({ study }) => study.slug)),
    );
    expect([...linked].sort()).toEqual(caseStudies.map(({ slug }) => slug).sort());
  });

  it('returns nothing for a slug it does not know', () => {
    expect(adjacentCaseStudies('no-such-study')).toEqual([]);
  });
});

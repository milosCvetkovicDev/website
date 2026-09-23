/**
 * These are pure data assertions with no DOM in them, and building a jsdom window is the most
 * expensive thing in a test file that does not need one -- importing the module alone costs about
 * two seconds in every worker.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
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

  it('clamps an out-of-range decimals value instead of throwing', () => {
    expect(() => formatMetric({ value: 5, decimals: -1, label: 'x' })).not.toThrow();
    expect(() => formatMetric({ value: 5, decimals: 500, label: 'x' })).not.toThrow();
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

  it('dates every study with real calendar dates, updated no earlier than published', () => {
    for (const { slug, publishedAt, updatedAt } of caseStudies) {
      for (const date of [publishedAt, updatedAt]) {
        expect(date, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), slug).toBe(date);
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

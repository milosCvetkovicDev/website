/**
 * These are pure data assertions with no DOM in them, and building a jsdom window is the most
 * expensive thing in a test file that does not need one -- importing the module alone costs about
 * two seconds in every worker.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { caseStudies, formatMetric } from '../case-studies';

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

  it('states every headline metric as a finite number', () => {
    for (const study of caseStudies) {
      expect(Number.isFinite(study.highlight.metric.value)).toBe(true);
      expect(study.highlight.metric.label.length).toBeGreaterThan(0);
    }
  });
});

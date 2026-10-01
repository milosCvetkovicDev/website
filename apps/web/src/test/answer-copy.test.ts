/**
 * @vitest-environment node
 *
 * The measures the /about question-and-answer block (#58) is held to, checked on their own so a
 * passing answer means the answer is right, not that the measure is blind.
 */
import { describe, expect, it } from 'vitest';
import { restatedMetrics, wordCount } from './answer-copy';

describe('wordCount', () => {
  it('counts what a reader counts: dotted names whole, dashes as breaks, a lone dash as none', () => {
    expect(wordCount('React and Next.js — on the front')).toBe(6);
    expect(wordCount('Humans stayed in control—agent proposed')).toBe(6);
    expect(wordCount('a range of 40–80 words')).toBe(6);
    expect(wordCount('  ')).toBe(0);
  });
});

describe('restatedMetrics', () => {
  const metrics = [
    { value: 73, suffix: '%', label: 'faster resolution' },
    { value: 5, suffix: '×', label: 'faster builds' },
  ];

  it.each([
    ['as the cards render it', 'It resolved errors 73% faster.', ['73%']],
    ['with a space before the unit', 'It resolved errors 73 % faster.', ['73%']],
    ['spelled as percent', 'It resolved errors 73 percent faster.', ['73%']],
    ['spelled as per cent', 'It resolved errors 73 per cent faster.', ['73%']],
    ['with a Latin x', 'Builds ran 5x faster.', ['5×']],
    ['as times', 'Builds ran 5 times faster.', ['5×']],
    ['as fold', 'A 5-fold speed-up.', ['5×']],
  ])('finds a figure written %s', (_, text, found) => {
    expect(restatedMetrics(text, metrics)).toEqual(found);
  });

  it.each([
    ['inside a longer number', 'A 173% jump and 15x more logs.'],
    ['as a bare number with no unit', 'Retries capped at 5 attempts, 73 services.'],
  ])('passes a number %s', (_, text) => {
    expect(restatedMetrics(text, metrics)).toEqual([]);
  });
});

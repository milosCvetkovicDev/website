/**
 * @vitest-environment node
 *
 * `pictographsIn` and `isOnlyEmoji`, the emoji test the page records and `e2e/pages.spec.ts` share.
 */
import { describe, expect, it } from 'vitest';
import { isOnlyEmoji, pictographsIn } from './pictographs';

describe('pictographsIn', () => {
  it.each([
    ['🚀 Ship it', '🚀 U+1F680'],
    ['gear ⚙️', '⚙ U+2699'],
    ['from 🇷🇸', '🇷 U+1F1F7'],
    ['press 1️⃣', '⃣ U+20E3'],
    ['©️ the emoji form', '©️ U+A9 U+FE0F'],
  ])('finds the emoji in %j', (text, first) => {
    expect(pictographsIn(text)[0]).toBe(first);
  });

  it('finds both halves of a flag', () => {
    expect(pictographsIn('🇷🇸')).toHaveLength(2);
  });

  it.each([
    'Angular Certified Architect',
    '© 2026 Milos Cvetkovic',
    'Portfolio® and Next.js™',
    'Testing & Quality: 95%',
    '',
  ])('finds nothing in %j', (text) => {
    expect(pictographsIn(text)).toEqual([]);
  });

  it('gives the same answer on every call', () => {
    // A global expression shared between calls would start the second one where the first stopped.
    expect(pictographsIn('🚀')).toHaveLength(1);
    expect(pictographsIn('🚀')).toHaveLength(1);
  });
});

describe('isOnlyEmoji', () => {
  it.each(['🚀', '⚙️', '☁️', '🏗️', '👁️‍🗨️'])('accepts %j', (text) => {
    expect(isOnlyEmoji(text)).toBe(true);
  });

  it.each(['', ' ', '🚀 ', 'A', '🚀 Ship', '️', '©'])('refuses %j', (text) => {
    expect(isOnlyEmoji(text)).toBe(false);
  });
});

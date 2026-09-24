/**
 * @vitest-environment node
 *
 * The two pure helpers behind the link-preview cards. The cards themselves are PNGs rendered at build
 * time; `e2e/seo-surface.spec.ts` (R23) proves every route serves one that answers as an image.
 */
import { describe, expect, it } from 'vitest';
import { buildMetadata } from '../metadata';
import { cardAlt, cardText } from '../og-image';

describe('cardText()', () => {
  it('reads the card’s words from the metadata the page already declares', () => {
    const metadata = buildMetadata({
      title: 'Work',
      socialTitle: 'Work & Case Studies',
      description: 'Case studies.',
      path: '/work',
    });
    expect(cardText(metadata)).toEqual({
      title: 'Work & Case Studies',
      description: 'Case studies.',
    });
  });

  it('refuses metadata without a plain Open Graph title, rather than drawing an empty card', () => {
    expect(() => cardText({ title: 'Work' })).toThrow(/openGraph/);
  });
});

describe('cardAlt()', () => {
  it('names the owner once', () => {
    expect(cardAlt('About Milos Cvetkovic')).toBe('About Milos Cvetkovic');
    expect(cardAlt('Work & Case Studies')).toBe('Work & Case Studies — Milos Cvetkovic');
  });
});

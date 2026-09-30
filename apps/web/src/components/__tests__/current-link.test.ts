/**
 * The rule that decides which header link is the current page, shared by the desktop nav and the
 * mobile menu. It is pure, so it runs without a DOM: building a jsdom window is the most expensive
 * thing in a test file that does not need one.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { isCurrentLink } from '../current-link';

describe('isCurrentLink', () => {
  it('marks / current on / only, not on every route that starts with a slash', () => {
    expect(isCurrentLink('/', '/')).toBe(true);
    for (const pathname of ['/about', '/work', '/work/self-healing-agent', '/no-such-page']) {
      expect(isCurrentLink(pathname, '/'), pathname).toBe(false);
    }
  });

  it('marks a section current on its own page and on the pages below it', () => {
    expect(isCurrentLink('/work', '/work')).toBe(true);
    expect(isCurrentLink('/work/self-healing-agent', '/work')).toBe(true);
  });

  it('does not match a route that only shares the prefix', () => {
    expect(isCurrentLink('/workshop', '/work')).toBe(false);
    expect(isCurrentLink('/work-in-progress', '/work')).toBe(false);
  });

  it('marks no other section current', () => {
    for (const href of ['/about', '/skills', '/blog', '/contact']) {
      expect(isCurrentLink('/work/self-healing-agent', href), href).toBe(false);
    }
  });
});

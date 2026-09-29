/**
 * @vitest-environment node
 *
 * `linkKind()`, which decides how a page renders a link from its record: through `next/link` for a
 * path on this site, as a plain `<a>` for an external URL. A protocol-relative href names another
 * origin, so it must never be taken for an on-site path.
 */
import { describe, expect, it } from 'vitest';
import { linkKind } from '../links';

describe('linkKind', () => {
  it.each(['/', '/contact', '/work/nx-remote-cache', '/privacy#hosting'])(
    'reads %s as a path on this site',
    (href) => {
      expect(linkKind(href)).toBe('site');
    },
  );

  it.each([
    'https://vercel.com/docs/analytics/privacy-policy',
    'http://example.com',
    'mailto:someone@example.com',
  ])('reads %s as an external URL', (href) => {
    expect(linkKind(href)).toBe('external');
  });

  // `//host` is protocol-relative, and a browser reads `/\host` the same way.
  it.each([
    '//evil.example/x',
    '/\\evil.example',
    'javascript:alert(1)',
    'data:text/html,hi',
    'contact',
    '#top',
    '',
  ])('refuses %j', (href) => {
    expect(() => linkKind(href)).toThrow(/neither a path on this site nor/);
  });
});

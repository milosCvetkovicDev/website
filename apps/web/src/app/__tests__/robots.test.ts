/**
 * @vitest-environment node
 *
 * `robots()`'s rules.
 *
 * The file used to disallow `/api/` and `/_next/` (R25, #48). `/_next/` holds every stylesheet, chunk
 * and font, so a crawler that obeyed it rendered the pages unstyled; `/api/` names a segment this app
 * does not have. The whole output is pinned below, so a rule can only come back deliberately.
 * `e2e/seo-surface.spec.ts` checks the same thing over HTTP, which is what a crawler receives.
 *
 * No DOM, so `node` rather than jsdom (CLAUDE.md, Testing).
 */
import { describe, expect, it } from 'vitest';
import robots from '../robots';

// The same expression the module uses (`robots.ts:4`), so a developer who has NEXT_PUBLIC_SITE_URL set in
// their shell gets the assertions they should rather than a failure about an origin nobody is testing.
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

/** `MetadataRoute.Robots['rules']` is one object or an array of them; this file writes one. */
function onlyRule() {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  if (!rule) throw new Error('robots() returned no rules');
  return rule;
}

const asArray = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

describe('robots()', () => {
  it('points at the sitemap on the same origin', () => {
    // The one line that makes the file worth serving. A sitemap URL on another origin is ignored.
    const { sitemap } = robots();
    expect(sitemap).toBe(`${BASE}/sitemap.xml`);
    expect(new URL(String(sitemap)).origin).toBe(BASE);
  });

  it('addresses every crawler and allows the site root', () => {
    const rule = onlyRule();
    expect(rule.userAgent).toBe('*');
    expect(asArray(rule.allow)).toContain('/');
  });

  it('follows NEXT_PUBLIC_SITE_URL when it is set', () => {
    // `robots()` reads the variable inside the function body rather than at module scope, so setting it
    // and calling again is enough — no re-import, which would only earn a Vite dynamic-import warning.
    // That is a real difference from `components/json-ld.tsx`, which does read it at module scope and
    // therefore does need `vi.resetModules()`.
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.example.test';
    try {
      expect(robots().sitemap).toBe('https://staging.example.test/sitemap.xml');
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it('is exactly one allow-all rule and the sitemap line', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: `${BASE}/sitemap.xml`,
    });
  });

  it('disallows nothing that would hide a page from search', () => {
    // Narrower than R25 on purpose, and green today: this is the property that must never break, while
    // R25 in e2e/seo-surface.spec.ts is the specific `/_next/` and `/api/` mistake #48 removes. A rule
    // matching a page route would delist it, which is a category worse than blocking an asset.
    const disallowed = asArray(onlyRule().disallow);
    for (const path of ['/', '/about', '/work', '/skills', '/contact', '/blog']) {
      expect(disallowed, `robots.txt must not disallow the page route ${path}`).not.toContain(path);
    }
  });
});

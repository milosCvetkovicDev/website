/**
 * @vitest-environment node
 *
 * `sitemap()`'s output, against the data file it should be derived from.
 *
 * Row R31 of the RED manifest, fixed by #48, plus the green assertions around it. No DOM here, so
 * `node` rather than jsdom: building a jsdom window costs about two seconds in every worker and is the
 * largest single cost in this suite (CLAUDE.md, Testing).
 *
 * The sitemap restates the six static routes by hand (`sitemap.ts:7-44`) while `e2e/routes.ts` and
 * `console-clean.spec.ts` keep their own copies. Consolidating the *source* side is #48's — a module
 * under `src/app` importing from `e2e/` would ship the spec directory into the build — so this file
 * asserts the two agree rather than editing either.
 */
import { describe, expect, it } from 'vitest';
import sitemap from '../sitemap';
import { caseStudies } from '@/data/case-studies';

// The same expression the module uses (`sitemap.ts:5`), so a developer who has NEXT_PUBLIC_SITE_URL set
// in their shell gets the assertions they should rather than a failure about an origin nobody is testing.
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

/** The routes that belong in a sitemap: the static six minus /blog, plus every case study. */
const EXPECTED_URLS = [
  BASE,
  `${BASE}/about`,
  `${BASE}/work`,
  `${BASE}/skills`,
  `${BASE}/contact`,
  ...caseStudies.map(({ slug }) => `${BASE}/work/${slug}`),
];

describe('sitemap()', () => {
  it('is derived from the case-study data, not a hand-written list of slugs', () => {
    // Green, and the one thing the sitemap already gets right: a new case study reaches it without an
    // edit. The rest of this file is about what it gets wrong.
    const urls = sitemap().map(({ url }) => url);
    for (const { slug } of caseStudies) {
      expect(urls, `the sitemap must list the ${slug} case study`).toContain(
        `${BASE}/work/${slug}`,
      );
    }
    expect(caseStudies.length, 'an emptied data file would make that vacuous').toBeGreaterThan(0);
  });

  it('gives every entry an absolute URL under one origin, a changeFrequency and a priority', () => {
    // Green. A relative `url` is silently accepted by the type and is invalid in a sitemap.
    for (const entry of sitemap()) {
      expect(entry.url, `${entry.url} must be absolute`).toMatch(/^https:\/\//);
      expect(new URL(entry.url).origin).toBe(BASE);
      expect(entry.changeFrequency).toBeDefined();
      expect(typeof entry.priority).toBe('number');
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });

  it('lists no URL twice', () => {
    // Green. Two entries for one URL is the shape a copy-paste edit leaves behind.
    const urls = sitemap().map(({ url }) => url);
    expect(urls).toHaveLength(new Set(urls).size);
  });

  it.fails(
    'R31 (#48): lists exactly the indexable routes, excludes /blog, and does not stamp every entry with one build clock',
    () => {
      const entries = sitemap();

      // Two defects in one row, because they are one edit: the URL set and the timestamps.
      //
      // /blog is a Coming Soon placeholder. The owner decision of 2026-09-11 keeps its nav link, makes
      // it noindex (R26) and takes it out of the sitemap — offering an empty page to search and
      // telling the same crawler not to index it is a contradiction, and it is currently listed
      // weekly at priority 0.6.
      expect(entries.map(({ url }) => url).sort()).toEqual([...EXPECTED_URLS].sort());

      // Every entry is `lastModified: new Date()` (`sitemap.ts:10-48`), so all nine stamps are the
      // same instant — the moment the sitemap was generated. That tells a crawler the whole site
      // changed on every deploy, which is the same as telling it nothing, and it will stop trusting
      // the field. Distinct stamps per route are what make it worth sending.
      const stamps = entries.map(({ lastModified }) => String(lastModified));
      expect(
        new Set(stamps).size,
        'every entry shares one timestamp: lastModified is a build clock, not a content date',
      ).toBeGreaterThan(1);
    },
  );
});

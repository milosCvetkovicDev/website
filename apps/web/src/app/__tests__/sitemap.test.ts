/**
 * @vitest-environment node
 *
 * `sitemap()`'s output, against the data file it should be derived from.
 *
 * Row R31 of the RED manifest, fixed by #48, plus the assertions around it. No DOM here, so `node`
 * rather than jsdom: building a jsdom window costs about two seconds in every worker and is the
 * largest single cost in this suite (CLAUDE.md, Testing).
 *
 * The sitemap lists the static routes by hand, with their dates from `src/data/static-routes.ts`,
 * while `e2e/routes.ts` keeps the spec side's own list; a module under `src/app` importing from
 * `e2e/` would ship the spec directory into the build. So this file asserts the two agree.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '../sitemap';
import { caseStudies } from '@/data/case-studies';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

// The same expression as `baseUrl` in sitemap.ts, so a developer who has NEXT_PUBLIC_SITE_URL set
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

  it('leaves out /blog while it is a noindex placeholder', () => {
    // The page says noindex (R26); a sitemap entry would offer it to the same crawler anyway.
    expect(sitemap().map(({ url }) => url)).not.toContain(`${BASE}/blog`);
  });

  it('lists no URL twice', () => {
    // Green. Two entries for one URL is the shape a copy-paste edit leaves behind.
    const urls = sitemap().map(({ url }) => url);
    expect(urls).toHaveLength(new Set(urls).size);
  });

  it('R31 (#48): lists exactly the indexable routes, excludes /blog, and dates each by its content', () => {
    const entries = sitemap();

    // Two defects in one row, because they were one edit: the URL set and the timestamps.
    //
    // /blog is a Coming Soon placeholder. The owner decision of 2026-09-11 keeps its nav link, makes
    // it noindex (R26) and takes it out of the sitemap: offering an empty page to search and telling
    // the same crawler not to index it is a contradiction.
    expect(entries.map(({ url }) => url).sort()).toEqual([...EXPECTED_URLS].sort());

    // Every entry used to be `lastModified: new Date()`, so all of them carried the one instant the
    // sitemap was generated. That tells a crawler the whole site changed on every deploy, which is
    // the same as telling it nothing, and it stops trusting the field.
    const stamps = entries.map(({ lastModified }) => String(lastModified));
    expect(
      new Set(stamps).size,
      'every entry shares one timestamp: lastModified is a build clock, not a content date',
    ).toBeGreaterThan(1);
  });

  describe('lastModified', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not depend on when the sitemap is generated', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const before = sitemap();
      vi.setSystemTime(new Date('2031-06-15T12:34:56Z'));
      expect(sitemap()).toEqual(before);
    });

    it('is a real calendar date, from the data files', () => {
      const byUrl = new Map(sitemap().map(({ url, lastModified }) => [url, lastModified]));
      expect(byUrl.get(BASE)).toBe(STATIC_ROUTE_UPDATED['/']);
      for (const { slug, updatedAt } of caseStudies) {
        expect(byUrl.get(`${BASE}/work/${slug}`)).toBe(updatedAt);
      }
      for (const date of byUrl.values()) {
        expect(String(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Round-trips through Date, so 2026-02-30 cannot slip in.
        expect(new Date(`${String(date)}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
      }
    });
  });
});

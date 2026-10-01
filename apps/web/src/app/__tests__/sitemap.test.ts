/**
 * @vitest-environment node
 *
 * `sitemap()`'s output, against the data file it should be derived from.
 *
 * Row R31 of the RED manifest, fixed by #48, plus the assertions around it. #61 rewrote R31 and the
 * /blog row from "never /blog" to "/blog and every published post once one is published": the
 * `hasPublishedPosts` switch of ADR 0028. The real `posts` array is empty until the owner publishes
 * the first post, so the last block loads the sitemap over the fixture posts for the other side.
 * No DOM here, so `node` rather than jsdom: building a jsdom window costs about two seconds in
 * every worker and is the largest single cost in this suite (CLAUDE.md, Testing).
 *
 * The sitemap lists the static routes by hand, with their dates from `src/data/static-routes.ts`,
 * while `e2e/routes.ts` keeps the spec side's own list; a module under `src/app` importing from
 * `e2e/` would ship the spec directory into the build. So this file asserts the two agree.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '../sitemap';
import { caseStudies } from '@/data/case-studies';
import { publishedPosts, type Post, type PublishedPost } from '@/data/posts';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { draftPost, everyBlockPost, fixturePosts, hostileTitlePost } from '@/test/fixtures/posts';

// The same expression as `baseUrl` in sitemap.ts, so a developer who has NEXT_PUBLIC_SITE_URL set
// in their shell gets the assertions they should rather than a failure about an origin nobody is testing.
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

/**
 * The routes that belong in a sitemap: the static seven and every case study, except that /blog is
 * there only with a post published, and then with every published post (#61). While none is, /blog
 * is a noindex Coming Soon placeholder.
 */
function expectedUrls(published: readonly PublishedPost[]): string[] {
  return [
    BASE,
    `${BASE}/about`,
    `${BASE}/work`,
    `${BASE}/skills`,
    `${BASE}/contact`,
    `${BASE}/privacy`,
    ...caseStudies.map(({ slug }) => `${BASE}/work/${slug}`),
    ...(published.length > 0
      ? [`${BASE}/blog`, ...published.map(({ slug }) => `${BASE}/blog/${slug}`)]
      : []),
  ];
}

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

  it('lists /blog if and only if a post is published', () => {
    // #61 rewrote this from "leaves out /blog": the page is noindex exactly while no post is
    // published (R26), and a sitemap entry would offer it to the same crawler anyway. The fixture
    // block below proves the other side while the real list is empty.
    expect(
      sitemap()
        .map(({ url }) => url)
        .includes(`${BASE}/blog`),
    ).toBe(publishedPosts.length > 0);
  });

  it('lists no URL twice', () => {
    // Green. Two entries for one URL is the shape a copy-paste edit leaves behind.
    const urls = sitemap().map(({ url }) => url);
    expect(urls).toHaveLength(new Set(urls).size);
  });

  it('R31 (#48, #61): lists exactly the indexable routes and dates each by its content', () => {
    const entries = sitemap();

    // Two defects in one row, because they were one edit: the URL set and the timestamps.
    //
    // While no post is published /blog is a Coming Soon placeholder. The owner decision of
    // 2026-09-11 keeps its nav link, makes it noindex (R26) and takes it out of the sitemap:
    // offering an empty page to search and telling the same crawler not to index it is a
    // contradiction. #61 made that conditional on `hasPublishedPosts` (ADR 0028), so the first
    // published post puts /blog and itself back with no code change; the fixture block below
    // holds the other side.
    expect(entries.map(({ url }) => url).sort()).toEqual(expectedUrls(publishedPosts).sort());

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

/**
 * /blog's own copy date in the block below, in place of the live one in `static-routes.ts`: the
 * fixtures' days are fixed, and the owner moves the live date whenever /blog's copy changes, so
 * these tests compare the fixtures with this day rather than with whatever the live date is.
 */
const BLOG_COPY_DAY = '2026-01-27';

/**
 * `sitemap()`, with `@/data/posts` built over `list` in place of the real, still empty, posts, and
 * /blog's own date fixed at `blogCopyDay`.
 */
async function sitemapOver(list: readonly Post[], blogCopyDay = BLOG_COPY_DAY) {
  vi.resetModules();
  vi.doMock('@/data/posts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/data/posts')>();
    return { ...actual, posts: list, ...actual.buildPostIndex(list) };
  });
  vi.doMock('@/data/static-routes', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/data/static-routes')>();
    return {
      ...actual,
      STATIC_ROUTE_UPDATED: { ...actual.STATIC_ROUTE_UPDATED, '/blog': blogCopyDay },
    };
  });
  return (await import('../sitemap')).default;
}

/** Each URL of `entries` with its lastmod. */
const lastmods = (entries: ReturnType<typeof sitemap>) =>
  new Map(entries.map(({ url, lastModified }) => [url, lastModified]));

describe('sitemap() once a post is published (#61, over the fixture posts)', () => {
  afterEach(() => {
    vi.doUnmock('@/data/posts');
    vi.doUnmock('@/data/static-routes');
    vi.resetModules();
  });

  it('lists /blog and every published post, and no draft', async () => {
    const urls = (await sitemapOver(fixturePosts))().map(({ url }) => url);
    // The fixtures hold two published posts and a draft between them.
    expect(urls.sort()).toEqual(expectedUrls([hostileTitlePost, everyBlockPost]).sort());
    expect(urls).not.toContain(`${BASE}/blog/${draftPost.slug}`);
    expect(urls.filter((url) => url.includes(draftPost.slug))).toEqual([]);
  });

  it('dates each post by its updatedAt, and /blog by the newest publication', async () => {
    const byUrl = lastmods((await sitemapOver(fixturePosts))());
    for (const { slug, updatedAt } of [everyBlockPost, hostileTitlePost]) {
      expect(byUrl.get(`${BASE}/blog/${slug}`), slug).toBe(updatedAt);
    }
    // /blog shows each post's title, summary and publication day, so a new post is what changes
    // it; both fixtures were published after /blog's own copy date.
    const newest = [everyBlockPost.publishedAt, hostileTitlePost.publishedAt].sort().at(-1);
    expect(newest! > BLOG_COPY_DAY).toBe(true);
    expect(byUrl.get(`${BASE}/blog`)).toBe(newest);
  });

  it("leaves /blog's date alone when a post's body is updated", async () => {
    // A post's updatedAt moves with its body, which /blog does not show; the post's own entry
    // carries that change. A changed title or summary bumps /blog's own date instead.
    const revised = { ...everyBlockPost, updatedAt: '2026-09-20' };
    expect(revised.updatedAt > hostileTitlePost.publishedAt).toBe(true);
    const byUrl = lastmods((await sitemapOver([revised, hostileTitlePost]))());
    expect(byUrl.get(`${BASE}/blog`)).toBe(hostileTitlePost.publishedAt);
    expect(byUrl.get(`${BASE}/blog/${revised.slug}`)).toBe('2026-09-20');
  });

  it("dates /blog by its own copy when that changed after every post's publication", async () => {
    // The page's heading and intro, and the titles and summaries it lists, are dated in
    // static-routes.ts: when the owner changes one after the last publication, that is the day
    // /blog last changed.
    const byUrl = lastmods((await sitemapOver(fixturePosts, '2026-09-25'))());
    expect(byUrl.get(`${BASE}/blog`)).toBe('2026-09-25');
    expect(byUrl.get(`${BASE}/blog/${hostileTitlePost.slug}`)).toBe(hostileTitlePost.updatedAt);
  });

  it('lists nothing of the blog while the only post is a draft', async () => {
    const urls = (await sitemapOver([draftPost]))().map(({ url }) => url);
    expect(urls.sort()).toEqual(expectedUrls([]).sort());
  });
});

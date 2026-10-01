/**
 * @vitest-environment node
 *
 * `buildMetadata()`, the one place a route's head is assembled.
 *
 * Next merges metadata one key deep: a segment that sets `openGraph`, `twitter` or `robots` replaces
 * the parent's whole object rather than merging into it. That is how every sub-page lost og:url,
 * og:site_name and og:locale while keeping the home page's twitter:title (#48, pages-5 and live-10).
 * So the helper returns every one of those objects complete, and these tests assert every field for
 * a sample route rather than trusting a spread to have carried it.
 *
 * `e2e/seo-surface.spec.ts` checks the same fields in the served HTML (R22 and R24); this file is the
 * fast half that names the field that went missing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMetadata, FEED_TITLE, SITE_NAME, TWITTER_HANDLE } from '../metadata';

// `hasPublishedPosts` is false until the owner publishes the first post, and these tests must not
// change meaning the day that happens, so the switch is this file's own: off unless a test turns it
// on (#61, ADR 0028). A getter, so `buildMetadata()` reads it at call time, as it reads the real one.
const postIndex = vi.hoisted(() => ({ published: false }));
vi.mock('@/data/posts', () => ({
  get hasPublishedPosts() {
    return postIndex.published;
  },
}));

const about = buildMetadata({
  title: 'About',
  description: 'I fix the systems everyone else gave up on.',
  path: '/about',
});

describe('buildMetadata()', () => {
  it('sets the canonical to the route’s own path, and advertises its Markdown twin', () => {
    // Relative on purpose: `metadataBase` in the root layout resolves both, so NEXT_PUBLIC_SITE_URL
    // keeps working for a staging origin. The twin is derived from the same path by
    // `markdownTwinPath()` (#59), so the two links cannot name different routes.
    expect(about.alternates).toEqual({
      canonical: '/about',
      types: { 'text/markdown': '/about/index.md' },
    });
  });

  it('advertises the root’s twin at /index.md and a case study’s one segment below it', () => {
    const home = buildMetadata({ title: { absolute: 'Home' }, description: 'd', path: '/' });
    expect(home.alternates).toEqual({
      canonical: '/',
      types: { 'text/markdown': '/index.md' },
    });
    const study = buildMetadata({ title: 't', description: 'd', path: '/work/nx-remote-cache' });
    expect(study.alternates?.types).toEqual({
      'text/markdown': '/work/nx-remote-cache/index.md',
    });
  });

  describe('the Atom feed', () => {
    afterEach(() => {
      postIndex.published = false;
    });

    it('is advertised nowhere while no post is published', () => {
      // `/feed.xml` is served either way, as an empty feed; an advertised feed with nothing in it
      // helps no reader, so the link waits for the content (ADR 0028's switch).
      for (const path of ['/', '/about', '/blog', '/work/nx-remote-cache']) {
        const metadata = buildMetadata({ title: 't', description: 'd', path });
        expect(metadata.alternates?.types, path).not.toHaveProperty(['application/atom+xml']);
      }
    });

    it('is advertised on every route once a post is published, beside the Markdown twin', () => {
      postIndex.published = true;
      for (const path of ['/', '/about', '/blog', '/blog/a-post', '/work/nx-remote-cache']) {
        const metadata = buildMetadata({ title: 't', description: 'd', path });
        // One path for every route: the feed is the site's, not the page's. Titled as the feed
        // titles itself, so a reader listing the page's feeds shows a name rather than a URL.
        expect(metadata.alternates?.types, path).toEqual({
          'text/markdown': path === '/' ? '/index.md' : `${path}/index.md`,
          'application/atom+xml': [{ url: '/feed.xml', title: 'Milos Cvetkovic — Writing' }],
        });
        expect(FEED_TITLE).toBe('Milos Cvetkovic — Writing');
        expect(metadata.alternates?.canonical, path).toBe(path);
      }
    });
  });

  it('returns a complete Open Graph object, because Next will not merge one', () => {
    expect(about.openGraph).toEqual({
      type: 'website',
      url: '/about',
      siteName: SITE_NAME,
      locale: 'en_US',
      title: 'About',
      description: 'I fix the systems everyone else gave up on.',
    });
  });

  it('credits the card to the X handle, read from the one social source', () => {
    // A literal on purpose: `TWITTER_HANDLE` is built from `data/social.ts` (#49), and comparing it with
    // that module would pass with the handle typed wrong there.
    expect(TWITTER_HANDLE).toBe('@milos_dev');
  });

  it('returns a complete Twitter card with the route’s own title and description', () => {
    expect(about.twitter).toEqual({
      card: 'summary_large_image',
      creator: TWITTER_HANDLE,
      title: 'About',
      description: 'I fix the systems everyone else gave up on.',
    });
  });

  it('passes the title and description through for the root template to finish', () => {
    expect(about.title).toBe('About');
    expect(about.description).toBe('I fix the systems everyone else gave up on.');
  });

  it('keeps an absolute title absolute and shares its text with the cards', () => {
    const home = buildMetadata({
      title: { absolute: 'Milos Cvetkovic | Senior Full-Stack Engineer' },
      description: 'Home.',
      path: '/',
    });
    expect(home.title).toEqual({ absolute: 'Milos Cvetkovic | Senior Full-Stack Engineer' });
    expect(home.openGraph?.title).toBe('Milos Cvetkovic | Senior Full-Stack Engineer');
    expect(home.twitter?.title).toBe('Milos Cvetkovic | Senior Full-Stack Engineer');
    expect(home.alternates?.canonical).toBe('/');
  });

  it('uses a separate social title for both cards when one is given', () => {
    const metadata = buildMetadata({
      title: 'About — Senior Full-Stack Engineer',
      socialTitle: 'About Milos Cvetkovic',
      description: 'd',
      path: '/about',
    });
    expect(metadata.title).toBe('About — Senior Full-Stack Engineer');
    expect(metadata.openGraph?.title).toBe('About Milos Cvetkovic');
    expect(metadata.twitter?.title).toBe('About Milos Cvetkovic');
  });

  it('marks a case study as an article', () => {
    const metadata = buildMetadata({
      title: 't',
      description: 'd',
      path: '/work/self-healing-agent',
      type: 'article',
    });
    expect(metadata.openGraph).toMatchObject({ type: 'article', url: '/work/self-healing-agent' });
  });

  it('describes a route-handler card completely, and adds no image to a route without one', () => {
    // A segment with an `opengraph-image` file gets its card from Next, so the helper must not name
    // one of its own there; the case studies' card is a route handler, which Next knows nothing of.
    expect(about.openGraph).not.toHaveProperty('images');
    const study = buildMetadata({
      title: 't',
      description: 'd',
      path: '/work/self-healing-agent',
      image: {
        url: '/work/self-healing-agent/og-image.png',
        alt: 'Case study: Self-Healing Agent',
      },
    });
    expect(study.openGraph).toMatchObject({
      images: [
        {
          url: '/work/self-healing-agent/og-image.png',
          alt: 'Case study: Self-Healing Agent',
          width: 1200,
          height: 630,
          type: 'image/png',
        },
      ],
    });
  });

  it('serves an indexable robots directive by default, and noindex when asked', () => {
    // Per route rather than in the root layout: whatever the layout declares also reaches the 404
    // pages, where it sat beside the `noindex` Next injects (#48, live-13).
    expect(about.robots).toMatchObject({ index: true, follow: true });
    const hidden = buildMetadata({ title: 't', description: 'd', path: '/blog', index: false });
    expect(hidden.robots).toEqual({ index: false, follow: true });
  });

  it('rejects a path that is not a clean absolute pathname', () => {
    // A canonical with a query string, a trailing slash or no leading slash names a different URL
    // from the one the route serves, which is worse than no canonical at all.
    for (const path of [
      'about',
      '/about/',
      '/work?x=1',
      '/work#top',
      'https://example.test/about',
    ]) {
      expect(() => buildMetadata({ title: 't', description: 'd', path }), path).toThrow();
    }
  });
});

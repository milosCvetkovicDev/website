/**
 * `/feed.xml`, the Atom feed of the published posts (#61, AC 6 and the route half of AC 9).
 *
 * This file runs in jsdom, unlike the other DOM-free files here, for one thing: its `DOMParser`,
 * a real XML parser that reports a `parsererror` element for a body that is not well-formed (an
 * unescaped `&` in a title, say). That is what a feed reader does with a broken feed, so it is
 * what these tests hold the output to, rather than a pattern over the text.
 *
 * The real `posts` array stays empty until the owner publishes the first post, so the feed with
 * entries is built from the fixtures (`src/test/fixtures/posts.ts`): two published posts listed
 * oldest first, a draft between them, and a title holding `&`, `<` and `"`. The route itself is
 * checked over the real, empty data, and once over the fixtures to prove it passes the index in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Post, PublishedPost } from '@/data/posts';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { ATOM_CONTENT_TYPE, buildAtomFeed } from '@/lib/atom';
import { draftPost, everyBlockPost, fixturePosts, hostileTitlePost } from '@/test/fixtures/posts';

const ATOM_NS = 'http://www.w3.org/2005/Atom';
const SITE = 'https://example.test';
const FALLBACK = '2026-01-27';

/** Parses `xml` as XML, failing the test with the parser's own message when it is not well-formed. */
function parse(xml: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error(`not well-formed XML: ${error.textContent}`);
  return doc;
}

/** The direct children of `parent` named `name` in the Atom namespace. */
const children = (parent: Element, name: string): Element[] =>
  [...parent.children].filter(
    (child) => child.namespaceURI === ATOM_NS && child.localName === name,
  );

/** The text of the one direct child named `name`, failing when there is not exactly one. */
function only(parent: Element, name: string): Element {
  const found = children(parent, name);
  if (found.length !== 1) {
    throw new Error(`<${parent.localName}> has ${found.length} <${name}> children, not one`);
  }
  return found[0];
}

const text = (parent: Element, name: string) => only(parent, name).textContent;

/** The `<link>` children of `parent` whose `rel` is `rel`. */
const links = (parent: Element, rel: string) =>
  children(parent, 'link').filter((link) => link.getAttribute('rel') === rel);

/** RFC 3339's `date-time`, which RFC 4287 requires of every date construct. */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const feedOf = (list: readonly Post[], fallbackUpdated = FALLBACK) =>
  parse(buildAtomFeed(list, { siteUrl: SITE, fallbackUpdated })).documentElement;

describe('buildAtomFeed()', () => {
  const xml = buildAtomFeed(fixturePosts, { siteUrl: SITE, fallbackUpdated: FALLBACK });
  const feed = parse(xml).documentElement;

  it('writes a well-formed Atom document', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')).toBe(true);
    expect(feed.localName).toBe('feed');
    expect(feed.namespaceURI).toBe(ATOM_NS);
  });

  it('gives the feed the elements RFC 4287 requires, each once', () => {
    expect(text(feed, 'id')).toBe(`${SITE}/blog`);
    expect(text(feed, 'title')).toBe('Milos Cvetkovic — Writing');
    expect(text(feed, 'updated')).toMatch(DATE_TIME);
  });

  it('links itself and the page it syndicates, by absolute URL', () => {
    const self = links(feed, 'self');
    expect(self).toHaveLength(1);
    expect(self[0].getAttribute('href')).toBe(`${SITE}/feed.xml`);
    expect(self[0].getAttribute('type')).toBe('application/atom+xml');
    const page = links(feed, 'alternate');
    expect(page).toHaveLength(1);
    expect(page[0].getAttribute('href')).toBe(`${SITE}/blog`);
    expect(page[0].getAttribute('type')).toBe('text/html');
  });

  it('names its author by name and site, with no address', () => {
    const author = only(feed, 'author');
    expect(text(author, 'name')).toBe('Milos Cvetkovic');
    expect(text(author, 'uri')).toBe(SITE);
    expect(children(author, 'email')).toEqual([]);
    expect(xml).not.toMatch(/<email\b/);
    expect(author.textContent).not.toContain('@');
  });

  it('holds one entry per published post, newest first, and no draft', () => {
    const entries = children(feed, 'entry');
    expect(entries.map((entry) => text(entry, 'id'))).toEqual([
      `${SITE}/blog/${hostileTitlePost.slug}`,
      `${SITE}/blog/${everyBlockPost.slug}`,
    ]);
    expect(xml).not.toContain(draftPost.slug);
    expect(xml).not.toContain(draftPost.title);
  });

  it.each([hostileTitlePost, everyBlockPost].map((post) => [post.slug, post] as const))(
    '%s: id, title, dates, an absolute link and the summary, as written',
    (_slug, post) => {
      const entry = children(feed, 'entry').find(
        (candidate) => text(candidate, 'id') === `${SITE}/blog/${post.slug}`,
      );
      if (!entry) throw new Error(`no entry for ${post.slug}`);
      expect(text(entry, 'title')).toBe(post.title);
      expect(text(entry, 'published')).toBe(`${post.publishedAt}T00:00:00Z`);
      expect(text(entry, 'updated')).toBe(`${post.updatedAt}T00:00:00Z`);
      const link = links(entry, 'alternate');
      expect(link).toHaveLength(1);
      expect(link[0].getAttribute('href')).toBe(`${SITE}/blog/${post.slug}`);
      expect(link[0].getAttribute('type')).toBe('text/html');
      expect(text(entry, 'summary')).toBe(post.summary);
      // The summary only: the body stays on the page and its Markdown twin.
      expect(children(entry, 'content')).toEqual([]);
    },
  );

  it('escapes a title holding &, < and ", which still parses and reads as written', () => {
    expect(hostileTitlePost.title).toMatch(/&.*<.*"/);
    expect(xml).toContain('Fixture: &amp; &lt;tags&gt; and &quot;quotes&quot;');
    expect(xml).not.toContain('<tags>');
    // `>` and `'` too, in a summary: a reader gets back exactly the text in the module.
    const quoted = buildAtomFeed(
      [{ ...hostileTitlePost, summary: `${hostileTitlePost.summary} & 'apostrophes' > all` }],
      { siteUrl: SITE, fallbackUpdated: FALLBACK },
    );
    const entry = children(parse(quoted).documentElement, 'entry')[0];
    expect(text(entry, 'summary')).toBe(`${hostileTitlePost.summary} & 'apostrophes' > all`);
  });

  it('dates the feed by its latest update, which can be an older post’s', () => {
    expect(text(feed, 'updated')).toBe(`${hostileTitlePost.updatedAt}T00:00:00Z`);
    const revised: PublishedPost = { ...everyBlockPost, updatedAt: '2026-09-20' };
    const later = feedOf([revised, hostileTitlePost]);
    expect(text(later, 'updated')).toBe('2026-09-20T00:00:00Z');
    // Order stays by publication: a revision does not move a post to the top.
    expect(children(later, 'entry').map((entry) => text(entry, 'id'))).toEqual([
      `${SITE}/blog/${hostileTitlePost.slug}`,
      `${SITE}/blog/${everyBlockPost.slug}`,
    ]);
  });

  it('is an empty feed, dated by the fallback, with nothing published', () => {
    for (const list of [[], [draftPost]] as const) {
      const empty = feedOf(list);
      expect(children(empty, 'entry')).toEqual([]);
      expect(text(empty, 'id')).toBe(`${SITE}/blog`);
      expect(text(empty, 'updated')).toBe(`${FALLBACK}T00:00:00Z`);
      expect(links(empty, 'self')).toHaveLength(1);
    }
  });

  it('never reads the clock: the same posts give the same bytes on any day', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2027-03-01T12:00:00Z'));
      const first = buildAtomFeed(fixturePosts, { siteUrl: SITE, fallbackUpdated: FALLBACK });
      vi.setSystemTime(new Date('2031-11-30T23:59:59Z'));
      const second = buildAtomFeed([], { siteUrl: SITE, fallbackUpdated: FALLBACK });
      expect(first).toBe(xml);
      expect(second).toBe(buildAtomFeed([], { siteUrl: SITE, fallbackUpdated: FALLBACK }));
      expect(second).not.toMatch(/2027|2031/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a site URL with a trailing slash, and refuses one that is not an origin', () => {
    expect(buildAtomFeed(fixturePosts, { siteUrl: `${SITE}/`, fallbackUpdated: FALLBACK })).toBe(
      xml,
    );
    for (const siteUrl of ['example.test', `${SITE}/blog`, `${SITE}?x=1`, 'ftp://example.test']) {
      expect(() => buildAtomFeed([], { siteUrl, fallbackUpdated: FALLBACK }), siteUrl).toThrow(
        /siteUrl/,
      );
    }
  });

  it('refuses a date that is not a real day, naming the post or the fallback', () => {
    const bad: PublishedPost = { ...everyBlockPost, publishedAt: '2026-02-30' };
    expect(() => buildAtomFeed([bad], { siteUrl: SITE, fallbackUpdated: FALLBACK })).toThrow(
      everyBlockPost.slug,
    );
    const backwards: PublishedPost = { ...everyBlockPost, updatedAt: '2026-08-01' };
    expect(() => buildAtomFeed([backwards], { siteUrl: SITE, fallbackUpdated: FALLBACK })).toThrow(
      /updatedAt/,
    );
    expect(() => buildAtomFeed([], { siteUrl: SITE, fallbackUpdated: '27 January 2026' })).toThrow(
      /fallbackUpdated/,
    );
  });

  it('refuses text XML 1.0 cannot carry, rather than write a feed no reader parses', () => {
    const control: PublishedPost = { ...hostileTitlePost, title: 'A bell \u0007 in a title' };
    expect(() => buildAtomFeed([control], { siteUrl: SITE, fallbackUpdated: FALLBACK })).toThrow(
      hostileTitlePost.slug,
    );
  });
});

describe('the /feed.xml route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/data/posts');
    vi.resetModules();
  });

  it('is prerendered, never a function', async () => {
    // A `GET` handler is dynamic by default since Next 15 and would deploy as a server function;
    // `pnpm check:build-output` fails the build that does, and this fails first.
    const route = await import('../feed.xml/route');
    expect(route.dynamic).toBe('force-static');
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
  });

  it('serves an empty Atom feed dated by /blog while nothing is published', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const { GET } = await import('../feed.xml/route');
    const response = GET();
    expect(response.status).toBe(200);
    expect(ATOM_CONTENT_TYPE).toBe('application/atom+xml; charset=utf-8');
    expect(response.headers.get('content-type')).toBe(ATOM_CONTENT_TYPE);
    const feed = parse(await response.text()).documentElement;
    expect(children(feed, 'entry')).toEqual([]);
    // Production when the variable is blank, as the sitemap and the twins fall back.
    expect(text(feed, 'id')).toBe('https://miloscvetkovic.dev/blog');
    expect(text(feed, 'updated')).toBe(`${STATIC_ROUTE_UPDATED['/blog']}T00:00:00Z`);
  });

  it('reads the published posts and the configured origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE);
    vi.doMock('@/data/posts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/data/posts')>();
      return { ...actual, posts: fixturePosts, ...actual.buildPostIndex(fixturePosts) };
    });
    const { GET } = await import('../feed.xml/route');
    expect(await GET().text()).toBe(
      buildAtomFeed(fixturePosts, {
        siteUrl: SITE,
        fallbackUpdated: STATIC_ROUTE_UPDATED['/blog'],
      }),
    );
  });
});

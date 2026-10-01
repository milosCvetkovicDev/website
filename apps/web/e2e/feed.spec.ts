import { expect, test } from '@playwright/test';
import { hasPublishedPosts, publishedPosts } from '../src/data/posts';
import { FEED, SITE_ORIGIN } from './endpoints';
import { NOT_FOUND_ROUTE, PAGE_ROUTES, postRoute } from './routes';
import { alternateLinks, alternates, attributeText, fetchHead } from './support/served-head';

/**
 * The Atom feed (#61, AC 7) and its discovery link, as served: `request.get(path)`, the bytes a feed
 * reader or a crawler reads, never the hydrated DOM. The feed is parsed by the browser's XML parser
 * (`DOMParser`, nothing navigated), so a body that is not well-formed fails here as it would in a
 * reader. `src/app/__tests__/feed.test.ts` holds the feed's content to the fixtures; this holds the
 * served feed to the real posts.
 *
 * `/feed.xml` is served from the first deploy, as an empty feed while no post is published, and
 * every page advertises it from its `<head>` only once one is (ADR 0028's switch): so each route
 * below expects exactly one Atom alternate when `hasPublishedPosts`, and none until then. The 404
 * never advertises it. Kept apart from `blog.spec.ts`, so the slices that build `/blog` and the feed
 * do not both edit one file.
 */

/** RFC 4287's media type, with the charset the handler writes (`ATOM_CONTENT_TYPE`). */
const ATOM = 'application/atom+xml; charset=utf-8';
/** The feed's own title (`FEED_TITLE`), which the link that advertises it carries too. */
const FEED_TITLE = 'Milos Cvetkovic — Writing';

test(`${FEED} is served as Atom: one entry per published post, newest first`, async ({
  page,
  request,
}) => {
  const response = await request.get(FEED);
  expect(response.status(), `${FEED} should answer 200`).toBe(200);
  expect(response.headers()['content-type'], `${FEED} should be served as Atom`).toBe(ATOM);

  const feed = await page.evaluate(
    (xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const root = doc.documentElement;
      const atom = 'http://www.w3.org/2005/Atom';
      const own = (parent: Element, name: string) =>
        [...parent.children].filter(
          (child) => child.namespaceURI === atom && child.localName === name,
        );
      return {
        error: doc.querySelector('parsererror')?.textContent ?? null,
        root: `${root.namespaceURI} ${root.localName}`,
        lang: root.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang'),
        required: ['id', 'title', 'updated'].map((name) => own(root, name).length),
        self: own(root, 'link')
          .filter((link) => link.getAttribute('rel') === 'self')
          .map((link) => link.getAttribute('href')),
        entries: own(root, 'entry').map((entry) => ({
          required: ['id', 'title', 'updated'].map((name) => own(entry, name).length),
          title: own(entry, 'title')[0]?.textContent ?? null,
          link: own(entry, 'link')
            .filter((link) => link.getAttribute('rel') === 'alternate')
            .map((link) => link.getAttribute('href')),
        })),
      };
    },
    await response.text(),
  );

  expect(feed.error, `${FEED} should be well-formed XML`).toBeNull();
  expect(feed.root).toBe('http://www.w3.org/2005/Atom feed');
  expect(feed.lang, 'the language of its titles and summaries').toBe('en');
  expect(feed.required, 'one id, title and updated on the feed').toEqual([1, 1, 1]);
  expect(feed.self, 'one absolute self link').toEqual([`${SITE_ORIGIN}${FEED}`]);
  expect(feed.entries).toEqual(
    publishedPosts.map(({ slug, title }) => ({
      required: [1, 1, 1],
      title,
      link: [`${SITE_ORIGIN}${postRoute(slug)}`],
    })),
  );
});

const HOW_OFTEN = hasPublishedPosts ? 'once' : 'nowhere, as no post is published';

for (const route of PAGE_ROUTES.filter((path) => path !== NOT_FOUND_ROUTE)) {
  test(`${route} advertises the feed ${HOW_OFTEN}`, async ({ request }) => {
    const head = await fetchHead(request, route);
    expect(head.status, `${route} should answer 200`).toBe(200);
    const links = alternateLinks(head, 'application/atom+xml');
    expect(links, `${route}: Atom alternates`).toHaveLength(hasPublishedPosts ? 1 : 0);

    for (const { href = '', title } of links) {
      // Named as the feed names itself, so a reader listing the page's feeds shows the name.
      expect(title && attributeText(title), `${route}'s feed link title`).toBe(FEED_TITLE);
      // `metadataBase` resolves the path `buildMetadata()` sets into the site's origin.
      const advertised = new URL(attributeText(href), SITE_ORIGIN);
      expect(`${advertised.origin}${advertised.pathname}${advertised.search}`).toBe(
        `${SITE_ORIGIN}${FEED}`,
      );
      const feed = await request.get(advertised.pathname);
      expect(feed.status(), `${route}'s feed link should answer 200`).toBe(200);
      expect(feed.headers()['content-type'], `${route}'s feed link should be Atom`).toBe(ATOM);
    }
  });
}

test('the 404 advertises no feed', async ({ request }) => {
  const head = await fetchHead(request, NOT_FOUND_ROUTE);
  expect(head.status).toBe(404);
  expect(alternates(head, 'application/atom+xml')).toEqual([]);
});

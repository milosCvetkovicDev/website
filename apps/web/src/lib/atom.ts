import { buildPostIndex, type Post, type PublishedPost } from '@/data/posts';
import { formatContentDate, formatContentDates } from './content-date';
import { SITE_NAME } from './metadata';
import { FEED_PATH } from './pathname';

/**
 * The Atom feed of the blog's published posts (#61; RFC 4287, design D12), served at `/feed.xml`
 * by `app/feed.xml/route.ts`. A server module like `metadata.ts`.
 *
 * Written by hand rather than through a library: the document is a dozen elements, and the risk in
 * it is escaping, which `xmlText` does for every value. An entry carries the post's summary and
 * links to the page; the body stays on the page and its Markdown twin. No email address is written
 * anywhere: RFC 4287 requires an author's name, not an address.
 *
 * The output depends on its inputs alone, never on the clock, so a rebuild with the same posts
 * writes the same bytes: the feed is dated by its latest post update, or by `fallbackUpdated` (the
 * `/blog` date in `static-routes.ts`) while nothing is published.
 */

/** The feed's media type. RFC 4287 registers `application/atom+xml`; the body is UTF-8. */
export const ATOM_CONTENT_TYPE = 'application/atom+xml; charset=utf-8';

const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';

/** The blog's own page, which the feed syndicates and whose URL is its id. */
const BLOG_PATH = '/blog';

/** The feed's title: the site's name, then the blog's, as `/blog`'s heading names it. */
const FEED_TITLE = `${SITE_NAME} — Writing`;

interface FeedOptions {
  /** The site's origin, `https://miloscvetkovic.dev` in production; every id and link is on it. */
  siteUrl: string;
  /** The `YYYY-MM-DD` day the feed is dated by while no post is published. */
  fallbackUpdated: string;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * Whether XML 1.0 can carry `codePoint` at all, escaped or not (its `Char` production): not the C0
 * controls bar tab and the line breaks, not a surrogate on its own, not U+FFFE or U+FFFF.
 */
const isXmlChar = (codePoint: number) =>
  codePoint === 0x9 ||
  codePoint === 0xa ||
  codePoint === 0xd ||
  (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
  codePoint >= 0x10000;

/**
 * `value` as XML character data or a double-quoted attribute value: `&`, `<`, `>` and `"` escaped,
 * so a reader gets back exactly the text in the module. Throws, naming `where`, on a character XML
 * cannot carry, which would make the whole feed unreadable rather than one entry wrong.
 */
function xmlText(value: string, where: string): string {
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (!isXmlChar(codePoint)) {
      throw new Error(
        `${FEED_PATH}: ${where} holds U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}, ` +
          'which XML 1.0 cannot carry',
      );
    }
  }
  return value.replace(/[&<>"]/g, (char) => ENTITIES[char]);
}

/**
 * The bare origin of `siteUrl`, with a trailing slash dropped. Anything that is not an http(s)
 * origin (no scheme, a path, a query) throws at build time rather than ship ids that name
 * nothing, as `absoluteUrl` in `serialise.ts` refuses one for the twins.
 */
function originOf(siteUrl: string): string {
  let url: URL | undefined;
  try {
    url = new URL(siteUrl);
  } catch {
    url = undefined;
  }
  if (
    !url ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `buildAtomFeed: siteUrl ${JSON.stringify(siteUrl)} is not an origin such as https://miloscvetkovic.dev`,
    );
  }
  return url.origin;
}

/**
 * A stored `YYYY-MM-DD` day as the RFC 3339 date-time every Atom date must be: the start of the
 * day in UTC. The day is the fact; the time is the convention that writes it.
 */
const dateTime = (day: string) => `${day}T00:00:00Z`;

function entry(post: PublishedPost, origin: string): string {
  const where = `the post ${JSON.stringify(post.slug)}`;
  // The same check the post page's date line makes, so a date the page would refuse to render
  // cannot reach a feed reader either.
  formatContentDates(`${FEED_PATH}: ${post.slug}`, post.publishedAt, post.updatedAt);
  const url = xmlText(`${origin}${BLOG_PATH}/${post.slug}`, `${where}'s URL`);
  return [
    '  <entry>',
    `    <id>${url}</id>`,
    `    <title>${xmlText(post.title, `${where}'s title`)}</title>`,
    `    <published>${dateTime(post.publishedAt)}</published>`,
    `    <updated>${dateTime(post.updatedAt)}</updated>`,
    `    <link rel="alternate" type="text/html" href="${url}"/>`,
    `    <summary>${xmlText(post.summary, `${where}'s summary`)}</summary>`,
    '  </entry>',
  ].join('\n');
}

/**
 * The feed of `posts`' published posts, newest first, whatever order or drafts it is handed: they
 * go through `buildPostIndex`, the same index every page reads, so a draft never reaches a reader.
 *
 * The feed's `updated` is its latest post update, which can be an older post's, since revising a
 * post changes the feed; with nothing published it is `fallbackUpdated`. Throws on a date that is
 * not a real day, a post updated before it was published, a `siteUrl` that is not an origin, or
 * text XML cannot carry, so a broken feed fails the prerender instead of reaching a reader.
 */
export function buildAtomFeed(
  posts: readonly Post[],
  { siteUrl, fallbackUpdated }: FeedOptions,
): string {
  const origin = originOf(siteUrl);
  if (!formatContentDate(fallbackUpdated)) {
    throw new Error(
      `buildAtomFeed: fallbackUpdated ${JSON.stringify(fallbackUpdated)} is not a real YYYY-MM-DD day`,
    );
  }
  const { publishedPosts } = buildPostIndex(posts);
  const entries = publishedPosts.map((post) => entry(post, origin));
  // Real `YYYY-MM-DD` days, each checked by `entry`, compare as strings in date order.
  const latestUpdate = publishedPosts
    .map(({ updatedAt }) => updatedAt)
    .reduce((latest, day) => (day > latest ? day : latest), '');
  const updated = latestUpdate || fallbackUpdated;
  const blog = xmlText(`${origin}${BLOG_PATH}`, 'the blog URL');
  const self = xmlText(`${origin}${FEED_PATH}`, 'the feed URL');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="${ATOM_NAMESPACE}">`,
    `  <id>${blog}</id>`,
    `  <title>${xmlText(FEED_TITLE, 'the feed title')}</title>`,
    `  <updated>${dateTime(updated)}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${self}"/>`,
    `  <link rel="alternate" type="text/html" href="${blog}"/>`,
    '  <author>',
    `    <name>${xmlText(SITE_NAME, 'the author name')}</name>`,
    `    <uri>${xmlText(origin, 'the author URI')}</uri>`,
    '  </author>',
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}

import { buildPostIndex, type Post, type PublishedPost } from '@/data/posts';
import { formatContentDate, formatContentDates } from './content-date';
import { FEED_TITLE, SITE_NAME } from './metadata';
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
 * writes the same bytes: the feed is dated by the later of its latest post update and
 * `fallbackUpdated` (the `/blog` date in `static-routes.ts`).
 *
 * The feed is the whole archive on purpose: every published post, with no cap. A personal blog adds
 * a few posts a year and each entry is a title and a summary, so a reader polling it fetches a few
 * kilobytes, and a reader subscribing late still gets every post.
 *
 * Dates are days, as the posts store them, written as midnight UTC. Two posts published on one day
 * share a `published` value (the feed lists them by update, then slug, as the index does), and a
 * correction made on the day of a post's last update leaves its `updated` as it was, so a reader that
 * refetches on a changed `updated` keeps the earlier text until the next one.
 */

/** The feed's media type. RFC 4287 registers `application/atom+xml`; the body is UTF-8. */
export const ATOM_CONTENT_TYPE = 'application/atom+xml; charset=utf-8';

const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';

/** The blog's own page, which the feed syndicates. */
const BLOG_PATH = '/blog';

/**
 * The origin every `atom:id` is written on, whatever `siteUrl` the build is given. RFC 4287 (4.2.6)
 * requires an id never to change, even when the feed moves; one built from `NEXT_PUBLIC_SITE_URL`
 * would change with a staging value or a new domain, and every reader would show the whole archive
 * again as unread. So ids are fixed here, and only the links follow `siteUrl`. In production the two
 * are the same URL. Never change this string: it names every entry a reader has seen.
 */
const ID_ORIGIN = 'https://miloscvetkovic.dev';

interface FeedOptions {
  /** The site's origin, `https://miloscvetkovic.dev` in production; every link is on it. */
  siteUrl: string;
  /** The `YYYY-MM-DD` day the feed is dated by while no post is published. */
  fallbackUpdated: string;
}

// Tab, line feed and carriage return as character references, since a parser rewrites them as
// written: a CR or CRLF becomes LF anywhere, and each of the three becomes a space in an attribute.
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\t': '&#x9;',
  '\n': '&#xA;',
  '\r': '&#xD;',
};

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
 * and tab, LF and CR written as references, so a reader gets back exactly the text in the module
 * in either place. Throws, naming `where`, on a character XML cannot carry, which would make the
 * whole feed unreadable rather than one entry wrong.
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
  return value.replace(/[&<>"\t\n\r]/g, (char) => ENTITIES[char]);
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
  const path = `${BLOG_PATH}/${post.slug}`;
  const url = xmlText(`${origin}${path}`, `${where}'s URL`);
  return [
    '  <entry>',
    `    <id>${xmlText(`${ID_ORIGIN}${path}`, `${where}'s id`)}</id>`,
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
 * The feed's `updated` is the later of its latest post update, which can be an older post's since
 * revising a post changes the feed, and `fallbackUpdated`. So it never moves backwards when a post
 * is unpublished, as long as the commit that does so bumps `/blog`'s date.
 *
 * Throws on a date that is not a real day, a post updated before it was published, a `siteUrl` that
 * is not an origin, or text XML cannot carry, so a broken feed fails the prerender instead of
 * reaching a reader.
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
  const updated = latestUpdate > fallbackUpdated ? latestUpdate : fallbackUpdated;
  const blog = xmlText(`${origin}${BLOG_PATH}`, 'the blog URL');
  const self = xmlText(`${origin}${FEED_PATH}`, 'the feed URL');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    // The language of every title and summary, as the pages' `<html lang>` says, for a reader's
    // hyphenation and its screen reader's pronunciation.
    `<feed xmlns="${ATOM_NAMESPACE}" xml:lang="en">`,
    `  <id>${xmlText(`${ID_ORIGIN}${BLOG_PATH}`, 'the feed id')}</id>`,
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

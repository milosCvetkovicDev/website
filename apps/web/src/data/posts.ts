/**
 * The blog's posts: the one source every page, twin, feed and sitemap entry for a post is to read,
 * in the shape `case-studies.ts` gives the case studies (#61, ADR 0028). A post's body is typed
 * blocks rather than Markdown or MDX, so the same object can render as HTML and serialise to
 * Markdown without a parser, and no sentence is written twice.
 *
 * For the owner, who writes every post; no agent drafts one (ADR 0028):
 *
 * - Add a post to `posts` as `draft: true` while it is being written. A draft renders nowhere and
 *   needs no dates. Everything that shows posts reads `publishedPosts` or `getPost`, never `posts`.
 * - Publish it by setting `draft: false` with `publishedAt` and `updatedAt`, both the day it goes
 *   live as `YYYY-MM-DD`. Later, bump `updatedAt` in the commit that changes what the post says,
 *   and only then: it is the date readers and crawlers are shown as the last change.
 * - Every string is plain text and is shown as written: no Markdown, no HTML, no entities. Inline
 *   code and links are pieces of their own; a link goes to an `https://` URL or a path on this site.
 * - `src/data/__tests__/posts.test.ts` checks what a published post must hold: a unique slug of
 *   lowercase words and hyphens, real dates that are not in the future with `updatedAt` on or after
 *   `publishedAt`, a summary of 50 to 300 characters, a served title (`metaTitle` when set, then
 *   ` | Milos Cvetkovic`) of at most 60, and a body whose blocks are not empty, with headings at
 *   level 2 or 3 and no level 3 before the first level 2.
 */

/**
 * A piece of running text: plain text, inline code, or a link. Pieces join as written, so a piece
 * carries its own spaces, as the text around a JSX link does.
 */
export type Inline =
  | string
  | { code: string }
  | {
      text: string;
      /** An `https://` URL, or a path on this site such as `/work` or `/blog/<slug>#section`. */
      href: string;
    };

/** A section heading. The post's title is the page's one `h1`, so the body starts at level 2. */
export interface HeadingBlock {
  kind: 'heading';
  level: 2 | 3;
  text: string;
}

export interface ParagraphBlock {
  kind: 'paragraph';
  content: readonly Inline[];
}

/** A bulleted list, or a numbered one when `ordered` is true. Each item is a run of inline pieces. */
export interface ListBlock {
  kind: 'list';
  ordered?: boolean;
  items: readonly (readonly Inline[])[];
}

/** Code shown as written, line breaks included. `language` names it for a reader, as `ts` does. */
export interface CodeBlock {
  kind: 'code';
  language?: string;
  code: string;
}

export interface QuoteBlock {
  kind: 'quote';
  content: readonly Inline[];
}

/** Every block a post's body is built from; a sixth kind needs a renderer wherever posts render. */
export type PostBlock = HeadingBlock | ParagraphBlock | ListBlock | CodeBlock | QuoteBlock;

interface PostContent {
  /** The `<slug>` in `/blog/<slug>`: lowercase words joined by hyphens. Never change a published one. */
  slug: string;
  /** The page's one `h1`, and its `<title>` unless `metaTitle` is set. */
  title: string;
  /** A shorter `<title>`, for a title that would pass 60 characters with ` | Milos Cvetkovic`. */
  metaTitle?: string;
  /** The post in a sentence or two, 50 to 300 characters, for wherever it is listed rather than read. */
  summary: string;
  tags: readonly string[];
  body: readonly PostBlock[];
}

/**
 * A post that is live. Its dates are `YYYY-MM-DD` days, as a case study's are: when it first went
 * live, and when what it says last changed.
 */
export interface PublishedPost extends PostContent {
  draft: false;
  publishedAt: string;
  updatedAt: string;
}

/** A post still being written. It renders nowhere, so its dates are optional until it publishes. */
export interface DraftPost extends PostContent {
  draft: true;
  publishedAt?: string;
  updatedAt?: string;
}

/** Discriminated on `draft`, so nothing can read a post's dates without first ruling out a draft. */
export type Post = PublishedPost | DraftPost;

/** Every post, drafts included, in any order. The owner writes them; see the top of this file. */
export const posts: Post[] = [];

/** Newest first: by publication day, then by the later update, then by slug, so ties are stable. */
function newestFirst(a: PublishedPost, b: PublishedPost): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/**
 * What a list of posts publishes: its published posts, newest first, whether there are any, and a
 * lookup that finds a published post by slug and nothing for a draft. The exports below are this
 * over `posts`; a test builds it over fixtures to prove the same code with posts in it.
 */
export function buildPostIndex(list: readonly Post[]): {
  publishedPosts: readonly PublishedPost[];
  hasPublishedPosts: boolean;
  getPost: (slug: string) => PublishedPost | undefined;
} {
  const published = list
    .filter((post): post is PublishedPost => post.draft === false)
    .sort(newestFirst);
  return {
    publishedPosts: published,
    hasPublishedPosts: published.length > 0,
    getPost: (slug) => published.find((post) => post.slug === slug),
  };
}

const index = buildPostIndex(posts);

/** The published posts, newest first. Drafts are never in it. */
export const publishedPosts = index.publishedPosts;

/**
 * Whether any post is published: the one switch ADR 0028 names for everything that waits for the
 * first post, so that publishing it is a data commit rather than a code change.
 */
export const hasPublishedPosts = index.hasPublishedPosts;

/** The published post at `slug`, or `undefined` for an unknown slug or a draft's. */
export const getPost = index.getPost;

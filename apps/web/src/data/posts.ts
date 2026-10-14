// No imports, or relative ones only, never `@/...`: `next.config.ts` imports this module to derive
// the routes that negotiate a Markdown twin, and Next's config loader turns an `@/` import into
// `./src/...`, a path that is right only beside the config (`src/test/next-config.test.ts` loads
// the config through that loader to catch it).

/**
 * The blog's posts: the one source every page, twin, feed and sitemap entry for a post is to read,
 * in the shape `case-studies.ts` gives the case studies (#61, ADR 0028). A post's body is typed
 * blocks rather than Markdown or MDX, so the same object can render as HTML and serialise to
 * Markdown without a parser, and no sentence is written twice.
 *
 * For whoever adds a post. A post is drafted with Claude outside this repository, approved line by
 * line by the owner, and added here by a pull request that only the owner merges (ADR 0034):
 *
 * - A post can wait in `posts` as `draft: true`: a draft renders nowhere and needs no dates.
 *   Everything that shows posts reads `publishedPosts` or `getPost`, never `posts`.
 * - Publish it by setting `draft: false` with `publishedAt` and `updatedAt`, both the day it goes
 *   live as `YYYY-MM-DD`. Later, bump `updatedAt` in the commit that changes what the post says,
 *   and only then: it is the date readers and crawlers are shown as the last change. /blog lists
 *   the title and summary, so a commit that changes either, or unpublishes or removes a post, also
 *   bumps `STATIC_ROUTE_UPDATED['/blog']` in `static-routes.ts`. Each of these commits, publishing
 *   included, regenerates `content-dates.json` (`pnpm --filter web content-dates:update`), or
 *   `pnpm test` fails.
 * - Every string is plain text and is shown as written: no Markdown, no HTML, no entities. Inline
 *   code and links are pieces of their own; a link goes to an `https://` URL or to a page on this
 *   site. Only a code block may hold a line break.
 * - Every post, draft or published, has a `kind`: `jev` for an article that reviews TypeSafe's Jev
 *   model, `own` otherwise. `posts.test.ts` fails when a published post that is not `jev` names Jev
 *   or TypeSafe in any text it shows, matched case-sensitively and as a whole word (ADR 0034).
 * - A table needs a caption, two columns or more with a name each and no name twice, one row or
 *   more, one cell per column in every row, a row header in each row and no header twice, and no
 *   blank cell when it has three columns or more. Names and headers are compared ignoring case.
 *   `TableBlock` says what such a table looks like on a phone, and what its cells must say.
 * - `src/data/__tests__/posts.test.ts` checks what a published post must hold: a unique slug of
 *   lowercase words and hyphens, real dates that are not in the future with `updatedAt` on or after
 *   `publishedAt`, a summary of 50 to 155 characters, as it is also the page's meta description (a
 *   draft entry's is held to 50 to 300), a served title (`metaTitle` when set, then
 *   ` | Milos Cvetkovic`) of at most 60, tags that are neither blank nor repeated, and a body whose
 *   blocks are not empty, with headings at level 2 or 3, no level 3 before the first level 2 and no
 *   heading twice. The body does not open with a bulleted list, which the twin's list of dates
 *   would run into, and no two lists of one kind (bulleted or numbered) stand next to each other:
 *   the twin, and a Markdown draft, would read either pair as one list. Titles, the summary,
 *   headings, tags, and a table's caption, column names and row headers have no spaces at either
 *   end or two in a row; no text outside a code block holds a line break, a control or a direction
 *   character; inline code holds more than whitespace, and no two pieces of it stand side by side,
 *   which the twin would write as one; a link's text says where it goes; and a link to this site is
 *   written as a path, not as a URL that names the site's own host, and names a page that exists.
 */

/**
 * A piece of running text: plain text, inline code, or a link. Pieces join as written, so a piece
 * carries its own spaces, as the text around a JSX link does.
 */
export type Inline =
  | string
  // `never` on the other kind's keys, so a piece that is both code and a link fails typecheck.
  | { readonly code: string; readonly text?: never; readonly href?: never }
  | {
      readonly text: string;
      /**
       * An `https://` URL, or a path to a page on this site such as `/work` or `/blog/<slug>`. A
       * `#fragment` is not yet checked against the headings of the page it names.
       */
      readonly href: string;
      readonly code?: never;
    };

/** A section heading. The post's title is the page's one `h1`, so the body starts at level 2. */
export interface HeadingBlock {
  readonly kind: 'heading';
  readonly level: 2 | 3;
  readonly text: string;
}

export interface ParagraphBlock {
  readonly kind: 'paragraph';
  readonly content: readonly Inline[];
}

/** A bulleted list, or a numbered one when `ordered` is true. Each item is a run of inline pieces. */
export interface ListBlock {
  readonly kind: 'list';
  readonly ordered?: boolean;
  readonly items: readonly (readonly Inline[])[];
}

/**
 * Code shown as written, line breaks and backticks included, so the Markdown serialiser has to
 * fence it with more backticks than its longest run (61e). `language` names it for a reader, as
 * `ts` does: letters, digits, `+`, `#` and `-` only.
 */
export interface CodeBlock {
  readonly kind: 'code';
  readonly language?: string;
  readonly code: string;
}

export interface QuoteBlock {
  readonly kind: 'quote';
  readonly content: readonly Inline[];
}

/**
 * A table of plain-text cells, rendered by `components/data-table.tsx` like the site's other
 * tables. The caption names it, and the first cell of each row is that row's header (ADR 0034).
 *
 * Below 640px a table of three or more columns stacks each row: its header and first value on one
 * line, then each other value on a line of its own, with the column names hidden from sight
 * (`data-table.tsx`, #226). A reader tells the values apart by their order alone, so:
 *
 * - no cell may be blank, which `posts.test.ts` checks;
 * - each value says what it is without its column, by its unit or a word ("1,234 tokens", "$0.10",
 *   "420 ms"). Where units cannot tell two columns apart, use two-column tables, which never stack
 *   and keep their headers. No test can check this; whoever writes the table has to.
 */
export interface TableBlock {
  readonly kind: 'table';
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly [header: string, ...cells: string[]])[];
}

/** Every block a post's body is built from; a seventh kind needs a renderer wherever posts render. */
export type PostBlock =
  HeadingBlock | ParagraphBlock | ListBlock | CodeBlock | QuoteBlock | TableBlock;

/**
 * Which kind of article a post is, as the writing room's tracker names it: `jev` for an article
 * that reviews TypeSafe's Jev model, `own` for every other (ADR 0034).
 */
export type PostKind = 'own' | 'jev';

interface PostContent {
  /** The `<slug>` in `/blog/<slug>`: lowercase words joined by hyphens. Never change a published one. */
  readonly slug: string;
  /** The page's one `h1`, and its `<title>` unless `metaTitle` is set. */
  readonly title: string;
  /** A shorter `<title>`, for a title that would pass 60 characters with ` | Milos Cvetkovic`. */
  readonly metaTitle?: string;
  /**
   * The post in a sentence or two: what lists show where it is not read, and the page's meta
   * description. `posts.test.ts` holds a draft entry's to 50 to 300 characters and a published
   * post's to 50 to 155.
   */
  readonly summary: string;
  readonly tags: readonly string[];
  /** `jev` when the post reviews TypeSafe's Jev model, so that it ends with `FOOTER_LINES.jev`. */
  readonly kind: PostKind;
  readonly body: readonly PostBlock[];
}

/**
 * A post that is live. Its dates are `YYYY-MM-DD` days, as a case study's are: when it first went
 * live, and when what it says last changed.
 */
export interface PublishedPost extends PostContent {
  readonly draft: false;
  readonly publishedAt: string;
  readonly updatedAt: string;
}

/** A post still being written. It renders nowhere, so its dates are optional until it publishes. */
export interface DraftPost extends PostContent {
  readonly draft: true;
  readonly publishedAt?: string;
  readonly updatedAt?: string;
}

/** Discriminated on `draft`, so nothing can read a post's dates without first ruling out a draft. */
export type Post = PublishedPost | DraftPost;

/**
 * The lines a post of each kind ends with, in order (ADR 0034), in the owner's own words. The post
 * page renders them in a `<footer>`, last inside its `<article>`, and ADR 0034 has the post's
 * Markdown twin end with them after a `---` rule. The feed carries only summaries, so no line
 * reaches it.
 */
export const FOOTER_LINES: Readonly<Record<PostKind, readonly string[]>> = {
  own: [],
  jev: ['I have no relationship with TypeSafe.'],
};

/**
 * Every post, drafts included, in any order. The top of this file says how a post is drafted and
 * added.
 * `posts.test.ts` fails when a source file other than a test imports `posts` rather than the index,
 * and when a client component imports this module at all, which would ship the drafts to the browser.
 */
export const posts: readonly Post[] = [];

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

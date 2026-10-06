# 0028. Blog posts are typed data, and the owner writes every one

## Status

Superseded by ADR-0034

Two of the decisions below no longer apply, and
[ADR 0034](0034-blog-posts-drafted-with-claude.md) replaces both. Decision 5 goes, because posts
are now drafted with Claude and approved by the owner line by line. Decision 1's list of block kinds
gains a `table`. The rest of this record still applies.

## Date

2026-09-29

## Context

`/blog` has been a "Coming Soon" placeholder since the site launched. It stays in the primary
navigation, `apps/web/src/app/blog/page.tsx` marks it `noindex`, and `apps/web/src/app/sitemap.ts`
leaves it out (#48). Issue #61 asks for posts, an Atom feed of them and a Markdown twin of each,
all read from one source in the way the case studies are read from
`apps/web/src/data/case-studies.ts`: the page renders the object, and
`apps/web/src/lib/serialise.ts`, the one module that writes Markdown (#59), serialises the same
object for the twin. The work is laid out in
[the blog engine design](../plans/2026-09-28-blog-engine-design.md).

Four questions had to be settled before any of it could be built.

- **The body's format.** The usual answer for a Next.js blog is MDX: `@next/mdx` with remark
  plugins and one `.mdx` file per post. Here that means a new dependency and a second rendering
  surface, and the twin and the feed would need a remark pipeline to turn MDX back into Markdown,
  outside the serialiser's escaping. `CLAUDE.md` also records that the Claude Code PostToolUse
  Prettier hook leaves `.mdx` files exactly as written.
- **The dates.** The issue gave a post's dates the `OWNER_TODO` union of #56, so that posts drafted
  before the owner had dated them could merge. The case studies carry plain `YYYY-MM-DD` strings,
  `publishedAt` and `updatedAt`, which `apps/web/src/lib/content-date.ts` formats and checks.
- **Who writes the posts.** The issue planned for Claude to draft two or three posts from the
  repository's history and for the owner to rewrite them. The owner's rule for this work is that
  no agent writes post prose, drafts included: a draft in the owner's voice that the owner did not
  write is what the rule exists to prevent.
- **The empty state.** The model has to merge before the first post exists, and until then the
  pages, the feed and the sitemap have to leave the site as it is.

## Decision

1. Posts are typed data in `apps/web/src/data/posts.ts`: an array, `posts`, beside
   `case-studies.ts`. A post's `body` is an array of blocks, each a `heading` (level 2 or 3), a
   `paragraph`, a `list`, a `code` block or a `quote`, and running text is an array of inline
   pieces: a string, `{ code }` or `{ text, href }`. Every string is plain text, shown as written.
   There is no MDX, no Markdown string and no parser: the post page renders the blocks, and
   `serialise.ts` writes the same blocks as Markdown.
2. `Post` is a union discriminated on `draft`. A published post carries `publishedAt` and
   `updatedAt` as `YYYY-MM-DD` days, the fields and format a case study uses; a draft may leave them
   out. Posts do not use `OWNER_TODO`.
3. Nothing renders `posts` directly. `publishedPosts` (newest first), `hasPublishedPosts` and
   `getPost(slug)` come from `buildPostIndex(posts)`, which leaves drafts out, so a draft reaches
   no page, twin, feed entry or sitemap row.
4. `hasPublishedPosts` is the one switch for everything that waits for the first post: whether
   `/blog` is `noindex`, whether `/blog` and the posts are in the sitemap, and whether pages
   advertise the feed. While it is false the site stays as it is today, placeholder and nav link
   included. Publishing the first post is a data commit to `posts.ts`, not a code change.
5. No agent writes post prose, drafts included, so `posts` is empty until the owner adds a post.
   Tests prove the non-empty paths against fixtures in `apps/web/src/test/fixtures/posts.ts`, whose
   copy describes the fixtures and nothing else.
6. `apps/web/src/data/__tests__/posts.test.ts` holds the rules, run against `posts` and the
   fixtures. Every slug is unique, in lowercase words joined by hyphens. A published post needs real
   dates, neither in the future, with `updatedAt` no earlier than `publishedAt`; a summary of 50 to
   300 characters; a served title of at most 60; tags that are neither blank nor repeated; and a
   body of non-empty blocks, with headings at level 2 or 3, no level 3 before the first level 2 and
   no heading twice. Only a code block may hold a line break, a control or a direction character,
   and titles, the summary, headings and tags have no stray spaces. Its links say where they go,
   and go to `https://` URLs or to pages on this site that exist, published posts included. The
   test also fails when code outside `posts.ts` imports `posts` rather than the index, or a client
   component imports the module at all, which would bundle the drafts.

## Consequences

- Writing a post means writing TypeScript string literals. That is more tedious than prose in an
  `.mdx` file, and quotation marks and line breaks need care. In exchange Prettier formats the
  module like any other, and the type checker rejects a malformed block before anything renders it.
- A new block or inline kind is a change to the type, to every renderer of posts and to the
  fixtures. The fixture test names each kind through `satisfies`, so it fails typecheck until the
  new kind is named there, and then fails until the fixtures use it.
- A post's `updatedAt` follows the case-study rule: it moves in the commit that changes what the
  post says, and only then.
- The issue's second acceptance criterion, a row in #56's `OWNER_TODO` register for each drafted
  post, is dropped. With no drafted post there is nothing to register.
- While `posts` is empty it passes every rule trivially. The rules are proven by the checker's own
  tests, which break copies of the fixtures one defect at a time and expect each to be named.
- If typed blocks prove intolerable to write, the fallback the issue names is MDX with a remark
  pipeline, in a record that supersedes this one, not a second copy of the prose.

## Alternatives considered

- **MDX**, with `@next/mdx` and remark plugins: rejected for the dependency, the second rendering
  surface, the pipeline the twin and the feed would need, and the Prettier hook's blind spot.
- **A Markdown string per post**, rendered by a parser at build time: rejected because it adds a
  parser to the site, and because the twin would be whatever the author typed rather than the
  serialiser's escaped output.
- **The `OWNER_TODO` union for post dates**, as the issue specified: it exists so that a placeholder
  can merge. With no drafted post there is no placeholder, and plain dates keep posts and case
  studies on one format and one date module.
- **Agent-drafted posts that the owner rewrites**, as the issue planned: refused under the owner's
  rule.
- **Removing `/blog` from the navigation until the first post**: the other way to handle the empty
  state. The switch in decision 4 works either way, so the choice stays with the owner.

# Blog engine — design

**Date:** 2026-09-28
**Status:** Proposed; in review with the first slice, `feat/blog-post-model`
**Branch:** one per slice, listed under Slices
**Related:** #61, #48 (the `/blog` `noindex`), #59 (the Markdown serialiser), #55 (the
build-output gate), #57 (JSON-LD), [ADR 0028](../adr/0028-blog-posts-as-typed-data.md)

## Context

`/blog` is a "Coming Soon" placeholder. It sits in the primary navigation, and since #48 it is
`noindex` and out of the sitemap. Issue #61 asks for posts, an Atom feed of them, a Markdown twin of
each, and for `/blog` to become indexable once a post is live, all read from one post model in the
shape `case-studies.ts` gives the case studies.

This design departs from the issue in three ways, each recorded in
[ADR 0028](../adr/0028-blog-posts-as-typed-data.md) or below:

- **No agent writes a post.** The issue planned two or three posts drafted by Claude for the owner
  to rewrite. The owner's rule for this work forbids that, so the model ships with no posts and
  every page, feed and sitemap entry is driven by the data: publishing the first post is the
  owner's data commit, not a second code pull request.
- **Plain dates.** A published post carries `publishedAt` and `updatedAt` as `YYYY-MM-DD` days, as a
  case study does, rather than #56's `OWNER_TODO` union. The issue's second acceptance criterion,
  a register row per drafted post, is dropped: there is no drafted post to register.
- **Six pull requests, not two.** The issue's two become the six slices below, each small enough to
  review on its own. The feed's end-to-end test gets its own spec, so the slices that build `/blog`
  and the feed do not both edit one file.

> **2026-10-06:** the bullet "No agent writes a post" no longer holds.
> [ADR 0033](../adr/0033-blog-posts-drafted-with-claude.md) supersedes ADR 0028: posts are drafted
> with Claude and approved by the owner line by line.
> [The publishing design](2026-10-06-blog-publishing-design.md) adds the `kind` flag, the disclosure
> footer, a table block and the publish check.

## Goals

1. One post model that the post page, its twin, the feed, the sitemap and the post's JSON-LD all
   read, so no sentence is written twice.
2. The machinery merges before any post exists, and while there is none the site is unchanged.
3. The owner publishes the first post by editing `apps/web/src/data/posts.ts` alone.
4. The deployment stays function-free: every new route prerenders.

## Non-goals

- Writing posts, or choosing their topics. The issue's three outlines are suggestions to the owner.
- RSS 2.0 or JSON Feed beside Atom, comments, a newsletter, reading-time or engagement counters,
  third-party embeds.
- Any structured-data type [ADR 0017](../adr/0017-ai-discoverability-policy.md) refuses, and any
  claim that a post or a feed changes how answer engines cite the site.
- A per-post `opengraph-image.tsx`, which the issue measured building as a function.

## Decisions

| #   | Decision                                                                                                                                                                                                                                            | Why                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Posts are typed data in `apps/web/src/data/posts.ts`: a body of `heading`, `paragraph`, `list`, `code` and `quote` blocks over inline text, code and links. No MDX, no Markdown string.                                                             | One object renders to HTML and serialises to Markdown with no parser (ADR 0028).                                                                            |
| D2  | `Post` is discriminated on `draft`. A published post has `YYYY-MM-DD` dates; a draft may omit them.                                                                                                                                                 | Nothing reads a date without ruling out a draft, and posts share the case studies' date format and `content-date.ts`.                                       |
| D3  | `publishedPosts` (newest first), `hasPublishedPosts` and `getPost` come from `buildPostIndex(posts)`, and nothing that renders reads `posts` itself.                                                                                                | A draft reaches no page, twin, feed entry or sitemap row, and tests prove the same code over fixtures while `posts` is empty.                               |
| D4  | `hasPublishedPosts` is the one switch for `/blog`'s `noindex`, `/blog` and the posts in the sitemap, and the feed's discovery link.                                                                                                                 | Publishing is data. #48's placeholder rules become conditional rather than being flipped by hand.                                                           |
| D5  | With no published post, `/blog` keeps its placeholder copy, its nav link and its `noindex`, stays out of the sitemap, and no page links the feed. `/feed.xml` still builds, as a valid feed with no entries.                                        | The feed follows the content, and an advertised feed with nothing in it helps no reader. The owner may instead drop the nav link while the blog is empty.   |
| D6  | `/blog/[slug]` exports `dynamicParams = false` and a `generateStaticParams` over `publishedPosts`, as `/work/[slug]` does.                                                                                                                          | An unknown slug is a routing-level 404 ([ADR 0015](../adr/0015-static-case-study-params.md)), not a `notFound()` that serves Next's bare recovery shell.    |
| D7  | Post pages are server components with no client state, GSAP or `AnimatedText`. Secondary text takes `--muted`, links `--accent-text`, and a code block scrolls in its own container.                                                                | Nothing on a post needs the client, a per-character heading reads badly to an extractor (#47), and the colour rules of ADR 0011 apply.                      |
| D8  | The post card is an `og-image.png` route handler beside the post page, as the case studies' is.                                                                                                                                                     | `buildMetadata()` sets a complete `openGraph`, so a folder's `opengraph-image` does not reach the post pages.                                               |
| D9  | Every route handler this work adds exports `dynamic = 'force-static'`, and a unit test pins it.                                                                                                                                                     | A `GET` handler is dynamic by default since Next 15, and a dynamic handler deploys as a function. The export goes only if the site adopts Cache Components. |
| D10 | Twins live at `/blog/<slug>/index.md`, written by a `postToMarkdown` in `serialise.ts`.                                                                                                                                                             | The uniform `/index.md` shape of #59, and one serialiser for every twin.                                                                                    |
| D11 | Posts carry a TechArticle and a BreadcrumbList built with #57's builders, and no new node type.                                                                                                                                                     | The case studies' type set, and ADR 0017's refusals.                                                                                                        |
| D12 | The feed is Atom, `application/atom+xml; charset=utf-8`, with an author name and URI and no address, entries newest first, published posts only, and its `updated` from the newest post or the `/blog` date in `static-routes.ts`, never the clock. | RFC 4287's required elements, Google Feedfetcher as a documented reader, and a build whose output depends on its inputs alone.                              |

## Slices

| Slice | Branch                     | Delivers                                                                                                                              | Builds on     |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 61a   | `feat/blog-post-model`     | The model, the fixtures, the checker, ADR 0028, this design and its plan.                                                             | `main`        |
| 61b   | `feat/blog-post-pages`     | `/blog/[slug]`, the post body component, the post card, the post routes in `apps/web/e2e/routes.ts`, and `apps/web/e2e/blog.spec.ts`. | 61a           |
| 61c   | `feat/blog-index`          | `/blog` lists published posts; its `noindex` and sitemap entries follow D4, and #48's two rows are rewritten to that contract.        | 61a, 61b      |
| 61d   | `feat/blog-atom-feed`      | `/feed.xml` and its discovery link while D4's switch is on.                                                                           | 61a, 61b, 55a |
| 61e   | `feat/blog-markdown-twins` | `postToMarkdown` and the post twins. It lands before the first post, or #59's alternates would advertise a twin that 404s.            | 61b, 59e      |
| 61f   | `feat/blog-post-json-ld`   | The post TechArticle and BreadcrumbList.                                                                                              | 61b, 61c, 57a |

[The plan](2026-09-28-blog-engine-plan.md) breaks each slice into tasks with stop conditions.

## Owner decisions

- Typed blocks over MDX, and that no agent writes a post (ADR 0028). **2026-10-06:** the second
  half no longer holds: [ADR 0033](../adr/0033-blog-posts-drafted-with-claude.md) supersedes
  ADR 0028.
- The empty state in D5, or dropping the nav link while the blog is empty.
- The feed's title and author: the name the site already uses and `https://miloscvetkovic.dev`,
  with no address.
- Dropping the issue's second acceptance criterion.
- Every post, its topic and its dates. A post drawing on the audit's finding register needs a
  decision on how much of it may be public; one about the self-healing agent quotes the metric
  wording #49 settles, never a bare percentage.

# Blog Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The blog renders, serialises and syndicates whatever the owner publishes in
`apps/web/src/data/posts.ts`, and with nothing published the site is unchanged.

**Architecture:** One typed module, `posts.ts`, holds every post; `buildPostIndex` derives the
published posts, newest first, the `hasPublishedPosts` switch and `getPost`. Post pages, twins, the
feed, the sitemap and the JSON-LD read only those. Every route handler prerenders.

**Design:** [2026-09-28-blog-engine-design.md](2026-09-28-blog-engine-design.md) (decisions
D1-D12), with the standing record in [ADR 0028](../adr/0028-blog-posts-as-typed-data.md).

**Branch:** one per task, as the design's Slices table lists: Task 1 is `feat/blog-post-model`,
branched from `main` at `415014e` and rebased onto `a0331e4` (#167) before its first push.

**Stop condition for the whole plan (all must hold):**

```bash
pnpm check:allowbuilds && pnpm check:adrs && pnpm test:scripts && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
pnpm --filter web build && CI=true pnpm --filter web test:e2e                                                                                    # exit 0, all three projects
pnpm check:docs-drift --skip-requires admin                                                                                                     # nothing uncatalogued
```

and, once the owner's first post is live, the design's production checks: `/blog` without
`noindex` or the placeholder, `/blog` and the post in `/sitemap.xml` with its `updatedAt`, one Atom
alternate on every page, and the post's twin answering `text/markdown`.

Every command runs from the repository root after loading nvm, one suite at a time.

---

### Task 1: The post model (61a)

**Files:**

- Create: `apps/web/src/data/posts.ts`, `apps/web/src/data/__tests__/posts.test.ts`,
  `apps/web/src/test/fixtures/posts.ts`, `docs/adr/0028-blog-posts-as-typed-data.md`, the design
  and this plan
- Modify: `docs/adr/README.md`, `docs/plans/README.md`, `docs/drift-manifest.json`

- [x] **Step 1:** Write the fixtures (every block and inline kind, a title with `&`, `<` and `"`, a
      draft, two published posts listed oldest first) and `posts.test.ts`, whose checker,
      `problemsIn`, takes the posts and a day and checks slugs, dates, summary length, the served
      title, blocks, heading levels and link targets. Run it; it fails because `../posts` does not
      exist.
- [x] **Step 2:** Write `posts.ts`: `Inline`, the five block types, `PublishedPost` and `DraftPost`
      discriminated on `draft`, an empty `posts`, and `buildPostIndex` with the `publishedPosts`,
      `hasPublishedPosts` and `getPost` it derives. The test passes: 148 tests.
- [x] **Step 3:** Mutate the checker and the index (a permissive link pattern, no heading-order
      check, the draft rule inverted, the future-date rule off, the sort reversed, drafts
      published) and see each mutant fail the suite.
- [x] **Step 4:** Write ADR 0028, the design and this plan, their index rows, and drift-manifest
      entries for their links, index cells and script commands.
- [ ] **Step 5:** At the merge turn, re-check that 0028 is still the next free ADR number on
      `main` (renumber the file, its row and its manifest entries if not), then run the ADR and
      drift checks.

**Stop condition:**

```bash
pnpm --filter web exec vitest run src/data/__tests__/posts.test.ts   # exit 0
pnpm check:adrs                                                      # exit 0
pnpm check:docs-drift --skip-requires admin                          # nothing uncatalogued
```

### Task 2: Post pages (61b)

**Files:**

- Create: `apps/web/src/app/blog/[slug]/page.tsx`, `apps/web/src/app/blog/[slug]/og-image.png/route.ts`,
  `apps/web/src/components/post-body.tsx` and its test, `apps/web/src/app/blog/__tests__/post-page.test.tsx`,
  `apps/web/e2e/blog.spec.ts`
- Modify: `apps/web/e2e/routes.ts`, `apps/web/e2e/accessibility.spec.ts`, the unknown-slug lists in
  the not-found, console and hydration specs, `apps/web/src/app/__tests__/page-metadata.test.ts`,
  `apps/web/src/app/__tests__/single-source-metrics.test.ts`, `CLAUDE.md` (Routes),
  `.claude/rules/app-router-and-content.md`

- [x] **Step 1:** The post page test against the fixtures, through `vi.mock('@/data/posts')`: one
      `h1`, both labelled dates as `<time dateTime>`, every block kind, drafts absent from
      `generateStaticParams`, and `force-static` on the card handler. It fails.
- **Step 2**, split when 61b landed, since only its first part was in that slice:
  - [x] The page, the body component and the card handler, copying the static params of
        `/work/[slug]` (D6, D7, D8). The summary is the description, so `page-metadata.test.ts`
        holds a published post's summary to 155 characters.
  - [ ] Headings get ids from one rule the page and the checker share; the checker then requires a
        link's `#fragment` to name a heading of the page it goes to, and ids to be unique, not only
        heading texts.
  - [ ] Decide whether `QuoteBlock` needs a `source` for `<cite>` (61b renders none).
  - [ ] Export the root title template once and derive the ` | Milos Cvetkovic` suffix from it in
        `page-metadata.test.ts` and `posts.test.ts`.
- [x] **Step 3:** The post routes in `routes.ts`, derived from `publishedPosts`; a template contrast
      floor for `/blog/<slug>`; `/blog/does-not-exist` in the unknown-slug lists; `blog.spec.ts`.
- [x] **Step 4:** The build table shows the post route and its card as prerendered, not as
      functions.

### Task 3: The `/blog` list, indexing and sitemap (61c)

**Files:**

- Modify: `apps/web/src/app/blog/page.tsx`, `apps/web/src/app/sitemap.ts`,
  `apps/web/src/app/__tests__/sitemap.test.ts`, `apps/web/src/data/static-routes.ts`,
  `apps/web/e2e/seo-surface.spec.ts`, `apps/web/e2e/blog.spec.ts`
- Create: `apps/web/src/app/blog/__tests__/blog-page.test.tsx`

- [x] **Step 1:** Tests over the fixtures: one list item per published post with its title and
      labelled date, no draft, no placeholder; the sitemap lists `/blog` and each post with
      `lastmod` equal to its `updatedAt`. They fail.
- [x] **Step 2:** `/blog` lists `publishedPosts` and keeps the placeholder only while
      `hasPublishedPosts` is false; its metadata becomes `index: hasPublishedPosts`; the sitemap
      follows the same switch (D4, D5).
- [x] **Step 3:** #48's two rows, the `/blog` robots meta and the sitemap's `/blog` entry, are
      rewritten to the conditional contract with a comment naming #61.

### Task 4: The Atom feed (61d)

**Files:**

- Create: `apps/web/src/lib/atom.ts`, `apps/web/src/app/feed.xml/route.ts`,
  `apps/web/src/app/__tests__/feed.test.ts`, `apps/web/e2e/feed.spec.ts`
- Modify: `apps/web/src/lib/metadata.ts` and its test, `apps/web/e2e/machine-readable.spec.ts`, the
  build-output gate under `scripts/`, `.claude/rules/app-router-and-content.md`

- [x] **Step 1:** `feed.test.ts` in jsdom, for its `DOMParser`: well-formed output, entries newest
      first with no draft, the fixture title with `&`, `<` and `"` still parsing, an empty feed, and
      `force-static`. It fails.
- [x] **Step 2:** `buildAtomFeed` and the route (D9, D12); the Atom alternate in `buildMetadata()`
      only while `hasPublishedPosts`.
- [x] **Step 3:** `feed.spec.ts`: `/feed.xml` answers 200 with the Atom type, and each page carries
      one Atom alternate when a post is published and none otherwise. The `/feed.xml` expected
      failure in the machine-readable spec is removed and the gate expects the feed's body file.
      (The gate requires `feed.xml.body` as it does every prerendered path's body, with fixtures in
      its test; it has no list of routes that must exist, so `/feed.xml` joins one when there is.)

### Task 5: Markdown twins (61e)

**Files:**

- Create: `apps/web/src/app/blog/[slug]/index.md/route.ts`
- Modify: `apps/web/src/lib/serialise.ts` and its test, `apps/web/src/app/blog/index.md/route.ts`,
  `apps/web/e2e/blog.spec.ts`, `.claude/rules/app-router-and-content.md`

- [x] **Step 1:** Serialiser tests: every block and inline kind of every fixture post appears in its
      Markdown, which opens with `# <title>`; the route exports `force-static`. A fixture code
      block and an inline code piece hold a run of backticks, and the fence and the code span are
      longer than the run. They fail. (The backtick runs are built in
      `apps/web/src/lib/__tests__/serialise.test.ts`, in the test "fences code longer than its
      longest backtick run…", not in the fixture posts.)
- [x] **Step 2:** `postToMarkdown`, the twin route over `publishedPosts` (D10), and the `/blog` twin
      listing the published posts.
- [x] **Step 3:** `blog.spec.ts` checks each twin and the post page's one Markdown alternate. This
      task lands before the first published post. (Met by `apps/web/e2e/markdown-twins.spec.ts`
      rather than `blog.spec.ts`: `MARKDOWN_TWINS` has an entry for each published post, so once a
      post is published the spec checks that its page advertises exactly one Markdown twin, served
      as Markdown. While none is, it checks no post twin.)

### Task 6: Post JSON-LD (61f)

**Files:**

- Modify: `apps/web/src/lib/structured-data.ts`, `apps/web/src/components/json-ld.tsx` and its
  test, `apps/web/src/app/blog/[slug]/page.tsx`, `apps/web/src/app/blog/__tests__/post-page.test.tsx`,
  `apps/web/e2e/seo-surface.spec.ts`

- [x] **Step 1:** Tests: each block parses, the fixture title stays inside its script, the dates
      equal the post's. They fail.
- [x] **Step 2:** Post TechArticle and BreadcrumbList builders on #57's graph, rendered from the post
      page (D11), and the served type set checked on the post routes. (#57's own `techArticle()`
      and `breadcrumbList()` build them, through `PostArticleJsonLd` and `PostBreadcrumbJsonLd` in
      `json-ld.tsx`, beside the post's `WebPageJsonLd`. The article leaves out `description` and
      `keywords`, because the post page prints neither its summary nor its tags (ADR 0031's fifth
      decision). With no post published, the served check covers no post route and says so in its
      report.)

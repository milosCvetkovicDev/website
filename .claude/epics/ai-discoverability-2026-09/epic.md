---
name: ai-discoverability-2026-09
status: backlog
created: 2026-09-12T08:13:07Z
updated: 2026-09-12T13:14:03Z
progress: 0%
prd: .claude/prds/ai-discoverability-2026-09.md
github: https://github.com/milosCvetkovicDev/website/issues/54
---

# Epic: ai-discoverability-2026-09

## Overview

Ten tasks that make the site legible to search engines, answer engines and AI agents, ordered by the strength of
the evidence behind each measure rather than by fashion. The research this epic derives from is unusually
one-sided: Google states no machine-readable AI file is needed or read, Ahrefs measured 97% of `llms.txt` files
as never fetched, and a matched study of 1,885 pages found no citation lift from JSON-LD. So the epic's weight
sits on content and correctness - dates, quotable metrics, a connected entity graph, extractable text - with the
machine-readable layer shipped narrowly and honestly, one deliberately ambitious endpoint built for
demonstration, and **a written record of everything refused**, which is the output most likely to still be
useful in a year.

Like epic #42, every task lands as one or more small squash-merged PRs from a typed branch; there is no epic
branch. Task #55 lands the gates and the irreplaceable baseline first; #64 verifies on production.

## Architecture Decisions

**Fixed (reuse, no debate):**

- **Static stays static.** Every page route remains `○` or `●`. Route handlers carry
  `export const dynamic = 'force-static'`; the MCP endpoint at `/mcp` is the single permitted function. A gate
  asserts this, because the failure is silent - the endpoint still works, it just stops being static.
- **One serialiser, one source.** A single module over `case-studies.ts` (and the post model #61 adds)
  produces the Markdown twins, `/llms.txt`, the JSON representation, the feed and the MCP tool payloads. No
  fact is written twice; CLAUDE.md's single-source rule extends to generated output.
- **Uniform `/index.md`** for every twin, including flat routes - `[slug].md` is impossible because Next types a
  partial dynamic segment as a literal with no params.
- **Negotiation by rewrite, never by middleware.** The canonical URL serves Markdown to a client that
  sends `Accept: text/markdown`, through a `beforeFiles` rewrite scoped to the known routes plus its own
  rule for `/`. A probe confirmed this keeps every route `○`/`●` with no function; middleware would end the
  static posture and is not used.
- **Consume #48's helpers.** `mergeMetadata` for per-route metadata and `serializeJsonLd` for every JSON-LD
  block; this epic adds nodes, never a second escaping path.
- **MCP against spec revision 2026-07-28**: stateless, no `initialize` handshake, no `Mcp-Session-Id`, so no
  session store and no Redis. Streamable HTTP only; the HTTP+SSE transport is formally deprecated.
- **Evidence labels are part of the deliverable.** Every measure states its consumer and whether the evidence
  is measured, vendor-documented, formal-standard, de-facto-standard, convention-only or speculative (the two
  standard labels are for a specification or RFC the claim rests on). Where the honest reason is demonstration, the
  task says so.
- **Nothing fabricated.** Dates, metric windows, credentials and locations are placeholders until the owner
  supplies them, and a CI check fails while a placeholder survives.

**Decided in the task that meets them (one ADR each, numbered at PR time):**

1. The AI discoverability policy: full crawler openness, the evidence per measure, and the dated
   "deliberately not built" list (#63).
2. Route handlers and generated endpoints as a repository pattern, with the `force-static` rule (#59).
3. The MCP server: scope, read-only posture, unauthenticated access and the honest audience (#62).

## Technical Approach

### Frontend Components

- `src/data/case-studies.ts`: `datePublished`, `dateModified`, and a metric definition carrying scope and
  window (#56). `src/data/posts.ts` for the blog (#61).
- `src/components/json-ld.tsx`: `@id`-connected graph, `ProfilePage`, expanded `Person`, `Article` and
  `BreadcrumbList` (#57).
- Route pages: `H1`s that name the subject, real `table` elements for stacks and timeline, visible dates and
  metric scope, a visible question-and-answer block with no FAQPage markup (#58).
- `src/app/**/index.md/route.ts`, `src/app/llms.txt/route.ts`, the JSON endpoint and `feed.xml` - all
  `force-static` (#59, #60, #61).

### Backend Services

One: the MCP endpoint at `src/app/mcp/route.ts` (#62), read-only and unauthenticated, over the same
serialised data. It is the only route in the repository that becomes a function.

### Infrastructure

- No new platform service. The MCP function runs on the existing Vercel project.
- Search Console and Bing Webmaster registration (owner action, #55).
- CI gains offline gates in `quality` and browser gates in `e2e`; Lighthouse asserts audit ids.

## Implementation Strategy

- **Order.** #55 first (the baseline cannot be backfilled and the gates make everything else provable), then
  #56 because every later task needs its data, then #57, #58 and #59 in parallel, #60 after #59, #61 and #62
  last before #64.
- **Conflicts to respect.** `conflicts_with` names each task's primary pairs and is not a complete parallelism
  gate; schedule from this file map, where two tasks may run together only if they share no line:
  - `src/data/case-studies.ts`: #56 (fields), #58 (copy)
  - `src/components/json-ld.tsx` and `src/app/layout.tsx`: #57, #59 (`alternates.types`), and task
    #48 of epic #42 before either
  - route pages (`about`, `skills`, `work`, `work/[slug]`): #57 (markup), #58 (headings and tables)
  - the serialiser and the generated endpoints: #59, #60, #61, #62
  - `.github/workflows/ci.yml` and `apps/web/playwright.config.ts`: #55, #63
  - `CLAUDE.md` and `README.md`: #63 primarily; #59 and #60 add one line each
  - `docs/adr/README.md`: #57, #59, #62 and #63 each add a row - rebase and re-run `pnpm format`
- **Cross-epic.** Do not start before #48 merges. Task #47 fixes the per-character spans this epic's extraction
  floor depends on; if #47 has not landed, #55's phrase assertions land as expected failures naming it.
- **Risk mitigation.** The build-output gate lands in #55, before any route handler exists, so the first
  handler cannot silently become a function. The MCP server ships last so that a protocol change cannot block
  the measures that actually pay.

## Task Breakdown Preview

- [ ] **#55 - Baseline and gates:** the no-JS text spec, the build-output gate, robots-versus-subresources,
      offline structured-data validation, Lighthouse by audit id, and the dated Search Console and Bing
      baseline.
- [ ] **#56 - Dates and honest metrics:** the content-model fields, the placeholder gate, visible dates, and
      sitemap lastmod restored from real data.
- [ ] **#57 - Structured data:** one `@id`-connected graph, `ProfilePage`, expanded `Person`, `Article` and
      `BreadcrumbList`.
- [ ] **#58 - Content shape:** headings that name the subject, real tables, metric scope in the visible text, a
      visible Q&A block.
- [ ] **#59 - Markdown twins:** one serialiser, a `/index.md` twin per route, `alternates.types` discovery.
- [ ] **#60 - llms.txt and JSON:** both generated from that serialiser, with their real audience stated.
- [ ] **#61 - Blog and feed:** two or three drafted posts for the owner to rewrite, the post model, an Atom feed,
      and `noindex` removed once a post is live.
- [ ] **#62 - MCP server:** read-only, stateless, unauthenticated, with connector snippets.
- [ ] **#63 - Policy and docs:** the ADR, the dated refusal list, CLAUDE.md, README and the plans index.
- [ ] **#64 - Production verification:** every endpoint, rich result and floor checked on the live site, with a
      dated after-snapshot.

## Dependencies

- **Epic #42:** task #48 (foundation, blocking), #43 (route list and served-HTML pattern), #47 (per-character
  spans), #49 (metric contradictions).
- **Owner:** Search Console and Bing registration; real dates and metric windows; the `Person` node's location,
  credentials and extra profiles; editing all drafted content.
- **External:** Google Rich Results Test; `validator.schema.org` (advisory only).

## Success Criteria (Technical)

- `Article` and `BreadcrumbList` detected with zero errors on all three case studies; `ProfilePage` on
  `/about`.
- Every route: canonical, visible date where applicable, `/index.md` twin returning `text/markdown`, and an
  advertising `alternates.types` link.
- Served HTML with JavaScript disabled meets every per-route floor, with no heading shattered per character.
- `/llms.txt` parses as llmstxt.org v2 and lists every case study; the JSON representation validates.
- `/mcp` answers `tools/list` over streamable HTTP; the published Claude Code snippet works unedited.
- Build output: no function other than `/mcp`; all seven gates and both e2e modes green.
- A dated before-and-after snapshot exists, and the ADR records the policy and the refusals.

## Estimated Effort

- **Timeline:** about 59 hours, so roughly two weeks alongside other work, starting after #48.
- **Critical path:** #55 → #56 → #59 → #60 → #62 → #64.
- **Sizing:** L: #61. M: #55, #57, #58, #59, #62. S: #56, #60, #63, #64.

## Tasks Created

- [ ] #55 - Measurement baseline and the gates this surface needs (parallel: true)
- [ ] #56 - Give the content real dates and honest metric definitions (parallel: true)
- [ ] #57 - One connected structured-data graph, and the two rich results the site is eligible for (parallel: true)
- [ ] #58 - Content shape: headings that name the subject, tables, and metrics with a scope (parallel: true)
- [ ] #59 - Markdown twins for every route, from one shared serialiser (parallel: true)
- [ ] #60 - llms.txt and a static JSON representation, framed by what actually reads them (parallel: true)
- [ ] #61 - Give the blog its first posts and an Atom feed (parallel: true)
- [ ] #62 - A read-only MCP server so agents can call the site (parallel: true)
- [ ] #63 - Record the policy, including what is deliberately not built (parallel: true)
- [ ] #64 - Production verification of the discoverability work (parallel: false)

Total tasks: 10
Parallel tasks: 9
Sequential tasks: 1

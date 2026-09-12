---
name: ai-discoverability-2026-09
description: Make the site legible to search engines, answer engines and AI agents - by fixing what the evidence says matters (dates, entity graph, content shape, Markdown twins) and deliberately not building the fashionable rest
status: backlog
created: 2026-09-12T08:13:07Z
---

# PRD: ai-discoverability-2026-09

## Executive Summary

The site should be findable and quotable by search engines, by answer engines (ChatGPT, Claude, Perplexity,
Google's AI surfaces) and by AI agents and developer tools. On 2026-09-12 six researchers established what
actually achieves that, from vendor documentation, specifications and measurement studies rather than from SEO
folklore. The answer is uncomfortable for anyone selling an "AI SEO" checklist:

- **Google states in writing** that no machine-readable file, AI text file, markup or Markdown is needed to
  appear in Google Search "including its generative AI capabilities", and that Search ignores those files
  (`developers.google.com/search/docs/fundamentals/ai-optimization-guide`, updated 2026-07-10).
- **`llms.txt` is mostly a publishing ritual.** Ahrefs' log study of 137,210 domains (2026-06-15) found 97% of
  valid `llms.txt` files were fetched zero times in May 2026; of the bots that read one, 77% were not AI tools
  at all (SEO audit tools alone were 21.7% of requests, AI retrieval bots 1.1%). Every major vendor publishes one; none documents reading one.
- **Structured data is not an AI citation lever.** Google: "Structured data isn't required for generative AI
  search, and there's no special schema.org markup you need to add." Ahrefs' matched difference-in-differences
  study over 1,885 pages found no citation lift from adding JSON-LD.
- **A dozen popular measures are dead or were never alive**: `llms-full.txt` (not in the specification),
  FAQPage and HowTo rich results (FAQ stopped appearing 2026-05-07), `speakable`, `ai.txt`, TDMRep,
  Cloudflare's Content-Signals ("made up by a CDN", John Mueller, 2026-07-06),
  `/.well-known/ai-plugin.json` (plugins shut down 2024-04-09), `agents.json`, JSON Resume, WebMCP, and
  IndexNow as an AI channel (its registry lists seven endpoints, none an AI vendor).

What is documented to pay is narrower and mostly unglamorous: two live Google rich results the site is
eligible for and does not emit, a connected entity graph instead of two unrelated nodes, content that carries
dates and quotable specifics, and machine-readable twins for the developer tools that demonstrably request
them. This epic does those, adds the gates that keep them true, builds one deliberately ambitious thing whose
case is skill rather than reach, and **writes down what it refused to build and why**, because the pressure to
add fashionable files will return.

It follows [`audit-remediation-2026-09`](../epics/audit-remediation-2026-09/epic.md) (epic #42) and starts once
task #48 lands, building on the canonical URLs, open `robots.txt`, `serializeJsonLd` helper and metadata
helper that #48 introduces.

## Problem Statement

**What:** five gaps, stated as what a machine cannot currently learn from this site.

1. **Nothing on the site has a date.** No page carries `datePublished` or `dateModified`, so there is no
   freshness signal for any engine, no honest `sitemap` lastmod (task #48 removes the build-time stamp
   precisely because there is nothing true to replace it with), and no `Article` schema is possible.
2. **The metrics are unquotable.** "73% faster resolution" has no denominator, no period and no definition.
   The KDD 2024 GEO benchmark measured statistics at +37% and cited sources at +30% for visibility in
   generative engines; a bare percentage is the shape that does not travel, and a reader cannot verify it.
3. **The entity graph is two disconnected nodes.** A `Person` and a `WebSite` with no relationship, no
   `ProfilePage`, no `sameAs` beyond the basics, and no `BreadcrumbList` or `Article` - two live Google rich
   results the three case-study routes are eligible for today and do not emit.
4. **The content shape fights extraction.** Five of seven `H1`s are narrative hooks that name neither the
   person nor the subject. The tech stacks and the About timeline are `div` grids, which no HTML-to-Markdown
   converter can turn into a table. And `AnimatedText` shards story headings across 681 per-character spans,
   so an extractor that inserts whitespace at tag boundaries reads `M o s t  b u g s` rather than a sentence -
   the same root cause as the letter-spaced accessible names that task #47 fixes.
5. **There is no machine-readable representation at all.** No Markdown twin, no JSON, no feed, no agent
   endpoint. Coding agents that demonstrably ask for Markdown - Claude Code, Cursor, both GitHub Copilot
   clients send `Accept: text/markdown`, and OpenAI's Codex CLI follows `rel="alternate"` - get HTML shredded
   into per-character spans instead.

**And the measurement is lying.** Lighthouse scores this site's `agentic-browsing` category **1.0** with four
of six audits `notApplicable`, and SEO **100** while every route lacks a canonical, because the canonical
audit returns `notApplicable` when the tag is absent rather than failing. Any gate built on category scores
would have certified all five gaps above as fine.

**Why now:** the site went live on 2026-09-09. A first-party baseline in Search Console and Bing Webmaster
Tools cannot be backfilled, and every week without one is a week of before-data lost.

## User Stories

### US-1: A recruiter's search finds the right page, with a usable result

As **someone searching for an engineer with this profile**, I want Google to show the case study with a
breadcrumb and a date rather than an undated fragment, so that the result looks current and credible.
**Pain today:** no dates, no breadcrumbs, no `Article` markup; every route lacks a canonical, and a
byte-identical copy is indexable on the `vercel.app` alias.

### US-2: An answer engine can quote a specific, checkable claim

As **someone asking ChatGPT or Perplexity "who builds self-healing production agents"**, I want this site's
claims to be specific enough to quote and attribute, so that it can be cited rather than paraphrased away.
**Pain today:** metrics without scope or period, no dates, and headings that do not name their subject.

### US-3: A coding agent can read the site as text

As **an engineer pointing Claude Code, Cursor or Copilot at this site**, I want a Markdown representation, so
that the agent gets prose rather than 681 per-character spans.
**Pain today:** HTML only; the `Accept: text/markdown` request those tools send has nothing to serve it.
The twins alone would not fix that - those clients ask at the canonical URL - so #59 also negotiates
there.

### US-4: An agent can query the work programmatically

As **an agent with a fetch tool, or a Claude Code user who adds this site as a connector**, I want structured
access to the case studies, so that "what has this person shipped with Azure?" is answerable without scraping.
**Pain today:** no JSON, no endpoint, nothing but pages.

### US-5: A machine identifies the person behind the site

As **a search engine resolving an entity**, I want one connected graph that says who this is, what they do and
where else they exist, so that the site's pages attach to a person rather than floating free.
**Pain today:** two unrelated JSON-LD nodes and no `ProfilePage`.

### US-6: The owner can tell whether any of this worked

As **the owner**, I want a dated before-and-after baseline and gates that fail when a claim stops being true,
so that this is measurable rather than a matter of faith.
**Pain today:** no Search Console property, and green Lighthouse categories that certify absent features.

### US-7: The owner is not asked to re-litigate this next quarter

As **the owner**, I want the refusals written down with their evidence and dates, so that the next article
recommending `llms-full.txt` or FAQPage markup meets a record instead of a debate.
**Pain today:** nothing records why these were skipped, so they look like oversights.

## Acceptance Criteria (Gherkin)

```gherkin
Feature: Dates and honest metrics (US-1, US-2)

  Scenario: Every case study carries real dates, visibly and in markup
    Given a case study route
    Then the page shows its publication and last-updated dates in the rendered text
    And its Article JSON-LD carries datePublished and dateModified matching them
    And the sitemap's lastmod for that URL equals its dateModified

  Scenario: No placeholder date or metric definition can ship
    Given any case study whose date or metric definition is still a placeholder
    When the CI gate runs
    Then it fails and names the field

  Scenario: A metric states what it measured
    Given the self-healing agent's headline metric
    Then the page states the figure, what it counted, and over what period
```

```gherkin
Feature: The two rich results and one entity graph (US-1, US-5)

  Scenario Outline: Google's Rich Results Test finds the expected type
    When <route> is tested
    Then <type> is detected with no errors
    Examples:
      | route                    | type           |
      | /work/self-healing-agent | Article        |
      | /work/self-healing-agent | BreadcrumbList |
      | /about                   | ProfilePage    |

  Scenario: The graph is connected
    Given any route's JSON-LD
    Then every node has an @id
    And the WebSite, the WebPage and the Person reference each other by @id rather than repeating themselves
```

```gherkin
Feature: Content a machine can extract (US-2, US-3)

  Scenario Outline: Each route's served HTML carries real text
    Given <route> fetched as served HTML with no JavaScript executed
    Then its extractable text is at least <floor> characters
    And it contains the route's load-bearing phrases intact, with no heading shattered into single characters
    Examples:
      | route  | floor |
      | /      | 4000  |
      | /about | 2500  |
      | /work  | 1200  |

  Scenario: Tech stacks survive Markdown conversion
    Given a case study's tech stack in the served HTML
    Then it is a table element, and converting the page to Markdown preserves its rows
```

```gherkin
Feature: Machine-readable representations (US-3, US-4)

  Scenario Outline: Every route has a Markdown twin
    When <twin> is requested
    Then it responds 200 with content-type text/markdown
    And its body contains the route's headings as sentences
    And the route's HTML advertises it with link rel="alternate" type="text/markdown"
    Examples:
      | twin                               |
      | /about/index.md                    |
      | /work/self-healing-agent/index.md  |

  Scenario: llms.txt is valid and generated
    When /llms.txt is requested
    Then it responds 200 as text/plain, beginning with a single H1 followed by a blockquote summary
    And every case study in the content module appears in it
    And no route in the build output became a server function

  Scenario: An agent can call the site
    When a tools/list request is sent to /mcp over streamable HTTP
    Then the server answers with its read-only tools and no session header
```

```gherkin
Feature: The gates see what Lighthouse cannot (US-6)

  Scenario: A missing canonical fails
    Given a route with no canonical link
    When the metadata gate runs
    Then it fails, rather than reporting notApplicable

  Scenario: An endpoint that stops being static fails the build gate
    Given a route handler whose force-static export was removed
    When the build-output gate runs
    Then it fails and names the route
```

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                              | Task          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| FR-1  | Every route's served HTML meets a per-route text floor with JavaScript disabled, and no heading is shattered per character.                              | #55, #58, #59 |
| FR-2  | The build output stays free of server functions except the MCP endpoint, enforced by a gate.                                                             | #55           |
| FR-3  | No render-critical subresource is disallowed in robots.txt, enforced by a gate.                                                                          | #55           |
| FR-4  | Structured data is validated offline in CI, and Lighthouse assertions name audit ids rather than category scores.                                        | #55           |
| FR-5  | A dated first-party baseline exists in Search Console and Bing Webmaster Tools before the content changes land.                                          | #55           |
| FR-6  | Every case study carries `datePublished` and `dateModified`, shown visibly, in markup, and in the sitemap's lastmod.                                     | #56           |
| FR-7  | Every metric states its scope and measurement window, and a placeholder cannot reach production.                                                         | #56, #58      |
| FR-8  | `Article` (or `TechArticle`) and `BreadcrumbList` are emitted on the case studies and pass the Rich Results Test.                                        | #57           |
| FR-9  | All JSON-LD forms one `@id`-connected graph, with `ProfilePage` on `/about` and an expanded `Person`.                                                    | #57           |
| FR-10 | Every `H1` names the person or the subject, and the tech stacks and timeline are real tables.                                                            | #58           |
| FR-11 | Every route has a `/index.md` twin from one serialiser, advertised with `alternates.types`, and the canonical URL negotiates on `Accept: text/markdown`. | #59           |
| FR-12 | `/llms.txt` is generated in llmstxt.org v2 format from the content module, and a static JSON representation is served.                                   | #60           |
| FR-13 | `/blog` has at least one real post, an Atom feed with discovery links, and no `noindex` once a post is live.                                             | #61           |
| FR-14 | A read-only MCP server answers `tools/list` and its tools over streamable HTTP, with connector snippets published.                                       | #62           |
| FR-15 | An ADR records the crawler policy, the evidence behind each measure, and a dated list of what was deliberately not built.                                | #63           |
| FR-16 | Every claim above is verified against production, with a dated after-snapshot.                                                                           | #64           |

### Non-Functional Requirements

- **Static stays static.** Every page route remains `○` or `●` in the build output. The MCP endpoint is the
  only permitted function, and it must not pull any page route with it. A nonce-based CSP is out of scope for
  exactly this reason: Next documents that it disables static optimisation.
- **One source of truth.** Everything generated - twins, `llms.txt`, JSON, the feed, JSON-LD, MCP tool output -
  derives from the data modules. No second copy of any fact.
- **No unevidenced claims in the record.** Each measure's task states who consumes it and how strong the
  evidence is: measured, vendor-documented, formal-standard, de-facto-standard, convention-only or speculative.
  "It demonstrates skill" is an
  acceptable reason when stated as one.
- **Nothing fabricated.** No invented date, metric, credential or location. Placeholders fail CI rather than
  shipping.
- **Gates keep their teeth.** No threshold lowered, no test skipped, warnings stay errors, and the console and
  accessibility gates keep `retries: 0`.
- **CI budget.** The `e2e` job stays inside its 20-minute timeout; offline gates go in `quality`.

## Testing Requirements

- **Task #55 lands the gates and the baseline first**, and its endpoint tests for the Markdown twins,
  `llms.txt`, the JSON representation and the MCP endpoint land as expected failures naming the task that
  turns each green - the same pattern epic #42 uses.
- **Served HTML, not the hydrated DOM.** SEO and extraction assertions fetch the response body (the pattern
  task #43 establishes) because no dedicated AI crawler executes JavaScript.
- **Offline first.** Structured-data validity is typed (`schema-dts`) and asserted in unit tests; the
  `validator.schema.org` call is advisory and must never block a merge on a third party's uptime.
- **Lighthouse by audit id.** Assertions name `canonical`, `document-title`, `meta-description`,
  `structured-data` and the agentic-browsing audit ids individually; a category score is never a gate.
- **Production verification** (#64) re-checks every endpoint and rich result against the live site.

## Success Criteria

- Google's Rich Results Test detects `Article` and `BreadcrumbList` on all three case studies and
  `ProfilePage` on `/about`, with zero errors.
- Every route: a canonical, a visible date where one applies, a `/index.md` twin returning `text/markdown`,
  an `alternates.types` link advertising it, and the canonical URL itself returning Markdown to a client
  that sends `Accept: text/markdown`.
- Served HTML with JavaScript disabled meets the per-route text floor, and no heading appears shattered into
  single characters.
- `/llms.txt` parses as llmstxt.org v2 and contains every case study; the JSON representation validates.
- `/mcp` answers `tools/list` over streamable HTTP; the connector snippets work unedited in Claude Code.
- The build output contains no server function other than `/mcp`.
- Search Console and Bing show the property with enhancements detected, and a dated before-and-after snapshot
  exists.
- An ADR records the policy and the refusals, each with its evidence and date.

## Constraints & Assumptions

- **Starts after task #48 of epic #42 lands**, and consumes its `mergeMetadata` helper, `serializeJsonLd`
  helper, open `robots.txt` and canonical URLs rather than duplicating them.
- **Owner decisions, recorded 2026-09-12:**
  - Full openness to AI crawlers, training included; no opt-out, no allowlist, no Content-Signals line.
  - All of Tiers 1 to 3, plus the MCP server. No MCP Apps widget.
  - Claude drafts content; the owner edits before anything ships in their voice.
  - Dates and metric windows land as placeholders that fail CI until the owner fills them in review.
  - Markdown twins use a uniform `/index.md` shape on every route, and the canonical URL negotiates on
    `Accept: text/markdown` through a scoped `beforeFiles` rewrite (owner's decision, 2026-09-12), which a
    build probe confirmed keeps every route static with no function added.
- **`[slug].md` is impossible**: Next types a partial dynamic segment as a literal with no params, so the
  case-study twins must be `/work/<slug>/index.md`.
- **Route handlers arrive in this epic.** CLAUDE.md's "There are no route handlers" stops being true at task
  #59, and `export const dynamic = 'force-static'` is mandatory on every one of them.
- **Nothing discovers an MCP server automatically**: SEP-2127 server cards were an open pull request on
  2026-09-11, and Anthropic's Connectors Directory needs a Team or Enterprise organisation.
- ADR numbers are taken at PR time.

## Out of Scope

- `llms-full.txt`, FAQPage and HowTo markup, `speakable`, `SearchAction`, `ai.txt`, TDMRep,
  Cloudflare Content-Signals, `/.well-known/ai-plugin.json`, `agents.json`, JSON Resume, WebMCP,
  `/.well-known/agent-skills`, IndexNow, a self-created Wikidata item, and a robots.txt allowlist. Each is
  refused with evidence in #63's ADR; this list is the point, not an omission.
- An MCP Apps widget (owner's decision: the server only).
- A nonce-based CSP, which would end static prerendering.
- Anything task #48 owns: canonical URLs, `og:image`, per-route Open Graph and Twitter metadata, icons, the
  manifest, security headers, `robots.txt` hygiene, JSON-LD escaping and `/blog`'s `noindex`.
- Paid answer-engine citation trackers.

## Dependencies

- **Epic #42, task #48** (metadata and crawl-surface foundation) must land first. Tasks #43 (the route list
  and served-HTML test pattern), #47 (the per-character span fix) and #49 (the metric contradictions) also
  feed this epic.
- **Owner actions:** Search Console and Bing Webmaster registration; the real dates and metric windows; the
  location, credentials and extra `sameAs` profiles the `Person` node will assert; editing the drafted content.
- **External:** Google's Rich Results Test and `validator.schema.org` (advisory only, never merge-blocking).

## Production Verification

Task #64 runs against `https://miloscvetkovic.dev` after every other task merges: every `/index.md` twin
returns `text/markdown` matching its page; `/llms.txt` parses as v2 and lists every case study; the JSON
endpoint validates; `/mcp` answers `tools/list`; the Rich Results Test detects `Article`, `BreadcrumbList` and
`ProfilePage`; a GPTBot-user-agent fetch with JavaScript disabled meets each route's floor with no shattered
heading; the Atom feed validates; Search Console and Bing show the enhancements; the build output has no
unexpected function. It records the dated after-snapshot against #55's baseline and states plainly which
outcomes are not attributable from first-party data, because answer-engine citation is not measurable that way.

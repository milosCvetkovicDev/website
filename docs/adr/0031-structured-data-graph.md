# 0031. Structured data is one graph joined by @id, in separate blocks, asserting only what a page shows

## Status

Accepted

## Date

2026-10-02

## Context

Until #57 the site's JSON-LD was four loosely related blocks at most. The root layout rendered a
`Person` and a `WebSite` on every route, and the `WebSite` carried its own copy of the Person, with
its name and URL, as `author`. A case study added a `TechArticle`, with the same copy as its
`author` and the WebSite named by `@id`, and a `BreadcrumbList`; neither of those two had an `@id`
of its own, and no route said what the page itself was. Nothing joined a page to the person it is
about, and the offline gate of #55 (`apps/web/src/components/__tests__/json-ld.test.tsx`) carried
two expected failures naming #57: every node carries an `@id`, and a page node exists that the
WebSite and the Person are joined to.

Structured data is worth shipping here for two reasons, and only these:

- **Rich results.** Google still documents a Breadcrumb and an Article result, and a case study is
  eligible for both: the trail replaces the raw URL in a result, and the article gets its title and
  date treatment once the visible dates of #56 are in place
  ([breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb),
  [article](https://developers.google.com/search/docs/appearance/structured-data/article)).
- **Entity resolution.** Google documents `ProfilePage` for a page about a single person, About-me
  pages included, and asks for `url` and `sameAs` on the Person for disambiguation
  ([profile-page](https://developers.google.com/search/docs/appearance/structured-data/profile-page)).
  No knowledge panel is promised: Google's gallery has no `Person` feature.

It is not an AI-citation lever, and this record does not claim one. Google says so itself:
"Structured data isn't required for generative AI search, and there's no special schema.org markup
you need to add"
([ai-optimization-guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide),
updated 2026-07-10). A matched difference-in-differences over 1,885 pages that added JSON-LD,
against roughly 4,000 controls, measured AI Overviews −4.6%, AI Mode +2.2% and ChatGPT +2.2%
([schema-ai-citations](https://ahrefs.com/blog/schema-ai-citations), 2026-05-11), results
straddling zero. A direct-fetch test of five answer engines found none of them reading JSON-LD;
what they did extract came from the visible HTML
([searchVIU](https://www.searchviu.com/en/schema-markup-and-ai-in-2025-what-chatgpt-claude-perplexity-gemini-really-see/),
2025-12-02). [ADR 0017](0017-ai-discoverability-policy.md) carries the rest of the evidence.

Google's structured-data policies also forbid marking up content that readers of the page cannot
see, and want the markup to be a true representation of the page
([sd-policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)).
Google's publication-dates guidance asks for a prominent, labelled date on the page that agrees with
the markup.

## Decision

1. **One module builds the nodes, one renders them.** `apps/web/src/lib/structured-data.ts` builds
   every node as a plain object: `person()`, `website()`, `webPage()`, `profilePage()`,
   `techArticle()` and `breadcrumbList()`, with `PERSON_ID`, `WEBSITE_ID` and `webPageId(path)`.
   `apps/web/src/components/json-ld.tsx` renders each node into its own
   `<script type="application/ld+json">` through `serializeJsonLd`, the one `JSON.stringify` there,
   so #48's escape stays the only path into a script element. Every URL is absolute on
   `NEXT_PUBLIC_SITE_URL` read as a bare http(s) origin by `apps/web/src/lib/site-origin.ts`, which
   fails the build on any other value, falling back to production; a route's URL is its
   canonical, built from the pathname that route passes to `buildMetadata()`: the origin alone for
   `/`, as Next writes the canonical link.

2. **Separate blocks, joined by `@id`, not one `@graph`.** Each node keeps its own block and an
   `@id`: `<origin>/#person`, `<origin>/#website`, `<canonical>#webpage` (`<origin>/#webpage` for
   `/`, whose ids keep the slash the Person's and the WebSite's have), `<canonical>#article` and
   `<canonical>#breadcrumb`. A node names another with a reference, `{ "@id": … }` and nothing
   else, so no fact is written twice. Every reference names a node the same document serves.

3. **What each route serves.** The root layout renders the Person and the WebSite on every route,
   the 404 included. The WebSite carries `inLanguage` `en` and names the Person as its `author` and
   `publisher`. Each static route and each case study renders a `WebPage` whose `url` is its
   canonical, whose `name` is the title it passes to `buildMetadata()`, and which is `isPartOf` the
   WebSite and `about` the Person. /about renders a `ProfilePage` instead of a WebPage, its
   `mainEntity` the Person. A case study adds a `TechArticle`, `author` the Person,
   `mainEntityOfPage` its WebPage, `isPartOf` the WebSite, its words and dates from
   `case-studies.ts`, its keywords from the study's tags and its image the study's card at
   `<canonical>/og-image.png`, and no `url` of its own; and a `BreadcrumbList` of Home, Work and the
   study, which its WebPage names as `breadcrumb`. /work has no trail of its own and the 404 has no
   page node. A post page's nodes come with #61.

4. **`TechArticle`, not `Article`.** The case studies read as technical write-ups, and Google's
   policies forbid labelling content as something it is not; `TechArticle` is the schema.org
   subtype of `Article` that says so.

5. **The visible-facts rule.** A node asserts only what the page that carries it shows. A date in
   the markup is a date the page prints: a case study's `datePublished` and `dateModified` are its
   visible Published and Updated line (#56), and /about's `dateModified` is
   `STATIC_ROUTE_UPDATED['/about']`, which /about now prints as a "Last updated" line, as /privacy
   does. A page node that carries no date asserts none: of the other pages only /privacy prints
   one, and dating its WebPage is left for a later change. The Person's existing predicates are
   brought under the rule by 57b, which also adds only facts /about displays.

6. **Refused types stay refused.** `FAQPage`, `HowTo`, `speakable` and `SearchAction` (with its
   `potentialAction`) are refused by [ADR 0017](0017-ai-discoverability-policy.md), with the source
   that settles each, and `scripts/ai-refusals.test.mjs` fails on any of them under `apps/web/src`.
   This record adds one: no `Organization`, and so no `worksFor` or `alumniOf`, because the /about
   timeline anonymises its employers and there is nothing displayed to mark up.

7. **What follows.** 57b expands the Person to what /about displays (the handle as `alternateName`,
   the locality, the credential, the occupation, `mainEntityOfPage` the ProfilePage) and trims
   `knowsAbout` to entries a route shows. 57c types every payload with schema-dts,
   `satisfies WithContext<T>`, so a misspelled predicate fails `pnpm typecheck`, and settles the
   validator step. The Rich Results Test has no API, so its verdicts on /about and the case studies
   are an owner step after each deploy.

## Consequences

### Positive

- The graph is checked offline on every route. `json-ld.test.tsx` renders each page after the
  layout's two blocks and fails on a node without an `@id`, two nodes with one, a reference that
  names no node on the route or carries more than its `@id`, and a type set other than the one
  pinned for the route; the two #57 expected failures are ordinary rows now.
  `apps/web/e2e/seo-surface.spec.ts` checks the same in the served HTML, a page node's `url`
  against the canonical link and a WebPage's `name` against the `<title>` the document serves,
  every link in a node as absolute, the article's image as an image, the trail's order and steps
  against the canonicals of the routes it names, and /about's printed date against its
  `dateModified`.
- A fact lives in one node. The WebSite no longer restates the Person, and a page node does not
  restate the WebSite.
- Adding a route means adding one `WebPageJsonLd`, with the path and title its metadata already
  has, and the pinned sets fail until it does.

### Trade-offs

- **The article's author is a bare reference.** Before #57 it was the copy with the Person's name
  and URL. Google's Article guidance recommends an author `name` and `url`; a parser that resolves
  `@id` across blocks finds both on the Person, but the Rich Results Test may still warn about a
  missing author name. That warning is accepted until the owner's test run says otherwise.
- **The article's image is a generated card.** Article has no required properties, and the card is
  the image every link preview of the study already uses, but it is a title card, not a picture of
  the work.
- **/about's date follows the content-date rule.** It changes in the commit that changes what /about
  visibly says, and on 1 January with the years figure /about prints, and not when only the
  markup changes.
- **Several blocks per page.** Each block repeats `@context`, and a reader that ignores `@id` sees
  unrelated nodes; the bytes are a few hundred per page.
- **`/`'s page id and URL differ by a slash.** The ids are opaque identifiers compared as strings;
  the `url` carries the canonical exactly.

## Alternatives considered

- **One `@graph` block per page.** It would need the layout to know each page's nodes or each page
  to emit the layout's again, and the offline gate of #55 refuses a block with no `@type` at its
  root. Separate blocks keep each node with the component that owns it, and the `@id` references
  join them as well as a `@graph` would.
- **Embedding the referenced node, as the WebSite's `author` did.** Every copy can drift from the
  Person it restates, and a reader cannot tell a copy from a second person.
- **`Article` on the case studies.** It would claim less than the pages are; see Decision 4.
- **`AboutPage` on /about.** It is valid schema.org, but `ProfilePage` is the type Google documents
  for a page about one person, and the one whose `mainEntity` it reads.
- **A trail on /work.** Home and Work alone add nothing a result's URL does not already say.
- **A `dateModified` on every WebPage from `STATIC_ROUTE_UPDATED`.** All but /privacy print no
  date, so the markup would assert one no reader can see.
- **Keeping the article's own `url`.** The page the article is the main entity of is its WebPage
  node, which carries the canonical; a second `url` is a second copy of one fact.

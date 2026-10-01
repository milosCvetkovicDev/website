# 0030. Generated endpoints are static route handlers; pages negotiate twins by rewrite

## Status

Accepted

## Date

2026-10-01

## Context

The site started with no route handlers at all: every response came from a page, a metadata file or
`public/`. Three kinds of generated endpoint have arrived since, each a `route.ts` under
`apps/web/src/app`:

- `favicon.ico/route.ts`, which packs the header's mark into an ICO;
- `work/[slug]/og-image.png/route.ts`, the case-study social card, a handler rather than an
  `opengraph-image` file because its alt text has to name the study;
- the Markdown twins of #59: one `index.md/route.ts` in each static route's folder
  (`app/index.md/route.ts` for `/`) and `work/[slug]/index.md/route.ts` for the case studies, ten
  URLs in all, each serving the page it sits beside as `text/markdown; charset=utf-8`.

More are planned in the same shape: `/llms.txt` and a static JSON representation (#60), an Atom
feed (#61), and the MCP server of #62, which the epic names as its single permitted function.
[ADR 0017](0017-ai-discoverability-policy.md) keeps every route statically prerendered, refuses
middleware, and leaves the route-handler pattern and its `force-static` rule to #59's record, which
is this one. Four facts about Next.js shape that pattern.

- **A `GET` handler is dynamic by default.** Since Next 15.0.0-RC a route handler that returns a
  constant string still builds as a server function unless it exports
  `dynamic = 'force-static'` (the `route` file convention's version history). A build probe for #59
  on 2026-09-12 (next 16.3.4) built two byte-identical handlers: the one with the export printed
  `○` and wrote a prerendered body, the one without printed `ƒ` and wrote none.
- **A partial dynamic segment does not exist.** A folder named `[slug].md` is a literal segment:
  Next's generated validator types its handler with `params: Promise<{}>`, and the same probe failed
  typecheck with `Property 'slug' is missing`. A twin can only sit one segment below its route,
  which is why the owner chose the uniform `/index.md` shape for flat routes and case studies alike.
- **`generateStaticParams` works in a route handler,** and with `dynamicParams = false` it
  prerenders one response per param and leaves every other slug a routing-level 404, as the page
  does under [ADR 0015](0015-static-case-study-params.md).
- **`force-static` and `dynamicParams` go away under Cache Components.** The route segment config's
  version history for `v16.0.0` removes `dynamic`, `dynamicParams`, `revalidate` and `fetchCache`
  when `cacheComponents` is enabled, and `generateStaticParams` must then return at least one
  param. `apps/web/next.config.ts` does not enable it.

A twin is only reached by the clients that follow the page's
`<link rel="alternate" type="text/markdown">`, which is Codex CLI. Claude Code, Cursor, GitHub
Copilot Chat, Copilot CLI, Microsoft Copilot and OpenCode instead send `Accept: text/markdown` to
the page's own URL (acceptmarkdown.com's agent matrix, last updated 2026-06-22). Issue #59 at first
listed negotiation under "Deliberately not done here": the rewrite form does not rank q-values, and
the middleware form that would rank them puts a function in front of every page. ADR 0017's
refusal of middleware already names the rewrite as the route #59 takes, and the 2026-09-12 probe
that added it found every route still `○` or `●`. This record ships it, with its limits written
down.

## Decision

1. **Every generated endpoint is a route handler under `apps/web/src/app` that exports
   `dynamic = 'force-static'`,** and one over a dynamic segment also exports
   `dynamicParams = false` and a `generateStaticParams` over the same data module its page reads.
   Each one prerenders at build time (`○` or `●`, never `ƒ`), and `pnpm check:build-output`
   fails the `quality` job on a route that does not. The MCP server of #62 is the one exception
   the epic allows, and its own record will say why.
2. **A page's Markdown twin is served at `<route>/index.md`** (`/index.md` for `/`), a path that
   `markdownTwinPath()` in `apps/web/src/lib/pathname.ts` derives, and every folder with a
   `page.tsx` has an `index.md/route.ts` beside it.
3. **Endpoint bodies are generated at build time from the typed data modules through one
   serialiser.** `apps/web/src/lib/serialise.ts` is the only module that writes Markdown, and its
   `markdownResponse()` the only place that writes the `text/markdown; charset=utf-8` header. A
   handler hands it a record from `src/data/pages` or a case study and builds nothing itself. No
   endpoint is written into `public/` by a script.
4. **The page's own URL negotiates its twin with one `beforeFiles` rewrite per route** in
   `apps/web/next.config.ts`. The routes are the keys of `STATIC_ROUTE_UPDATED` and one per case
   study, the same list the twins are built from, and `/` has its rule like the rest. Each rule's
   source is the literal route, never a pattern such as `/:path*`, its destination is the route's
   twin, and it matches when the `accept` request header lists the media range `text/markdown`
   (`has`) without giving it a weight of zero (`missing`). Every other request, a browser's
   included, is served the page.
5. **Each negotiating route sends `Vary: Accept`,** from one `headers()` entry per route, beside the
   entries of [ADR 0023](0023-static-security-headers.md) and
   [ADR 0025](0025-production-alias-noindex.md), which are unchanged. A twin's own URL serves one
   representation whatever the request accepts, and gets no entry.

## Consequences

### Positive

- Both representations of a page answer from its canonical URL with no function: under
  `next start` on 2026-10-01 (next 16.3.6), `/` and `/about` answered
  `Accept: text/markdown, */*` with `200 text/markdown; charset=utf-8` and `Accept: text/html` with
  `200 text/html`, both `x-nextjs-cache: HIT`, and the build table listed no `ƒ`.
- A request for Markdown at a path with no twin answers that path's normal 404, and an asset,
  `robots.txt` or the sitemap answers as it always did: no rule matches them.
- A page, its twin and its negotiated answer cannot disagree: all three read one record, and
  `e2e/markdown-negotiation.spec.ts` compares the negotiated body with the twin's byte for byte.
- `src/test/next-config.test.ts` walks `src/app` for twin handlers and fails when the negotiated
  routes and the twins differ in either direction, so a new route gains its rule with its twin.

### Trade-offs

- **The rewrite ranks no q-value.** Next matches a `has` or `missing` value as an anchored regular
  expression over the raw header (`^value$`). `ACCEPTS_MARKDOWN` matches `text/markdown` as a
  whole media range, so `text/markdownx` does not count, and `REFUSES_MARKDOWN` matches it with a
  weight of zero, which RFC 9110 makes a refusal, so `text/markdown;q=0` gets the page. A non-zero
  weight is not compared with the others: `text/html, text/markdown;q=0.1` gets Markdown rather
  than the HTML it prefers. acceptmarkdown.com's Next.js recipe records the same limit for the
  rewrite form. Ranking weights against each other needs code that runs per request, which is the
  middleware ADR 0017 refuses. The match is also case-sensitive, so `Text/Markdown` gets HTML,
  although RFC 9110 makes media types case-insensitive.
- **`Vary: Accept` does not reach the HTML page under `next start`.** Next's App Router page
  handler sets its own `Vary` (`rsc` and the three `next-router-*` request headers) with
  `setHeader` after the `headers()` entries have been applied, in
  `next/dist/build/templates/app-page-runtime.js` of 16.3.6, so on a page the `Accept` entry is
  replaced. Every negotiated Markdown answer carries Next's `Vary` and `Accept` both, and a twin
  requested by its own URL, which serves one representation, carries Next's `Vary` only (measured
  2026-10-01). A cache that honours `Vary`, as RFC 9111 requires, can therefore never hand the
  twin to a request for the page that did not ask for it, while it may hand the page to an agent
  that asked for Markdown, which is what that agent got before this record. Issue #59 cites
  Vercel's markdown-access documentation (last updated 2026-09-03) for this rewrite and for its CDN
  keying the cache on `Accept`. `next start` has no shared cache to measure that on, so the live
  check of [ADR 0026](0026-vercel-web-analytics.md) measures it on the apex after every production
  deployment and daily: `apps/web/e2e-live/markdown-negotiation.spec.ts` asks each negotiating
  route for Markdown and then as a browser, and the other way round, without busting the cache.
- **`next.config.ts` now imports the data modules** (`static-routes.ts`, `case-studies.ts`) and
  `lib/pathname.ts`. Next's config loader compiles every module it requires with one set of
  options and no file name, so an `@/` import becomes `./src/…`, a path that is right only beside
  `next.config.ts`. No module in that chain may use the alias; `case-studies.ts` imports
  `content-date.ts` by relative path for that reason, and a unit test loads the config through
  Next's own loader to catch the next one. `next dev` restarts only when the config file itself
  changes, so a route or case study added under a running dev server is not negotiated until it
  restarts.
- **Adopting Cache Components breaks every endpoint here.** `force-static` and `dynamicParams` are
  removed under it, so each handler would need `'use cache'` instead, and `generateStaticParams`
  could no longer return an empty list. Enabling `cacheComponents` means revisiting this record
  first.
- The rule list grows with the routes and case studies: one rewrite and one `Vary` entry per route
  with a twin.

## Alternatives considered

- **Middleware or `proxy.ts` that ranks `Accept` by q-value.** It would negotiate correctly, and it
  runs on every matching request, which ends the static posture. ADR 0017 refuses it.
- **One `/:path*` rewrite to `/:path*/index.md`.** It would also rewrite a Markdown-asking
  request for a path that exists without a twin, `robots.txt`, the sitemap, an Open Graph image or a
  `/_next/static` chunk, to an `index.md` below it that does not exist, so a client that sends
  `text/markdown, */*` with every request would be refused them. The `/.md` 404 that the 2026-09-12
  probe measured for `/` belonged to a `.md`-suffix shape; under `/index.md`, `/` maps to
  `/index.md` and has a literal rule like every other route.
- **A `/work/:slug` pattern for the case studies.** It would serve the same twins, but an unknown
  slug would reach the twin's 404 by a rewrite rather than its own. A literal rule per route keeps
  the negotiated routes equal to the routes with a twin, which the unit test checks both ways.
- **Negotiating inside a page.** A Server Component that reads the request's headers renders per
  request, which is a function on every page.
- **Rewrites in `vercel.json`.** They would apply on Vercel only, so neither `next start` nor the
  e2e suite could prove them, and ADR 0023 keeps headers out of `vercel.json` so that one file
  holds the response rules.
- **No negotiation, discovery by link only.** The clients that send `Accept: text/markdown` would
  keep receiving HTML at the canonical URL; issue #59's acceptance criteria and ADR 0017's
  middleware row both commit to the rewrite.
- **Emitting the twins into `public/` from a prebuild script,** which would allow `/work/<slug>.md`.
  The repository's Prettier hook would rewrite the generated files, they would need adding to
  `.gitignore`, `.prettierignore` and `.vercelignore`, and nothing would typecheck them against
  `case-studies.ts`.
- **A case-insensitive match written as character classes** (`[Tt][Ee][Xx][Tt]/…`). It would
  follow RFC 9110, at the cost of a value a reader cannot check at a glance, and
  acceptmarkdown.com's matrix records its clients sending the lower-case `text/markdown`.
- **The refusal as a negative lookahead inside the `has` value.** It matches the same requests;
  a separate `missing` condition keeps each value one readable pattern and asks nothing of the
  router's regular-expression engine beyond groups and repetition.

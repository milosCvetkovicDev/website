---
paths:
  - 'apps/web/src/app/**'
  - 'apps/web/src/lib/**'
  - 'apps/web/src/data/**'
  - 'apps/web/src/components/json-ld.tsx'
  - 'apps/web/public/**'
---

# App Router, metadata, content and AI-facing files

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Routes (App Router)

Every route's head comes from `buildMetadata()` in `apps/web/src/lib/metadata.ts`: its canonical,
complete Open Graph and Twitter blocks, and its robots directive. Next replaces `openGraph`,
`twitter` and `robots` wholesale per segment rather than merging them, so the root layout keeps only
what is true of every response, the 404s included (`metadataBase`, the title template and the
default Next requires beside it, the author, card type, site name, locale), and never a URL, a
description, a link-preview title or a robots directive.

`apps/web/src/app` also holds `error.tsx`, `not-found.tsx` and the metadata files: `sitemap.ts`,
`robots.ts`, `manifest.ts`, `icon.tsx` and `apple-icon.tsx` (the mc_ mark of the header's `Logo`,
drawn by `src/lib/brand-mark.tsx` in `src/app/fonts/geist-mono-600-mark.ttf`), and an
`opengraph-image.tsx` in the root and in each static route's folder, all over one card design in
`src/lib/og-image.tsx`. Each folder needs its own: a root image
never reaches a page that declares its own `openGraph`. The route handlers:

- `favicon.ico/route.ts` packs the same mark into an ICO.
- `work/[slug]/og-image.png/route.ts` draws the case-study card, whose alt text has to name the
  study, which an `opengraph-image` file's single `alt` cannot; the page points og:image at it
  through `buildMetadata()`'s `image`.
- The Markdown twins (#59): an `index.md/route.ts` in each static route's folder
  (`app/index.md/route.ts` for `/`), and `work/[slug]/index.md/route.ts` for the case studies, with
  its own `generateStaticParams` and `dynamicParams = false`. Each is three lines that hand a record
  from `pages` in `src/data/pages/index.ts`, or a study, to the serialiser below.

`buildMetadata()` advertises the twin of every route that calls it as
`alternates.types['text/markdown']`, at the path `markdownTwinPath()` in `src/lib/pathname.ts`
derives from the canonical's (a module with no imports, which the e2e helpers read too). So every
folder with a `page.tsx` needs an `index.md/route.ts` beside it: `data/__tests__/pages.test.ts`
fails one without, fails a static route without a record, and calls every handler to check it
serves exactly the serialiser's output, statically. `e2e/markdown-twins.spec.ts` checks the served
twins against the served pages. The sitemap lists no twin.

All of the route handlers prerender at build time, and `pnpm check:build-output` (a `quality` step,
`ci-and-scripts.md`) fails when a route does not: a `GET` handler is dynamic unless it exports
`dynamic = 'force-static'`, and without it builds as a server function, as a handler that exports
any other method does even with it. The same check fails a `proxy.ts` and any `'use server'`
action. `sitemap.ts`, `robots.ts`, `layout.tsx`, `components/json-ld.tsx` and `lib/serialise.ts`
each read `NEXT_PUBLIC_SITE_URL`, falling back to `https://miloscvetkovic.dev`. There is no
middleware.
`src/lib/serialise.ts` is the one module that writes Markdown: it renders the case studies and the
page records typed in `src/data/pages/types.ts`, and no route handler builds Markdown of its own
(#59). `lib/__tests__/serialise.test.ts` fails when a file under `src/app` writes `text/markdown`.
The security headers come from one static `headers()` entry in `apps/web/next.config.ts` whose
source, `/:path*`, matches every path, `/_next/static` assets and the 404s included:
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a Content-Security-Policy, a
`Permissions-Policy` and a `Cross-Origin-Opener-Policy` (ADR 0023). A second entry, over the same
source and keyed on `has: [{ type: 'host', ... }]`, adds `X-Robots-Tag: noindex` on the public
production alias and on no other host (ADR 0025); the alias host is `PRODUCTION_ALIAS_HOST` in
`apps/web/production-alias.ts`, which has to change if the Vercel project is renamed. Never key it
on `missing` the apex: a typo there would noindex production. Next's router sends a few answers
before it applies `headers()`, and those carry none of them: the 308s that strip a trailing slash
or collapse repeated slashes, and the plain 500 for a malformed percent-encoding.

A case study's visible `Published` / `Updated` line, its TechArticle's `datePublished` and
`dateModified`, and its sitemap `lastmod` (from `updatedAt` alone) all read the same fields,
`publishedAt` and `updatedAt` in `case-studies.ts`: the line is two `<time dateTime>` elements
holding the stored values, written out by `formatContentDates()` in `src/lib/content-date.ts` from a
fixed month table rather than the build machine's locale or zone, and `e2e/seo-surface.spec.ts`
fails when the served line and the TechArticle disagree. A date that is not a real day from 2000 on,
or a pair updated before it was published, throws there and fails the prerender. "Not in the
future" is a unit-test check against the live clock, not a build check, and it counts a day as
begun once UTC+14 has reached it: an accepted tolerance of up to 14 hours against the UTC date.

## Owner placeholders

A value only the owner can supply is left as a registered placeholder, never invented, through
`apps/web/src/data/owner-todo.ts`, the one convention for it. A typed placeholder is a union branch
`{ state: typeof OWNER_TODO }`, a gap in prose is `ownerTodo(hint)` (the hint on one line, without
brackets), and the marker, `OWNER-TODO`, is spelled out in that module and in no other file under
`apps/web/src` or `apps/web/public`. That scan is an exact byte search for the literal typed by hand;
a marker assembled from pieces gets past it, and only the served-output check below would catch it.
Whatever renders the value omits the whole sentence, row or block while its marker survives;
`e2e/seo-surface.spec.ts` fails if any route, `/sitemap.xml`, `/robots.txt` or
`/manifest.webmanifest` serves it.

The gate is `pnpm --filter web exec vitest run src/data/__tests__/owner-todo.test.ts`, part of
`pnpm test`. It walks every source in that file's one source list and fails, naming
`<source>.<path>`, on an unfilled field with no row in `unfilledOwnerFields`, on a value it cannot
walk (a function, a `Map`, a `Set`, a class instance, a symbol key), on a row that matches no
unfilled field or repeats another, on a row with a blank `why`, and on a row whose `expires` is
missing, a placeholder, not a real `YYYY-MM-DD` day, reached, or more than `MAX_EXPIRY_DAYS` (366)
ahead, on the real clock in UTC. A sibling joins it with one `{ id, value }` entry in that list (a
data module's export, or the string a generator returns) and one register row per unfilled field:
`field` as the finding names it, `why`, and an `expires` the owner chooses, never an agent. A typed
placeholder is `<source>.<path>` (56c's `case-studies.0.metricDefinition`, for example), and each
marker in a string is `<source>.<path>#<hint>`, so two markers in one string need two rows. The test
also fails on a module under `src` that imports owner-todo and is neither imported by it for a
source entry nor named in its `RENDERS_ONLY` list with a reason. Once a deadline passes, `pnpm test`
is red on every branch until the owner fills the value or moves the date in a pull request, and
that is intended: the pull request that moves the date is green on its own head.

## Quality gates

- The AI-facing refusals are gated. `scripts/ai-refusals.test.mjs` runs under `pnpm test:scripts` and
  fails when a mechanism `docs/adr/0017-ai-discoverability-policy.md` refuses reappears: an
  `llms-full.txt`, `ai.txt`, `tdmrep.json`, `ai-plugin.json`, `agents.json`, `cv.json`, `resume.json`
  or `agent-skills` path anywhere under `apps/web`, an `AGENTS.md` under `apps/web/public` or as a
  route directory under the app router, a
  `middleware.ts` or `proxy.ts`, a `FAQPage`, `HowTo`, `speakable`, `SearchAction`, `potentialAction`
  or `modelContext` string under `apps/web/src`, an IndexNow reference, a `Content-Signal` line or a
  second `userAgent` group in `robots.ts`, or a `nonce` in `next.config.ts`. It also fails when that
  record's refusal table loses a row, a source URL or a date. Adding one of these is a deliberate
  act: supersede the record and delete the matching assertion in the same pull request.

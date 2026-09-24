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
never reaches a page that declares its own `openGraph`. There are two route handlers:
`favicon.ico/route.ts` packs the same mark into an ICO, and `work/[slug]/og-image.png/route.ts`
draws the case-study card, whose alt text has to name the study, which an `opengraph-image` file's
single `alt` cannot; the page points og:image at it through `buildMetadata()`'s `image`. All of them
prerender at build time.
`sitemap.ts`, `robots.ts`, `layout.tsx` and `components/json-ld.tsx` each read
`NEXT_PUBLIC_SITE_URL`, falling back to `https://miloscvetkovic.dev`. There is no middleware.
Response headers come from one static `headers()` entry in `apps/web/next.config.ts` whose source,
`/:path*`, matches every path, `/_next/static` assets and the 404s included:
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a Content-Security-Policy, a
`Permissions-Policy` and a `Cross-Origin-Opener-Policy` (ADR 0023). Next's router sends a few
answers before it applies `headers()`, and those carry none of them: the 308s that strip a trailing
slash or collapse repeated slashes, and the plain 500 for a malformed percent-encoding.

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

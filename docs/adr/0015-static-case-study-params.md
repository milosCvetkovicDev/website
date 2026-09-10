# 0015. Case-study slugs are fixed at build time, so unknown ones 404 at the router

## Status

Accepted

## Date

2026-09-10

## Context

`/work/[slug]` read its slug at request time and called `notFound()` when
`getCaseStudy(slug)` returned nothing, which rendered a tailored
`work/[slug]/not-found.tsx` ("Case study not found"). That looked equivalent to the
site-level 404 at `app/not-found.tsx`, and the two routes were covered by the same
clean-console gate. They were not equivalent.

`notFound()` throws. React error boundaries do not run during server rendering, so the
throw unwound past the root layout and Next.js fell into its SSR error-recovery path,
answering with the bare shell it builds for that case:

```html
<html id="__next_error__">
  <head></head>
  <body></body>
</html>
```

The RSC payload still described the real tree, so the browser recovered and the finished
page looked correct. But the root layout's `<head>` never reached the HTML. The client
re-created its three `<script>` elements instead of hydrating them, and a script React
creates on the client never executes. Two consequences followed:

1. React's development build logs `Encountered a script tag while rendering React
component` for the theme init script, failing `e2e/console-clean.spec.ts` on the local
   (dev server) Playwright path. It does not log it for the two `application/ld+json`
   scripts, because React skips the warning for any script whose `type` is not an
   executable one — the check is on `type` alone, not on how the body was supplied, so
   `dangerouslySetInnerHTML` neither causes nor avoids it.
2. `apps/web/src/lib/theme.ts` exists to set the `dark` or `light` class on `<html>`
   before first paint. On this one route it never ran, so a visitor who prefers dark got
   the light theme painted first and a flip once `ThemeProvider`'s effect landed. Nothing
   caught this: the warning that reveals it is stripped from React's production build, and
   CI runs the production build, so CI was green while the defect shipped.

`/no-such-page` was unaffected because it matches no route at all: Next resolves it at the
routing layer and renders `app/not-found.tsx` through the root layout, with nothing thrown.

## Decision

`apps/web/src/app/work/[slug]/page.tsx` sets `export const dynamicParams = false`.

`src/data/case-studies.ts` is the single source of truth for case studies and
`generateStaticParams` enumerates it, so every valid slug is known at build time and an
unknown one can only be a bad URL. Refusing dynamic params moves that case to the routing
layer, where it renders through the root layout exactly like `/no-such-page`, still
answering 404.

The `if (!caseStudy) notFound()` guard stays. It narrows `CaseStudy | undefined` for
TypeScript and remains a backstop, but it is now unreachable in practice, so
`work/[slug]/not-found.tsx` was deleted rather than left as a page nothing can render.
Unknown case-study URLs get the site-level 404, which already offers "Go Home" and
"View Work".

`e2e/not-found-shell.spec.ts` guards the behaviour by asserting that both 404 routes carry
the theme init script verbatim in their server HTML. It asserts on the HTML rather than on
the console because the console signal is dev-only and CI runs the production build. The
match is deliberately verbatim: the RSC flight payload embedded in the document describes
the same `<head>`, so any fragment of the script is present even on the broken page. The
payload is JSON-escaped, so only the real inline tag matches the source string.

## Consequences

### Positive

- The route renders through the root layout, so the theme init script is in the HTML and
  the flash of light theme is gone.
- The clean-console gate passes on the local Playwright path without being weakened.
- A regression is now visible to CI, which the console gate alone could never be.
- The intent is stated: the case-study set is closed and known at build time.

### Trade-offs

- Unknown case-study URLs lose their tailored copy and get the site-level 404.
- Next logs `Error: Internal: NoFallbackError` on the server for each unknown `/work/*` request.
  It is the internal signal that routes the request to the 404, the response is still a correct
  404, and no browser console entry results — but it lands on the error channel, so production
  logs carry one such line per bad case-study URL. Measured on `next start`: one line per request,
  none for `/no-such-page` and none for a valid slug.
- Any future case-study source that is not known at build time — a CMS, say — would have
  to revisit this, because `dynamicParams = false` would 404 slugs it could serve. Such a
  source would hit the same SSR-recovery problem through `notFound()` and would need a
  different answer to it.

## Alternatives considered

- **A `loading.tsx` on the segment**, to wrap it in a Suspense boundary so React could
  recover only that subtree and leave the shell intact. It preserved the layout, but the
  shell then completed before the throw and the route answered **HTTP 200** instead of 404. Rejected: a 404 that reports 200 is worse than the problem.
- **`next/script` with `strategy="beforeInteractive"`** for the theme script. Measured: the
  script still did not reach the recovery shell's HTML and the warning still fired.
- **Moving the JSON-LD out of the layout.** It was never implicated — React does not warn
  for `type="application/ld+json"` — and it would not have restored the layout's `<head>`.
- **A `prefers-color-scheme` fallback in CSS**, to survive the missing script. It treats
  the symptom, and it would override an explicit stored preference on first paint, which
  is the flash the script exists to prevent.

# 0023. Six static security headers on every page and asset

## Status

Accepted

## Date

2026-09-23

## Context

Until this record, the only security header the site sent was Vercel's default HSTS
(`strict-transport-security: max-age=63072000`), and only in production. `apps/web/next.config.ts`
set `turbopack.root` and `distDir` and declared no `headers()`, and `apps/web/vercel.json` carries Git
and build-step settings only. The external audit's finding live-8 recorded the gap, and row R30 of the
e2e RED manifest (#43) pinned it as an expected failure in `apps/web/e2e/security-headers.spec.ts`:
a page, a prerendered case study, a `/_next/static` chunk and a 404 each lacked
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy` and
`Permissions-Policy`. live-8 names a sixth, `Cross-Origin-Opener-Policy: same-origin`, which #48's
acceptance criteria and #52's post-deploy check expect on the same four surfaces. ADR 0005 had
already named `headers()` in `next.config.ts` as the place to add a header once one was needed; its
sentence that no response headers are set anywhere described the site on its own date and, under
ADR 0012, is not corrected.

Two earlier decisions bound the options. ADR 0017 refuses a per-request CSP token, because Next
documents that one disables static optimisation, and it refuses middleware (`middleware.ts`,
`proxy.ts`) for the same reason: every route is prerendered, and `scripts/ai-refusals.test.mjs`
fails on the word for such a token anywhere in `next.config.ts`. So the headers have to be static,
evaluated once by `next build`.

What the site actually loads was measured on 2026-09-23, twice. Before writing a policy, against a
production build of d1da60f served by `next start`, Playwright's Chromium recorded every request on
`/`, `/about`, a case study and the 404 in both colour schemes, scrolling each page and following a
soft navigation to `/work`. Then, against a build serving the policy below, Chromium and WebKit
walked `/`, `/about`, `/work`, `/skills`, `/blog`, `/contact`, the three case studies, both 404
paths and the icon and manifest routes in both schemes, scrolling the whole of `/`, and reported no
`securitypolicyviolation` event and no console error beyond the two expected 404s; a control that
requested a cross-origin image, a `data:` image and a cross-origin `fetch` from `/` was refused and
reported in both browsers. With `Cross-Origin-Opener-Policy: same-origin` added, a build served by
`next start` was walked again over `/`, `/about`, `/work`, a case study and the 404: Chromium in
both schemes with `/` scrolled, and WebKit with each page left to settle, reported no console error
beyond the 404's own. (WebKit reports an RSC prefetch that a navigation cuts short as a failed
access-control check, with or without any of these headers.) A page on another origin
(`127.0.0.1` against `localhost`) that opened the site lost its handle in both engines: the handle's
`closed` read `true`, and the site's `window.opener` was `null`.

- **Every request is same-origin.** Documents, RSC fetches (`?_rsc=`), scripts, stylesheets and
  fonts under `/_next/static`, and nothing else. The fonts are self-hosted since #75. There is no
  analytics script, no `next/script`, no `next/image`, no iframe, no worker, no form and no
  websocket. The other URLs in `apps/web/src` are link targets, which a CSP does not govern, the
  site's own canonical origin, SVG namespace URIs, values in the JSON-LD, whose
  `application/ld+json` blocks are data that no browser executes, and a made-up address in the
  decorative terminal text; none of them is fetched.
- **No page renders a `data:` or `blob:` image.** The source holds two `data:` SVGs, the `.noise`
  utility in `globals.css` and the `DataStream` tile in `hud-elements.tsx`, and no route renders
  either.
- **Inline script is unavoidable.** Every page's HTML carries inline scripts: the root layout's
  theme script, which sets the colour-scheme class before first paint, and the App Router's RSC
  payload (`self.__next_f.push`), which differs per page and per build. `/` also carries 117
  inline `style` attributes that React renders.
- **The site opens no window that needs an opener.** Each of the twelve external links in
  `apps/web/src` is `target="_blank"` with `rel="noopener noreferrer"`, and nothing calls
  `window.open`.
- **The development server needs a relaxation.** With the production policy served by `next dev`,
  the two browsers reported 4,170 `script-src` eval violations between them over that walk, all
  from React's development build (`react-server-dom-turbopack`), which also logged "eval() is not
  supported in this environment" on every page. The HMR socket, `ws://<host>/_next/hmr`, connected
  under `'self'` alone in both browsers: CSP Level 3 lets `'self'` match a same-origin `ws:` URL,
  where Level 2 matched only the page's own scheme.

Two facts about the platform matter as well. Vercel injects its Toolbar into preview deployments
from `https://vercel.live`, and its toolbar documentation lists what a CSP has to allow for it. And
Vercel builds this repository through `turbo run build` against its own remote cache
(`docs/runbooks/deploy.md`), while Turborepo 2 runs the `build` task in strict mode. Strict mode
filters an undeclared variable out of the task, `NODE_ENV` included, but passes a built-in list
through, and `VERCEL_*` is on that list: measured with turbo 2.10.13 in a scratch workspace, an
undeclared `VERCEL_ENV=preview` reached the task while an undeclared control variable and
`NODE_ENV=development` did not. A variable that is passed through that way is left out of the
task's hash: with `VERCEL_ENV` undeclared, `turbo run build --dry=json` gave `preview` and
`production` the same hash, so a preview build and a production build of one tree would have shared
a cache entry.

## Decision

- **One `headers()` entry in `apps/web/next.config.ts`, with `source: '/:path*'`, sends six
  headers on every page and asset**: pages, prerendered routes, `/_next/static` assets, metadata
  routes, RSC payloads and the 404s alike. `:path*` matches zero or more segments, so `/` is
  covered too. There is no second entry and no `vercel.json` header, so there is one place to read
  the policy.

  | Header                       | Value                                      |
  | ---------------------------- | ------------------------------------------ |
  | `X-Content-Type-Options`     | `nosniff`                                  |
  | `X-Frame-Options`            | `DENY`                                     |
  | `Referrer-Policy`            | `strict-origin-when-cross-origin`          |
  | `Content-Security-Policy`    | the policy below                           |
  | `Permissions-Policy`         | `camera=(), microphone=(), geolocation=()` |
  | `Cross-Origin-Opener-Policy` | `same-origin`                              |

  Not every response Next sends is covered. Its router answers some requests before it applies
  `headers()`, and those answers carry none of the six. Measured under `next start` on 2026-09-23:
  the 308 that strips a trailing slash (`GET /about/` to `/about`), the 308 that collapses repeated
  slashes (`GET //about` to `/about`), and the plain-text 500 for a malformed percent-encoding
  (`GET /work/%E0%A4%A`). No browser renders or frames a redirect's body, and the 500's is a fixed
  string, so they expose nothing; the only hook that runs earlier is the middleware ADR 0017
  refuses. How Vercel answers the same requests has not been measured.

- **The production Content-Security-Policy** is:

  ```text
  default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none';
  form-action 'self'; frame-ancestors 'none'
  ```

  (one line on the wire). Its value is **not** in stopping inline script: `'unsafe-inline'` in
  `script-src` is required, because the theme script and the RSC payload are inline and the only
  alternative that keeps the routes static, a hash, cannot be written for a payload that changes
  per page and per build. So an injected inline script still runs, and the defence against one
  stays where it was: React's escaping and the JSON-LD serialiser. The policy's value is in
  `frame-ancestors 'none'` (no clickjacking), `object-src 'none'` (no plugins), `base-uri 'none'`
  (an injected `<base>` cannot re-point the relative script URLs; Next never writes one),
  `form-action 'self'` (an injected form cannot post to another origin), and in limiting where
  scripts, styles, fonts, images and connections may come from to this origin, so that an injected
  `<script src>`, stylesheet, image beacon or `fetch` to anywhere else is refused.

- **Each fetch directive allows exactly what the site loads.** `'self'`, plus `'unsafe-inline'` for
  the inline scripts and the `style` attributes, and nothing else: no `data:`, no `blob:`, no third
  party. A route that starts loading anything else produces a CSP violation, which Chromium and
  WebKit both log as a console error. `apps/web/e2e/console-clean.spec.ts` fails on it in the
  desktop `chromium` project, the only one that runs that spec, so widening the policy is then a
  deliberate edit. No WebKit project runs a console gate: a refusal only WebKit makes is caught by
  nothing in CI, and the WebKit walks under Context are the only console checks of that engine.
  `form-action` is `'self'` rather than `'none'` because a form on this site would post to the site
  itself, and a `form-action` violation only fires on submit, where the load-time console gate
  cannot see it.
- **`next dev` alone adds `'unsafe-eval'` to `script-src` and `ws:` to `connect-src`.** Both key on
  `NODE_ENV === 'development'`, which `next dev` sets and `next build` defaults to `production`.
  `ws:` is not needed by the Chromium and WebKit the suite runs; it keeps HMR up in an engine that
  still applies Level 2's same-scheme rule, on a server that only ever runs locally.
- **A Vercel preview build alone allows the Vercel Toolbar**, when `VERCEL_ENV` is `preview` at
  build time, with the additions Vercel documents and nothing more: `https://vercel.live` in
  `script-src`, `style-src`, `img-src`, `font-src`, `connect-src` and `frame-src`, plus
  `https://vercel.com`, `data:` and `blob:` in `img-src`, `https://assets.vercel.com` in `font-src`
  and `wss://ws-us3.pusher.com` in `connect-src`. `frame-ancestors`, `object-src`, `base-uri` and
  `form-action` stay as they are in production. Previews are private to the owner (deployment
  protection covers every URL except the custom domains, see the runbook), the Toolbar is how
  comments on them work, and blocking it would put a CSP violation in the console of every preview
  page. No production response carries these origins: Vercel sets `VERCEL_ENV=preview` only when it
  builds a preview, nothing in the repository or in CI sets it, and Vercel rebuilds a preview with
  production variables when it is promoted.
- **`Cross-Origin-Opener-Policy: same-origin`**, as live-8 asks. It gives the site a browsing
  context group of its own, so a cross-origin page that opens the site keeps no handle on its
  window, and it costs nothing here, because the site opens no window that needs an opener. A
  Vercel preview build alone sends `same-origin-allow-popups` instead, keyed on the same
  `VERCEL_ENV === 'preview'`: `same-origin` would cut the opener of a window the injected Toolbar
  opens, such as a sign-in, when it navigates to another origin. That is reasoned from how COOP
  severs an opener, not observed on a preview, and like the Toolbar's CSP origins it never reaches
  production.
- **`turbo.json` declares `VERCEL_ENV` in the `build` task's `env`**, so a preview build and a
  production build of the same tree hash differently and a production build cannot replay a
  preview's cached output: with the declaration, `turbo run build --filter=web --dry=json` gives
  `preview`, `production` and an unset `VERCEL_ENV` three different hashes. The declaration is not
  what gets the variable to `next build`, which strict mode's `VERCEL_*` pass-through already does;
  it is what puts it in the hash.
- **Deliberately not sent:**
  - `upgrade-insecure-requests`. The e2e suite serves plain `http://localhost`. Chromium exempts
    localhost from the upgrade, but WebKit, which the `mobile-safari` project runs, does not: on a
    probe page served with it, WebKit requested the page's script as `https://localhost/...`, which
    failed with a TLS error, while Chromium loaded it over `http`. `.dev` is HSTS-preloaded, so
    production gains nothing from it.
  - `Strict-Transport-Security`. Vercel sets it on every production response, it means nothing over
    the plain HTTP the suite serves, and its `includeSubDomains` and `preload` attributes are a
    hosting decision that #48 verifies against the deployment and #52 re-checks.
- **Two tests hold it.** `apps/web/src/test/next-config.test.ts` pins the header list and every
  value, the `source`, the development and preview additions (the preview's COOP included) and
  where they must not appear, and the absence of a per-request token, `upgrade-insecure-requests`
  and HSTS.
  `apps/web/e2e/security-headers.spec.ts` (row R30, no longer an expected failure) proves that the
  four surfaces carry the headers under `next start` in CI and `next dev` locally.

## Consequences

### Positive

- Every page, asset and 404 carries the six headers, the `/_next/static` chunks included, where
  `X-Content-Type-Options: nosniff` is what stops a script chunk being sniffed as something else.
- A cross-origin page that opens the site gets no handle on its window.
- Every route stays static: the build output marks every route `○` or `●` and none `ƒ`.
- The site cannot be framed, by `frame-ancestors 'none'` in browsers that read CSP and by
  `X-Frame-Options: DENY` in any that do not.
- A new origin or `data:` image fails the console gate in Chromium on the first route that loads
  it, instead of being allowed silently by a policy written wider than the site.
- The policy lives in one function, `contentSecurityPolicy()`, and a change to it is one diff there
  and one in its unit test.

### Trade-offs

- The CSP does not stop an injected inline script, and `style-src 'unsafe-inline'` does not stop an
  injected inline style. On a site with no forms, cookies, sessions or secrets that is a small
  exposure, but the CSP must not be cited as the XSS defence.
- A preview's policy is not byte-for-byte production's: it differs by the Toolbar's origins. A
  preview therefore does not prove the production CSP; the e2e suite, which serves the production
  policy locally, and the live check in the runbook do.
- `headers()` is evaluated at build time and baked into the routes manifest that `next start` and
  Vercel serve from. Changing the policy needs a new build, and Instant Rollback to a deployment
  older than this record brings back that deployment's headers, which is none of these.
- Adding analytics or any other third party means editing `contentSecurityPolicy()` and its test in
  the same change, and Vercel Web Analytics is only half an exception. In production its script
  and beacons are same-origin under `/_vercel/insights/`, so `'self'` covers them there, but under
  `next dev` `@vercel/analytics` loads `https://va.vercel-scripts.com/v1/script.debug.js` instead,
  which the development `script-src` refuses. Turning it on means adding that origin to the
  development additions, or every local run of the console gate fails.
- In development `ws:` allows a WebSocket to any host, which is wider than the one socket HMR opens.
  It applies only where `NODE_ENV` is `development`, which no deployed build is: Vercel builds
  through `turbo run build`, whose strict mode filters `NODE_ENV` out of the task, and `next build`
  then defaults it to `production`.
- The console gate runs in Chromium alone, so the CSP's effect in WebKit rests on the walks under
  Context and on the mobile projects' functional specs, not on a console check in CI.

## Alternatives considered

- **A per-request token in `script-src`, set by `proxy.ts`.** It is the only way to drop
  `'unsafe-inline'` for the RSC payload, and ADR 0017 refuses both halves of it: the token makes
  every route a request-time render, and the proxy is the middleware that record refuses.
- **Hashes of the inline scripts.** The theme script's hash is fixed, but the RSC payload's text
  changes per page and per build, and one static `headers()` entry cannot carry a hash list per
  route. Worse, a browser that sees any hash in `script-src` ignores `'unsafe-inline'`, so the
  payload scripts would be blocked and hydration would fail.
- **A CSP of only `frame-ancestors`, `object-src`, `base-uri` and `form-action`**, with no
  `default-src`, `script-src` or `style-src`, as the task that planned this work first proposed. It
  avoids `'unsafe-inline'` in the header, but it gives up every limit on where scripts, styles,
  fonts, images and connections may come from, and the measurement above showed that limit costs
  nothing: everything the site loads is same-origin.
- **Headers in `apps/web/vercel.json`.** They would apply on Vercel only, so neither `next start`
  nor `next dev`, which is what the e2e suite tests, would carry them. ADR 0005 names `headers()` in
  `next.config.ts` as the place.
- **Leaving the Toolbar blocked on previews.** The preview policy would then equal production's,
  but every preview page would log a CSP violation from the injected Toolbar script, the kind of
  standing console noise that hides a real violation, and comments on previews would stop working.
  Switching the Toolbar off in the Vercel dashboard would avoid both, as a setting outside the
  repository that no review sees.
- **`Content-Security-Policy-Report-Only` first.** There is nowhere to send reports (the runbook
  records no error monitoring), and the e2e console gate already reports every violation on every
  route in both colour schemes.
- **`img-src 'self' data:`**, as Next's own example policy has it. No page renders a `data:` image,
  so it would allow something the site does not use; a route that starts rendering one fails the
  console gate, and the policy can grow then.

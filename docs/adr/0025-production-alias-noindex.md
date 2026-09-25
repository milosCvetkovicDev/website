# 0025. The public `vercel.app` production alias answers `X-Robots-Tag: noindex`

## Status

Accepted

## Date

2026-09-25

## Context

Every production deployment of the Vercel project answers on three hosts: the apex,
`https://miloscvetkovic.dev`; `www.miloscvetkovic.dev`, which the project's domain settings redirect
to the apex with a 308; and the project's production alias, `portfolio-theta-gold-77.vercel.app`.
The per-deployment, branch and team `*.vercel.app` URLs redirect to a Vercel login, and the audit
found the branch and team ones sending `x-robots-tag: noindex` as well. But the project's deployment
protection is `all_except_custom_domains`, and the production alias answers `200` to anyone
([docs/runbooks/deploy.md](../runbooks/deploy.md), under **Not covered**).

The external audit recorded the consequence twice, as live-3 and pages-7 (#48): the alias is a
byte-identical copy of the site that a search engine may index. Checked again on 2026-09-25, before
this record:

```text
$ curl -sSI https://portfolio-theta-gold-77.vercel.app/about
HTTP/2 200
etag: "4a1baff856a9d54d5259e5a20851e663"     (the apex's /about sends the same etag)
server: Vercel
                                             (no x-robots-tag)
```

The page itself carries `<meta name="robots" content="index, follow, ...">` and a canonical naming
`https://miloscvetkovic.dev/about`, which #48 added, and the alias's `robots.txt` is the apex's: one
open `*` group and the apex's sitemap. The alias is named in this public repository, in the runbook
and in the Claude Code rules, so a crawler can find it.

The canonicals alone do not settle it. A canonical is a signal a search engine weighs, not a
directive, and it reaches only the engines that read it. #48's AC 2 and the alias half of its AC 17,
and #52's AC 18, ask for more: the alias either redirects to the apex or answers
`X-Robots-Tag: noindex`, while the apex carries no `x-robots-tag` at all. #48 first preferred the
redirect, as a Vercel setting to be made with the owner's go-ahead. On 2026-09-25 the owner chose a
code-level header instead, keyed on the alias host.

Two earlier records bound how. [ADR 0017](0017-ai-discoverability-policy.md) keeps every route
statically prerendered and refuses middleware, so no page can vary its markup by host: the header
has to come from the routing layer. [ADR 0023](0023-static-security-headers.md) put the response
headers in `headers()` in `apps/web/next.config.ts`, and its first Decision bullet says: "There is
no second entry and no `vercel.json` header, so there is one place to read the policy."

How Next 16.3.5 matches a host was read in its source before writing the rule. `matchHas` in
`next/dist/shared/lib/router/utils/prepare-destination.js` takes the request's `Host` header,
drops the port, lower-cases it, and tests it against the `has` value as the anchored regular
expression `^value$`. `next build` writes the entry, `has` condition included, into the routes
manifest that `next start` and Vercel serve from.

## Decision

- **A second `headers()` entry in `apps/web/next.config.ts` sends `X-Robots-Tag: noindex` on every
  path of the production alias, and on no other host:**

  ```ts
  {
    source: '/:path*',
    has: [{ type: 'host', value: PRODUCTION_ALIAS_HOST }],
    headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
  }
  ```

  `PRODUCTION_ALIAS_HOST` is `'portfolio-theta-gold-77.vercel.app'`, exported from
  `apps/web/production-alias.ts`. In code the literal is written once, and the config and both
  tests read it from there. The records that quote it (this one, `docs/runbooks/deploy.md` and
  #52's AC 18) do not follow a rename by themselves. It has a module of its own because the Playwright spec has to import it, and
  Playwright loads TypeScript as CommonJS, where the `import.meta.url` in `next.config.ts` is a
  syntax error.

- **The entry is keyed on the alias being present, never on the apex being absent.** A rule with
  `missing: [{ type: 'host', value: 'miloscvetkovic.dev' }]` would noindex production the day that
  value had a typo, and would noindex every other host that ever answered for the site. A typo in
  the alias only fails to noindex the alias, which is the state before this record, and the check
  after the deploy (below) finds it.

- **The value is `noindex`, alone.** It is what live-3, #48's AC 2 and #52's AC 18 check for.
  `nofollow` would add nothing: the links on an alias page lead to other alias pages, each of them
  `noindex`, and every page's canonical already names the apex.

- **Its source is ADR 0023's `/:path*`,** so pages, prerendered case studies, `/_next/static`
  assets, metadata routes (`robots.txt`, the sitemap, the images) and 404s on the alias all carry
  the header. The answers ADR 0023 lists as leaving Next's router before `headers()` runs, the 308s
  that strip a trailing slash or collapse repeated slashes and the 500 for a malformed
  percent-encoding, carry none of Next's headers on the alias either. The entry sets no key that the
  security entry sets, so it overrides none of the six security headers: when two entries set the
  same key, Next keeps the later one.

- **ADR 0023's entry is unchanged,** its six headers and their values included, and the security
  policy is still read in one place, `securityHeaders()`. This supersedes
  [ADR 0023](0023-static-security-headers.md) in part: the sentence of its first Decision bullet
  saying there is no second `headers()` entry. The rest of 0023's decision stands.

- **[ADR 0017](0017-ai-discoverability-policy.md) is unchanged, and so is
  `scripts/ai-refusals.test.mjs`.** That record's crawler policy governs `robots.txt` on the site's
  own origin, one open `*` group, and this header changes neither that file nor what any crawler may
  do on the apex. It tells every crawler that honours it that one duplicate host is not the copy to
  index, and it is none of the mechanisms that record refuses: not a second `robots.txt` group, not
  middleware, not a per-request token.

- **Two tests hold it.** `apps/web/src/test/next-config.test.ts` pins the entry: the source, the
  host constant in `has`, the single header and its value, no entry keyed on `missing`, the six ADR
  0023 headers unchanged and sharing no key with it, and the constant's shape, a bare lower-case
  `*.vercel.app` host. It also runs the config through Next's own matcher
  (`unstable_getResponseFromNextConfig` from `next/experimental/testing/server`): the alias gets
  `noindex` with or without a port, and the apex, `www` and `localhost` get none, nor does a host
  that merely contains the alias. `apps/web/e2e/production-alias.spec.ts` sends the alias as the
  `Host` header to the local server and proves `x-robots-tag: noindex` on a page, a case study, a
  `/_next/static` chunk and a 404, and no `x-robots-tag` on the same four with the apex's `Host` or
  the default one, under `next start` in CI and `next dev` locally. Measured on 2026-09-25 while
  writing them: Playwright's request context does send a custom `Host`, and both servers match it.
  With the `has` value changed to `portfolio-theta-gold-78.vercel.app`, the alias test failed under
  `next dev` and under a rebuilt `next start`, every surface reporting `x-robots-tag (none)`; with
  the entry keyed on `missing` the apex instead, the apex test failed, because `localhost` got
  `noindex` on all four surfaces.

## Consequences

### Positive

- A search engine that reaches the alias is told not to index it, on every path, while the apex
  stays indexable, and the canonical on the same page names the copy to index.
- The rule lives in the repository: reviewed with the code, pinned by a unit test and proved on the
  wire by an e2e spec in CI, none of which a dashboard setting would be.
- Every route stays static. `headers()` is routing, not rendering, and the build still marks every
  route `○` or `●` and none `ƒ`.
- The alias stays reachable. The runbook's plain-`curl` checks against the production deployment,
  which read the pages from the alias before DNS existed and still can, get the same `200`s and the
  same six security headers, now with `x-robots-tag: noindex` beside them.

### Trade-offs

- The literal has to change if the Vercel project is renamed or its production `vercel.app` domain
  changes. Vercel would then serve a new alias without the header, and nothing in CI would notice:
  the tests read the same constant, so they follow a wrong value as happily as a right one. A typo
  in the constant is invisible to them in the same way; the unit test pins only its shape. The live
  check below, and #52's AC 18, are what catch either.
- The `has` value is a regular expression, so its unescaped dots match any one character. No host
  that answers for this deployment differs from the alias in only those places, and Next's own
  documentation writes a host the same way.
- Pages already indexed on the alias drop out only when a search engine recrawls them and sees the
  header, and only for crawlers that honour `X-Robots-Tag`.
- `headers()` is evaluated at build time. Instant Rollback to a deployment older than this record
  brings back an alias without the header. `docs/runbooks/deploy.md` checks the alias under
  **Verify**, and its **Rollback** section re-runs those checks, so a rollback that drops the
  header shows there. Nothing checks the alias on a schedule.
- How Vercel applies a host-keyed header to responses from its edge cache is not measured before
  the deploy. Nothing in CI reaches the live alias, so the proof is this check, run once the merge
  has deployed:

  ```bash
  chunk=$(curl -fsS https://miloscvetkovic.dev/ | grep -oE '/_next/static/[^"]+\.js' | head -1)
  echo "chunk: ${chunk:-none found, so the third path below tests / instead of an asset}"
  for p in /about /work/self-healing-agent "$chunk" /no-such-page; do
    for host in portfolio-theta-gold-77.vercel.app miloscvetkovic.dev; do
      echo "== $host$p"
      curl -sSI "https://$host$p" | tr -d '\r' | grep -iE '^(HTTP/|x-robots-tag:)'
    done
  done
  # expect: HTTP/2 200 under every URL (404 under /no-such-page), x-robots-tag: noindex under each
  #         alias URL, and no x-robots-tag line under any apex URL. A URL with no HTTP/ line under
  #         it was not answered, and proves nothing either way.
  ```

## Alternatives considered

- **A 308 redirect of the alias to the apex in the Vercel project's domain settings**, which #48
  first preferred and which is how `www` already reaches the apex. It would remove the duplicate
  outright. It lost on three counts. It is dashboard state that no review sees and no test in CI
  exercises, the argument ADR 0023 makes against switching the Vercel Toolbar off in the dashboard.
  It would turn the runbook's plain-`curl` checks against the production deployment into 308s: the
  alias is the one URL of a production deployment that answers without a login and is not a custom
  domain, which is what those checks rely on. And whether Vercel lets the project's own production
  `vercel.app` domain redirect was not verified.
- **Leaving it to the canonicals.** They are on every page, and they are a hint rather than a
  directive, which only the engines that read them follow. #48's AC 2 and #52's AC 18 ask for a
  redirect or the header, and the canonicals alone meet neither.
- **A rule keyed on `missing` the apex host.** One typo in the apex value would noindex production,
  and so would any host added later. Measured above: keyed that way, `localhost` got `noindex`.
- **Vercel Deployment Protection over the production alias.** A login in front of the alias would
  hide it from crawlers. It is dashboard state again, it would turn the runbook's plain-`curl`
  checks into login redirects, like the per-deployment URLs today, which need `vercel curl` and its
  bypass-secret side effect, and whether the plan offers a mode that protects the production alias
  without the custom domains was not checked.
- **Removing the alias from the project's domains.** The same objections as the redirect, and
  whether Vercel lets the project drop its own production `vercel.app` domain was not checked.
- **A host-specific `robots.txt` or robots meta tag.** Both are prerendered once for every host, so
  varying either by host needs a request-time render or middleware, which ADR 0017 refuses. A
  `Disallow` on the alias would also stop crawlers fetching its pages, so they would never see the
  canonical or a `noindex`, and a linked URL could still be indexed without its content.
- **The header in `apps/web/vercel.json`,** whose `headers` accept `has` as well. It would apply on
  Vercel only, so neither `next start` nor `next dev` would carry it and the e2e spec could not
  prove it, and ADR 0005 and ADR 0023 put the site's response headers in `next.config.ts`.
- **`noindex, nofollow`, or `none`.** Nothing to gain over `noindex`, as the Decision says, and
  #52's AC 18 checks for `x-robots-tag: noindex`.

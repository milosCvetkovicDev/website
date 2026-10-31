# 0040. Non-home routes get a new first-load JavaScript budget, and the growth behind it is recorded

## Status

Accepted

## Date

2026-10-31

## Context

#52's acceptance criterion 26 ("page weight holds") sets two budgets on first-load JavaScript: at most
233 KiB for `/` and at most 174 KiB for every other route. Both were the figures measured on
2026-09-12 against the deployment of 6e0a87a, so the budget was exactly that day's size and any growth
failed it. The close-out run of 2026-10-13 measured production at 8e5d329: `/` 201 KiB, every other
route 178 KiB (182,987 bytes), 4,405 bytes over the 178,582 the budget was set at. #268 opened to
find what grew. This record is its answer, and the owner's ruling on it is to accept the growth
(a) rather than remove it (b).

**The method.** #52 defines the figure as the sum of the `gzip -9` sizes of the unique
`/_next/static/**/*.js` files that a route's served HTML references, printed as whole KiB (bytes
divided by 1024, rounded down). So "at most 174 KiB" has always meant at most 179,199 bytes. The
measurement for #268 ran the same sum over the prerendered HTML and chunk files of a local
`next build`, with `VERCEL_ENV=production`. The flag matters: the layout renders Vercel Web
Analytics only in a production or preview build (ADR 0026), so a build without it leaves out 1,292
bytes that production serves.

**The validation.** The local figures reproduce the two production figures they can be compared with:

| Build                                         | Route    | Measured here | Known                | Difference |
| --------------------------------------------- | -------- | ------------- | -------------------- | ---------- |
| 6e0a87a3 (the budget's baseline, next 16.3.4) | `/about` | 178,589 bytes | 178,582 bytes (#52)  | +7 bytes   |
| eb5acc42 (`main`, next 16.3.8)                | `/about` | 182,909 bytes | 182,987 bytes (#268) | -78 bytes  |

All nine non-home routes measure the same, because their first load is the shared chunks. `/` is far
inside its budget at 205,889 bytes (201 KiB) on `main`.

**The attribution.** The rows below are the measured differences of `/about` between consecutive
builds in the history of `main`, each built with `VERCEL_ENV=production`, and they sum exactly to
the head minus the baseline, 183,368 - 178,589 = +4,779 bytes. A row that names one commit is the
difference between the build of that commit and the build of its parent. A row marked "window" is
the difference between two builds with several commits between them (its count is given): it is a
measured residual for that stretch, not an attribution to any one commit in it. Steps of zero are
left out. The attribution is per commit, not per module: the build ships no source maps, and Next
16.4 re-minifies every module (it drops `"use strict"`, renumbers module ids and renames variables),
so no module could be matched between 16.3 and 16.4. The commit that added a byte is exact; which
module inside the commit holds it is not.

| Row                                                                                | Bytes  |
| ---------------------------------------------------------------------------------- | ------ |
| #71, the dependency policy and lockfile clean-up                                   | +12    |
| Window: the 10 commits between #71 and #87 (dependency bumps among them)           | -32    |
| #87, the hydration marker                                                          | +68    |
| #116, the SEO audit fixes, with the lazy GSAP loader and the chunk split           | +996   |
| #118, the mc_ brand mark in the header                                             | +204   |
| Window: the 5 commits between #118 and #125 (#119, #120, #122 and #124 among them) | +12    |
| #125, the mobile Lighthouse score of `/`                                           | -42    |
| #135, Vercel Web Analytics                                                         | +1,283 |
| #138, the global error page that keeps the site shell                              | +1,118 |
| #146, a 15-update dependency group (Next 16.3.5 to 16.3.6)                         | -6     |
| Window: the 27 commits between #146 and #178                                       | +35    |
| #178, the mobile menu as a modal dialog                                            | +591   |
| #232, an 11-update dependency group (next 16.3.6 to 16.3.8 among them)             | +94    |
| Window: the 31 commits between #232 and `main` at eb5acc42                         | -13    |
| **Growth #268 reports, baseline to `main`** (the 14 rows above)                    | +4,320 |
| #275, Next 16.3.8 to 16.4.3 and React 19.3.0 to 19.3.1                             | +459   |
| **Baseline to #275's head, bd666525**                                              | +4,779 |

#275 changed no application source, only tests, so its 459 bytes are framework code: the vendored
React canary moved from 20260731 to 20261002, the runtime chunk grew by 86 bytes and the framework
chunks were re-partitioned. It is not the cause of #268; it adds to it. The rows that name a feature
commit (#87, #116, #118, #135, #138, #178) are 4,260 of the 4,779 bytes.

## Decision

The budget for every non-home route is 179 KiB, the whole-KiB figure of the
`/about` measurement taken against production on 2026-10-31 after #275 merged as 0a56661f and
deployed: 183,408 bytes (179 KiB), the same on all nine non-home routes. `/` measured 206,298
bytes (201 KiB) there. Production is 40 bytes over the local build of bd666525 (183,368); the cause was not traced,
and the production figure is the authority. In bytes the line is
184,319; production sits 911 under it. The budget for
`/` stays at 233 KiB. The method is #52's, unchanged: the sum of `gzip -9` sizes of the unique
`/_next/static/**/*.js` files the served HTML references, in whole KiB rounded down, and any figure
above the budget fails. A local measurement must set `VERCEL_ENV=production`, and the production
loop is the authority when the two differ.

Each part of the growth is accepted for the reason it exists:

- **#116, lazy GSAP (+996 bytes).** The same commit takes 42,704 bytes off `/` (239,796 to 197,092)
  by loading GSAP on demand. The shared loader and the extra chunk boundary are what the other routes
  pay for it. Removing them would put the 42.7 KB back on `/`.
- **#138, the global error page (+1,118 bytes).** It lets a crash in the root layout still show the
  site shell and mount analytics instead of Next's bare default. The page is in the first load of every
  route.
- **#135, Vercel Web Analytics (+1,283 bytes).** ADR 0026 records the decision; the bytes are inside
  the 2,250-byte bound #135's review set.
- **#178, the mobile menu as a modal dialog (+591 bytes).** It is the accessibility fix for the menu
  (focus handling, the current page marked).
- **#118, the brand mark (+204 bytes), #87, the hydration marker (+68 bytes).** The marker is what
  the e2e specs wait on (ADR 0006), and its design record predicted root-chunk growth.
- **#275 (+459 bytes).** The upgrade carries the fixes for the critical advisories on Next 16.3.8.
  Staying on 16.3.8 is not an option.
- **#71, #125, the dependency groups (#146, #232) and the four windows (+60 bytes net).** None is
  above 94 bytes in either direction, within the noise of a chunk re-partition. #125 is a gain. The
  windows are residuals, not decisions, and are accepted as such.

## Consequences

- The gate is again "any growth fails", now from a larger base. A change that adds first-load
  JavaScript to every route has to remove the same amount, or supersede this record with a new
  budget and the same kind of attribution.
- No single removal could have met the old budget. At bd666525 the non-home figure is 183,368 bytes,
  4,169 over the old 179,199-byte line; dropping Analytics, the global error page and the mobile menu
  together would leave it 1,177 over. Only all of #116, #118, #135, #138 and #178 reaches it, and
  reverting #116 costs `/` 42.7 KB.
- #52's acceptance criterion 26, in the issue and in the tracked copies of the epic, still says 174
  KiB. Those texts are the owner's to edit; this record does not rewrite them.
- The budget is the figure measured on production after #275 deployed, 183,408 bytes, so it holds 911
  bytes of room before the next whole KiB. Any growth that crosses 184,319 bytes fails it.
- The figure moves with the framework: a Next or React bump can shift it by a few hundred bytes in
  either direction, as #275 did (+459) and the #232 bumps did (+94). Such a bump re-measures
  against the budget and, when it crosses it, records the new figure the way this record does.

## Alternatives considered

- **Remove the growth (b).** Rejected by the owner on 2026-10-31. It means deleting or reverting
  five features, one of which (#116) would return 42.7 KB to `/`, and the total still leaves #275's
  459 bytes.
- **Raise the budget without a record.** #268 says this is not a fix: the next reader of the budget
  would not know what the number holds or why.
- **Set the budget to the production figure of 2026-10-13 (182,987 bytes).** It does not include
  #275, which deploys next, so the gate would fail on that deploy.
- **Add a CI gate for the figure.** Not decided here. The loop is manual, #52's close-out run is its
  only user, and a gate needs a production build with the Vercel flag and a pinned method; that is a
  separate record.

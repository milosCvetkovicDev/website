# 0035. Content dates move with served text, and a pull request check holds them together

## Status

Proposed

## Date

2026-10-08

## Context

Every static route, case study and published post has a content date: `STATIC_ROUTE_UPDATED` in
`apps/web/src/data/static-routes.ts`, a study's `publishedAt` and `updatedAt` in `case-studies.ts`,
a post's dates in `posts.ts`. The dates are the sitemap's `lastmod`, the case studies' TechArticle
dates and /about's `dateModified`. `CLAUDE.md` states the rule: the commit that changes what a page
visibly says bumps its date, and no other commit does. Until #191 nothing checked it. No script,
workflow, hook or test read a content date against the copy; the date tests checked only that each
date is a real day, not in the future, and that its readers agree with it. A copy change without a
bump makes all of those claim the page is older than it is, and a bump without one claims a change
that did not happen.

A check has to settle three things the prose leaves open:

- **What counts as a change to what a page says.** Most static copy has sat in
  `apps/web/src/data/pages/*.ts` since #157 and #158, and each h1 since #249, but the hero story's
  phases, the home page's featured work and some fixed strings in each `page.tsx` do not, so a
  hand-kept map from files to routes would rot. And a comment, a type or a reformat changes a file
  without changing a word a reader sees.
- **What to compare with.** A pull request is judged by what it changes since it forked, at its
  merge base, not against the current tip of `main`, which other pull requests move.
- **How to make a deliberate exception.** Date-only commits have been made on purpose: #229 dated
  five routes to the day #228 merged. And the three case studies share one `UPDATED_AT`, so a copy
  change to one study moves the date of all three.

Two facts constrain any record of text and date kept in the repository. `/` and `/about` take the
later of their recorded date and the day the years-of-experience figure last changed, and that
figure is in their text, so both move on 1 January with no commit. And /blog's sitemap date is the
latest of its own date and its published posts' `publishedAt`.

## Decision

Content dates move with served text, and two halves hold them together.

1. **A manifest, kept true by the unit suite.** `apps/web/src/data/content-dates.json` has one line
   per route: every `STATIC_ROUTE_UPDATED` key (/blog included while no post is published), every
   case study and every published post. Each line holds the route's sitemap `lastmod` (`updated`)
   and a fingerprint of its served text (`text`, the first 16 hex digits of a sha256). Served text
   is the page component's server render, without `script`, `style`, `template` or `time` elements,
   each block element a line of its own and whitespace collapsed, plus the route's Markdown twin,
   with the route's own dates masked in both. A comment, a type or a reformat cannot move a
   fingerprint, and a date bump alone moves only `updated`. `/` is rendered twice, as served and
   finished (reduced motion), because its server render leaves out the log events and the deploy
   result the story reveals. The clock is pinned to 2026-07-01 and the site origin left blank while
   the routes render, so the years figure does not move the file on 1 January.
   `apps/web/src/data/__tests__/content-dates.test.tsx` computes the manifest and fails when the
   file disagrees, inside `pnpm test` in the required `quality` job; only
   `pnpm --filter web content-dates:update` writes it.
2. **A pairing check on every pull request.** `scripts/check-content-dates.mjs`
   (`pnpm check:content-dates`) reads the manifest at the pull request's head and at its merge base
   with the base branch. For every route in both, it fails when the text moved and the date did
   not, when the date moved and the text did not, or when the date moved backwards, and names the
   route. A route only at the head is listed as new and a route only at the merge base as removed,
   and both pass. A merge base without a manifest passes with a notice. A missing or malformed
   manifest at the head, or a revision git cannot resolve, means the check could not run (exit 2).
3. **The escape is a line in the pull request body:** `Content-Date-Exception: <route> <reason>`,
   at the start of a line the rendered body shows, so not in a fenced code block or an HTML
   comment. It excuses every finding on its route. An exception that names a route the head
   manifest does not list, or gives no reason, fails the check, and the check prints every
   exception with whether its route needed it.
4. **The check is advisory.** It runs in a workflow of its own, `.github/workflows/content-dates.yml`,
   whose one job is `Content dates`, on the `opened`, `edited`, `synchronize` and `reopened` pull
   request events, so editing the body re-runs it alone. It is not a required status check. Making
   it one is the owner's decision: it follows [ADR 0021](0021-squash-only-merges-and-required-checks.md)'s
   order for adding a context, once the workflow is on `main` and reporting on pull requests, and
   it needs a record that supersedes ADR 0021, whose agreement check reads only `ci.yml` and
   `commitlint.yml`.

## Consequences

### Positive

- A copy change that leaves its date behind, or a date bump with no copy change, is named on the
  pull request, by route, before it reaches the sitemap or the structured data.
- Copy anywhere in a page's render counts, in records, page components and hero components alike,
  with no map from files to routes to keep.
- An exception is written where the reviewer reads, and the check lists every one.

### Trade-offs

- The check trusts the manifest at the head. Only the required unit suite keeps that file true, so
  the advisory check means something only on a head where `pnpm test` passes.
- The fingerprint does not see the layout's chrome (header, navigation, footer), which no page
  component renders; text in attributes (`alt`, `aria-label`, `title`); or strings shown only
  mid-animation, such as the story's `Processing...` and the deploying label, which neither render
  of `/` contains. A change to any of them moves no fingerprint and trips nothing.
- The decorative tmux background on `/` is hidden from assistive technology but served as text, so
  it counts: a change to it moves the fingerprint of `/` and needs a date or an exception.
- The years figure is fingerprinted as of the pinned day, not as the live site prints it. On
  1 January the live `lastmod` of `/` and `/about` still moves without a commit, as before, and the
  manifest does not follow it.
- The three case studies share one `UPDATED_AT`. A copy change to one study either gives it a date
  of its own or moves the shared one and carries an exception for each of the other two.
- Dating a change the day it is expected to merge now costs a date-only follow-up with an exception
  when the merge slips.
- Two pull requests that change the same route, or neighbouring routes, conflict on the manifest.
  The file is regenerated, never merged by hand.
- Every pull request that changes served copy now moves its date or carries an exception. While the
  check is advisory, one can still merge with it failing.

## Alternatives considered

- **Diffing the production build's HTML.** It needs a build of each side, or a manifest the build
  writes, and the years figure would make a committed one stale on `main` every 1 January.
- **Fingerprinting the merge base in a worktree of its own.** It needs the base's dependencies
  installed, and breaks when a data module's exports are renamed between the base and the head.
- **A map from source files to routes, hashing string literals.** Copy outside the records, in the
  hero phases and the page components, would need entries by hand, and the map would rot.
- **A required check from the start, or a step in the required `Commit messages` job.** The first
  needs a protection change and a record superseding ADR 0021 before the check has run on a single
  pull request. The second is enforced at once and already re-runs on a body edit, but puts a
  content check in a job named for commit messages. The owner chose an advisory check first, to be
  revisited after a few pull requests.
- **The exception as a commit trailer.** A squash merge keeps the pull request title and an empty
  body, so the trailer would never reach `main`, and adding one takes a new commit, which re-runs
  every check. The body is edited in place and re-runs this check alone.
- **A label.** It carries no route and no reason, so it can be neither listed nor reviewed per
  route.

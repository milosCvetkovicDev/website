# 0038. Hold @playwright/test below 1.64 until mobile-safari passes on it

## Status

Accepted

## Date

2026-10-30

## Context

Dependabot's minor-and-patch group update #275 carried fourteen updates, among them Next.js 16.4.3,
the fix for two critical Next.js advisories, and `@playwright/test` 1.64.1. Under 1.64.1 the e2e
job failed in the `mobile-safari` project: on the GitHub-hosted Ubuntu runner its WebKit 27.2
(revision 2370) read 1 to 4 animation frames in time windows that need at least 10, in runs
39311682857 and 40387450438, where 1.63.0's WebKit 26.6 (revision 2359) passes. 1.64.1 also moves
Chromium from 153.0.8010.12 to 156.0.8078.4, which is not the build the launch flags of
[ADR 0032](0032-e2e-chromium-single-threaded-gc.md) were measured on, and the test that pins that
build fails on it by design.

On 2026-10-30 the owner ruled (answer 2a to the session coordinating #275) that the rest of the
update lands and Playwright is held: #275 keeps the 1.63.0 that `main` locks, and #278 tracks the
upgrade. Nothing else would have kept it there. `apps/web/package.json` declares `^1.58.2`, which
admits 1.64, and only `pnpm-lock.yaml` records 1.63.0, so the next minor-and-patch run would offer
1.64 again, inside the group, and turn the whole group pull request red.

[ADR 0018](0018-dependency-update-policy.md) ignores in `.github/dependabot.yml` the majors this
repository cannot take, each with the event that reopens the question, under the rule that "an
ignore rule is a deferral with a named trigger, never a permanent opinion". Its Decision is about
majors. This hold is of another kind: it keeps out 1.64 and every release after it, a 2.x major
included, for a defect first seen in 1.64.1 whose cause is not yet known. It follows the same rule
but is not one of those majors, so it gets a record of its own.

## Decision

**`@playwright/test` is held at the 1.63 line the lockfile installs, by an `ignore` entry in
`.github/dependabot.yml` with `versions: ['>=1.64.0']`, until #278 is resolved by a Playwright
release under which the `mobile-safari` project passes on CI.** `>=1.64.0` holds 1.64 and every
later release, a 2.x major included, so the trigger ends the hold, not a version number. It is a
version hold: a deferral with a named trigger, under ADR 0018's rule. It sits beside ADR 0018
and changes nothing in that record's Decision, which stays about majors. The pull request that
resolves #278 deletes the entry and moves the lockfile.

## Consequences

### Positive

- The minor-and-patch group no longer offers a Playwright release that fails `mobile-safari`, so
  that failure cannot turn a group pull request red or hold one of the five open pull request slots.
- `playwright` and `playwright-core` need no entry: `@playwright/test` 1.63.0 depends on
  `playwright` 1.63.0 exactly, and that on `playwright-core` 1.63.0.
- Every ignore entry now has a record: the majors in ADR 0018, this hold here. The drift manifest's
  `adr-0038-dependabot-ignores` entry lists every `dependency-name` in `.github/dependabot.yml`, in
  order and with any repeat, and `adr-0038-dependabot-ignore-rules` the one rule each of them
  carries, so an ignore added, removed, repeated or widened without a record shows up as drift.

### Trade-offs

- Only Dependabot is held. `^1.58.2` in `apps/web/package.json` does not enforce the hold, so a
  `pnpm update` by hand, or any change that re-resolves `@playwright/test`, installs 1.64 or later.
  That is a known gap; the e2e job's `mobile-safari` failure and the Chromium build test of ADR 0032
  are what would catch it.
- The review cost of each new Playwright release moves to #278: nothing offers it as a pull request
  while the hold stands, so a Playwright fix the repository wants waits for #278 too.

## Alternatives considered

- **Narrow the range in `apps/web/package.json` to `~1.63.0`.** It would hold every install, but
  not Dependabot: under `versioning-strategy: increase-if-necessary` the bot raises a range that
  excludes a new release, so the group would offer `~1.64.1` instead, red as before.
- **`versions: ['1.64.x']`.** The first form #275 wrote. 1.65 passes it, and would be offered
  before anyone knows whether it fixes the starvation.
- **Amend ADR 0018.** Its Decision is accepted and is never edited (ADR 0012), and superseding it
  to add one row would restate the whole update policy for one hold.
- **Leave Playwright in the group and drop it from each group pull request by hand.** Every run
  would bring it back, red, inside a pull request that also carries the updates the repository
  wants, as #275 did.

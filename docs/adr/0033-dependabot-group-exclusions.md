# 0033. Dependabot's catch-all groups exclude the packages that have groups of their own

## Status

Accepted

## Date

2026-10-06

## Context

[ADR 0018](0018-dependency-update-policy.md) gave the vite family a Dependabot group of its own, so
that a vite major arrives with the `@vitejs/plugin-react` and vitest releases that peer on it, and
#193 added two groups for `lighthouse`, whose bumps are red by design until someone re-reads the
audits the Lighthouse spec asserts: `lighthouse` for version updates and `lighthouse-security` for
security updates. Each was declared ahead of the catch-all group it would otherwise fall into,
`minor-and-patch` or `security`, on the strength of GitHub's options reference for `groups`
(docs.github.com, "Dependabot options reference"): "If a dependency matches more than one rule, it's
included in the first group that it matches" (read on 2026-10-06).

That is not how Dependabot assigns them. #232, the `minor-and-patch` pull request of 2026-10-05,
carried eleven updates, four of them owned by the other groups (lighthouse 13.5.0, vite 8.3.2,
vitest 5.0.3 and `@vitest/coverage-v8` 5.0.3), and turned red on the Lighthouse version check that
the `lighthouse` group exists to keep out of it. The logs of the two version-update runs Dependabot
queued at 19:24 UTC that day, whose jobs ran from about 19:30, show how, and dependabot-core's
source explains it (read at dependabot/dependabot-core@47c1f006, `updater/lib/dependabot/` and
`common/lib/dependabot/dependency_group.rb`):

- **A refresh takes every member of the group it refreshes.** The job that refreshed the open
  `minor-and-patch` pull request, #203 (Actions run 37363210348), logged "Updating the
  'minor-and-patch' group", then a dependency change for each member in turn, `lighthouse`, `vite`,
  `vitest` and `@vitest/coverage-v8` among them, then, because its dependencies had changed,
  replaced #203 with #232. A group's members are the dependencies its `contains?` accepts, and a
  group with no patterns, as `minor-and-patch` is, accepts every name (`matches_pattern?` passes
  when no patterns are defined). `lighthouse` 13.5.0 was in that lineage before its groups existed:
  #175, opened at 06:54 UTC on 2026-09-30, carried it, and three minutes after #193 merged at 14:13
  UTC, run 36727537643 refreshed #175 into #203.
- **A wildcard loses to a group without patterns.** dependabot-core scores each group that matches a
  dependency (`pattern_specificity_calculator.rb`, since dependabot/dependabot-core#13044, #13098
  and #13180 in September 2025): 1000 for a pattern that is the dependency's name, 500 for a group
  with no patterns, 100 less 10 per wildcard plus 1 per character beyond five for a wildcard pattern
  (94 for `@vitejs/*` and `@vitest/*`), 1 for `*`, and 0 for a group whose exclusions match. A group
  with patterns gives a dependency up to a higher-scoring group; a group without patterns never
  checks, so it gives nothing up, even to a group that names the dependency exactly. In the job that
  runs every group (Actions run 37363207945) this logged "Skipping @vitejs/plugin-react for group
  'vite' - belongs to more specific group 'minor-and-patch'".
- **A group with an open pull request claims its members first.** Before any group runs,
  `mark_group_handled` (`dependency_snapshot.rb`) marks as handled the members of every group with
  an open pull request and the dependencies recorded on that pull request. The same job logged
  "Detected existing pull request # for the dependency group 'minor-and-patch'" (the log prints no
  number) and "Marking group 'minor-and-patch' as handled", and the `vite` and `lighthouse` groups
  then skipped `vite`, `vitest` and `lighthouse` "as it has already been handled by a previous
  group". Because every name is a member of `minor-and-patch`, the pass for packages outside the
  groups had nothing left either: the job ended with "Found no dependencies to update after
  filtering allowed updates in /".

The order of the groups counts in one case only. Groups without an open pull request run in the
order they are declared (the job definition lists `vite`, `lighthouse`, `minor-and-patch`), and a
later group skips a dependency an earlier one handled. So in a run with no `minor-and-patch` pull
request open, `vite`, `vitest` and `lighthouse`, which both their own group and `minor-and-patch`
keep, go to their own group because it is declared first. That is all the order protects: never
`@vitejs/plugin-react` or `@vitest/coverage-v8`, and nothing while a `minor-and-patch` pull request
is open, as one has been since #175 opened, but for 21 seconds between #175 closing and #203
opening, so no run has yet shown even that case.

Exclusion reaches all of these. `DependencyGroup#contains?` returns false for a name its
`exclude-patterns` match before it looks at any pattern (it accepts a dependency that is already a
member first, and only the engine adds members, once `contains?` has accepted them), the engine adds
a dependency to a group only when `contains?` accepts it (`dependency_group_engine.rb`), and a group
that excludes a dependency scores 0 for it. An excluded package therefore never becomes a member, so
neither a refresh nor the claim's member list can take it. The claim's other half, the dependencies
recorded on an open pull request, is not computed from the configuration, and exclusion does not
reach it.

The `security` group's `*` scores 1 and gives `lighthouse` up to `lighthouse-security`, so security
updates have not shown the fault. They depend on the same undocumented ranking.

## Decision

**A catch-all Dependabot group excludes, by pattern, every package that a group of its own owns.**
`minor-and-patch` carries
`exclude-patterns: ['vite', '@vitejs/*', 'vitest', '@vitest/*', 'lighthouse']`, the patterns of the
`vite` and `lighthouse` groups, and `security` carries `exclude-patterns: ['lighthouse']`, the
pattern of `lighthouse-security`. A change that adds a group, or a pattern to one, adds the same
patterns in the same change to the `exclude-patterns` of the catch-all group with the same
`applies-to`: `minor-and-patch` for version updates, `security` for security updates. A group owns a
package this way only when its `update-types` include every level the catch-all group takes (minor
and patch for `minor-and-patch`); otherwise the excluded levels would arrive one pull request per
package.

The order of the groups is left as it was. It still decides between two groups that keep the same
dependency in a run where neither has an open pull request, but after the exclusions no package is
kept by two groups. This decision adds a mechanism to ADR 0018's vite group and to #193's lighthouse
groups and changes neither: each still selects a group of its own, with the update types it had.

## Consequences

### Positive

- The vite family and `lighthouse` stay out of `minor-and-patch`, and `lighthouse` out of
  `security`, whatever the order and whatever the ranking does next, once no open catch-all pull
  request records them.
- The configuration's comments and `.claude/rules/dependencies.md` say why, so the next group is not
  declared "ahead of" a catch-all group in the belief that this is enough.

### Trade-offs

- An open catch-all pull request that records an owned package keeps claiming it, since the claim
  reads the dependencies recorded on the pull request. So this change merges after #232, which
  records all four, and a group added later needs the open `minor-and-patch` pull request merged or
  closed before its exclusions take effect.
- Each owned pattern is written twice, once in its group and once in an exclusion. Nothing compares
  the two: no test reads `.github/dependabot.yml`, and `pnpm check:docs-drift`, which runs outside
  the required checks, pins each list to its literal value, so a change to either side alone is
  reported there but not refused. A group added without its exclusion fails silently unless a bump
  it captures breaks the build: #232 was noticed only because lighthouse turned it red.
- The vite family's minor and patch updates now arrive in the `vite` group's pull request, with any
  vite or vitest major. A major that cannot land yet holds them; the way out is an `ignore` entry
  for that major, with the upstream event that reopens it, as the ESLint majors have. The patterns
  match four direct dependencies today: `vite`, `@vitejs/plugin-react`, `vitest` and
  `@vitest/coverage-v8`.
- Security updates of the vite family still arrive in the `security` batch, which this change leaves
  as it was: a fix that moves vitest without `@vitest/coverage-v8`, or vite past plugin-react's peer
  range, fails `scripts/vitest-coverage-pair.test.mjs` and holds the batch, the outcome
  `lighthouse-security` avoids for lighthouse. A `vite-security` group would be a new decision.
- Exclusion matches the name of the dependency Dependabot updates. A security fix for a package in
  lighthouse's tree that needed a newer lighthouse would be raised under that package's name, which
  `security` does not exclude, and the Lighthouse version check would fail that batch.
- While a `minor-and-patch` pull request is open, its claim marks every package it covers handled,
  so no major outside the dedicated groups gets a pull request of its own until it is merged or
  closed. That predates this change and is not altered by it.
- The change is proved only by a later Dependabot run: the first version update of an owned package
  after #232 has merged arrives in its own group's pull request, and the job's log shows no
  `minor-and-patch` dependency change for it.
- The ranking is undocumented and changed three times in September 2025. This decision no longer
  relies on it or on the order.

## Alternatives considered

- **Keep the order and its comments.** Rejected: #232 is the outcome.
- **Give `minor-and-patch` a pattern such as `*`**, so that it takes part in the ranking and gives
  owned packages up to their groups. Rejected: a refresh of its open pull request still takes every
  member, and the result would rest on a score GitHub does not document.
- **Drop the dedicated groups.** Rejected: a red `lighthouse` bump would hold every other minor and
  patch update, and a vite major would arrive without the releases that peer on it, as #9 did. Those
  are the reasons the groups exist.
- **Ignore `lighthouse` in version updates and bump it by hand.** Rejected: the re-read procedure in
  `.claude/rules/dependencies.md` relies on Dependabot raising each release.
- **A test in `scripts/` that compares each group's patterns with the catch-all group's
  exclusions.** Not taken now: without a YAML parser it can read the lists only while they stay
  one-line flow sequences, as the drift check's patterns do, and the drift check already reports a
  change to either side. It becomes worth it when a fourth group with patterns of its own is added
  or an exclusion list outgrows one line.

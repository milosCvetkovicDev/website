# 0018. Dependency update policy

## Status

Accepted

## Date

2026-09-12

## Context

Dependency updates had jammed, and nothing in the repository reported it.

Both open Dependabot pull requests were red for reasons that live upstream, not here. **#10** (ESLint
9 → 10) fails `web#lint` with `TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function`, because `eslint-config-next` 16.3.4 — also its
`latest` tag — depends on `eslint-plugin-react` `^7.37.0`, and 7.37.5, the newest release, calls the
`context.getFilename()` that ESLint 10 removed. The plugin peers `eslint` up to `^9.7` and upstream
has confirmed it does not support ESLint 10 yet (jsx-eslint/eslint-plugin-react#3977; the fix,
#4022, awaits review). **#9** (`@vitejs/plugin-react` 5 → 6) fails `web#test` with
`ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './internal'`, because plugin-react 6.1.1 imports
`vite/internal` and peers `vite: ^8.0.0`, while both apps resolve vite 7.3.1, whose export map has no
such entry.

Neither is a defect on `main`. Both are majors this repository cannot take yet, and with no `ignore:`
key in `.github/dependabot.yml` each new release in those majors reopened a red pull request. Between
them they had cost 21 failed CI runs and 19 Vercel previews, and they held two of the five slots
`open-pull-requests-limit` allows — slots a security fix would need. The five-slot cap had a second
effect: grouped pull request #6 silently skipped eslint 9.39.5, `@eslint/js` 9.39.5, vite 7.3.6,
`@vitejs/plugin-react` 5.2.0, `@types/node` 20.19.43 and `@testing-library/jest-dom` 6.10.0, all
published before that run, because each had a newer major Dependabot targeted instead. So the
in-range fixes were skipped _because_ the out-of-range ones were queued.

What sat in the lockfile as a result, measured on 9189af4: **40 distinct advisories — 30 high, 9
moderate, 1 low** — across 14 packages, every one of them dev-only, and every one with a patched
release inside its dependent's declared range. (`pnpm audit`'s own summary line counts vulnerable
package _instances_, not advisories, and printed "45 vulnerabilities found / 1 low | 11 moderate | 33
high" for the same tree; the two numbers describe the same thing differently.) `pnpm audit --prod`
printed "No known vulnerabilities found" across 105 production dependencies, and 24 of the 40
advisories reached the tree only through `apps/playground`, the untouched create-vite starter that
ships nothing: 11 of the 14 affected packages appear only under `apps__playground>…`. vite's
advisories were the only ones shared with the site; `js-yaml` and `fast-uri` came from the root
through `@commitlint/cli`.

Two version pins had drifted the same way. `packageManager` named `pnpm@10.33.0`, which
`gh api "/advisories?ecosystem=npm&affects=pnpm@10.33.0"` reports as affected by **18** published
advisories (11 high, 7 medium), all fixed by 10.34.5 on the same major — and CI and Vercel both
install the `packageManager` version. `apps/web` declared `@types/node` `^20` on a Node 22 runtime,
outside vitest 5's optional `@types/node` peer range (`^22.0.0 || >=24.0.0`), so nothing warned;
`apps/playground` drifted the other way with `^24.10.1`. The root `engines.node` floor of `>=22`
admitted Node versions that locked tools reject, jsdom 30.0.1's `^22.22.2 || ^24.15.0 || >=26.0.0`
being the binding entry.

Finally, `pnpm install` had no install delay, although the pinned pnpm implements one.
[ADR 0013](0013-dependency-build-scripts-reviewed.md)'s `allowBuilds` denial stops a dependency's
install script from running, but not a compromised build of a package that runs in-process at build
or test time — vite, an ESLint plugin, `@babel/core` — and Dependabot refreshes the lockfile every
Monday.

Dependabot alerts and security updates were both off on a public repository serving a live site:
`gh api repos/{owner}/{repo}/vulnerability-alerts -i` returned 404 and
`automated-security-fixes` returned `{"enabled":false,"paused":false}`. The owner approved switching
both on, on 2026-09-11. Nothing in CI audited dependencies either, and code scanning was off: on
2026-09-12 `gh api repos/{owner}/{repo}/code-scanning/default-setup --jq .state` printed
`not-configured`.

This record sits on top of [ADR 0004](0004-ci-pipeline-and-quality-gates.md)'s Dependabot paragraph,
which fixes the weekly Monday schedule, the `minor-and-patch` group, the five-PR cap and the
`commit-message` prefixes. None of those change here, so nothing in 0004 becomes false and it is
neither corrected nor superseded. It does supersede part of
[ADR 0002](0002-monorepo-toolchain.md): its pin table and the sentence about tightening `engines.node`
to `22.x`.

## Decision

**Majors this repository cannot take are ignored in `.github/dependabot.yml`, each with the upstream
event that reopens the question.** An ignore rule is a deferral with a named trigger, never a
permanent opinion:

| Ignored                                 | Why it cannot pass                                                                                              | Revisit when                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `eslint`, `@eslint/js` — `semver-major` | `eslint-config-next` 16.3.4 pulls `eslint-plugin-react` 7.37.5, which calls the removed `context.getFilename()` | jsx-eslint/eslint-plugin-react#3977 ships                                                     |
| `typescript` — `>=7`                    | typescript 7's root export carries no classic compiler API; typescript-eslint 8 peers `<6.1.0`                  | typescript-eslint raises that peer; 6.0.x is the reachable next step, in its own pull request |
| `@types/node` — `semver-major`          | Node types must not lead the runtime                                                                            | `.nvmrc` changes major, and then by hand                                                      |

**The vite family gets a group of its own that admits majors, declared ahead of `minor-and-patch`,
and it lands in the same pull request that makes `apps/web` declare `vite` directly, not before.**
The group is:

```yaml
vite:
  patterns: ['vite', '@vitejs/*', 'vitest', '@vitest/*']
  update-types: [major, minor, patch]
```

A vite major and the `@vitejs/plugin-react` and vitest majors that peer on it then arrive as one
pull request that can pass, instead of #9's plugin-react 6 arriving alone against vite 7. It goes
ahead of `minor-and-patch` because Dependabot places a dependency in the first group that matches
it. Declared any earlier than that pull request, it would regenerate a red grouped pull request,
because `apps/web` receives vite only as a peer of vitest and plugin-react rather than declaring it.
That pull request is the vite 8 migration; until it merges, `.github/dependabot.yml` carries no vite
group.

**Dependabot alerts are on. Security updates are grouped, are triggered by alerts rather than the
Monday schedule, and are switched on only after the pull request carrying this record has merged.**
A `security` group with `applies-to: security-updates` and `patterns: ['*']` batches the security
updates of each run into one pull request, so several advisories arriving together cannot fill the
five-slot cap. Version updates keep their own `minor-and-patch` group and their Monday schedule.
Security updates wait on two things. The first is [ADR 0016](0016-vercel-deployment-budget.md),
under which a push to a Dependabot branch creates no Vercel deployment: every bot pull request would
otherwise spend the Hobby plan's 100-deployments-a-day quota, and the point of turning alerts on is
not to exhaust it. That record has merged. The second is this record's own lockfile refresh:
switched on while `main` still carries the 40 advisories, security updates would open pull requests
for fixes this record's pull request lands. So when this record is accepted, automated security
updates are off (`gh api repos/{owner}/{repo}/automated-security-fixes` returns
`{"enabled":false,"paused":false}`) and an open alert produces no pull request. The owner switches
them on once that pull request has merged.

**A package version published less than a day ago is not installed.**
`minimumReleaseAge: 1440` in `pnpm-workspace.yaml` sets that for every pnpm resolution, and
`cooldown.default-days: 1` on the npm Dependabot entry sets the same window for the bot, so it cannot
propose a version pnpm would then refuse. `cooldown` covers version updates only, not security
updates, which is the behaviour wanted: a security fix should arrive the day it is published. An
exception goes in `minimumReleaseAgeExclude` with a named package and a reason, and a security fix
published the same day is the one case that earns one.

**The toolchain pins:**

| Pin             | Location                        | Value                                  |
| --------------- | ------------------------------- | -------------------------------------- |
| Node version    | `.nvmrc`                        | `22`                                   |
| Node range      | `package.json` `engines.node`   | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| Package manager | `package.json` `packageManager` | `pnpm@10.34.5`                         |

`engines.node` is no longer a bare floor. It is the intersection of the `engines: {node: …}` ranges
of every package in `pnpm-lock.yaml` that installs on a platform this repository runs on (CI and
Vercel build on linux x64, and development is on macOS), so it admits no Node version a tool
installed here rejects. It is re-derived whenever the lockfile moves rather than guessed. The
platform qualifier is load-bearing. The lockfile also lists optional platform binaries, marked with
`os` and `cpu`, which pnpm installs only on their own platform, and one of them,
`@img/sharp-win32-ia32@0.35.4` (`os: [win32]`, `cpu: [ia32]`), declares `^20.9.0`. That shares no
version with jsdom's range, so the intersection over literally every entry is empty. Of the 471
`engines.node` entries in the lockfile, it is the only one the range is not a subset of, checked
with `semver.subset` over each. Today the intersection is exactly jsdom 30.0.1's own range:
lint-staged 17.5.0's `>=22.22.1` and entries such as `^22.20 || ^24.12 || >=25` and
`^22.12.0 || ^24.0.0 || >=26.0.0` are all looser. pnpm only warns, and exits 0, when the running Node
is below the range, so the floor informs rather than blocks; `nvm install 22` is the fix. This
supersedes ADR 0002's `>=22` and its plan to tighten to `22.x`, which would have excluded the Node 24
and 26 lines the lockfile is happy with.

`packageManager` moves to `pnpm@10.34.5`, the newest 10.x, for which
`gh api "/advisories?ecosystem=npm&affects=pnpm@10.34.5" --jq length` prints `0`. It stays on the 10
line: whether pnpm 11 or 12 changes how `allowBuilds`, and therefore
`scripts/check-allowbuilds-drift.mjs`, behaves has not been checked, and that is its own evaluation.

**TypeScript stays on 5.x.** Next 16.3.4 does not support the 7.x native compiler and typescript-eslint
caps its peer below 6.1.0, so 6.0.x is the reachable next step, evaluated in its own pull request.

**A refresh inside declared ranges is the first move against an advisory, not a major bump.** Doing
that once took the tree from 40 advisories to 0. Two mechanics matter and are easy to get wrong:

- `pnpm update -r <patterns>` does **not** reach transitive copies by default, despite what the
  option's documented default suggests. Without `--depth Infinity` it left five stale copies pinned
  behind parents whose own ranges admitted the fix — `js-yaml` 4.1.1 under `cosmiconfig` 9.0.1
  (which declares `^4.1.0`), `fast-uri` 3.1.0 under `ajv` 8.18.0 (`^3.0.1`), plus `brace-expansion`
  1.1.12, `minimatch` 3.1.2 and `browserslist` 4.28.1 — while adding the patched version alongside
  for other dependents. 21 of the 40 advisories survived the first pass for that reason alone.
- A refresh must stay off the packages the gates are measured against. `@axe-core/playwright` (a new
  axe rule fails the accessibility gate, which runs with `retries: 0`), `prettier` (reformatting
  fails `format:check`), `tailwindcss`, `@playwright/test` and `react` are left to Dependabot's
  grouped pull request, where a failure is legible as a failure.

**`@gsap/react` is removed.** Nothing imported it or `useGSAP`: every GSAP call site uses the plain
API inside `gsap.context()`, reverted in the effect's cleanup. It was a production dependency that
two documents described as in use.

**`apps/playground` is retired, in #45's follow-up pull request.** It is the untouched create-vite
starter, still rendering `<h1>Vite + React</h1>`, and nothing consumes it, yet it brought in 24 of
the 40 advisories and half of any vite 8 migration. The owner decided this on 2026-09-12. The
removal is carried out by #45's follow-up pull request (workspace pruning), not by the pull request
carrying this record, so that this one's lockfile diff stays the advisory refresh its reviewers
checked. Until the follow-up merges, the playground's Dependabot updates arrive in the same grouped
pull requests as the site's, and the repository owner, `@milosCvetkovicDev`, the only maintainer,
triages them.

**`packages/eslint-config` and `packages/typescript-config` are deleted, in #45's follow-up pull
request.** Nothing references either: `apps/web` lints through its own `eslint.config.mjs` built on
`eslint-config-next`, and each app has its own `tsconfig.json`. Wiring the ESLint package in instead
would downgrade `eslint-plugin-react-hooks` to a 5.x without the `set-state-in-effect` rule that
[ADR 0006](0006-hydration-safe-client-state.md) depends on, and would register the plugin a second
time next to `eslint-config-next`. The owner decided this on 2026-09-12, and the same follow-up pull
request deletes both packages.

**Pull requests run `actions/dependency-review-action`.** It is a step in the existing `quality` job,
pinned as `actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0` and
placed straight after checkout, so a pull request that introduces a vulnerable dependency fails
before anything is installed. It is guarded by `if: github.event_name == 'pull_request'`: a push to
`main` has no base to compare with, and the action would fail there. It runs with the action's
defaults, which fail on an advisory of any severity (`fail-on-severity: low`) in a dependency scoped
`runtime` (`fail-on-scopes: runtime`), and which post no pull request comment
(`comment-summary-in-pr: never`), so the workflow's top-level `permissions: contents: read` is all it
needs, as the action's v5 README shows. `runtime` does not exempt dev tooling here: GitHub's
dependency graph gives that scope to every resolved `pnpm-lock.yaml` entry, dev-only packages
included, and gives `development` only to the version ranges read from each `package.json`, so the
step judges every version a pull request adds to the lockfile. Because it is a step in `quality`, a
check branch protection already requires on `main`, no branch-protection change is needed. It
answers a different question
from alerts: alerts report advisories in what `main` already carries, and dependency review stops a
pull request from adding one. The owner adopted it on 2026-09-12. A `pnpm audit` step was the weaker
option, for the reason under Alternatives considered.

**CodeQL default setup is on.** It was switched on by the owner on 2026-09-12, in setup run
34716120727, and `gh api repos/{owner}/{repo}/code-scanning/default-setup --jq .state` now prints
`configured`, with the `default` query suite. Its `.languages` lists `actions`, `javascript`,
`javascript-typescript` and `typescript`, which run as two analyses: `actions` and
`javascript-typescript`. GitHub manages it, so it adds no workflow file and
`.github/workflows/ci.yml` does not change for it. Its checks are not among those branch protection
requires on `main`, which are still the `quality` and `e2e` jobs.

## Consequences

### Positive

- A red bot pull request no longer reopens weekly, and the five slots are available to the security
  group.
- `pnpm audit --audit-level high` exits 0 and `pnpm audit` prints "No known vulnerabilities found",
  so the number has a meaning it did not have before: it was 40 while every fix was already inside a
  declared range.
- CI and Vercel install a pnpm with no open advisory against it, and the lockfile's 681
  resolutions all keep their sha512 integrity, with no git or tarball sources.
- A supply-chain compromise has a day to be found and unpublished before this repository installs it,
  which is the window most of them are caught in, and it applies to both pnpm and the bot.
- `engines.node` now means something checkable. It is derived from the lockfile rather than asserted,
  so it cannot quietly admit a Node version that a tool installed on this repository's platforms
  rejects.
- A pull request that adds a lockfile entry with a known advisory fails `quality`, dev tooling
  included, and branch protection requires that check, so it cannot merge. Alerts cover the
  advisories published after a dependency has landed.
- CodeQL analyses the TypeScript and the workflows on pull requests, with no workflow file to keep
  pinned.

### Trade-offs

- An ignore rule hides a real major. The mitigation is that each carries its revisit trigger in the
  file itself, and #52 re-checks that no Dependabot pull request has been red for more than seven
  days.
- The install delay can block a security fix published the same day. Watch the first security-update
  run; the escape hatch is `minimumReleaseAgeExclude` for that named package.
- A lockfile refresh is now time-dependent: a non-frozen `pnpm install` can resolve differently
  depending on the hour. CI's `--frozen-lockfile` skips resolution, so this affects local work only.
- `engines.node` will need re-deriving whenever the lockfile moves, and the range is narrower than it
  looks: jsdom excludes all of Node 23 and 25. The derivation also has to skip, by hand, optional
  binaries built for platforms nothing here runs on. A mechanical intersection over every entry in
  the lockfile is empty today because of `@img/sharp-win32-ia32@0.35.4`'s `^20.9.0`.
- Dependency review fails on dev tooling as well as on what the site ships. GitHub's dependency graph
  scopes every resolved `pnpm-lock.yaml` entry `runtime`, so the default `fail-on-scopes` already
  covers all of them, including the lockfile entries that carried the 40 advisories this record
  cleared; widening it to `development` would add only the `package.json` ranges. The cost is that a
  grouped version-update pull request, or any lockfile re-resolution, that lands an affected dev-tool
  version, such as one with no patched release yet, fails the required `quality` check and cannot
  merge until that version moves. The escape hatch is the action's `allow-ghsas` input naming the
  advisory, and using it is its own decision, recorded with its reason.
- Dependency review judges only what a pull request adds. An advisory published later against a
  version already on `main` does not fail it; that stays with alerts and, once they are on, security
  updates.
- Until the follow-up pull request merges, the playground and the two config packages stay in the
  workspace, in the lockfile and in Dependabot's grouped pull requests.

### Facts to watch, with no change here

- **pnpm 11 and 12.** `latest` is 12.4.1 and `latest-11` is 11.26.0, while 10.34.5 (2026-07-10) is
  the 10 line's last release, and CI's `pnpm/action-setup` bootstraps pnpm 11 before switching down
  to the pinned version. An ADR-backed evaluation, covering how `allowBuilds` and
  `scripts/check-allowbuilds-drift.mjs` behave on the new major, is follow-up work.
- **React 19.3.0** (2026-09-09) will arrive in the next grouped pull request; next 16.3.4's peer
  range admits it. Merge that pull request only after the local dev-server e2e run passes as well as
  CI: 19.3 adds a DEV-only warning about conditional `use()`, and a new DEV warning fails the console
  gate in dev mode alone.
- **`@testing-library/jest-dom` 6.10.0 is deprecated upstream** — "Incorrect minor release with
  breaking changes (Node >=22 and required @testing-library/dom peer). Use 6.9.1 for the 6.x line, or
  upgrade to 7.0.0." pnpm's resolver skips it, which is why a refresh inside `^6.9.1` stays on 6.9.1
  and why 6.9.1 is the right resting place until 7.x is evaluated. It carries no advisory.
- **Licences.** The production tree's only non-OSI licence is GSAP's standard "no charge" licence
  (gsap 3.15.0, which ships the DrawSVG and MotionPath plugins the hero imports). Removing
  `@gsap/react` leaves gsap as the only one. Nothing in the repository records this, and there is no
  LICENSE file.

## Alternatives considered

- **Leave `.github/dependabot.yml` alone and close the red pull requests by hand each week.** This is
  what was happening. Dependabot reopens on the next release in the ignored major, so the cost
  repeats indefinitely and the slots stay occupied between closures.
- **Take the majors instead of ignoring them.** Not available for either: ESLint 10 needs an upstream
  plugin release, and `@vitejs/plugin-react` 6 needs vite 8 in both apps at once — which is a real
  coordinated bump (vitest 5 already accepts vite 8, and vite 8.3.0 drops the esbuild dependency),
  just not one that belongs in a policy change.
- **A blanket `pnpm update -r --latest`.** It would clear the advisories and also move
  `@axe-core/playwright`, `prettier`, `tailwindcss`, `@playwright/test` and the playground's `react`,
  turning one dependency change into an unbounded set of gate failures with no way to attribute them.
  The targeted refresh keeps the diff readable.
- **Keep `apps/playground` as a sandbox, with the owner triaging its upgrades.** It would keep a
  second vite app, the source of 24 of the 40 advisories, in every future refresh and in the vite 8
  migration, for a starter page nothing ships.
- **A `pnpm audit` step in CI instead of alerts.** It fails every pull request on the day an
  unrelated advisory is published, whoever opened it, and it says nothing about whether a fix exists.
  Alerts and grouped security updates deliver the same information as work rather than as a blocked
  merge.
- **Pin every transitive with `pnpm.overrides`.** It clears an advisory without waiting for the
  parent, but each override is a fork of someone else's resolution that no tool will ever tell you to
  remove. Kept in reserve for an advisory with no in-range fix, which is not the case for any of the 40.
- **Raise `engines.node` to `22.x`,** as ADR 0002 anticipated. It excludes the Node 24 and 26 lines
  the lockfile explicitly admits, so it would refuse a working toolchain; the lockfile intersection
  refuses only what is actually unsupported.

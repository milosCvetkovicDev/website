---
paths:
  - 'package.json'
  - 'apps/*/package.json'
  - 'packages/*/package.json'
  - 'scripts/package.json'
  - 'pnpm-workspace.yaml'
  - 'pnpm-lock.yaml'
  - '.nvmrc'
  - '.github/dependabot.yml'
---

# Dependencies, the lockfile and Dependabot

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Architecture

pnpm 10.34 workspace (`apps/*`, `packages/*`, `scripts`, per `pnpm-workspace.yaml`) driven by
Turborepo 2.10.
Node 22 is pinned in `.nvmrc` only; `engines.node` is
`^22.22.2 || ^24.15.0 || >=26.0.0` and `packageManager` pins pnpm
(`pnpm@10.34.5`), not Node. CI reads Node from `.nvmrc` and pnpm from `packageManager`. The range is
not a bare floor. It is the intersection of the `engines: {node: …}` ranges of the lockfile's
packages that install on linux x64 (CI, Vercel) or macOS, and it is re-derived whenever the lockfile
moves. Skip the optional binaries for other platforms (entries with `os`/`cpu`):
`@img/sharp-win32-ia32` declares `^20.9.0`, so an intersection over every entry is empty. A local
Node below the range makes pnpm print `WARN Unsupported engine` and carry on; `nvm install 22`
fixes it. See `docs/adr/0018-dependency-update-policy.md`.

`pnpm typecheck` stays the plain `turbo typecheck`, and `scripts/` is type-checked as one of its
tasks: `@repo/scripts` runs `tsc -p .`, which checks every `scripts/**/*.mjs` with `checkJs`, and
`check-docs-drift.ts` as TypeScript, with `strict` against `scripts/tsconfig.json`. That type-check
gets `typescript` and `@types/node` from the package's own devDependencies, not the root's, and for
them pnpm adds only the package's importer block to the lockfile. As root devDependencies they would
also rewrite other packages' lockfile snapshots, because a root dependency is also what pnpm
resolves the root's own packages' peer dependencies to: a root `@types/node` would become the
`@types/node` peer root commitlint reaches through `cosmiconfig-typescript-loader`, in place of the
version pnpm installed for it. The measurement behind the choice is in PR 2's entry in
`.claude/epics/audit-remediation-2026-09/50.md`.

## Quality gates

- Dependabot runs weekly on Mondays for npm and github-actions. Minor and patch npm updates are
  grouped into one `minor-and-patch` pull request, except those of the `vite` and `lighthouse`
  groups below, a major outside those two groups arrives as a pull request of its own, though not
  while a `minor-and-patch` pull request is open, which marks every package it covers as handled
  (ADR 0033), and open npm pull requests are capped at five; github-actions bumps are not grouped.
  Dependabot alerts and automated security updates are both on. Security updates are triggered by
  alerts rather than the Monday schedule, and a `security` group
  (`applies-to: security-updates`, `patterns: ['*']`) batches the security updates of each run into
  one pull request so they cannot fill the five-slot cap. Three majors are ignored, each with the
  upstream event that reopens it: `eslint` and `@eslint/js` (eslint-config-next pulls an
  eslint-plugin-react that ESLint 10 breaks — jsx-eslint/eslint-plugin-react#3977), `typescript`
  `>=7` (no classic compiler API at the root; typescript-eslint peers `<6.1.0`) and `@types/node`
  majors (they follow `.nvmrc` by hand). Adding one is a policy change, so read
  `docs/adr/0018-dependency-update-policy.md` first; deleting one without the trigger having fired
  puts the red pull request back. A `vite` group (`vite`, `@vitejs/*`, `vitest`, `@vitest/*`, majors
  included) brings a vite major in one pull request with the `@vitejs/plugin-react` and vitest
  releases that peer on it. The order of the groups does not, by itself, keep a package in its own
  group (it decides only between two groups that both keep it, neither with an open pull request): a
  group with no patterns, as `minor-and-patch` is, never gives a dependency up, even to a group that
  names it exactly, and outranks a wildcard; a group with an open pull request claims its members
  first; and a refresh of that pull request takes every member. So every package a group owns is
  also in the `exclude-patterns` of the catch-all group with the same `applies-to`
  (`minor-and-patch` for version updates, `security` for security updates), which Dependabot reads
  before any pattern, and a new group adds its patterns there in the same change, if its
  `update-types` include minor and patch (ADR 0033, #232). The group relies on `apps/web` declaring
  `vite` directly (ADR
  0027): without that, a plugin-react major would arrive without the vite major it needs and fail
  as #9 did. Keep the declaration while the group exists. The major is not pinned by any decision:
  `scripts/vitest-coverage-pair.test.mjs` fails `pnpm test:scripts` when the installed vite's major
  is outside the installed plugin-react's `vite` peer range, which is what catches a manual or
  security update that moves one without the other.
- `lighthouse` is pinned exactly in `apps/web/package.json`, and a bump, Dependabot's included,
  means re-reading the audit ids and scoring rules `apps/web/e2e/lighthouse-audits.spec.ts` asserts
  and its docblock records for the version `LIGHTHOUSE_VERSION` names. The spec fails on any other version until `LIGHTHOUSE_VERSION`
  in `apps/web/e2e/support/lighthouse.ts` is updated, because a changed `notApplicable` or scoring
  rule would not fail it by itself. So Dependabot raises lighthouse bumps alone, in a `lighthouse`
  group (`patterns: ['lighthouse']`, majors included) or a `lighthouse-security` one for security
  updates, and `minor-and-patch` and `security` both exclude it, so a red lighthouse pull request
  bumps no other direct dependency. The pattern
  matches the exact name only; `lighthouse-logger` and the rest of its tree are transitive and
  change only when the new lighthouse requires it, which can include `@opentelemetry/api` below:
  check its version and the peer suffix on `next` in the lockfile diff. To land one, check out the
  Dependabot branch, re-read the audits against the release notes, then update `LIGHTHOUSE_VERSION`
  and the docblock's version in one commit (`git grep -nF` with the old version, over `apps/web`,
  lists every place that cites the release; a dated measurement keeps the version it was taken
  with, and `src/test/lighthouse.test.ts` derives its versions from the pin). Dependabot stops rebasing a branch once someone else commits to it, and
  the open pull request holds one of the five version-update slots until it is merged or closed.
  Lighthouse's tree brings `@opentelemetry/api`, which pnpm then resolves as `next`'s optional peer
  (the `(@opentelemetry/api@1.9.1)` suffix on `next`, `@vercel/analytics` and `vitest`), so the
  production build traces that package beside Next's compiled copy. Next prefers it when it
  resolves; with no tracer provider registered, both are the same no-op API, and the build stays
  function-free. Removing lighthouse is what drops the peer again (see the optional peer gotcha
  below).

## Gotchas

- Never hand-edit `pnpm-lock.yaml`, `.next/`, `node_modules/` or `.env*`; change dependencies through
  pnpm. pnpm's peer-suffix resolution for this dependency graph is not deterministic: now and then
  a resolution, on `main` as well, flips a few peer suffixes the other way (on 2026-09-16, the
  `@babel/core` suffix of `next` and `styled-jsx` and the suffixes of the
  `eslint-plugin-import`/`eslint-import-resolver-typescript` cycle). A lockfile diff that flips only
  such suffixes is pnpm's own output, not a hand edit. A plain `pnpm install` keeps the flip: the
  lockfile already matches the manifests, so resolution is skipped. Taking `main`'s whole lockfile
  with `git checkout` and resolving again (`pnpm install --resolution-only`) usually writes it back.
- `pnpm install` runs no dependency lifecycle scripts. `allowBuilds` in `pnpm-workspace.yaml` denies
  the one package pnpm 10 would otherwise warn about, unrs-resolver: its script only checks the
  prebuilt platform binary the lockfile already installs, and downloads one only when none is
  present. esbuild's entry went with the vite 8 migration (ADR 0027), because vite 8 does not depend
  on esbuild and nothing else does. sharp has no entry because it has had no install script since
  0.35.0, and an entry belongs there only while the package still declares one — an entry for a
  scriptless package would silently deny whatever a later release adds instead of letting pnpm
  report it. Each entry
  carries a `Reviewed at <version>` comment, and `pnpm check:allowbuilds` fails CI when one drifts
  from the lockfile or outlives its script, so a Dependabot bump of a denied package means reading
  the new script and updating the comment. That check fails closed: anything it cannot parse is an
  error, not a skip, so a legal but unrecognised edit to the block fails CI rather than passing
  unchecked. Its own tests are `pnpm test:scripts`. An `Ignored build scripts` warning naming a package
  without an entry is a new decision: run `pnpm ignored-builds` and `pnpm why -r <name>`, read its
  `scripts` under `node_modules/.pnpm/<name>@<version>/node_modules/<name>/`, then add it to
  `allowBuilds` as `true` or `false` with a comment; do not run `pnpm approve-builds --all`. A
  warning naming a package that already has an entry means the `node_modules` predates the entry:
  pnpm re-reports the builds recorded in `node_modules/.modules.yaml` until
  `pnpm clean && pnpm install`. Do not add `strictDepBuilds`, which turns that stale warning into a
  failed install (ADR 0013, `docs/adr/0013-dependency-build-scripts-reviewed.md`, superseding 0007).
- `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` refuses any version published less than a day
  ago, so a non-frozen `pnpm install` or `pnpm update` can fail with
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION` naming a package released hours earlier — including an
  optional platform binary such as `@rollup/rollup-<platform>`, whose release tracks its parent's. The
  fix is to re-resolve that package (`pnpm update -r <name>`) so pnpm picks the newest mature version,
  not to add it to `minimumReleaseAgeExclude`, which is for a named, justified exception such as a
  security fix published the same day. CI's `pnpm install --frozen-lockfile` skips resolution and is
  unaffected. Dependabot mirrors the window with `cooldown.default-days: 1`, which applies to version
  updates only. ADR 0018.
- On pnpm 10.34.5, `pnpm update -r <patterns>` did not reach transitive copies without
  `--depth Infinity`, whatever the documented default says. A refresh aimed at an advisory in a transitive package will add the
  patched version for some dependents and silently leave the vulnerable copy pinned under others
  whose own ranges admitted the fix. Always pass `--depth Infinity` and re-run `pnpm audit` to confirm
  the count actually moved. Whatever the depth, a version in a pattern stops it reaching them:
  pnpm 10.34.5's `update()` matches transitive copies by name only when no pattern carries
  `@<version>`. On 2026-10-08 (#211),
  `pnpm update -r source-map-js@1.2.2 --depth Infinity --lockfile-only` left `@tailwindcss/node`'s
  `source-map-js` at 1.2.1, while `pnpm update -r source-map-js --lockfile-only` lifted it to 1.2.2.
  Dependabot's security updater runs the versioned form (run 37623928748:
  `pnpm update source-map-js@1.2.2 --lockfile-only --no-save -r`), so an advisory in a transitive
  package whose parent's range admits the fix arrives as a failed "Dependabot Updates" run, not a
  pull request, and needs the bare-name refresh by hand.
- pnpm resolves an optional peer when the package is already in the dependency graph, and keeps
  it: a lockfile that once resolved it holds it in the graph by itself. vite 8.3.1 kept
  `esbuild@0.27.2` as its optional peer that way after nothing else needed esbuild, and neither
  `pnpm install --resolution-only`, `pnpm dedupe` nor `pnpm update -r vite --depth Infinity` dropped
  it. `pnpm --filter web remove` of every package that brings vite in (`vite`,
  `@vitejs/plugin-react`, `vitest`, `@vitest/coverage-v8`), then `pnpm --filter web add -D` of the
  same ranges, did. pnpm writes the resolved version as the new specifier (`^5.0.0` came back as
  `^5.0.2`), so put back any range that was not meant to move and run `pnpm install`.

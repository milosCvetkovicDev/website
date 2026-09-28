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
  grouped into one pull request and open npm pull requests are capped at five; github-actions bumps
  are not grouped. Dependabot alerts and automated security updates are both on. Security updates
  are triggered by alerts rather than the Monday schedule, and a `security` group
  (`applies-to: security-updates`, `patterns: ['*']`) batches the security updates of each run into
  one pull request so they cannot fill the five-slot cap. Three majors are ignored, each with the
  upstream event that reopens it: `eslint` and `@eslint/js` (eslint-config-next pulls an
  eslint-plugin-react that ESLint 10 breaks — jsx-eslint/eslint-plugin-react#3977), `typescript`
  `>=7` (no classic compiler API at the root; typescript-eslint peers `<6.1.0`) and `@types/node`
  majors (they follow `.nvmrc` by hand). Adding one is a policy change, so read
  `docs/adr/0018-dependency-update-policy.md` first; deleting one without the trigger having fired
  puts the red pull request back. A `vite` group (`vite`, `@vitejs/*`, `vitest`, `@vitest/*`, majors
  included) goes ahead of `minor-and-patch` in the same pull request that makes `apps/web` declare
  `vite` directly, and not before: added now it would regenerate a red grouped pull request.

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
  the two packages pnpm 10 would otherwise warn about (esbuild, unrs-resolver): their scripts only
  check the prebuilt platform binaries the lockfile already installs, and download one only when
  none is present. sharp has no entry because it has had no install script since 0.35.0, and an
  entry belongs there only while the package still declares one — an entry for a scriptless package
  would silently deny whatever a later release adds instead of letting pnpm report it. Each entry
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
  the count actually moved.

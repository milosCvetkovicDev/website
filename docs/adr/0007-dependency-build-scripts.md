# 0007. Dependency build scripts stay disabled

## Status

Accepted (corrected 2026-09-10)

## Date

2026-09-09

## Context

pnpm 10 does not run the `preinstall`, `install` and `postinstall` scripts of dependencies unless a
package is allowed by name ([ADR 0002](0002-monorepo-toolchain.md) pins `pnpm@10.33.0`). With
nothing allowed or denied, every `pnpm install --frozen-lockfile` on a clean checkout ended with the
same box: under pnpm 10.33.0 locally, in both CI jobs (which install pnpm from `packageManager`
through `pnpm/action-setup`), and on Vercel, whose build log ends with `using pnpm v10.33.0` for
the same reason:

```
Ignored build scripts: esbuild@0.27.2, sharp@0.34.5, unrs-resolver@1.11.1.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

`pnpm ignored-builds` reported the same three packages and nothing else, so the list is complete.
Nothing was broken by it: every build passed with the scripts skipped. But the warning was a
decision nobody had taken, printed on every install, and the day a fourth package joined the list
nobody would have noticed. None of the three is a direct dependency; `pnpm why -r <name>` shows
each arriving through a tool the repository does need:

| Package                | Pulled in by                                                          | Script                                                     |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `esbuild@0.27.2`       | `vite`, used by Vitest in `apps/web` and by Vite in `apps/playground` | `postinstall: node install.js`                             |
| `sharp@0.34.5`         | `next`, as an optional dependency for `next/image` optimisation       | `install: node install/check.js \|\| npm run build`        |
| `unrs-resolver@1.11.1` | `eslint-import-resolver-typescript`, through `eslint-config-next`     | `postinstall: napi-postinstall unrs-resolver 1.11.1 check` |

What the scripts do, read from the installed packages under
`node_modules/.pnpm/<name>@<version>/node_modules/<name>/` rather than from their READMEs:

- **esbuild** resolves its native binary from the platform package pnpm installs as an optional
  dependency (`@esbuild/darwin-x64`, `@esbuild/linux-x64`, ...), hard-links that binary over the
  JavaScript `bin/esbuild` wrapper so the CLI starts a few milliseconds faster, and runs
  `esbuild --version` to check the binary matches the package. Only when no platform package is
  present does it download one with npm. Vite and Vitest call the JavaScript API, which finds the
  binary the same way at runtime and never goes through `bin/esbuild`.
- **sharp** declares `install: node install/check.js || npm run build`. `check.js` exits 0 and does
  nothing unless a global libvips at or above 8.17.3 is found through `pkg-config`, or
  `npm_config_build_from_source` is set; in those two cases it exits 1, so the `||` runs
  `npm run build`, a from-source compile with node-gyp. `build.js` requires `node-addon-api` and
  `node-gyp`, which sharp does not declare as dependencies, so under pnpm's isolated layout it stops
  with "Please add node-addon-api to your dependencies" and exit code 1. That branch was read, not
  reproduced: no machine this was checked on has a global libvips. In every other case
  `require('sharp')` loads the prebuilt `@img/sharp-<platform>` and `@img/sharp-libvips-<platform>`
  packages, script or no script. As of this record nothing in `apps/web` uses `next/image`, `<img>`
  or `ImageResponse`, so Next does not load sharp at all today; the decision below does not depend
  on that staying true.
- **unrs-resolver** runs `napi-postinstall` in check mode: it verifies that the
  `@unrs/resolver-binding-<platform>` package for the current platform can be resolved, and if it
  cannot, installs one with `npm install` into a temporary directory or downloads the tarball from
  the registry.

So on every platform this repository builds on (macOS for development, `ubuntu-latest` in CI,
Vercel's Linux x64 build image) all three scripts either do nothing or do work that has no effect on
how the package is loaded. The lockfile already names the platform packages and pnpm checks their
integrity hashes; the scripts are fallbacks for installs that skipped optional dependencies.

## Decision

Deny the three scripts in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: false
  sharp: false
  unrs-resolver: false
```

`allowBuilds` arrived in [pnpm 10.26](https://pnpm.io/blog/releases/10.26), is the map
[`pnpm approve-builds`](https://pnpm.io/cli/approve-builds) writes (`true` for an approved package,
`false` for a denied one), and is the only form [pnpm 11](https://pnpm.io/blog/releases/11.0)
keeps, having removed `onlyBuiltDependencies`, `neverBuiltDependencies` and
`ignoredBuiltDependencies`. Every install this repository runs is on pnpm 10.33.0, above that
floor: the local pin through Corepack, CI through `pnpm/action-setup`, and Vercel, which resolves
the version from `packageManager` too. pnpm 10.33 does not record the setting in `pnpm-lock.yaml`:
a frozen install after the change passed with the lockfile unchanged.

The entries are unversioned on purpose, with the reviewed version in the comment above each one. A
Dependabot bump of esbuild or sharp keeps the denial, because the reasoning is about what the
scripts are for, not about a particular release. The comment is what the reviewer of a
major-version bump compares against, since a changed install script produces no new signal for a
denied package.

One pnpm behaviour shapes the rest of this record. pnpm writes the builds it skipped into
`node_modules/.modules.yaml`, and on the next install it adds every stored entry that is still in
the lockfile back to the list it reports, after the point where `allowBuilds` was applied (read in
the pnpm 10.33 bundle, and reproduced: install without the setting, add it, install again, and the
box is printed although the install exits 0; recreate `node_modules` and it is silent). So a
`node_modules` older than the entries keeps printing the box, on a developer machine and in
Vercel's build cache alike, until `pnpm clean && pnpm install` locally, a redeploy without the
build cache on Vercel, or a version bump that drops the stored entries out of the lockfile. The
warning is stale in that case, not a new decision.

That behaviour is also why `strictDepBuilds`, which replaces the box with
`ERR_PNPM_IGNORED_BUILDS` and exit code 1 for any undecided package, is not enabled. An earlier
revision of this change had it, and two Vercel preview deployments
(`dpl_DXD3pDThRiUmAuxR1XLAmMLX6WsB`, `dpl_39QmykvP5wyWLZZhQs3HrYzembJ2`) failed at the install step
with that error for all three packages, because Vercel restored a `node_modules` from before the
setting; every checkout older than the setting would have failed the same way after the merge. The
same branch without `strictDepBuilds` built (`Done in 1.2s using pnpm v10.33.0`, box printed,
status Ready). Strict mode is worth revisiting once every `node_modules` this repository builds
against has been recreated with the entries in place; it is one line, and the enforcement the rule
below lacks.

The rule from here on: a new `Ignored build scripts` line naming a package without an entry is a
new decision, not noise. Find the package with `pnpm ignored-builds` and `pnpm why -r <name>`,
read its `scripts` in `node_modules/.pnpm/<name>@<version>/node_modules/<name>/package.json` and
the files they run, then add the package to `allowBuilds` as `true` or `false` with a comment
saying why. `pnpm approve-builds` in pnpm 10.33 is interactive and `--all` approves everything
pending; neither replaces reading the script. pnpm rewrites `pnpm-workspace.yaml` through the
`yaml` library's document API, so the comments survive if the command is used.

## Consequences

### Positive

- `pnpm install --frozen-lockfile` is quiet on a clean checkout, in CI, and on Vercel once its
  build cache has been recreated, so the next package with a lifecycle script is visible instead of
  one more line in a box everyone has learned to skip.
- An install runs no dependency lifecycle scripts at all, which is the point of pnpm 10's default:
  the install-time supply-chain surface of these three packages is gone. The root `prepare` script
  still runs husky, but that is the repository's own script, not a dependency's.
- A machine with a Homebrew libvips does not compile sharp from source, or fail trying, on behalf of
  a package the site does not call.
- The choice sits in a file that takes comments and is reviewed like code. Approving a script later
  is a one-line change in the same place.

### Trade-offs

- esbuild's install-time version check does not run. A binary that does not match the package would
  surface at first use, with esbuild's own error, instead of at install. `bin/esbuild` stays the
  JavaScript wrapper; only direct CLI invocations pay the few milliseconds.
- On a platform none of the three publishes a binary for, the fallbacks that would have downloaded
  or compiled one do not run and the first use fails. No such platform is in use; the fix would be
  to flip that package to `true`, not to drop the setting.
- If the site adopts `next/image` with self-hosted optimisation, sharp is loaded from the same
  prebuilt package and the denial still holds; only a deliberate from-source build would change it.
- A `node_modules` from before this change keeps printing the box until it is recreated, as
  described above. The first Vercel build after the merge will show it too, until a redeploy
  without the build cache or a bump of those packages.
- Nothing enforces the rule for the next package: a warning in a CI log nobody reads is a weak
  signal, and `strictDepBuilds` is deferred for the reason above.
- A denied package whose install script changes purpose in a later release produces no new signal.
  None of the three appears in a workspace manifest, so Dependabot raises no version-update pull
  request for them; their versions move only when a parent such as `next`, `vite` or
  `eslint-config-next` moves, whether that arrives in the `minor-and-patch` group or, for a major,
  on its own. The reviewed versions in the comments are the only mitigation.
- A pnpm older than 10.26 does not understand `allowBuilds`, so on such a machine the warning would
  be back and nothing else would change. `packageManager` and Corepack make that a local mistake.

## Alternatives considered

**Approve all three (`pnpm approve-builds --all`).** Silences the warning by running the scripts.
Rejected: on every supported platform the scripts have nothing to do, and sharp's would turn a
global libvips into a failed install. Approving code to run at install time because it is easier
than reading it is the habit pnpm 10's default exists to break.

**Approve esbuild only.** The one script with a real check, the version validation. Rejected: the
lockfile's integrity hashes already guard against a wrong or corrupted platform package, and a
mismatch fails loudly at the first `vite build` or `vitest run` rather than silently.

**`strictDepBuilds: true` alongside the entries.** Tried and reverted, as described in the
decision: pnpm merges the stale list from an existing `node_modules` back in unfiltered, so strict
mode fails every checkout and build cache older than the entries. Deferred until those have been
recreated.

**The pnpm 10 lists (`ignoredBuiltDependencies`, or `pnpm.ignoredBuiltDependencies` in
`package.json`).** Same effect in pnpm 10.33, the `package.json` field understood from
pnpm 10.1 and the `pnpm-workspace.yaml` list from 10.5, with the same stale-list behaviour. Rejected
because pnpm 11 removed them in favour of
`allowBuilds`, `pnpm approve-builds` already writes `allowBuilds` in 10.33, and `package.json`
cannot carry the comment that explains each entry.

**Skip sharp entirely with `ignoredOptionalDependencies`.** sharp is an optional dependency of
`next`, so pnpm could leave it and its `@img/*` platform packages out of the install. Rejected: it
saves a handful of cached packages and removes the image optimiser Next needs under `next start`
the day `next/image` is used, which the CI end-to-end job would then be the first to hit.

**Remove the packages.** Not possible without removing the tools that need them: sharp comes with
`next`, esbuild with `vite`, unrs-resolver with `eslint-config-next`.

## Corrections

### 2026-09-10

An independent review of the merged commit found two false claims. Both sit outside `## Decision`,
neither changes which option the decision selects, and no new guidance is introduced by fixing them.
Corrected under [ADR 0011](0011-correcting-accepted-records.md).

**A mitigation that cannot fire**, in `### Trade-offs`. The record read: "The reviewed versions in
the comments and the major-version review are the mitigation; Dependabot groups only minor and patch
updates, so a major arrives as its own pull request." It now reads: "None of the three appears in a
workspace manifest, so Dependabot raises no version-update pull request for them; their versions
move only when a parent such as `next`, `vite` or `eslint-config-next` moves, whether that arrives
in the `minor-and-patch` group or, for a major, on its own. The reviewed versions in the comments
are the only mitigation." What was wrong: the grouping claim is true of Dependabot but was offered
as
the mechanism that surfaces a changed script _in a denied package_, and no such pull request is ever
raised. Evidence: none of `esbuild`, `sharp` or `unrs-resolver` appears in the root,
`apps/web`, `apps/playground` or `packages/*` manifests, and `pnpm why -r <name>` reaches each
only through `vite`, `next` and `eslint-import-resolver-typescript` respectively; Dependabot's npm
version updates act on manifests. Security updates are a separate path that can target a transitive
package directly, and are not what the trade-off was describing.

**A version floor that was too high**, in `## Alternatives considered`. The record read: "Same
effect in pnpm 10.33 and understood from pnpm 10.12 (10.4.1 ignores them)". It now reads: "Same
effect in pnpm 10.33, the `package.json` field understood from pnpm 10.1 and the
`pnpm-workspace.yaml` list from 10.5". What was wrong: the sentence names two forms and gave one
floor for both, and that floor was the upper bracket of a two-point test (10.4.1 and 10.12.1) rather
than a boundary. Evidence:
[pnpm 10.1.0](https://github.com/pnpm/pnpm/releases/tag/v10.1.0) added the
`pnpm.ignoredBuiltDependencies` field, and
[pnpm 10.5.0](https://github.com/pnpm/pnpm/releases/tag/v10.5.0) moved the `pnpm.*` settings into
`pnpm-workspace.yaml`, using `onlyBuiltDependencies` as its worked example.

`## Decision` is left exactly as written, as ADR 0011 requires. It says "The comment is what the
reviewer of a major-version bump compares against", which is defensible only because a parent's
major does arrive as its own pull request; the corrected trade-off above is the accurate account of
when a denied package's version moves.

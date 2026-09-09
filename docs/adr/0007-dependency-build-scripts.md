# 0007. Dependency build scripts stay disabled

## Status

Accepted

## Date

2026-09-09

## Context

pnpm 10 does not run the `preinstall`, `install` and `postinstall` scripts of dependencies unless a
package is allowed by name ([ADR 0002](0002-monorepo-toolchain.md) pins `pnpm@10.33.0`). With
nothing allowed or denied, every `pnpm install --frozen-lockfile` on a clean checkout ended with the
same box: under pnpm 10.33.0 locally, in both CI jobs (which install pnpm from `packageManager`
through `pnpm/action-setup`), and in the first Vercel production build of `main` on 2026-09-09:

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

Deny the three scripts and make an undecided script an error, both in `pnpm-workspace.yaml`:

```yaml
strictDepBuilds: true
ignoredBuiltDependencies:
  - esbuild
  - sharp
  - unrs-resolver
```

`ignoredBuiltDependencies` is the pnpm 10 list for denied packages, `onlyBuiltDependencies` its
counterpart for approved ones, and `strictDepBuilds`
([settings reference](https://pnpm.io/settings)) replaces the warning box with
`ERR_PNPM_IGNORED_BUILDS`, exit code 1, for any package that has a lifecycle script and sits in
neither list. pnpm 10.33 records none of the three in `pnpm-lock.yaml`: a frozen install after the
change passed with the lockfile unchanged.

The newer form of the same decision is the `allowBuilds` map, added in
[pnpm 10.26](https://pnpm.io/blog/releases/10.26), written by
[`pnpm approve-builds`](https://pnpm.io/cli/approve-builds) (`true` for approved, `false` for
denied), and the only form [pnpm 11](https://pnpm.io/blog/releases/11.0) keeps. It is not used
here because Vercel does not build with the pinned pnpm. The first version of this change used
`allowBuilds`, and its preview deployment failed at the install step:

```
Detected `pnpm-lock.yaml` version 9 generated by pnpm@10.x from package.json#packageManager pnpm@10.33.0
Running "install" command: `pnpm install --frozen-lockfile`...
 ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.27.2, sharp@0.34.5, unrs-resolver@1.11.1
```

Vercel takes the pnpm major from the lockfile and `packageManager` and runs its own bundled 10.x
release, which understood `strictDepBuilds` but not `allowBuilds`, so all three packages counted as
undecided. Vercel only runs the exact `packageManager` version when the project sets
`ENABLE_EXPERIMENTAL_COREPACK=1` ([Vercel docs](https://vercel.com/docs/package-managers)), which
this project does not. ADR 0002 assumed the pin reached Vercel; it reaches the major only. The two
lists are understood by every release in use: pnpm 10.4.1 knows neither setting (a clean install
printed the box and exited 0), pnpm 10.12.1 knows both (silent, exit 0), and Vercel's release,
CI's 10.33.0 and the local pin all sit above that floor.

The entries are unversioned on purpose, with the reviewed version in the comment above each one. A
Dependabot bump of esbuild or sharp keeps the denial, because the reasoning is about what the
scripts are for, not about a particular release. The comment is what the reviewer of a
major-version bump compares against, since a changed install script produces no new signal for a
denied package.

The rule from here on: an install that fails with `ERR_PNPM_IGNORED_BUILDS` is a new decision, not
an obstacle. Find the package with `pnpm ignored-builds` and `pnpm why -r <name>`, read its
`scripts` in `node_modules/.pnpm/<name>@<version>/node_modules/<name>/package.json` and the files
they run, then add the package to `ignoredBuiltDependencies` or `onlyBuiltDependencies` with a
comment saying why. `pnpm approve-builds` in pnpm 10.33 is interactive and `--all` approves
everything pending; neither replaces reading the script. pnpm rewrites `pnpm-workspace.yaml` through
the `yaml` library's document API, so the comments survive if the command is used, but in 10.33 it
writes `allowBuilds`, which Vercel would ignore.

## Consequences

### Positive

- `pnpm install --frozen-lockfile` is quiet on a clean checkout, in CI and on Vercel, and a new
  package with a lifecycle script fails the install instead of adding a line to a box everyone has
  learned to skip. The Vercel failure above is that mechanism working: a warning-only setting
  would have hidden that Vercel ignored `allowBuilds`.
- An install runs no dependency lifecycle scripts at all, which is the point of pnpm 10's default:
  the install-time supply-chain surface of these three packages is gone. The root `prepare` script
  still runs husky, but that is the repository's own script, not a dependency's.
- A machine with a Homebrew libvips does not compile sharp from source, or fail trying, on behalf of
  a package the site does not call.
- The choice sits in a file that takes comments and is reviewed like code. Approving a script later
  is a one-line move to the other list.

### Trade-offs

- esbuild's install-time version check does not run. A binary that does not match the package would
  surface at first use, with esbuild's own error, instead of at install. `bin/esbuild` stays the
  JavaScript wrapper; only direct CLI invocations pay the few milliseconds.
- On a platform none of the three publishes a binary for, the fallbacks that would have downloaded
  or compiled one do not run and the first use fails. No such platform is in use; the fix would be
  to move that package to `onlyBuiltDependencies`, not to drop the setting.
- If the site adopts `next/image` with self-hosted optimisation, sharp is loaded from the same
  prebuilt package and the denial still holds; only a deliberate from-source build would change it.
- A Dependabot pull request that brings in a package with a lifecycle script fails CI until an
  entry exists. That is the intended forcing function, but the entry has to reach `main` (or be
  pushed to the Dependabot branch) before that pull request can merge.
- A denied package whose install script changes purpose in a later release produces no new signal.
  The reviewed versions in the comments and the major-version review are the mitigation; Dependabot
  groups only minor and patch updates, so a major arrives as its own pull request.
- pnpm 11 removed both lists in favour of `allowBuilds`. Raising the pin to 11 will fail the install
  with `ERR_PNPM_IGNORED_BUILDS` until the entries move to `allowBuilds`, and that move only works
  once Vercel builds with the pinned pnpm (Corepack enabled on the project) or its bundled release
  has caught up. The failure is loud, which is what `strictDepBuilds` is for.
- A pnpm older than the floor above ignores both settings and prints the warning again; nothing
  breaks. `packageManager` and Corepack make that a local mistake.

## Alternatives considered

**Approve all three (`pnpm approve-builds --all`).** Silences the warning by running the scripts.
Rejected: on every supported platform the scripts have nothing to do, and sharp's would turn a
global libvips into a failed install. Approving code to run at install time because it is easier
than reading it is the habit pnpm 10's default exists to break.

**Approve esbuild only.** The one script with a real check, the version validation. Rejected: the
lockfile's integrity hashes already guard against a wrong or corrupted platform package, and a
mismatch fails loudly at the first `vite build` or `vitest run` rather than silently.

**`allowBuilds`, the pnpm 10.26+ map.** The forward-compatible form and the first one tried.
Rejected for now because Vercel's bundled pnpm ignores it, as the failed preview deployment above
shows. It becomes the right form the day Vercel builds with the pinned pnpm; `pnpm approve-builds`
then migrates the lists.

**Enable Corepack on the Vercel project first.** `ENABLE_EXPERIMENTAL_COREPACK=1` would make Vercel
run pnpm 10.33.0 from `packageManager`, which also closes the gap ADR 0002 assumed away. Not done in
this change because it is a Vercel project setting outside the repository, and the lists work
without it; it is the recorded follow-up.

**`pnpm.ignoredBuiltDependencies` in `package.json`.** Same setting, different file. Rejected
because `package.json` cannot carry the comment that explains each entry.

**Deny the three but keep the warning for the next one.** The smaller change, and it would never
block a Dependabot pull request. Rejected because a warning in a CI log nobody reads is not a
signal, and locally the box only prints on the install that first links the package, so the "new
decision" rule above would have had no enforcement.

**Skip sharp entirely with `ignoredOptionalDependencies`.** sharp is an optional dependency of
`next`, so pnpm could leave it and its `@img/*` platform packages out of the install. Rejected: it
saves a handful of cached packages and removes the image optimiser Next needs under `next start`
the day `next/image` is used, which the CI end-to-end job would then be the first to hit.

**Remove the packages.** Not possible without removing the tools that need them: sharp comes with
`next`, esbuild with `vite`, unrs-resolver with `eslint-config-next`.

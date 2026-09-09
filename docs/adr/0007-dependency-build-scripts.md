# 0007. Dependency build scripts stay disabled

## Status

Accepted

## Date

2026-09-09

## Context

pnpm 10 does not run the `preinstall`, `install` and `postinstall` scripts of dependencies unless a
package is allowed by name ([ADR 0002](0002-monorepo-toolchain.md) pins `pnpm@10.33.0`). With
nothing allowed or denied, every `pnpm install --frozen-lockfile` on a clean checkout, locally, in
CI and in the Vercel build, ended with the same box:

```
Ignored build scripts: esbuild@0.27.2, sharp@0.34.5, unrs-resolver@1.11.1.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Nothing was broken by it: the 2026-09-09 production build on Vercel and every local build passed
with the scripts skipped. But the warning was a decision nobody had taken, printed on every install,
and the day a fourth package joined the list nobody would have noticed. None of the three is a
direct dependency; each arrives through a tool the repository does need:

| Package                | Pulled in by                                                          | Script                                                     |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `esbuild@0.27.2`       | `vite`, used by Vitest in `apps/web` and by Vite in `apps/playground` | `postinstall: node install.js`                             |
| `sharp@0.34.5`         | `next`, as an optional dependency for `next/image` optimisation       | `install: node install/check.js \|\| npm run build`        |
| `unrs-resolver@1.11.1` | `eslint-import-resolver-typescript`, through `eslint-config-next`     | `postinstall: napi-postinstall unrs-resolver 1.11.1 check` |

What the scripts do, read from the installed packages rather than their READMEs:

- **esbuild** resolves its native binary from the platform package pnpm installs as an optional
  dependency (`@esbuild/darwin-x64`, `@esbuild/linux-x64`, ...), hard-links that binary over the
  JavaScript `bin/esbuild` wrapper so the CLI starts a few milliseconds faster, and runs
  `esbuild --version` to check the binary matches the package. Only when no platform package is
  present does it download one with npm. Vite and Vitest call the JavaScript API, which finds the
  binary the same way at runtime and never goes through `bin/esbuild`.
- **sharp** runs `install/check.js`, which exits 0 and does nothing unless a global libvips at or
  above 8.17.3 is found through `pkg-config`, or `npm_config_build_from_source` is set. In those two
  cases it hands over to `npm run build`, a from-source compile with node-gyp that needs
  `node-addon-api`, `node-gyp`, Python and a C++ toolchain, and fails without them. Otherwise the
  prebuilt `@img/sharp-<platform>` and `@img/sharp-libvips-<platform>` packages are used, script or
  no script. `apps/web` has no `next/image`, `<img>` or `ImageResponse` usage, so Next never loads
  sharp at all.
- **unrs-resolver** runs `napi-postinstall` in check mode: it verifies that the
  `@unrs/resolver-binding-<platform>` package for the current platform can be resolved, and if it
  cannot, installs one with `npm install` into a temporary directory or downloads the tarball from
  the registry.

So on every platform this repository builds on (macOS for development, `ubuntu-latest` in CI,
Vercel's Linux x64 build image) all three scripts either do nothing or do work that has no effect on
how the package is loaded. The lockfile already names the platform packages and pnpm checks their
integrity hashes; the scripts are fallbacks for installs that skipped optional dependencies.

## Decision

Deny build scripts for all three packages in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: false
  sharp: false
  unrs-resolver: false
```

`allowBuilds` was added in pnpm 10.26 and is the setting `pnpm approve-builds` writes (`true` for an
approved package, `false` for a denied one); pnpm 11 removes `onlyBuiltDependencies`,
`neverBuiltDependencies` and `ignoredBuiltDependencies` in its favour. The entries are unversioned
on purpose: a Dependabot bump of esbuild or sharp keeps the denial, because the reasoning is about
what the scripts are for, not about a particular release. pnpm 10.33 does not record build approvals
in `pnpm-lock.yaml`, so the lockfile is untouched by this decision.

The rule from here on: a new `Ignored build scripts` line is a new decision, not noise. Read the
script in `node_modules`, then add the package to `allowBuilds` as `true` or `false` and say why in
the comment above it or in a record that supersedes this one. `pnpm approve-builds` is interactive
and `pnpm approve-builds --all` approves everything pending; neither replaces reading the script.

## Consequences

### Positive

- `pnpm install --frozen-lockfile` is quiet again on a clean checkout, in CI and on Vercel, so the
  next warning is visible instead of one more line in a box everyone has learned to skip.
- An install runs no code from dependencies at all, which is the point of pnpm 10's default: the
  install-time supply-chain surface of these three packages is gone.
- A machine with a Homebrew libvips does not compile sharp from source, or fail trying, on behalf of
  a package the site never calls.
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
- A pnpm older than 10.26 does not understand `allowBuilds`, so on such a machine the warning would
  be back. `packageManager` and Corepack make that a local mistake; CI and Vercel use the pin.

## Alternatives considered

**Approve all three (`pnpm approve-builds --all`).** Silences the warning by running the scripts.
Rejected: on every supported platform the scripts have nothing to do, and sharp's would turn a
global libvips into a failed install. Approving code to run at install time because it is easier
than reading it is the habit pnpm 10's default exists to break.

**Approve esbuild only.** The one script with a real check, the version validation. Rejected: the
lockfile's integrity hashes already guard against a wrong or corrupted platform package, and a
mismatch fails loudly at the first `vite build` or `vitest run` rather than silently.

**The legacy lists (`ignoredBuiltDependencies`, or `pnpm.ignoredBuiltDependencies` in
`package.json`).** Same effect in pnpm 10.33. Rejected because pnpm 11 removes them in favour of
`allowBuilds`, and `package.json` cannot carry the comment that explains the choice.

**`strictDepBuilds: true`.** Turns an undecided build script into an install failure instead of a
warning, so a new native dependency cannot reach `main` without a decision. Deferred rather than
rejected: it would also fail every Dependabot pull request that brings one in until someone edits
`pnpm-workspace.yaml`, and the warning is enough signal while the list has three entries. Revisit
if a fourth package slips through unnoticed.

**Remove the packages.** Not possible without removing the tools that need them: sharp comes with
`next`, esbuild with `vite`, unrs-resolver with `eslint-config-next`.

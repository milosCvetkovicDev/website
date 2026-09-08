# 0003. Formatting and linting standards

## Status

Accepted

## Date

2026-09-08

## Context

`packages/prettier-config` was added on 2026-02-23, four weeks after the monorepo was created, and
no workspace ever referenced it. It declares single quotes, a 100 column print width, trailing
commas (`es5` then, `all` now) and the Tailwind class sorter. There was no `prettier.config.*` and
no `.prettierrc` anywhere, so the root `format` script (then
`prettier --write "**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,css}"`) ran Prettier with its built-in
defaults: double quotes at 80 columns.

Two consequences followed.

- A 59 file reformat sat uncommitted in the working tree for five months. It was pure churn
  produced by running a default-configured formatter over a codebase no configured formatter had
  ever touched. It could not be reviewed usefully and could not be dropped without losing the four
  files that carried real changes in the same working tree.
- The churn was guaranteed to recur. Editors formatting on save and the next `pnpm format` would
  disagree with each other for as long as the intended configuration and the executed
  configuration diverged.

Linting had the same shape of problem. ESLint ran without `--max-warnings 0`, so warnings were
printed and ignored. By the time this decision was taken, `main` carried seven errors and eight
warnings. Every one of the seven errors was a React Hooks v7 rule: six
`react-hooks/set-state-in-effect` and one `react-hooks/immutability`. The warnings were seven
`@typescript-eslint/no-unused-vars` and one `react-hooks/exhaustive-deps`. A gate that cannot fail
is not a gate. The seven errors are the subject of
[ADR 0006](0006-hydration-safe-client-state.md).

## Decision

**`@repo/prettier-config` is the single source of truth for formatting.** It is referenced by two
thin config files, one a bare re-export and one a re-export with a single addition:

| File                           | Content                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `prettier.config.mjs`          | `import config from '@repo/prettier-config'; export default config;` |
| `apps/web/prettier.config.mjs` | The same, spread, plus `tailwindStylesheet: './src/app/globals.css'` |

Wiring the package also moved `trailingComma` from `'es5'` to `'all'`, the Prettier 3 default, so
the one-off reformat encodes a configuration change as well as the first application of the shared
style.

The web override exists because Tailwind v4 has no `tailwind.config.js`. The class sorter needs the
CSS entry point to read the project's theme and custom variants, and that path is relative to the
config file, so it cannot live in the shared package.

**The Tailwind plugin path is resolved inside the shared package**, not named as a string:

```js
plugins: [fileURLToPath(import.meta.resolve('prettier-plugin-tailwindcss'))];
```

Prettier resolves plugin names relative to the config file that names them. Under pnpm's strict
`node_modules` layout, a consumer cannot see a package it does not itself depend on, so a bare
`'prettier-plugin-tailwindcss'` in the shared config would fail to resolve from the root and from
`apps/web`. Resolving to an absolute path inside the package that owns the dependency makes the
consumers' `devDependencies` list `@repo/prettier-config` and nothing else. `apps/playground`
declares neither, and inherits the root `prettier.config.mjs` by Prettier's upward config lookup.

**Linting fails on warnings.** Both apps run ESLint with `--max-warnings 0` (`eslint
--max-warnings 0` in `apps/web`, `eslint . --max-warnings 0` in `apps/playground`), so a warning
costs the same as an error and cannot accumulate. (`lint:fix` deliberately omits the flag so it can
rewrite files without exiting non-zero part way through a fix; `lint` and the lint-staged blocks
carry it.) Findings are fixed structurally rather than suppressed. Two exceptions survive, both
`// eslint-disable-next-line @typescript-eslint/no-explicit-any` on the `ref` casts in
`apps/web/src/components/animated-hero/animated-text.tsx`, where the polymorphic `Tag` element has
no sound ref type. `eslint-disable` is never an acceptable answer to a React Hooks finding (see
[ADR 0006](0006-hydration-safe-client-state.md)).

**Both gates run on staged files, with a lint-staged config per package.** ESLint 9 resolves its
flat config from the current working directory, not from the file being linted, and there is no
`eslint.config.*` at the repository root, so `eslint` invoked from the root finds no config at all.
lint-staged runs each block from the directory of the `package.json` that declares it, so each app
carries its own block running `eslint --fix --max-warnings 0` then `prettier --write` with the
working directory set to that app. The root block runs Prettier only, and covers the files that
belong to no app: workspace configs, `docs/**`, `.github/**`. `.husky/pre-commit` invokes
`pnpm exec lint-staged`, which picks the nearest config.

A third enforcement point exists for agent-authored code. The `PostToolUse` hook in
`.claude/settings.json` runs `prettier --write` on every file Claude Code writes, so agent output
is formatted before it is ever staged.

**Editors are pointed at the same config.** `.editorconfig` fixes charset, LF line endings,
two-space indent, final newline and trailing whitespace for any editor that reads it.
`.vscode/settings.json` sets `esbenp.prettier-vscode` as the default formatter with `formatOnSave`,
runs `source.fixAll.eslint` on save, and sets `eslint.workingDirectories: [{ "mode": "auto" }]` so
the editor resolves the same per-app flat config lint-staged does. `.vscode/extensions.json`
recommends both extensions. Without this, the format-on-save divergence named above would survive
everything else in this decision.

**`format` walks the tree, not a glob.** The scripts became `prettier --write .` and
`prettier --check .`, with `.prettierignore` as the only exclusion list. A glob of extensions
silently skips any file type nobody remembered to add; an ignore file fails loudly instead.

**CI repeats the format check over the whole tree and the lint check over both apps**,
`pnpm format:check` then `pnpm lint` in the `quality` job, so a bypassed hook is caught before
merge. The asymmetry is deliberate but worth naming: `pnpm lint` is `turbo lint`, and only `web`
and `playground` declare a `lint` script, so the three config packages and the root-level config
files are formatted but never linted. `.prettierignore` keeps generated output (`node_modules`,
`.pnpm-store`, `.next`, `.turbo`, `dist`, `out`, `coverage`, `test-results`, `playwright-report`,
`pnpm-lock.yaml`, `next-env.d.ts`, `*.tsbuildinfo`) and machine-local files out of `pnpm format`
and `pnpm format:check`. It has no effect on ESLint.

## Consequences

### Positive

- Formatting is decided in one file, `packages/prettier-config/index.js`. Changing the print width
  is a one line change that every workspace picks up.
- Tailwind class order is mechanical, which removes a recurring category of review noise.
- The lint bar cannot erode quietly. A new warning in either app fails the commit and fails CI.
- Reformats are no longer a possible source of large diffs, because the tree is already in the
  shared package's style and CI keeps it there.

### Trade-offs

- The 59 file reformat still had to land once. It was committed as a separate formatting-only
  change so that later diffs stay readable.
- Contributors must let the tooling format. Fighting the shared config produces failing commits
  rather than a debate.
- `@repo/eslint-config` exists but is referenced by no workspace. ESLint configuration is still
  per app (`apps/web/eslint.config.mjs` composes `eslint-config-next`;
  `apps/playground/eslint.config.js` composes `@eslint/js`, `typescript-eslint` and the React
  plugins). Sharing ESLint rules the way Prettier rules are shared is deliberately left for a later
  change, because merging a shared base with `eslint-config-next` risks duplicate plugin
  registration. See [ADR 0002](0002-monorepo-toolchain.md) for the workspace layout and
  [ADR 0004](0004-ci-pipeline-and-quality-gates.md) for the CI jobs these gates run in.
- The `tailwindStylesheet` path is duplicated knowledge: moving `globals.css` requires updating
  `apps/web/prettier.config.mjs`.

## Alternatives considered

- **Keep the bare `'prettier-plugin-tailwindcss'` string and add the plugin to the root and
  `apps/web` `devDependencies`.** The cheapest fix, and it would work. Rejected because it puts the
  plugin's version in three manifests instead of one, and a consumer that forgets it gets unsorted
  classes with no error rather than a resolution failure.
- **A copy of the Prettier config in each app.** Removes the plugin resolution problem, but
  reintroduces drift, which is precisely the failure this ADR responds to.
- **No shared package, one root config only.** Simpler, but `apps/web` needs `tailwindStylesheet`
  and the playground does not, so a single root file cannot serve both without pulling web specific
  paths into the root.
- **Biome instead of Prettier and ESLint.** One fast binary and one config. Rejected because
  `eslint-config-next` encodes the Next.js and React Hooks rules this codebase actually needed (all
  seven errors on `main` were Hooks violations), and there is no equivalent ruleset. Prettier also
  has the Tailwind class sorter.
- **Formatting checked only in CI, no pre-commit hook.** Cheaper locally, but it moves the feedback
  to after the push and leaves the working tree free to drift between commits, which is how five
  months of unreviewable churn accumulated in the first place.

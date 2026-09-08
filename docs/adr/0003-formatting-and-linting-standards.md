# 0003. Formatting and linting standards

## Status

Accepted

## Date

2026-09-08

## Context

`packages/prettier-config` has existed since the monorepo was created. It declares single quotes, a
100 column print width, trailing commas and the Tailwind class sorter. No workspace referenced it.
There was no `prettier.config.*` and no `.prettierrc` anywhere, so the root `format` script
(`prettier --write .`) ran Prettier with its built-in defaults: double quotes at 80 columns.

Two consequences followed.

- A 59 file reformat sat uncommitted in the working tree for five months. It was pure churn
  produced by running a default-configured formatter over a codebase written in the shared
  package's style. It could not be reviewed usefully and could not be dropped without losing the
  few real changes tangled into the same working tree.
- The churn was guaranteed to recur. Editors formatting on save and the next `pnpm format` would
  disagree with each other for as long as the intended configuration and the executed
  configuration diverged.

Linting had the same shape of problem. ESLint ran without `--max-warnings 0`, so warnings were
printed and ignored. By the time this decision was taken, `main` carried ten errors (mostly React
Hooks v7 violations) and ten warnings. A gate that cannot fail is not a gate.

## Decision

**`@repo/prettier-config` is the single source of truth for formatting.** It is referenced by two
thin config files that do nothing but re-export it:

| File                           | Content                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `prettier.config.mjs`          | `import config from '@repo/prettier-config'; export default config;` |
| `apps/web/prettier.config.mjs` | The same, spread, plus `tailwindStylesheet: './src/app/globals.css'` |

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
consumers' `devDependencies` list `@repo/prettier-config` and nothing else.

**Linting fails on warnings.** Both apps run ESLint with `--max-warnings 0` (`eslint
--max-warnings 0` in `apps/web`, `eslint . --max-warnings 0` in `apps/playground`), so a warning
costs the same as an error and cannot accumulate. Findings are fixed, not suppressed.

**Both gates run on staged files, with a lint-staged config per package.** ESLint flat config
resolves from the directory of the file being linted, so each app carries its own block running
`eslint --fix --max-warnings 0` then `prettier --write`. The root block runs Prettier only, and
covers the files that belong to no app: workspace configs, `docs/**`, `.github/**`. `.husky/pre-commit`
invokes `pnpm exec lint-staged`, which picks the nearest config.

**CI repeats both checks over the whole tree**, `pnpm format:check` then `pnpm lint` in the
`quality` job, so a bypassed hook is caught before merge. `.prettierignore` keeps generated output
(`.next`, `.turbo`, `dist`, `coverage`, `playwright-report`, `pnpm-lock.yaml`, `next-env.d.ts`) out
of both.

## Consequences

### Positive

- Formatting is decided in one file, `packages/prettier-config/index.js`. Changing the print width
  is a one line change that every workspace picks up.
- Tailwind class order is mechanical, which removes a recurring category of review noise.
- The lint bar cannot erode quietly. A new warning fails the commit and fails CI.
- Reformats are no longer a possible source of large diffs, because the tree is already in the
  shared package's style and CI keeps it there.

### Trade-offs

- The 59 file reformat still had to land once. It was committed as a separate formatting-only
  change so that later diffs stay readable.
- Contributors must let the tooling format. Fighting the shared config produces failing commits
  rather than a debate.
- `@repo/eslint-config` exists but is referenced by no workspace. ESLint configuration is still
  per app (`apps/web/eslint.config.mjs` composes `eslint-config-next`; `apps/playground/eslint.config.js`
  composes `@eslint/js`, `typescript-eslint` and the React plugins). Sharing ESLint rules the way
  Prettier rules are shared is deliberately left for a later change, because merging a shared base
  with `eslint-config-next` risks duplicate plugin registration.
- The `tailwindStylesheet` path is duplicated knowledge: moving `globals.css` requires updating
  `apps/web/prettier.config.mjs`.

## Alternatives considered

- **A copy of the Prettier config in each app.** Removes the plugin resolution problem, but
  reintroduces drift, which is precisely the failure this ADR responds to.
- **No shared package, one root config only.** Simpler, but `apps/web` needs `tailwindStylesheet`
  and the playground does not, so a single root file cannot serve both without pulling web specific
  paths into the root.
- **Biome instead of Prettier and ESLint.** One fast binary and one config. Rejected because
  `eslint-config-next` encodes the Next.js and React Hooks rules this codebase actually needed
  (the ten errors on `main` were Hooks violations), and there is no equivalent ruleset. Prettier
  also has the Tailwind class sorter.
- **Formatting checked only in CI, no pre-commit hook.** Cheaper locally, but it moves the
  feedback to after the push and leaves the working tree free to drift between commits, which is
  how five months of unreviewable churn accumulated in the first place.

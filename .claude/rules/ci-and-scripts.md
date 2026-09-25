---
paths:
  - '.github/workflows/**'
  - 'scripts/*.{mjs,ts,sh}'
  - 'scripts/package.json'
  - 'scripts/tsconfig.json'
  - 'turbo.json'
---

# CI, branch protection, commit linting and the root scripts

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Architecture

- `scripts/` at the repository root holds the scripts that run outside the apps:
  `check-allowbuilds-drift.mjs` (`pnpm check:allowbuilds`), `vercel-ignore-build.mjs` (Vercel's
  ignored build step, ADR 0016), `check-webserver-log.mjs` (the `e2e` job's server-log check),
  `check-docs-drift.ts` (`pnpm check:docs-drift`, TypeScript that Node 22 runs directly),
  `docs-drift-patch.mjs` (the docs drift workflow's check on what its agent changed),
  `agent-resume.sh` (the briefing for agent checkpoints, under Working with this repo in Claude
  Code), `flake-hunt.sh` and `flake-hunt-issue.sh` (the flake hunt, below under Quality gates),
  `flake-sweep.sh` (`pnpm test:e2e:sweep`, see `e2e-tests.md`), `verify-flake.sh` (runs one e2e spec N
  times into `.verify`), and the `node:test` suites that `pnpm test:scripts` runs, one for each of
  those ten plus `docs-drift-workflow.test.mjs`, `ai-refusals.test.mjs`,
  `commitlint-config.test.mjs`, `claude-hooks.test.mjs` (the session hooks in `.claude/hooks`) and
  `claude-md-budget.test.mjs` (the byte budget of `CLAUDE.md` and the `paths` of every rule).
  It is a private workspace package, `@repo/scripts`, whose only task is `typecheck` (`tsc -p .`
  against `scripts/tsconfig.json`, which covers the `.mjs` and `.ts` files), so `turbo typecheck`
  type-checks it alongside the apps. It ships no source anyone imports: nothing depends on it, and
  the root scripts still call the scripts by path.

## Commands

| Command                                                                 | What it does                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                                              | `turbo dev` across every app                                                                                                                                                         |
| `pnpm dev:web`                                                          | Next.js dev server on port 3000                                                                                                                                                      |
| `pnpm dev:playground`                                                   | Vite dev server for the sandbox                                                                                                                                                      |
| `pnpm build`                                                            | `next build` (web) and `tsc -b && vite build` (playground)                                                                                                                           |
| `pnpm lint`                                                             | ESLint in each app with `--max-warnings 0`                                                                                                                                           |
| `pnpm lint:fix`                                                         | `eslint --fix` in each app, without `--max-warnings 0`                                                                                                                               |
| `pnpm typecheck`                                                        | `turbo typecheck`: `next typegen && tsc --noEmit` (web), `tsc -b` (playground), `tsc -p .` (scripts)                                                                                 |
| `pnpm test`                                                             | Vitest unit tests (web only)                                                                                                                                                         |
| `pnpm test:e2e`                                                         | Playwright specs in `apps/web/e2e`; `turbo.json` gives it `dependsOn: ["build"]`, so the root script builds `web` first. Prefer `pnpm --filter web test:e2e` locally, which does not |
| `pnpm test:e2e:sweep e2e/<spec> [runs] [out-dir]`                       | Runs one spec file N times (10 by default) and summarises every test's outcomes and durations; see `scripts/flake-sweep.sh`                                                          |
| `pnpm format`                                                           | Prettier over the whole repo, writing changes                                                                                                                                        |
| `pnpm format:check`                                                     | Prettier in check mode, no writes                                                                                                                                                    |
| `pnpm check:allowbuilds`                                                | Checks `allowBuilds` entries against the versions the lockfile resolves                                                                                                              |
| `pnpm check:docs-drift`                                                 | Checks every claim in `docs/drift-manifest.json` against the repository and `gh api`; exit 1 on drift, 2 when a check could not run                                                  |
| `pnpm test:scripts`                                                     | `node:test` tests for the root `scripts/`                                                                                                                                            |
| `scripts/flake-hunt.sh [runs]`                                          | Runs the whole e2e suite N times (30 by default) and ranks specs by failure rate in `flake-hunt/flake-report.json`                                                                   |
| `pnpm clean`                                                            | `turbo clean` in both apps, then `rm -rf node_modules` at the root                                                                                                                   |
| `pnpm prepare`                                                          | `husky`; runs on install and is what creates the git hooks                                                                                                                           |
| `pnpm --filter web test:e2e`                                            | Playwright without going through Turborepo                                                                                                                                           |
| `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`                       | Playwright on a port other than the default 3210                                                                                                                                     |
| `pnpm --filter web test:watch`                                          | Vitest in watch mode                                                                                                                                                                 |
| `pnpm --filter web exec vitest run <path>`                              | One unit test file, e.g. `src/hooks/__tests__/use-is-hydrated.test.tsx`                                                                                                              |
| `pnpm --filter web exec playwright install --with-deps chromium webkit` | Needed once before the first e2e run; the phone projects need webkit                                                                                                                 |
| `scripts/agent-resume.sh [task-id ...]`                                 | Briefs each `.agent-state/<task-id>.json` checkpoint and checks it against git and gh; exits 1 when one is invalid or cannot be briefed                                              |
| `scripts/verify-flake.sh <runs> e2e/<spec>`                             | Runs one spec N times into `.verify` with pass rate and p50/p95; exits 0 all passed, 1 any failed, 2 usage, tool or lock error or unmeasured run, 130/129/143 on INT/HUP/TERM        |

`pnpm clean` only reaches the two apps, because `packages/*` and `scripts` define no `clean` task.
Their `node_modules` survive it and have to be deleted by hand before a truly cold reinstall.

`typecheck` and `test` declare `dependsOn: ["^build"]` in `turbo.json`. Nothing an app depends on
has a `build` task today (`@repo/prettier-config` is config only), so this is currently a no-op. It
is there so that a future buildable package is compiled before the apps typecheck against it.

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

- CI is `.github/workflows/ci.yml`, two jobs. `quality`: dependency review
  (`actions/dependency-review-action`, on pull requests only, straight after checkout; it fails a
  pull request that adds a dependency with a known advisory, dev tooling included, because GitHub's
  dependency graph scopes every `pnpm-lock.yaml` entry `runtime`, the action's default), then
  install, `check:allowbuilds`, `test:scripts`, `format:check`, `lint`, `typecheck`, `test`, `build`.
  `e2e`: install chromium and webkit, build web, run the Playwright specs on all three projects with
  their output teed into a log, then check that log with `scripts/check-webserver-log.mjs` whenever
  the suite ran; the report is uploaded as an artifact on failure or cancellation. Actions are
  SHA-pinned, `permissions: contents: read`, and concurrency cancels superseded runs on pull
  requests only.
  CodeQL default setup is on as well (ADR 0018): GitHub manages it, so it has no workflow file here,
  and branch protection does not require its checks. An alert on a line a pull request changes is
  also posted as a review thread, though, and the resolved-threads rule below blocks the merge until
  that thread is resolved: GitHub resolves it once the flagged code changes, and a writer can
  resolve it by hand or dismiss the alert.
- `.github/workflows/flake-hunt.yml` hunts flaky e2e tests every night at 02:17 UTC and on manual
  dispatch, never on a pull request, and none of its jobs is a required check. Six shards each run
  the whole suite five times against the production build with `scripts/flake-hunt.sh`; a report
  job merges the 30 runs into `flake-report.json` (an artifact, with each failure's trace and
  screenshot in the shard artifacts), counts a run no shard uploaded as an infrastructure error,
  and `scripts/flake-hunt-issue.sh` opens one issue labelled `flake-hunt` for the failing tests of
  every spec that failed in more than 5% of the completed runs it ran in, unless an open
  `flake-hunt` issue already names them. Only that job may write issues, and it opens one only for
  the schedule or a dispatch of the default branch. The hunt stops before its first run, failing
  the shard, when `apps/web/e2e/support/warm-routes.ts` is missing or no spec imports it. Locally,
  `scripts/flake-hunt.sh [runs]` runs the hunt and writes the report against the dev server,
  without an issue. 30 runs take hours and hold the Playwright port and that checkout's `.next-e2e`
  the whole time, so start it in the background from a worktree of its own, with `PLAYWRIGHT_PORT`
  set when another checkout runs e2e. Ctrl-C stops a hunt in the foreground only; stop a
  background one with `kill -TERM <pid>`, which exits 143 and still writes the report.
- `main` has branch protection on, and three checks are required: both CI jobs and
  `Commit messages`. A required check is stored as the job's display name, so the three required
  contexts are the `name:` values in `.github/workflows/ci.yml` and
  `.github/workflows/commitlint.yml` character for character, and a comment near each says so.
  Renaming any of those jobs strands a required check that never reports and blocks every pull
  request, and so does anything else that stops the job reporting under that name on every pull
  request, such as a matrix, a reusable-workflow call or a branch or path filter on its trigger;
  ADR 0021 gives the order for renaming, removing or adding one. Protection also requires the
  branch to be up to date with `main`, signed commits, linear history (merge commits are refused)
  and resolved review threads, and it applies to administrators. Squash is the only merge method
  the repository allows, with merge commits and rebase merging switched off; the squash commit
  defaults to the pull request title and an empty body, which the merge dialog or
  `gh pr merge --subject` and `--body` can still override. Approving reviews required: 0, so the
  reviewer rule in `CLAUDE.md` is convention, not enforcement. See
  `docs/adr/0021-squash-only-merges-and-required-checks.md`.
- The root `scripts/` gates are type-checked, not linted. `@repo/scripts` has a `typecheck` task
  (`tsc -p .`, strict, `checkJs`) that `turbo typecheck` runs, so CI's existing typecheck step
  covers them without a step of its own. There is no root `eslint.config.*` on purpose: ADR 0003's
  per-package lint-staged split relies on its absence.

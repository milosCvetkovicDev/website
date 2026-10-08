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
  `check-allowbuilds-drift.mjs` (`pnpm check:allowbuilds`), `check-adr-index.mjs`
  (`pnpm check:adrs`, the ADR records against their index), `check-build-output.mjs`
  (`pnpm check:build-output`, that `/mcp` is the build's one function), `vercel-ignore-build.mjs`
  (Vercel's ignored build step, ADR 0016), `check-webserver-log.mjs` (the `e2e` job's server-log
  check), `post-draft-check.mjs` (the publish check for a blog post, run by hand when a post is
  published; CI runs only its tests. `web#test` hashes only files under `apps/web`, so after
  editing the check run `pnpm --filter web exec vitest run src/lib/__tests__/post-draft.test.ts`,
  or `pnpm test --force`: a plain local `pnpm test` replays a cached green, which CI, with no turbo
  cache, never does), `check-docs-drift.ts` (`pnpm check:docs-drift`, TypeScript that Node 22 runs
  directly), `docs-drift-patch.mjs` (the docs drift workflow's check on what its agent changed),
  `check-content-dates.mjs` (`pnpm check:content-dates`, the `Content dates` workflow's pairing of
  each route's served text with its content date, ADR 0036),
  `agent-resume.sh` (the briefing for agent checkpoints, under Working with this repo in Claude
  Code), `flake-hunt.sh` and `flake-hunt-issue.sh` (the flake hunt, below under Quality gates),
  `flake-sweep.sh` (`pnpm test:e2e:sweep`, see `e2e-tests.md`), `verify-flake.sh` (runs one e2e spec N
  times into `.verify`), and the `node:test` suites that `pnpm test:scripts` runs, one for each of
  those fourteen plus `docs-drift-workflow.test.mjs`, `ai-refusals.test.mjs`,
  `commitlint-config.test.mjs`, `claude-hooks.test.mjs` (the session hooks in `.claude/hooks`),
  `claude-guards.test.mjs` (the PreToolUse guards in `.claude/settings.json`; it needs `jq` on
  `PATH` and fails without it, which the CI runner meets with its preinstalled `/usr/bin/jq`),
  `claude-md-budget.test.mjs` (the byte budget of `CLAUDE.md` and the `paths` of every rule) and
  `vitest-coverage-pair.test.mjs` (the lockfile installs `@vitest/*` at vitest's exact version).
  It is a private workspace package, `@repo/scripts`, whose only task is `typecheck` (`tsc -p .`
  against `scripts/tsconfig.json`, which covers the `.mjs` and `.ts` files), so `turbo typecheck`
  type-checks it alongside the apps. It ships no source anyone imports: nothing depends on it, and
  the root scripts still call the scripts by path.

## Commands

| Command                                                                  | What it does                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                               | `turbo dev` (`next dev` in `apps/web`)                                                                                                                                                                      |
| `pnpm dev:web`                                                           | Next.js dev server on port 3000                                                                                                                                                                             |
| `pnpm build`                                                             | `next build` (web)                                                                                                                                                                                          |
| `pnpm lint`                                                              | ESLint in `apps/web` with `--max-warnings 0`                                                                                                                                                                |
| `pnpm lint:fix`                                                          | `eslint --fix` in `apps/web`, without `--max-warnings 0`                                                                                                                                                    |
| `pnpm typecheck`                                                         | `turbo typecheck`: `next typegen && tsc --noEmit` (web), `tsc -p .` (scripts)                                                                                                                               |
| `pnpm test`                                                              | Vitest unit tests (web only)                                                                                                                                                                                |
| `pnpm test:e2e`                                                          | Playwright specs in `apps/web/e2e`; `turbo.json` gives it `dependsOn: ["build"]`, so the root script builds `web` first. Prefer `pnpm --filter web test:e2e` locally, which does not                        |
| `pnpm test:e2e:sweep e2e/<spec> [runs] [out-dir]`                        | Runs one spec file N times (10 by default) and summarises every test's outcomes and durations; see `scripts/flake-sweep.sh`                                                                                 |
| `pnpm format`                                                            | Prettier over the whole repo, writing changes                                                                                                                                                               |
| `pnpm format:check`                                                      | Prettier in check mode, no writes                                                                                                                                                                           |
| `pnpm check:allowbuilds`                                                 | Checks `allowBuilds` entries against the versions the lockfile resolves                                                                                                                                     |
| `pnpm check:adrs`                                                        | Checks each ADR's status, H1 title, date and link against its row in `docs/adr/README.md`, and ADR 0012's status and pointer rules; exit 1 on a disagreement, 2 if it could not run                         |
| `pnpm check:build-output [<distDir>]`                                    | After `pnpm --filter web build`: every route, and each one in `REQUIRED_ROUTES`, is prerendered with its body file, none a function outside `ALLOWED_FUNCTIONS`; exit 1 on a finding, 2 if it could not run |
| `pnpm check:content-dates -- --base <rev> [--head <rev>]`                | Pairs `content-dates.json`'s dates and text at the head (`HEAD` by default) and its merge base unless the body (`--event`, else `PR_BODY`) excuses a route; exit 1 on a finding, 2 if it could not run      |
| `pnpm check:docs-drift`                                                  | Checks every claim in `docs/drift-manifest.json` against the repository and `gh api`; exit 1 on drift, 2 when a check could not run                                                                         |
| `node scripts/post-draft-check.mjs --kind own\|jev <draft.md> <twin.md>` | Compares an approved draft with the post's served twin: 0 equal, 1 differences or refused syntax, 2 could not run                                                                                           |
| `pnpm test:scripts`                                                      | `node:test` tests for the root `scripts/`                                                                                                                                                                   |
| `scripts/flake-hunt.sh [runs]`                                           | Runs the whole e2e suite N times (30 by default) and ranks specs by failure rate in `flake-hunt/flake-report.json`                                                                                          |
| `pnpm clean`                                                             | `turbo clean` in `apps/web`, then `rm -rf node_modules` at the root                                                                                                                                         |
| `pnpm prepare`                                                           | `husky`; runs on install and is what creates the git hooks                                                                                                                                                  |
| `pnpm --filter web test:e2e`                                             | Playwright without going through Turborepo                                                                                                                                                                  |
| `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`                        | Playwright on a port other than the default 3210                                                                                                                                                            |
| `pnpm --filter web test:watch`                                           | Vitest in watch mode                                                                                                                                                                                        |
| `pnpm --filter web test:coverage`                                        | Vitest with a v8 coverage text summary; report-only, no threshold, not run in CI                                                                                                                            |
| `pnpm --filter web exec vitest run <path>`                               | One unit test file, e.g. `src/hooks/__tests__/use-is-hydrated.test.tsx`                                                                                                                                     |
| `pnpm --filter web exec playwright install --with-deps chromium webkit`  | Needed once before the first e2e run; the phone projects need webkit                                                                                                                                        |
| `scripts/agent-resume.sh [task-id ...]`                                  | Briefs each `.agent-state/<task-id>.json` checkpoint and checks it against git and gh; exits 1 when one is invalid or cannot be briefed                                                                     |
| `scripts/verify-flake.sh <runs> e2e/<spec>`                              | Runs one spec N times into `.verify` with pass rate and p50/p95; exits 0 all passed, 1 any failed, 2 usage, tool or lock error or unmeasured run, 130/129/143 on INT/HUP/TERM                               |

`pnpm clean` only reaches `apps/web`, because `packages/*` and `scripts` define no `clean` task.
Their `node_modules` survive it and have to be deleted by hand before a truly cold reinstall.

`typecheck` and `test` declare `dependsOn: ["^build"]` in `turbo.json`. Nothing an app depends on
has a `build` task today (`@repo/prettier-config` is config only), so this is currently a no-op. It
is there so that a future buildable package is compiled before the apps typecheck against it.

The `build` task keys its hash on `"inputs": ["$TURBO_DEFAULT$", ".env*"]` as well as its `env`
list. `$TURBO_DEFAULT$` is turbo's default input set: the package's files that git does not ignore,
tracked or untracked (an untracked, unignored file in `apps/web` moves the web#build hash in
`turbo run build --dry=json`, turbo 2.10.13). A gitignored `apps/web/.env.local` therefore counts
only through the `.env*` glob: without it, editing that file left the hash unchanged and replayed a
cached build that baked in the old origin. The glob is relative to each package, so the
repository-root `.env.example` is not an input; nothing in the repository loads a root env file
(Next.js reads them from `apps/web`). It deliberately matches more than a build reads
(`.env.example`, `.env.test`, an editor backup): an edit to one of those costs a rebuild, where a
list of names would miss the file a later mode reads and replay a stale build. Only `build` carries
it: no other cached task's result depends on an env file (the web tests use no `import.meta.env`,
the only place Vitest puts env-file values).

Its `outputs` exclude `.next/dev/**`: without that, a cached web build also carried whatever
`next dev` had left in `apps/web/.next/dev`, and a cache hit wrote it back there. On 2026-09-27 the
manifests of two web#build artifacts in the local cache (`jq` summing `size` under
`apps/web/.next/dev/` in `.turbo/cache/<hash>-manifest.json`) held 424 MB of `.next/dev` in a
435 MB artifact built without the exclusion, and none in an 11 MB one built with it. The rest of
`.next` (`server`, `static`, `types`, `trace`, the manifests) is what `next build` writes, so the
outputs stay `.next/**` minus two exclusions rather than a list a Next.js upgrade could leave short.

A git worktree shares the main checkout's `.turbo/cache`: with no `cacheDir` in `turbo.json`,
turbo (2.10.13 here; its `cacheDir` reference documents the behaviour) reads and writes the main
worktree's cache and restores artifacts without rewriting them. Clearing the cache therefore means
clearing that one directory, and a `turbo run` in a worktree without `--force` can replay another
checkout's result, down to the absolute paths that checkout wrote into
`apps/web/.next/required-server-files.json`. Pass `--force` when the run is evidence. Setting
`"cacheDir": ".turbo/cache"` would give each worktree its own cache and lose the cross-worktree
hits; `turbo.json` does not set it.

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

The root has no `typescript` at all, so `.vscode/settings.json` points `typescript.tsdk` at
`apps/web/node_modules/typescript/lib`, the shipping app's own compiler (`^6` in its
`package.json`; 6.0.3 on 2026-09-27). `@repo/scripts` declares its own `^6`, and the lockfile holds
one `typescript`, 6.0.3 on 2026-10-07, so the editor and `pnpm typecheck` run the same compiler on a
`scripts/` file today. The two ranges are separate entries, so an update that moves only one of them
splits the versions again, and `pnpm typecheck` is the reference for `scripts/` when they disagree.

## Quality gates

- CI is `.github/workflows/ci.yml`, two jobs. `quality`: dependency review
  (`actions/dependency-review-action`, on pull requests only, straight after checkout; it fails a
  pull request that adds a dependency with a known advisory, dev tooling included, because GitHub's
  dependency graph scopes every `pnpm-lock.yaml` entry `runtime`, the action's default), then
  install, `check:allowbuilds`, `check:adrs`, `test:scripts`, `format:check`, `lint`, `typecheck`,
  `test`, `build`, `check:build-output`. The last reads what `build` left in `apps/web/.next`, the route manifests
  and the prerendered bodies under `server/app`, not the route table Next prints, and fails when a
  route needs a server function (no prerendered path, a dynamic route whose params are not fixed,
  revalidation, or a partially prerendered page) unless it is in the script's `ALLOWED_FUNCTIONS`,
  when an allowlisted route turns out static or absent, when a prerendered path has no body file,
  and when the build has a `proxy.ts` or middleware, a Server Action or a Pages Router entry (the
  four `server/*-manifest.json` files the App Router manifests do not cover). It also fails a build
  that lacks a route handler in its `REQUIRED_ROUTES` (the case-study JSON since #60, the Atom feed
  since #61; #59's twins are not listed yet), builds one as a page, allowlists one as a function,
  or where a dynamic one prerendered no path or other params than the page above it
  (`/work/[slug]`). A manifest field it decides on that is missing or holds an unknown value, or a
  prerendered path it cannot attribute to a route, exits 2 rather than passing. The allowlist is
  `/mcp` alone, the MCP server (#62), whose `POST` handler cannot be prerendered. A route handler
  without `export const dynamic = 'force-static'` is the failure it exists for: it still serves the
  right bytes, as a function billed per request. Its parsing is tested in `test:scripts`, which runs
  before the build.
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
- `.github/workflows/live-check.yml` runs on Vercel's `deployment_status` events, daily at 06:23
  UTC and on manual dispatch, and none of its jobs is a required check. Its one job, `Live site`,
  is skipped unless the event is a successful `Production` status (GitHub's environment name,
  exactly; `production_environment` is false on Vercel's deployments), a schedule or a dispatch, so
  every preview deployment leaves a skipped `Live site` entry on its commit. It checks out the
  triggering commit and runs `apps/web/e2e-live/` against `https://miloscvetkovic.dev` with
  `playwright.live.config.ts`, which starts no server and shares no spec with
  `playwright.config.ts`. It targets the apex because a deployment's own URL is behind Vercel
  Authentication, so it can test the previous deployment when the alias has not moved yet; the
  daily run covers that race and changes that reach the apex without a status (rollback,
  promotion). `analytics.spec.ts` asserts the tracker tag and its script's 200, a console without
  errors or warnings, no `Set-Cookie`, cookie or storage entry, on desktop Chromium only; never a
  page-view beacon or the intake's CSP `connect-src`: the tracker sends nothing when
  `navigator.webdriver` is true. `markdown-negotiation.spec.ts` checks that the CDN keys on
  `Accept` (ADR 0030): on every route with a Markdown twin, a Markdown request then a browser's,
  and the reverse, with no cache-busting query, the browser must get `text/html` and the agent
  `text/markdown; charset=utf-8`. A third test per route checks that a cache downstream cannot
  hand the twin to a browser: the Markdown answer's `Vary` lists `accept` or is `*`, or, as on
  Vercel, which drops `accept` there (#217), its caching fields (`Cache-Control`, and any
  `Surrogate-Control` or targeted `<target>-Cache-Control` field, such as `CDN-Cache-Control`)
  forbid storing it or make every cache revalidate it (a bare `no-cache`, or `max-age=0` with
  `must-revalidate`, and no `s-maxage` above 0, `stale-*` or `X-Accel-Expires` other than 0), its
  one ETag differs from the page's, each representation's own ETag in `If-None-Match` gets a `304`,
  and the other's gets `200` with the type asked for. The rules live in
  `e2e/support/cache-control.ts`, unit-tested in `src/test/cache-control.test.ts`, and fail closed
  on a field that does not parse. A cache may still hand the page to an agent (ADR 0030). A failed
  deployment or scheduled run opens the issue "Live check failed on the production site", or
  comments on the open one, and never closes one; the job holds `issues: write` for that step
  alone.
  Locally: `pnpm --filter web exec playwright test --config playwright.live.config.ts`, with
  `LIVE_URL` for another target.
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
- `.github/workflows/content-dates.yml` runs on the `opened`, `edited`, `synchronize` and
  `reopened` pull request events, and its one job, `Content dates`, is not a required check
  (ADR 0036). It checks out the whole history without keeping the token, sets up Node and installs
  nothing, then runs `scripts/check-content-dates.mjs` with the base branch as fetched
  (`origin/<base>`, not the event's base SHA, which can lag it), the head SHA and the event
  payload. That compares `apps/web/src/data/content-dates.json` at the head with the file at the
  merge base and fails, by route, a route whose served text moved without its content date, whose
  date moved without its text, or whose date moved backwards, unless the body excuses it with a
  `Content-Date-Exception: <route> <reason>` line: at the very start of a line, outside fenced code
  and HTML comments, any letter case for the key, the route bare or in backticks. The script reads
  the body from the event payload (`--event`), never interpolated and never through an environment
  variable, whose 128 KiB cap a long body of multi-byte text can pass; `PR_BODY` serves a run by
  hand. Every exception is listed as needed or not needed, and one that names a route the head
  manifest lacks, or gives no reason, fails the check. A route only at the head or only at the
  merge base is listed and passes, a merge base without the manifest passes with a notice, and a
  missing or malformed manifest at the head, a malformed one at the merge base, or any other failure
  exits 2. In Actions the report sits between `::stop-commands::` and its token, so nothing the
  body says runs as a workflow command, and each route out of step gets an error annotation.
  Editing the body re-runs this workflow alone. GitHub runs no `pull_request` workflow while a pull
  request conflicts with its base, so the check is absent, not failing, until the conflict is
  resolved. It trusts the head manifest, which the `quality` job's `pnpm test` keeps true, and it
  runs the pull request's own copy of the script, as `ci.yml` runs its own tests. Making it
  required follows ADR 0021's order for adding a context, in a record that supersedes ADR 0021,
  whose agreement check reads only `ci.yml` and `commitlint.yml`.
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

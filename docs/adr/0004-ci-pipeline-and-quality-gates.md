# 0004. CI pipeline and quality gates

## Status

Accepted

## Date

2026-09-08

## Context

The repository had no continuous integration at all. Nothing ran on push, nothing ran on a pull
request, and the only thing standing between a broken commit and `main` was whoever remembered to
run the checks by hand.

Two failures followed directly from that:

- Three Playwright tests in `apps/web/e2e/hero.spec.ts` had been failing on `main` since February.
  Nobody noticed, because nothing was looking.
- `husky` was listed in the root `package.json` and `prepare` ran it, but `.husky/` contained no
  hook scripts. The conventional-commit rules the project documented were never enforced on a
  single commit.

By the time this decision was taken, [ADR 0002](0002-monorepo-toolchain.md) and
[ADR 0003](0003-formatting-and-linting-standards.md) had just put the checks themselves in working
order: Prettier wired to `@repo/prettier-config`, ESLint 9 running with `--max-warnings 0` in both
apps (`eslint-config-next` in `apps/web`, `@eslint/js` and `typescript-eslint` in
`apps/playground`), and `pnpm typecheck` mapped to a declared Turbo task (`next typegen` then
`tsc --noEmit` in `apps/web`, `tsc -b` in `apps/playground`). Vitest unit tests and Playwright
end-to-end tests already existed. None of those first three was true on `main`, where `lint` was a
bare `eslint`, `apps/web` had no `typecheck` script at all, and `pnpm typecheck` failed with
"Missing tasks in project". What was still missing was anything that made running the checks
non-optional.

## Decision

Run the same checks in two places, with different jobs.

**GitHub Actions is the authority.** `.github/workflows/ci.yml` runs on every push to `main`, every
pull request, and on `workflow_dispatch`. It has two jobs:

| Job       | What it does                                                                  |
| --------- | ----------------------------------------------------------------------------- |
| `quality` | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` |
| `e2e`     | installs Chromium, builds `web`, then `pnpm --filter web test:e2e`            |

Both jobs install with `pnpm install --frozen-lockfile` on a clean checkout, take the pnpm version
from `package.json#packageManager` and the Node version from `.nvmrc` (see
[ADR 0002](0002-monorepo-toolchain.md)), and carry a timeout (15 and 20 minutes).

`apps/web/playwright.config.ts` treats `CI=true` or `CI=1`, and nothing else, as CI, so a stray
`CI=false` in a shell stays on the local path. Under CI it sets `forbidOnly`, two retries, one
worker, a 10 second `expect` timeout, the `list` and `html` reporters instead of `list` alone, and
runs `pnpm start` in `apps/web` against the production build rather than `next dev`. The `html`
reporter is what
writes `apps/web/playwright-report`, which the workflow uploads as an artifact
`if: failure() || cancelled()` with a seven day retention, so a red run leaves evidence behind and a
green one does not cost storage. A CI-only end-to-end failure is reproduced locally with
`pnpm --filter web build && CI=true pnpm --filter web test:e2e`.

Three workflow-level choices are deliberate:

- **Actions are pinned to commit SHAs**, with the version in a trailing comment
  (`actions/checkout@3d3c42e5... # v7.0.1`). A tag is a mutable pointer: whoever controls the action
  repository can move `v7` to different code at any time, and CI runs with write access to a
  checkout of our source. A SHA cannot be moved.
- **`permissions: contents: read`** at workflow level. Neither job needs to write to the repository,
  so the token they get cannot.
- **Concurrency cancels superseded pull-request runs, never `main`.** The group keys on
  `github.event.pull_request.number || github.sha` and `cancel-in-progress` is true only for
  `pull_request`, so every commit on `main` gets a full result and rapid pushes to a branch do not
  queue up stale runs.

**Husky gives fast local feedback.** `.husky/pre-commit` runs `pnpm exec lint-staged`, which picks
the `lint-staged` block nearest each staged file. `apps/web` and `apps/playground` each run
`eslint --fix --max-warnings 0` and then `prettier --write` over TypeScript and JavaScript, while
the root block runs `prettier --write` only and covers the files that belong to no app: workspace
configs, `packages/**`, `docs/**` and `.github/**`. The split exists because ESLint 9 resolves its
flat config from the working directory rather than from the file being linted, and there is no
`eslint.config.*` at the repository root, while lint-staged runs each block from the directory of
the `package.json` that declares it (see [ADR 0003](0003-formatting-and-linting-standards.md)).
`.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"` against
`@commitlint/config-conventional`.

Both hooks fall back to `nvm` when `pnpm` is not on `PATH`: they set `NVM_DIR="$HOME/.nvm"`, source
`$NVM_DIR/nvm.sh` if it is there, and exit 1 with a message pointing at the README if `pnpm` is
still missing. GUI git clients do not inherit a login shell, so without that bootstrap the hooks
would silently break for anyone not committing from a terminal. The fallback hard-codes `~/.nvm`, so
an nvm installed elsewhere (a Homebrew install under `/usr/local/opt/nvm`, for example) is not
found, and the hook then fails closed rather than skipping the check.

**Dependabot proposes updates weekly** (`.github/dependabot.yml`), on Mondays: for `npm` with minor
and patch grouped into a single pull request and at most five open, and for `github-actions`
ungrouped. Both entries set `commit-message.prefix` (`build` for npm, `ci` for actions) with
`include: scope`, so the bot's commits satisfy the same Conventional Commits rule the `commit-msg`
hook enforces for humans. Grouped updates land as one CI run instead of a dozen.

The two layers do different jobs. The hooks are fast and touch only staged files, so they cannot
prove the whole repository is healthy; they exist to stop obvious mistakes before they reach a
branch. CI is the authority because it runs on a clean checkout with a frozen lockfile, on a machine
that has none of the local state that makes "it works here" true. A hook can also be bypassed with
`--no-verify`, and a fresh clone or worktree has no hooks at all until `pnpm install` has run
`prepare`; a CI job runs regardless.

CI is not yet a merge gate. Branch protection on `main` requiring the `quality` and `e2e` checks is
not enabled: it is open question 2 in
[the repository hardening design](../plans/2026-09-08-repo-hardening-and-launch-design.md), because
it is a persistent repository setting that needs an explicit go-ahead. Until it is turned on, the
workflow reports and does not block.

`.github/pull_request_template.md` lists the same commands as a verification checklist, so the
author states what they ran rather than the reviewer guessing.

## Consequences

### Positive

- Failures are visible within minutes rather than months. The three hero specs that had been failing
  since February were repaired as part of this change (they were test bugs, not product bugs), and
  the whole suite now runs on every pull request and every push to `main`, so the same kind of
  silent rot is caught immediately.
- Commit conventions are checked for the first time, by `.husky/commit-msg`. This is a local gate
  only: no CI job runs commitlint, the hook does not exist until `pnpm install` has run `prepare`,
  and `--no-verify` skips it. It raises the floor rather than guaranteeing the history.
- A pull request carries a public pass or fail for the five `quality` checks and the `e2e` job that
  the README's quality-gate table and the pull request template both list, so a red diff is visible
  before review. Until branch protection is enabled that signal is advisory: a red pull request can
  still be merged, and once the Vercel project is connected a merge to `main` deploys to production
  with no approval gate (see [the deployment runbook](../runbooks/deploy.md)).
- Supply-chain exposure through third-party actions is bounded by the pinned SHAs.

### Trade-offs

- Every pull request pays for two full installs and two builds; the jobs share no artefacts, so
  `web` is built twice, and three times once the Vercel Git integration is connected and builds
  every push to a non-production branch as well ([ADR 0005](0005-hosting-on-vercel.md)). Only the
  pnpm store is cached, by
  `actions/setup-node`; the Turborepo cache is local only, so CI starts cold on every run, and
  Chromium is downloaded again on every `e2e` run.
- SHA pins are not human-readable and go stale. They rely on the Dependabot `github-actions`
  ecosystem to keep moving, and the comment must be updated with the pin.
- Hooks add a few seconds to each commit, and contributors who use a GUI client depend on the `nvm`
  bootstrap continuing to match their setup.
- The e2e job runs a single Playwright project (Chromium) with one worker, so cross-browser
  regressions are not covered.

## Alternatives considered

- **No CI, keep running checks by hand.** The status quo. Rejected: it had already failed, silently,
  for months.
- **One job for everything.** Simpler and saves an install, but a Playwright timeout would then be
  indistinguishable at a glance from a type error, and the whole run would carry the slower job's
  timeout. Two jobs give two independent signals and run in parallel.
- **Pre-push instead of pre-commit.** Cheaper per commit, but it moves the feedback to the moment
  the work is about to leave the machine, and it does nothing for commit messages, which have to be
  checked at `commit-msg` time regardless.
- **Tag-pinned actions (`@v7`).** Readable and self-updating within a major version, at the cost of
  executing whatever code the tag points at today. Not worth it for a workflow that checks out our
  source.
- **Let Vercel's branch build be the only signal.** Once the Git integration is connected it will
  build every push to a non-production branch ([ADR 0005](0005-hosting-on-vercel.md)), so a broken
  build would be caught without a workflow at all. Rejected: it proves only that `next build`
  succeeds inside
  `apps/web`, with no formatter, linter, type check, unit tests or end-to-end run, and it makes a
  third-party status the gate on a repository whose point is that the gates live in the repository.

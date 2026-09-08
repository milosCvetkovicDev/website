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

The toolchain to check the code already existed: Prettier through `@repo/prettier-config`, ESLint 9
with `eslint-config-next` run as `eslint --max-warnings 0`, `tsc --noEmit` behind `pnpm typecheck`,
Vitest unit tests, and Playwright end-to-end tests. What was missing was anything that made running
them non-optional.

## Decision

Run the same checks in two places, with different jobs.

**GitHub Actions is the authority.** `.github/workflows/ci.yml` runs on every push to `main`, every
pull request, and on `workflow_dispatch`. It has two jobs:

| Job       | What it does                                                                  |
| --------- | ----------------------------------------------------------------------------- |
| `quality` | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` |
| `e2e`     | installs Chromium, builds `web`, then `pnpm --filter web test:e2e`            |

Both jobs install with `pnpm install --frozen-lockfile` on a clean checkout, take the pnpm version
from `package.json#packageManager` and the Node version from `.nvmrc`, and carry a timeout
(15 and 20 minutes). `apps/web/playwright.config.ts` switches on `CI`: in CI it sets `forbidOnly`,
two retries, one worker, a longer `expect` timeout, and runs the production server rather than
`next dev`. The Playwright HTML report is uploaded as an artifact `if: failure() || cancelled()`,
so a red run leaves evidence behind and a green one does not cost storage.

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

**Husky gives fast local feedback.** `.husky/pre-commit` runs `pnpm exec lint-staged`, which applies
ESLint `--fix --max-warnings 0` and Prettier to staged files, using the `lint-staged` block in each
package's own `package.json`. `.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"` against
`@commitlint/config-conventional`. Both hooks first check whether `pnpm` is on `PATH` and, if not,
source `nvm` from `$NVM_DIR`, then fail with a pointer to the README if it is still missing. GUI git
clients do not inherit a login shell, so without that bootstrap the hooks would silently break for
anyone not committing from a terminal.

**Dependabot proposes updates weekly** (`.github/dependabot.yml`), for both `npm` and
`github-actions`, on Mondays, with minor and patch grouped into a single pull request and a cap of
five open npm pull requests. Grouped updates land as one CI run instead of a dozen.

The two layers do different jobs. The hooks are fast and touch only staged files, so they cannot
prove the whole repository is healthy; they exist to stop obvious mistakes before they reach a
branch. CI is the authority because it runs on a clean checkout with a frozen lockfile, on a machine
that has none of the local state that makes "it works here" true. A hook can also be bypassed with
`--no-verify`; a required CI job cannot.

`.github/pull_request_template.md` lists the same commands as a verification checklist, so the
author states what they ran rather than the reviewer guessing.

## Consequences

### Positive

- Failures on `main` are visible within minutes rather than months. The three broken Playwright
  tests are now a blocking signal.
- Commit conventions are enforced for the first time, which keeps the history usable.
- A pull request either passes the same five checks the README documents, or it does not merge.
- Supply-chain exposure through third-party actions is bounded by the pinned SHAs.

### Trade-offs

- Every pull request pays for two full installs and two builds; the jobs do not share artefacts, so
  `web` is built twice.
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

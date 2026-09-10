# Local Playwright port and server ownership — design

**Date:** 2026-09-10
**Status:** Approved
**Branch:** `chore/local-playwright-port`
**Standing record:** [ADR 0014](../adr/0014-playwright-owns-its-server.md)

## Context

`apps/web/playwright.config.ts` served and tested `http://localhost:3000` in both modes, with
`port: 3000`, `baseURL: 'http://localhost:3000'` and `reuseExistingServer: !isCI`.

This repository is worked on in several git worktrees under `.claude/worktrees/` at the same time,
and each worktree is a complete checkout of the same site. Port 3000 is also what `pnpm dev:web`
uses. Whichever process starts first owns it, and both failure modes were observed on 2026-09-10:

| Path                                 | `reuseExistingServer` | Behaviour when 3000 is taken                                        |
| ------------------------------------ | --------------------- | ------------------------------------------------------------------- |
| `CI=true pnpm --filter web test:e2e` | `false`               | Aborts: `http://localhost:3000 is already used`. Noisy but honest.  |
| `pnpm --filter web test:e2e`         | `true`                | Attaches and tests the foreign server. Silent, and the real danger. |

Three specs assert `toHaveTitle(/Milos Cvetkovic/)` against exactly this. The assertion cannot work
as described: a second worktree of this site serves
`<title>Milos Cvetkovic | Senior Full-Stack Engineer</title>` character for character, verified on
2026-09-10 by curling a `next start` from `.claude/worktrees/cranky-heyrovsky-ae811c` while this
branch was being written. The guard only ever caught an unrelated application on 3000.

## Goals

1. A local run is unaffected by whatever else holds port 3000.
2. A run can never test a build that is not the working tree without saying so.
3. CI keeps port 3000 and its behaviour is otherwise unchanged.
4. The port is overridable, so two checkouts can run their suites at once.

## Non-goals

- Making two checkouts run concurrently with no intervention. A collision that stops the run is an
  acceptable, and preferable, outcome; see decision D2.
- Any change to what the specs assert. Only the comments describing why the title is asserted move.
- Fingerprinting the served build. See D5.

## Decisions

| #      | Decision                                                                                                       | Why                                                                                                                                                                                                                                                                                               | Rejected alternative                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | `reuseExistingServer: false` in both modes; Playwright always starts the server it tests.                      | Removes the silent-wrong-build path outright. An aborted run is fixed in seconds; a green run against the wrong build is never noticed.                                                                                                                                                           | Keeping reuse locally for the speed of a warm dev server.                                                                                           |
| **D2** | One default port, `3210`, overridable by `PLAYWRIGHT_PORT`.                                                    | Leaves 3000 to `pnpm dev`. A documented constant is easier to reason about than a port that moves; a second checkout is unblocked by one environment variable.                                                                                                                                    | Scanning upward for a free port, or hashing the checkout path: both make `baseURL` unpredictable in errors and traces for a collision that is rare. |
| **D3** | CI sets `PLAYWRIGHT_PORT: '3000'` in `.github/workflows/ci.yml`, rather than the config deriving it from `CI`. | `docs/runbooks/deploy.md` sets `CI=true` by hand to reproduce the CI path on a developer machine, where 3000 is taken; that reproduction has to work. It also puts CI's port in the file a reader checks for it.                                                                                  | Keying the port on `CI`, which would break goal 1 for the runbook's own command; or keying it on `GITHUB_ACTIONS`, an implicit rule easy to miss.   |
| **D4** | A `PLAYWRIGHT_PORT` that is not an integer in 1–65535 throws at config load.                                   | Falling back would serve a port other than the one asked for, which is the failure class being removed. Matches `apps/web/next.config.ts`, which already throws on a bad monorepo root, and `--max-warnings 0` throughout.                                                                        | Warning and falling back to 3210.                                                                                                                   |
| **D5** | Keep the three title assertions, described as smoke checks. No build fingerprint.                              | They prove the app rendered, but guard nothing reachable: an occupied port aborts before the first test, and the not-found and error pages share the title. An honest fingerprint needs a marker rendered by `layout.tsx`: test scaffolding in a production component, to save a `next dev` boot. | A `NEXT_PUBLIC_` build id or a dev-only `<meta>` in the layout; removing the assertions, which is a behaviour change outside this design's scope.   |
| **D6** | The local dev server builds into `.next-e2e`, via `NEXT_DIST_DIR` read by `apps/web/next.config.ts`.           | D1 means Playwright's `next dev` now runs beside the developer's. Two dev servers writing one build directory race over manifests and chunks. Left unset for `pnpm start`, which must serve what `next build` wrote to `.next`.                                                                   | Documenting "do not run e2e while `pnpm dev` is up", which forbids the common workflow.                                                             |

## Consequences

- Local runs pay a `next dev` boot and compile the routes they visit. `.next-e2e` persists between
  runs, so only the first is cold.
- `.next-e2e` is a second build directory in `apps/web`, ignored in both `.gitignore` files and not
  reached by `pnpm clean`, which removes `.next` by name.
- `apps/web/next.config.ts` reads an environment variable only the test configuration sets. A stray
  `NEXT_DIST_DIR` in a shell would send `next build` somewhere unexpected; it is named after the
  Next.js option it sets and nothing else in the repository reads it.
- CI is unchanged in command, port and build. Only the source of the port moved.

## Verification

The condition from the report, reproduced rather than simulated: a `next start` from another
worktree of this repository holding 3000, then

```bash
pnpm --filter web build && CI=true pnpm --filter web test:e2e
```

must run the whole suite green. The suite was 34 tests in 4 files when this was written: 29 across
`console-clean.spec.ts` (14), `hero.spec.ts` (12) and `featured-work.spec.ts` (3), plus
`accessibility.spec.ts` (5). After rebasing onto `main` it is 38, because #26 added four scrolled
hero audits to `accessibility.spec.ts`.

`resolvePort` is covered separately by `apps/web/src/test/playwright-config.test.ts`, so the parsing
rules are a `pnpm test` failure rather than a hand-run check.

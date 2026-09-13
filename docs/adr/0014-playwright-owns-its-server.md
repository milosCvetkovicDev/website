# 0014. Playwright starts the server it tests, on a port of its own

## Status

Accepted (corrected 2026-09-12)

## Date

2026-09-10

## Context

`apps/web/playwright.config.ts` served and tested `http://localhost:3000` in both modes, with
`reuseExistingServer: !isCI`. Port 3000 is also the port `pnpm dev:web` uses, which is the whole
reason reuse was switched on: attaching to a dev server the developer already had running skipped a
second `next dev` boot.

That holds while one checkout of this repository exists on a machine. This repository is worked on
in several git worktrees under `.claude/worktrees/` at once, and a worktree is a full checkout of
the same site. Whichever one starts a server first owns 3000, and both failure modes were observed
on 2026-09-10:

- **CI path.** `CI=true pnpm --filter web test:e2e` sets `reuseExistingServer: false`, so a taken
  3000 aborted the run before the first test:
  `http://localhost:3000 is already used, make sure that nothing is running on the port/url`. Noisy,
  but honest.
- **Local path.** Without `CI=true`, reuse was on, so Playwright attached to whatever answered on
  3000 and tested it. When that was a `next start` from a different worktree, the whole suite ran
  green against a build that was not the working tree. Silent, and the more dangerous of the two.

Three specs carried a `toHaveTitle(/Milos Cvetkovic/)` assertion against exactly this. It cannot
work: a second worktree of this site serves
`<title>Milos Cvetkovic | Senior Full-Stack Engineer</title>`, character for character, because it
is the same site. The guard only ever caught an unrelated application on 3000.

A guard that could tell two checkouts apart would need the served pages to carry a marker naming
the checkout that built them, rendered by `apps/web/src/app/layout.tsx`. That is test scaffolding in
a production component, and either an absolute path in the client bundle of a public site or a
development-only branch in the layout. It buys back a few seconds of `next dev` boot.

## Decision

Playwright starts the server it tests, always, and locally that server does not touch anything the
developer is using.

- **`reuseExistingServer: false` in both modes.** The suite never attaches to a process it did not
  start. A port that is already taken now aborts every run, CI and local alike, with Playwright's
  "already used" error. Loud beats silent: an aborted run is fixed in seconds, a green run against
  the wrong build is not noticed at all.
- **One default port, 3210.** 3000 is left to `pnpm dev`. `PLAYWRIGHT_PORT` overrides it, and
  `.github/workflows/ci.yml` sets `PLAYWRIGHT_PORT: '3000'` on the `e2e` job, so CI keeps the
  conventional port and says so in the file a reader checks for it. The port is not derived from
  `CI`: `docs/runbooks/deploy.md` sets `CI=true` by hand to reproduce the CI path locally, on the
  machine where 3000 is taken, and that reproduction has to work.
- **`PLAYWRIGHT_PORT` throws on a value that is not a port**, rather than warning and falling back.
  Falling back would serve a port other than the one asked for, which is the failure this record
  exists to remove. The parse is digits-only with no leading zero, not `Number`, which reads
  `"0x0c8a"`, `"3.21e3"`, `" 3210 "` and `"03000"` as valid ports with values nobody typed.
  `resolvePort` is exported and pinned by `apps/web/src/test/playwright-config.test.ts`, following
  the precedent `next.config.ts` set with `findWorkspaceRoot`.
- **The local server gets its own build directory.** `apps/web/next.config.ts` reads
  `distDir: process.env.NEXT_DIST_DIR ?? '.next'`, and the local `webServer.env` sets it to
  `.next-e2e`. Two `next dev` processes writing one build directory race over manifests and chunks,
  and the point of taking reuse away is that Playwright's dev server now runs beside the
  developer's. The variable is left unset for `pnpm start`, which has to serve what `next build`
  wrote to `.next`.
- **The three title assertions stay, described honestly as smoke checks.** They are cheap and they
  prove the application rendered, but they are not a guard against anything reachable: an occupied
  port now aborts the run before the first test, and the not-found and error pages carry the same
  title, so status and path are what catch a wrong page. The comments no longer claim otherwise.
  Removing them was rejected as a behaviour change outside this record's scope.

## Consequences

- Two checkouts running the local suite at the same moment both want 3210. The second aborts with
  the "already used" error and is unblocked by `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`.
  This is deliberate: a collision that stops the run is the outcome this record wants, and deriving
  a per-worktree port would trade a clear failure for an unmemorable number.
- Local runs no longer reuse a warm dev server, so each one pays a `next dev` boot and compiles the
  routes it visits. `.next-e2e` persists between runs, so only the first is cold.
- `.next-e2e` is a second build directory in `apps/web`, and it has to be declared in seven places:
  both `.gitignore` files, `.prettierignore`, `globalIgnores` in `apps/web/eslint.config.mjs`, the
  `include` list in `apps/web/tsconfig.json`, `.vercelignore` and the `clean` script in
  `apps/web/package.json`. Two of those are not housekeeping. The tsconfig entries are load-bearing:
  `next dev` appends its own `distDir` type paths to `tsconfig.json`, so without them every local
  e2e run rewrites a tracked file and `pnpm format:check` fails on the result. `.vercelignore` is
  load-bearing too: the Vercel CLI never reads `.gitignore` and its built-in list names `.next`
  only, so a `vercel deploy` from a machine that has run the suite would upload ~150 MB of dev
  build. That is the cost of this decision, and it is the strongest argument against it.
- Only an e2e run writes `.next-e2e`, and `tsconfig.json` compiles the route types it contains, so
  the copy can go stale in a way `.next/dev/types` does not. If `pnpm typecheck` disagrees with CI
  about a route added or renamed elsewhere, delete the directory (`pnpm --filter web clean`). Note
  that `.next/types` and `.next/dev/types` are already two sources of the same generated globals in
  the committed `tsconfig.json`; this adds a third that sorts last, rather than a new pattern.
- Two local suites in the same checkout on different ports share `.next-e2e` and race over it, which
  is the failure this bullet's directory exists to prevent, moved one level up. Two different
  checkouts are unaffected: each has its own. Port-scoping the directory was rejected because
  nothing prunes these directories and each is around 150 MB.
- `turbo.json` declares `PLAYWRIGHT_PORT` in the `test:e2e` task's `env`. Turborepo 2 filters
  undeclared variables out of a task's environment, so without it `PLAYWRIGHT_PORT=3211 pnpm test:e2e`
  would silently serve 3210 through the root script while the `--filter` form honoured it.
- Nothing reuses a server, so a run killed part-way leaves an orphaned `next dev` on 3210 and every
  later run in that checkout aborts until it is killed. That is the cost of the guarantee.
- `apps/web/next.config.ts` now reads an environment variable that only the test configuration sets,
  and it is read by every Next.js entry point, `next build`, `next start` and `next typegen` included.
  `webServer.env` therefore pins it on both branches rather than omitting it on one: Playwright merges
  that object over `process.env`, so an omitted key would inherit an ambient value and let `pnpm start`
  serve a directory `next build` never wrote. An empty value falls back to `.next` (`||`, not `??`).
  A stray `NEXT_DIST_DIR` exported in a shell still affects a hand-run `next build`; it is named after
  the Next.js option it sets, and nothing else in the repository reads it.
- CI behaviour is unchanged: same command, same port, same production build. Only the source of the
  port moved, from a literal in the test config to the workflow's `env`.

## Alternatives considered

- **Keep reuse locally and fingerprint the build.** Rejected: the only honest fingerprint is a
  marker rendered by `layout.tsx`, which puts test scaffolding in a production component to save a
  `next dev` boot.
- **Scan upward from 3210 for a free port.** Parallel checkouts would never collide and no override
  would ever be needed, but `baseURL` would change from run to run, so error messages, traces and
  any browser attached by hand would point somewhere different each time. Rejected for legibility;
  a documented constant that fails loudly is easier to reason about than a port that moves.
- **Derive the port from a hash of the checkout path.** Stable per worktree and collision-free in
  practice, but it cannot be written down as a number, and a hash collision fails exactly like the
  fixed port does anyway.
- **Move CI to 3210 as well and drop the override.** One fewer moving part, but the deploy runbook's
  hand-run Lighthouse commands and every "open localhost:3000" habit are built around the
  conventional port for the production build. CI matching them is worth one line of `env`.
- **An opt-in `PLAYWRIGHT_REUSE_SERVER=1`.** Rejected as YAGNI: it re-opens the silent-wrong-build
  path for whoever sets it, and Playwright starting the server is what makes the run trustworthy.

## Corrections

### 2026-09-12

Two sentences inside `## Decision` misstate how `NEXT_DIST_DIR` is read and set. Both were false
when this record was accepted: the code they describe landed in the same commit, `5a02529`, already
written the other way, and this record's own `## Consequences` describes the real behaviour
correctly at `:104-110`. `## Decision` is never rewritten, so both are annotated here, under
[ADR 0012](0012-correcting-accepted-records.md).

**How the variable is read.** The record reads: "`apps/web/next.config.ts` reads
`distDir: process.env.NEXT_DIST_DIR ?? '.next'`". What is true: it reads
`distDir: process.env.NEXT_DIST_DIR || '.next'`. What was wrong: the operator. `??` falls back only
on `null` and `undefined`, so it would take an empty string — an unset variable expanded by a shell
— as a build directory named by the empty string. `||` falls back on that too, which is why the code
uses it. Evidence: `apps/web/next.config.ts:42`, and this record's `## Consequences` at `:108`,
which already says "An empty value falls back to `.next` (`||`, not `??`)" — the two halves of the
record disagreed from the day it was accepted.

**Whether the variable is left unset for `pnpm start`.** The record reads: "The variable is left
unset for `pnpm start`, which has to serve what `next build` wrote to `.next`." What is true:
Playwright pins the variable on both branches. `apps/web/playwright.config.ts:64` is
`NEXT_DIST_DIR: isCI ? '.next' : '.next-e2e'`, so the CI branch that runs `pnpm start` sets it
explicitly to `.next` rather than omitting it. What was wrong: "left unset" describes a draft that
the review rejected. Omitting the key would let Playwright, which merges `webServer.env` over
`process.env`, inherit an ambient `NEXT_DIST_DIR` from the shell and serve `pnpm start` a
directory `next build` never wrote. The record's intent — that `pnpm start` serves `.next` — is
what the code achieves; it achieves it by pinning, not by omitting. Evidence:
`apps/web/playwright.config.ts:64` and the comment above it; `## Consequences` at `:106-108`
("`webServer.env` therefore pins it on both branches rather than omitting it on one"); and
[the local Playwright port plan](../plans/2026-09-10-local-playwright-port-plan.md) Task 6, whose
review round records the change as an accepted finding: "`webServer.env` omitted `NEXT_DIST_DIR`
on the CI branch rather than pinning it. Playwright merges that object over `process.env`, so an
ambient value would have reached `pnpm start`".

The comment at `apps/web/next.config.ts:40` repeats the second error, calling the variable "Unset
everywhere else, CI included". Correcting a comment in `apps/web` is not this record's to make and
is left to the pull request that owns that file; the code beside it is right.

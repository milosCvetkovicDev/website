# Local Playwright port and server ownership — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Playwright run is unaffected by whatever else holds port 3000, and can never
silently test a build that is not the working tree. CI keeps port 3000 and is otherwise unchanged.

**Design:** [`docs/plans/2026-09-10-local-playwright-port-design.md`](2026-09-10-local-playwright-port-design.md)
(decisions D1–D6). Standing record: [ADR 0014](../adr/0014-playwright-owns-its-server.md).

**Branch:** `chore/local-playwright-port` (from `main` at `7d7f567`).

**Stop condition for the whole PR (all must hold):**

```bash
# with a `next start` from another checkout of this repository holding port 3000:
pnpm --filter web build && CI=true pnpm --filter web test:e2e   # 34 passed
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
gh pr checks --watch                                                           # all checks pass
```

---

### Task 1: Give the suite its own port and its own server

**Files:**

- Modify: `apps/web/playwright.config.ts`
- Modify: `.github/workflows/ci.yml`, `turbo.json`

- [x] Add `resolvePort(raw, fallback)`: returns the fallback for an unset or empty value, otherwise
      an integer in 1–65535, and throws naming the bad value for anything else (D4).
- [x] Resolve one `port` from `PLAYWRIGHT_PORT` with a default of `3210` (D2) and use it for both
      `use.baseURL` and `webServer.port`. The port does not depend on `CI` (D3).
- [x] Set `webServer.env.PORT`, which `next dev` and `next start` both read, rather than passing a
      CLI flag through pnpm.
- [x] Set `reuseExistingServer: false` unconditionally (D1).
- [x] Add `PLAYWRIGHT_PORT: '3000'` to the `Run e2e tests` step in the `e2e` job (D3).
- [x] Declare `PLAYWRIGHT_PORT` in the `test:e2e` task's `env` in `turbo.json`. Turborepo 2 filters
      undeclared variables out of a task's environment, so without it the root `pnpm test:e2e`
      would ignore the override while the `--filter` form honoured it.

**Stop condition:**

```bash
pnpm --filter web exec vitest run src/test/playwright-config.test.ts   # 20 passed
pnpm --filter web exec playwright test --list | tail -1               # Total: 38 tests in 4 files
```

### Task 2: Keep the local dev server out of `apps/web/.next`

**Files:**

- Modify: `apps/web/next.config.ts`
- Modify: `.gitignore`, `apps/web/.gitignore`, `.prettierignore`, `apps/web/eslint.config.mjs`,
  `apps/web/tsconfig.json`

- [x] Read `distDir: process.env.NEXT_DIST_DIR || '.next'` (D6). `||`, so an empty value falls back.
- [x] Pin `NEXT_DIST_DIR` on both branches of `webServer.env`: `.next-e2e` locally, `.next` for
      `pnpm start`. Omitting the CI branch would inherit an ambient value, because Playwright merges
      `webServer.env` over `process.env`.
- [x] Ignore `.next-e2e` in both git ignore files, in `.prettierignore` and in `globalIgnores`.
- [x] Add `.next-e2e/types/**/*.ts` and `.next-e2e/dev/types/**/*.ts` to `apps/web/tsconfig.json`.
      `next dev` appends its `distDir` type paths to that file itself; without the entries every
      local run rewrites a tracked file and `pnpm format:check` fails.

**Stop condition:**

```bash
pnpm --filter web test:e2e                    # starts, and creates apps/web/.next-e2e
git status --porcelain | grep next-e2e        # no output: the directory is ignored
```

### Task 3: Make the three title guards describe what they actually do

**Files:**

- Modify: `apps/web/e2e/hero.spec.ts`, `apps/web/e2e/console-clean.spec.ts`,
  `apps/web/e2e/accessibility.spec.ts`

- [x] Replace the `reuseExistingServer … :3000` comments. The assertions themselves do not change
      (D5); a second checkout of this site serves an identical title and never could be caught here.

**Stop condition:**

```bash
grep -rn "reuseExistingServer" apps/web/e2e/   # no matches
```

### Task 4: Documentation

**Files:**

- Create: `docs/adr/0014-playwright-owns-its-server.md`; modify `docs/adr/README.md`
- Create: `docs/plans/2026-09-10-local-playwright-port-design.md`, this file; modify
  `docs/plans/README.md`
- Modify: `CLAUDE.md`, `docs/runbooks/deploy.md`

- [x] ADR 0014 with the context, the six decisions, the consequences and the rejected alternatives;
      index row added after 0011.
- [x] `CLAUDE.md`: a `PLAYWRIGHT_PORT` row in the Commands table, the two Testing bullets that
      described reuse and port 3000, a new bullet on server ownership, and two Gotchas — that
      `CI=true` does not change the port, and how to unblock a second checkout.
- [x] `docs/runbooks/deploy.md`: the gate description, the console-clean checklist item, and a note
      that the hand-started `pnpm start` on 3000 for Lighthouse is a different server from the
      suite's.
- [x] Design and plan committed with an index row in `docs/plans/README.md`.

**Stop condition:**

```bash
pnpm format:check    # exit 0
grep -rn "reuses a running dev server" CLAUDE.md docs/   # no matches
```

### Task 5: Verify against the reported condition

**Files:** none.

- [x] Start `PORT=3000 pnpm start` from another worktree of this repository, and confirm it answers
      `<title>Milos Cvetkovic | Senior Full-Stack Engineer</title>` — the title the guards assert.
- [x] `pnpm --filter web build && CI=true pnpm --filter web test:e2e` with that server still up.
- [x] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [x] Paste the real output into the pull request's Verification section.

**Stop condition:** the whole suite green while 3000 is held by another checkout.

### Task 6: Review round

**Files:** `apps/web/playwright.config.ts`, `apps/web/next.config.ts`, `turbo.json`,
`.prettierignore`, `.vercelignore`, `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`,
`apps/web/package.json`, and the four documents.

The `adversarial-reviewer` (diff only) and `edge-case-hunter` (changed files) agents reviewed the
branch. Findings accepted and fixed:

- [x] `webServer.env` omitted `NEXT_DIST_DIR` on the CI branch rather than pinning it. Playwright
      merges that object over `process.env`, so an ambient value would have reached `pnpm start` and
      served a directory `next build` never wrote. Now `isCI ? '.next' : '.next-e2e'`.
- [x] `distDir: … ?? '.next'` accepted an empty string, which a shell produces from an unset
      variable. Now `||`.
- [x] `Number(raw)` accepted `"0x0c8a"`, `"3.21e3"`, `" 3210 "` and `"03000"` as valid ports. Now
      `/^[1-9]\d*$/`.
- [x] `turbo.json` filtered `PLAYWRIGHT_PORT` out of the `test:e2e` environment (Task 1).
- [x] `.next-e2e` was ignored by git only: `pnpm format:check` and `pnpm lint` would have walked
      144 MB of generated output, and a `vercel deploy` would have uploaded it, because the CLI
      never reads `.gitignore`. Added to `.prettierignore`, `globalIgnores` and `.vercelignore`.
- [x] Nothing removed `.next-e2e`; added to the `clean` script.
- [x] `next dev` rewrote the tracked `apps/web/tsconfig.json` on every local run, adding its own
      `distDir` type paths and reformatting the file, which broke `pnpm format:check`. Pre-declaring
      both paths makes the rewrite a no-op. Found by running the suite, not by either agent.
- [x] The reworded title-guard comments still claimed to catch a foreign application, which
      `reuseExistingServer: false` makes unreachable. Rewritten as smoke checks (D5).
- [x] `resolvePort` had no automated coverage, only a hand-run stop condition. It is now exported
      and pinned by `apps/web/src/test/playwright-config.test.ts` (20 cases), following the
      precedent `next.config.ts` set with `findWorkspaceRoot` in #23.

Rejected, with reasons recorded in the pull request: a claim that `.next-e2e` route types shadow
`.next/types` (checked with `tsc --listFiles`: `.next/types/routes.d.ts` sorts first, and the
committed `tsconfig.json` already lists two generators of the same globals); port-scoping
`.next-e2e` per port (nothing prunes these directories and each is ~150 MB); rejecting privileged
ports below 1024 (`EACCES` from the child is clear enough, and the stated range is honest).

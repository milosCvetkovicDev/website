# Portfolio

Personal portfolio site. A Turborepo 2 + pnpm monorepo whose only shipping app is the Next.js site in
`apps/web`.

## Scoped rules

This file carries what every task needs. Guidance for one area of the repository lives in
`.claude/rules/`, and Claude Code loads a rule only when it reads a file matching the `paths` in the
rule's frontmatter, so it costs nothing in sessions that never touch that area. Unless a rule's text
is already in context, read it before editing in its area. `scripts/claude-md-budget.test.mjs`
holds this file to 16 KB and fails on a rule without `paths` or with a pattern that matches no
tracked file: new guidance goes into the rule for its area, not here.

- `ci-and-scripts.md` (the workflows, the `scripts/` sources, `turbo.json`): the CI jobs, branch
  protection and required checks, the `scripts/` package and the full command table.
- `git-hooks-and-commits.md` (`.husky/`, the commitlint configs and workflow): the git hooks,
  lint-staged, and how commit messages and squash titles are linted.
- `dependencies.md` (the manifests, `pnpm-workspace.yaml`, the lockfile, `.nvmrc`, Dependabot): the
  `engines.node` range, lockfile peer-suffix flips, `allowBuilds`, `minimumReleaseAge`, updates.
- `app-router-and-content.md` (`apps/web/src/app`, `src/lib`, `src/data`, `public/`): per-route
  metadata, Open Graph images and icons, JSON-LD, the AI-refusal gate.
- `ui-components.md` (components, hooks, route pages, `globals.css`, the web ESLint config): accent
  and status colour tokens, the components barrel, lazy GSAP, the accessibility gate.
- `unit-tests.md` (`__tests__`, `src/test`, `vitest.config.ts`): stubs, jsdom cost, slow queries,
  timeouts, expected failures.
- `e2e-tests.md` (`apps/web/e2e`, `playwright.config.ts`, the flake scripts, `ci.yml`,
  `flake-hunt.yml`): the hydration and GSAP waits, projects, server ownership, ports, `.next-e2e`,
  flaky tests, the gates.
- `docs-and-adrs.md` (`docs/`, the docs drift prompt, workflow and scripts): ADR rules, the drift
  check, claims about live settings.
- `claude-code-config.md` (`.claude/` settings, hooks, agents and skills, `.mcp.json`, the
  checkpoint scripts): the guards, the session hooks, checkpoints in full.
- `deploy-and-next-config.md` (`next.config.ts`, `.vercelignore`, `.gitignore`, the deploy
  runbook): the `turbopack.root` search, production on Vercel, CLI deploys.

## Architecture

pnpm 10.34 workspace (`apps/*`, `packages/*`, `scripts`) driven by Turborepo 2.10. Node 22 comes
from `.nvmrc` and pnpm from `packageManager`; how the `engines.node` range is derived is in
`dependencies.md`.

- `apps/web` — the site. Next.js 16 (App Router), React 19, Tailwind v4, GSAP.
  Source in `src/{app,components,data,hooks,lib,test}`, e2e specs in `e2e/`.
- `apps/playground` — Vite 7 + React sandbox. Not deployed, no tests.
- `packages/prettier-config` — `@repo/prettier-config`. Referenced by `prettier.config.mjs` at the
  repo root and by `apps/web/prettier.config.mjs`, which adds
  `tailwindStylesheet: './src/app/globals.css'` so the class sorter sees the theme.
- `scripts/` — the gates that run outside the apps and their `node:test` suites
  (`pnpm test:scripts`): a private `@repo/scripts` package that `turbo typecheck` type-checks.
- `packages/eslint-config` and `packages/typescript-config` exist but no app references them yet.
  `apps/web` lints through its own `eslint.config.mjs` built on `eslint-config-next`, and each app
  has its own `tsconfig.json`.

## Routes (App Router)

`/`, `/about`, `/blog`, `/contact`, `/skills`, `/work`, `/work/[slug]`.

Every route's head comes from `buildMetadata()` in `apps/web/src/lib/metadata.ts`, and every
static route folder needs its own `opengraph-image`; see `app-router-and-content.md`.
`apps/web/next.config.ts` sends the security headers (ADR 0023), and its CSP allows this origin
only: a script, stylesheet, font, image or connection from anywhere else is refused, so adding one
means widening `contentSecurityPolicy()` and its test; see `deploy-and-next-config.md`.

## Commands

- `pnpm dev` (`turbo dev`, every app), `pnpm dev:web` (Next.js on port 3000), `pnpm dev:playground`
- `pnpm build`: `next build` (web) and `tsc -b && vite build` (playground)
- `pnpm lint` (ESLint, `--max-warnings 0`), `pnpm lint:fix`, `pnpm typecheck` (`turbo typecheck`)
- `pnpm test` (Vitest, web only); one file: `pnpm --filter web exec vitest run <path>`; watch:
  `pnpm --filter web test:watch`
- `pnpm --filter web test:e2e`: Playwright without Turborepo (`pnpm test:e2e` builds `web` first);
  `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e` for another port; once before the first run:
  `pnpm --filter web exec playwright install --with-deps chromium webkit`
- Flaky tests: `pnpm test:e2e:sweep e2e/<spec> [runs] [out-dir]`, `scripts/flake-hunt.sh [runs]`,
  `scripts/verify-flake.sh <runs> e2e/<spec>` (`e2e-tests.md` has the procedure, the command table
  in `ci-and-scripts.md` the options)
- `pnpm format` / `pnpm format:check`: Prettier over the whole repo, writing or checking
- `pnpm test:scripts` (`node:test` for `scripts/`), `pnpm check:allowbuilds`, `pnpm check:docs-drift`
  (exit 1 on drift, 2 when a check could not run)
- `scripts/agent-resume.sh [task-id ...]`: briefs the `.agent-state` checkpoints against git and gh
- `pnpm clean` (`turbo clean` in both apps, then the root `node_modules`), `pnpm prepare` (`husky`)

`pnpm lint:fix` drops `--max-warnings 0`, so it exits 0 on warnings that `pnpm lint` and CI fail on.
Always finish with `pnpm lint`.

## Quality gates

- Pre-commit runs lint-staged (Prettier on the staged files, after ESLint on the apps' TS/JS files);
  commit-msg runs commitlint.
- CI (`.github/workflows/ci.yml`) has two jobs: `quality` (dependency review on pull requests,
  install, `check:allowbuilds`, `test:scripts`, `format:check`, `lint`, `typecheck`, `test`, `build`)
  and `e2e` (Playwright on three projects, then the web-server log check). `main` requires both jobs
  and `Commit messages`; renaming one of those jobs strands its required check (ADR 0021).
- Pull request titles are linted as the squash commit, with GitHub's ` (#NN)` suffix and without
  commitlint's default ignores, so keep them conventional and short.
- Warnings are errors. Lint runs with `--max-warnings 0` in both apps, so a warning fails CI.
- Every route must load with a clean browser console and pass axe in both colour schemes
  (`e2e/console-clean.spec.ts`, `e2e/accessibility.spec.ts`); never widen a budget or lower a floor
  to quieten a failure.
- `eslint-disable` is not an acceptable fix for the React Hooks rules. `react-hooks/set-state-in-effect`
  in particular is pointing at a real hydration problem: restructure the component instead. See
  `docs/adr/0006-hydration-safe-client-state.md` and `apps/web/src/hooks/use-is-hydrated.ts`.
- The docs drift check and the nightly flake hunt run outside the required checks.

## Conventions

- Conventional commits, enforced by `commitlint.config.mjs` (`@commitlint/config-conventional`).
  Branch prefixes match the commit type: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`.
- Formatting comes only from `packages/prettier-config`: semicolons, single quotes, trailing commas,
  two-space indent, 100 columns, LF, plus `prettier-plugin-tailwindcss`. Do not add local overrides.
- Data lives in `apps/web/src/data`. `case-studies.ts` is the single source of truth for project
  copy, metrics and tech stacks; pages read from it rather than restating any of it. Content dates
  live there too: each study's `publishedAt` and `updatedAt`, and `STATIC_ROUTE_UPDATED` in
  `static-routes.ts` for the static routes. They are the sitemap's `lastmod` and the case studies'
  TechArticle dates, so the commit that changes what a page visibly says bumps its date, and no
  other commit does.
- Server components by default. Add `'use client'` only where browser APIs, React state or GSAP are
  actually needed.
- Tailwind v4 is CSS-first: the theme is declared in `apps/web/src/app/globals.css` and compiled by
  `@tailwindcss/postcss`. There is no `tailwind.config.js` and there should not be one.
- Colour: `--accent` paints surfaces and `--accent-text` is the only accent allowed as text, status
  colours come from `--status-ok`, `--status-warn` and `--status-err`, and text is never dimmed with
  an opacity modifier (ADR 0011, 0010; the details are in `ui-components.md`).
- Layouts import components directly, never through the `components/index.ts` barrel, and no
  rendered component imports GSAP statically; lint fails on both (ADR 0009).
- `apps/web` resolves `@/*` to `src/*` (`paths` in `tsconfig.json`, mirrored by `resolve.alias` in
  `vitest.config.ts`). Import across folders as `@/components/...`, `@/data/...`, `@/hooks/...`, and
  keep relative imports for siblings inside one folder.

## Testing

- Unit tests sit next to the code in `__tests__` folders. `apps/web/vitest.config.ts` picks up
  `src/**/*.test.{ts,tsx}` in jsdom with globals enabled; `src/test/setup.ts` only imports
  `@testing-library/jest-dom/vitest`.
- e2e specs wait for hydration through `e2e/support/hydration.ts` (`gotoHydrated`,
  `expectHydrated`) before interacting, and for GSAP on `/` through `e2e/support/gsap.ts`.
- A flaky e2e test is root-caused before it is patched; the procedure and the tools are in
  `e2e-tests.md`.

## Working with this repo in Claude Code

- Trust facts, for auto mode and for any push: the repository is **public**
  (`github.com/milosCvetkovicDev/website`), so every push, pull request body and issue publishes.
  Keep confidential material, other repositories' code and machine paths out of it. `main` is
  protected: pull requests only, squash merge only, signed commits, required checks, no force
  pushes, the branch up to date with `main` and every review thread resolved (a CodeQL alert on a
  changed line arrives as one). Merging to `main` deploys `https://miloscvetkovic.dev` to production
  on Vercel.
- The PreToolUse guards in `.claude/settings.json` block some writes to `.env*`, `pnpm-lock.yaml`
  and build output; they are a partial backstop, and the Gotchas below are the rule.
- A PostToolUse hook runs `pnpm exec prettier --write` on files written inside `$CLAUDE_PROJECT_DIR`
  whose extension is `.ts .tsx .js .jsx .mjs .cjs .json .md .css .yml .yaml`, so do not hand-format
  those. Other extensions, `.mdx` and `.svg` among them, are left exactly as written. The
  Prettier call ends in `|| true`, so a formatting failure is silent and only surfaces at
  `pnpm format:check`.
- `.claude/agents/ui-reviewer.md` is a read-only review agent for `apps/web/src/components`: visual
  quality, GSAP cleanup and reduced motion, accessibility, component structure. Run it after
  changing a component, and name the changed files in its task: it has no shell to find them.
- Every change ships as a pull request, because `main`'s protection refuses direct pushes: branch,
  commit with a Conventional Commit title (Quality gates describes how the squash title is linted),
  open it with `gh pr create`, and poll CI until every check on the head commit is green before
  calling the work done. Never squash-merge without the owner's explicit approval.
  `.claude/skills/open-pr/SKILL.md` walks the whole sequence.
- Long-running work keeps a checkpoint, `.agent-state/<task-id>.json`, in the shape
  `scripts/agent-state.schema.json` defines: write it before the first step, update it after every
  commit, push, pull request or check result, and on resuming act on the contradictions that
  `scripts/agent-resume.sh` reports before anything else (`claude-code-config.md` has the rest).
  `git worktree remove` deletes a worktree's `.agent-state` without asking: copy out what is needed.
- Before opening a pull request, work the checklist in `.github/pull_request_template.md`, which
  lists every gate in CI order; do not keep a second copy of it here. Paste the commands and their
  real output into the Verification section; "seems fine" is not evidence.
- A reviewer other than the author reads the diff before it is merged: a person, or a review agent
  such as `ui-reviewer` for components. Findings go in the Review section of the pull request,
  written down rather than asserted.
- UI changes also get Playwright screenshots of the affected section in light, dark and mobile
  viewports before the pull request is opened.
- Merge to `main` by squash.

## Documentation

- `docs/plans` — `YYYY-MM-DD-topic-design.md` (what is being built and why) and
  `YYYY-MM-DD-topic-plan.md` (the ordered task list derived from it), indexed with status in
  `docs/plans/README.md`. Tasks are `- [ ]` checkboxes; tick them in the same commit as the work
  they describe.
- `docs/adr` — numbered records, indexed in `docs/adr/README.md`. An accepted record's `## Decision`
  is never edited: supersede it, or correct its other sections where they were false when it was
  accepted, under ADR 0012.
- Before editing a document that describes repository or CI settings, check each claim against the
  live settings (`gh api repos/milosCvetkovicDev/website`, `.../branches/main/protection`) rather
  than trusting the existing text, and cite code as a path with line numbers checked against
  current `main`.
- Before adding any AI-facing or machine-readable file — an `llms.txt` variant, a `.well-known`
  descriptor, a crawler directive, a new JSON-LD type — read
  `docs/adr/0017-ai-discoverability-policy.md`. It carries the crawler policy with its trade-off, what
  each measure of the AI-discoverability work is for and who consumes it, and eighteen mechanisms that
  were considered and refused, each with the source and date that settle it. Adding one of them means
  superseding that record rather than editing it, and deleting the matching assertion in
  `scripts/ai-refusals.test.mjs`.
- `docs/runbooks` — operational procedures. `docs/runbooks/deploy.md` is the deployment procedure.
- `README.md` addresses a reader landing on GitHub; this file addresses an agent about to change
  code. Keep them consistent without duplicating each other.

## Gotchas

- Non-interactive shells have neither node nor pnpm on PATH. Run
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` before any node, pnpm or npx command.
- A fresh clone or git worktree has no git hooks until `pnpm install` has run `prepare`.
- Never hand-edit `pnpm-lock.yaml`, `.next/`, `node_modules/` or `.env*`; change dependencies through
  pnpm (`dependencies.md` explains the lockfile's peer-suffix flips). Never run
  `pnpm approve-builds --all`: a new `Ignored build scripts` warning is a reviewed `allowBuilds`
  entry in `pnpm-workspace.yaml`.
- If `pnpm typecheck` disagrees with CI about a route another branch added, renamed or removed,
  `apps/web/.next-e2e` is stale: `pnpm --filter web clean`.
- `apps/web/README.md` is untouched `create-next-app` boilerplate: it says `npm run dev` and
  `app/page.tsx`, both wrong here. Ignore it. The root `README.md` and this file are the
  authoritative documents.
- `gh` intermittently fails on writes while reads keep working: `gh pr create` and `gh pr edit`
  return a GraphQL "Something went wrong" or a REST 502. Retry at most three times with a pause,
  and run `gh pr list --head <branch>` before each retry, because the pull request may have been
  created anyway. Set a body that did not land over REST:
  `gh api -X PATCH repos/{owner}/{repo}/pulls/<N> -F body=@<file>`.

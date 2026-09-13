# miloscvetkovic.dev

Personal site of Milos Cvetkovic, Senior Full-Stack Engineer. An interactive, animated portfolio built as a small Turborepo monorepo and used as a working example of how I ship software: written plans, tests before code, every quality gate enforced locally and in CI, and a documented deployment.

[![CI](https://github.com/milosCvetkovicDev/website/actions/workflows/ci.yml/badge.svg)](https://github.com/milosCvetkovicDev/website/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![React 19](https://img.shields.io/badge/React-19-149eca)
![pnpm 10](https://img.shields.io/badge/pnpm-10-f69220)
![Node 22](https://img.shields.io/badge/Node-22-339933)

## Live site

[https://miloscvetkovic.dev](https://miloscvetkovic.dev), deployed on Vercel from `main` and live since 2026-09-09. The exact steps, DNS records and verification checks are in [docs/runbooks/deploy.md](docs/runbooks/deploy.md).

## Stack

| Layer     | Choice                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, server components by default), React 19, TypeScript 5                           |
| Styling   | Tailwind CSS 4 (CSS-first config), Geist fonts                                                          |
| Motion    | GSAP 3 + ScrollTrigger for the scroll story, SMIL and CSS for decorative details                        |
| Monorepo  | Turborepo 2, pnpm 10 workspaces, Node 22                                                                |
| Tests     | Vitest 5 + Testing Library (unit), Playwright (end-to-end)                                              |
| Quality   | Prettier 3 with Tailwind class sorting, ESLint 9 (`eslint-config-next`), Husky, lint-staged, commitlint |
| Delivery  | GitHub Actions (SHA-pinned), Dependabot, Vercel                                                         |

## Repository layout

```
apps/
  web/            Next.js site (src/app routes, src/components, src/data, e2e/)
  playground/     Vite + React sandbox for experiments
packages/
  eslint-config/      shared ESLint presets (not yet wired into the apps)
  prettier-config/    shared Prettier config, referenced by prettier.config.mjs files
  typescript-config/  shared tsconfig bases (not yet wired into the apps)
scripts/          root scripts outside the workspaces: CI gates, Vercel's ignored build step, their tests
docs/
  adr/            architecture decision records
  plans/          design documents and step-by-step implementation plans with progress
  runbooks/       operational procedures (deployment)
.claude/          project-level Claude Code configuration (hooks, agents)
.github/          CI workflow, Dependabot, pull request template
```

## Getting started

Requirements: Node 22 and pnpm 10.33. `.nvmrc` and `package.json#packageManager` pin both, so `nvm use` and Corepack pick the right versions.

```bash
nvm use
corepack enable
pnpm install
pnpm dev:web
```

The site runs on `http://localhost:3000`. `pnpm dev:playground` starts the sandbox.

`pnpm install` runs no dependency build scripts: the packages pnpm 10 would ask about ship prebuilt binaries and are denied in `pnpm-workspace.yaml` ([ADR 0013](docs/adr/0013-dependency-build-scripts-reviewed.md)). Each denial records the version whose script was read, and `pnpm check:allowbuilds` fails CI when that drifts from the lockfile. A checkout from before the setting keeps printing the warning until `pnpm clean && pnpm install`.

## Quality gates

CI runs on every pull request and every push to `main` (`.github/workflows/ci.yml` limits its `push` trigger to `main`). Of the rows marked CI below, the `quality` job runs the first seven in the order listed and the `e2e` job runs the last. On each commit, Husky runs Prettier and ESLint over the staged files and commitlint over the commit message; commitlint does not run in CI.

| Command                      | What it checks                                                                      | Pre-commit         | CI  |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------ | --- |
| `pnpm check:allowbuilds`     | `allowBuilds` entries against the versions the lockfile resolves                    | -                  | yes |
| `pnpm test:scripts`          | `node:test` suites in `scripts/`: allowBuilds drift, AI refusals, Vercel build step | -                  | yes |
| `pnpm format:check`          | Prettier, shared config, Tailwind class order                                       | yes (staged files) | yes |
| `pnpm lint`                  | ESLint with `--max-warnings 0` in every app                                         | yes (staged files) | yes |
| commitlint                   | Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, ...)                  | yes                | -   |
| `pnpm typecheck`             | `next typegen && tsc --noEmit` (web), `tsc -b` (playground)                         | -                  | yes |
| `pnpm test`                  | Vitest unit tests                                                                   | -                  | yes |
| `pnpm build`                 | Production builds of both apps                                                      | -                  | yes |
| `pnpm --filter web test:e2e` | Playwright against the production build                                             | -                  | yes |

Useful extras: `pnpm lint:fix`, `pnpm format`, `pnpm clean`.

## Testing

- **Unit tests** live next to the code in `__tests__` folders. jsdom is the default environment; a file with no DOM in it opts out with an `@vitest-environment node` docblock at the top, as the three `apps/web/src/data/__tests__` files do, because building a jsdom window costs about two seconds in every worker (see the Testing section of [CLAUDE.md](CLAUDE.md)). Components that read `matchMedia` or `IntersectionObserver` stub them explicitly (see `apps/web/src/components/__tests__/featured-work.test.tsx`); there is no global mock, so a component that forgets to guard those APIs fails loudly.
- **End-to-end tests** live in `apps/web/e2e`. Playwright always starts the server it tests, on port 3210 by default and 3000 in the CI job, which sets `PLAYWRIGHT_PORT`, so a port that is already taken aborts the run instead of testing whatever is answering on it; under `CI=true` it serves the production build with one worker and two retries. The console and accessibility gates opt out of those retries, because a retry turns an intermittent failure into a green run. Interactions must wait for hydration: the hero spec waits for the boot loader to disappear before scrolling or clicking, because event listeners only exist after React mounts.
- **Visual checks** are done with Playwright screenshots of the affected section in light, dark and mobile viewports before a UI pull request is opened.

## Conventions

- Conventional Commits, enforced by commitlint. Squash merges into `main`; branch names `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`.
- Formatting comes from `packages/prettier-config` (single quotes, 100 columns, trailing commas, Tailwind class sorting). Do not add editor-specific formatting rules; `.editorconfig` and `.vscode/settings.json` point editors at the same config.
- Lint warnings are errors. Fix the pattern instead of adding `eslint-disable`; the React Hooks rules in particular point at real hydration and cascading-render bugs (see [ADR 0006](docs/adr/0006-hydration-safe-client-state.md)).
- Data lives in `apps/web/src/data`, not in components. Case studies are the single source of truth for project copy and metrics.
- Every pull request fills in the template: what changed, the commands run with their results, and who reviewed it besides the author.

## Working with Claude Code

This repository is developed with Claude Code and keeps its configuration in the repo:

- `.claude/settings.json` wires two `PreToolUse` guards, and they do not cover the same ground. The file-tool guard blocks writes to `.env*` (except `.env.example`), `pnpm-lock.yaml`, `node_modules`, `.next` and `dist`. The shell guard is narrower: it blocks only commands that would write `.env*` or `pnpm-lock.yaml`, so nothing stops a shell command writing into `node_modules`, `.next` or `dist`. Treat the full list as the rule and the hooks as a partial backstop; [CLAUDE.md](CLAUDE.md) states the same split. A `PostToolUse` hook formats every written file with Prettier.
- `.claude/agents/ui-reviewer.md` reviews components for visual quality, accessibility and the project's patterns. Reviews by an agent other than the author are part of the definition of done.
- Work is planned before it is built: design documents and step-by-step plans with checkboxes live in [docs/plans](docs/plans/README.md), and decisions that outlive a pull request are recorded in [docs/adr](docs/adr/README.md).

## Documentation map

| Where                                              | What                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| [docs/plans/README.md](docs/plans/README.md)       | Index of design documents and implementation plans with status |
| [docs/adr/README.md](docs/adr/README.md)           | Architecture decision records                                  |
| [docs/runbooks/deploy.md](docs/runbooks/deploy.md) | Deploying to Vercel, DNS, verification, rollback               |
| [CLAUDE.md](CLAUDE.md)                             | Instructions for AI-assisted development in this repository    |

## Deployment

The `web` app deploys to Vercel from `main` (project `portfolio`) with preview deployments for pull requests, except that Dependabot branches create no deployment and a later push that changes no build input has its preview build cancelled ([ADR 0016](docs/adr/0016-vercel-deployment-budget.md)). Root directory `apps/web`, Node 22, one environment variable (`NEXT_PUBLIC_SITE_URL`), and `.vercelignore` keeps caches and local files out of what Vercel receives, from Git-triggered builds and CLI uploads alike. Full procedure: [docs/runbooks/deploy.md](docs/runbooks/deploy.md).

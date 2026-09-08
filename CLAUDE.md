# Portfolio

Personal portfolio site. A Turborepo 2 + pnpm monorepo whose only shipping app is the Next.js site in
`apps/web`.

## Architecture

pnpm 10.33 workspace (`apps/*`, `packages/*`) driven by Turborepo. Node 22 is pinned in `.nvmrc`,
`engines.node` and `packageManager`.

- `apps/web` — the site. Next.js 16 (App Router), React 19, Tailwind v4, GSAP + `@gsap/react`.
  Source in `src/{app,components,data,hooks,test}`, e2e specs in `e2e/`.
- `apps/playground` — Vite 7 + React sandbox. Not deployed, no tests.
- `packages/prettier-config` — `@repo/prettier-config`. Referenced by `prettier.config.mjs` at the
  repo root and by `apps/web/prettier.config.mjs`, which adds
  `tailwindStylesheet: './src/app/globals.css'` so the class sorter sees the theme.
- `packages/eslint-config` and `packages/typescript-config` exist but no app references them yet.
  `apps/web` lints through its own `eslint.config.mjs` built on `eslint-config-next`, and each app
  has its own `tsconfig.json`.

## Routes (App Router)

`/`, `/about`, `/blog`, `/contact`, `/skills`, `/work`, `/work/[slug]`.

`apps/web/src/app` also holds `sitemap.ts`, `robots.ts`, `error.tsx` and `not-found.tsx`. Those two
route handlers plus `layout.tsx` and `components/json-ld.tsx` read `NEXT_PUBLIC_SITE_URL`, falling
back to `https://miloscvetkovic.dev`.

## Commands

| Command                                                          | What it does                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                                       | `turbo dev` across every app                                            |
| `pnpm dev:web`                                                   | Next.js dev server on port 3000                                         |
| `pnpm dev:playground`                                            | Vite dev server for the sandbox                                         |
| `pnpm build`                                                     | `next build` (web) and `tsc -b && vite build` (playground)              |
| `pnpm lint`                                                      | ESLint in each app with `--max-warnings 0`                              |
| `pnpm lint:fix`                                                  | The same with `--fix`                                                   |
| `pnpm typecheck`                                                 | `next typegen && tsc --noEmit` (web), `tsc -b` (playground)             |
| `pnpm test`                                                      | Vitest unit tests (web only)                                            |
| `pnpm test:e2e`                                                  | Playwright specs in `apps/web/e2e`                                      |
| `pnpm format`                                                    | Prettier over the whole repo, writing changes                           |
| `pnpm format:check`                                              | Prettier in check mode, no writes                                       |
| `pnpm clean`                                                     | Removes build output and `node_modules` everywhere                      |
| `pnpm prepare`                                                   | `husky`; runs on install and is what creates the git hooks              |
| `pnpm --filter web test:e2e`                                     | Playwright without going through Turborepo                              |
| `pnpm --filter web test:watch`                                   | Vitest in watch mode                                                    |
| `pnpm --filter web exec vitest run <path>`                       | One unit test file, e.g. `src/hooks/__tests__/use-is-hydrated.test.tsx` |
| `pnpm --filter web exec playwright install --with-deps chromium` | Needed once before the first e2e run                                    |

`typecheck` and `test` depend on `^build` in `turbo.json`, so a cold run builds dependencies first.

## Quality gates

- On commit: `.husky/pre-commit` runs `pnpm exec lint-staged`, `.husky/commit-msg` runs
  `pnpm exec commitlint --edit "$1"`. Both source `~/.nvm/nvm.sh` if pnpm is missing and abort with a
  message if it is still not on PATH.
- lint-staged has a config per package. The root one only runs `prettier --write`; `apps/web` and
  `apps/playground` run `eslint --fix --max-warnings 0` then `prettier --write` on TS/JS files.
- CI is `.github/workflows/ci.yml`, two jobs. `quality`: install, `format:check`, `lint`,
  `typecheck`, `test`, `build`. `e2e`: install chromium, build web, run the Playwright specs; the
  report is uploaded as an artifact on failure or cancellation. Actions are SHA-pinned,
  `permissions: contents: read`, and concurrency cancels superseded runs on pull requests only.
- Warnings are errors. Lint runs with `--max-warnings 0` in both apps, so a warning fails CI.
- `eslint-disable` is not an acceptable fix for the React Hooks rules. `react-hooks/set-state-in-effect`
  in particular is pointing at a real hydration problem: restructure the component instead. See
  `docs/adr/0006-hydration-safe-client-state.md` and `apps/web/src/hooks/use-is-hydrated.ts`.
- Dependabot runs weekly for npm and github-actions, minor and patch grouped.

## Conventions

- Conventional commits, enforced by `commitlint.config.mjs` (`@commitlint/config-conventional`).
  Branch prefixes match the commit type: `feat/`, `fix/`, `chore/`, `docs/`.
- Formatting comes only from `packages/prettier-config`: semicolons, single quotes, trailing commas,
  two-space indent, 100 columns, LF, plus `prettier-plugin-tailwindcss`. Do not add local overrides.
- Data lives in `apps/web/src/data`. `case-studies.ts` is the single source of truth for project
  copy, metrics and tech stacks; pages read from it rather than restating any of it.
- Server components by default. Add `'use client'` only where browser APIs, React state or GSAP are
  actually needed.
- Tailwind v4 is CSS-first: the theme is declared in `apps/web/src/app/globals.css` and compiled by
  `@tailwindcss/postcss`. There is no `tailwind.config.js` and there should not be one.
- Components live in `apps/web/src/components` with `index.ts` re-exporting them; the hero and its
  phases are in `components/animated-hero`.

## Testing

- Unit tests sit next to the code in `__tests__` folders. `apps/web/vitest.config.ts` picks up
  `src/**/*.test.{ts,tsx}` in jsdom with globals enabled; `src/test/setup.ts` only imports
  `@testing-library/jest-dom/vitest`.
- Browser APIs are stubbed per test file, not globally. `matchMedia` and `IntersectionObserver` are
  defined in a `beforeEach` inside the file that needs them, as in
  `src/components/animated-hero/__tests__/tmux-background.test.tsx`. Keep new stubs local too.
- e2e specs must wait for hydration before interacting, because events fired before it are lost.
  `e2e/hero.spec.ts` waits for the `System Boot` loader to be hidden, and also asserts the page title
  to catch a stray dev server on port 3000.
- `apps/web/playwright.config.ts` treats `CI=true` or `CI=1` as CI: it serves the production build
  with `pnpm start`, retries twice, uses one worker and a 10s expect timeout. Locally it reuses a
  running dev server on port 3000.

## Working with this repo in Claude Code

- `.claude/settings.json` PreToolUse hooks block writes to `.env*` (except `.env.example`),
  `pnpm-lock.yaml`, `node_modules`, `.next` and `dist`, both through Edit/Write and through Bash
  commands that would redirect into or rewrite those paths. Both hooks require `jq` and fail closed
  without it.
- A PostToolUse hook runs `pnpm exec prettier --write` on every file written inside the project, so
  do not hand-format TS, JS, JSON, Markdown, CSS or YAML.
- `.claude/agents/ui-reviewer.md` is a read-only review agent for `apps/web/src/components`: visual
  quality, GSAP cleanup and reduced motion, accessibility, component structure. Run it after
  changing a component.
- A change is reviewed by someone other than its author before it is opened for review, and the
  findings are written down rather than asserted.

## Documentation

- `docs/plans` — designs and implementation plans, dated filenames, tasks as `- [ ]` checkboxes.
  Tick the boxes in the same commit as the work they describe.
- `docs/adr` — numbered architecture decision records.
- `docs/runbooks` — operational procedures, including deployment.
- `README.md` addresses a reader landing on GitHub; this file addresses an agent about to change
  code. Keep them consistent without duplicating each other.

## Gotchas

- Non-interactive shells have neither node nor pnpm on PATH. Run
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` before any node, pnpm or npx command.
- A fresh clone or git worktree has no git hooks until `pnpm install` has run `prepare`.
- Never hand-edit `pnpm-lock.yaml`, `.next/`, `node_modules/` or `.env*`; change dependencies through
  pnpm.
- The site is not deployed yet. `miloscvetkovic.dev` still points at a registrar parking page, and
  no Vercel project has been created.

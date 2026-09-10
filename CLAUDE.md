# Portfolio

Personal portfolio site. A Turborepo 2 + pnpm monorepo whose only shipping app is the Next.js site in
`apps/web`.

## Architecture

pnpm 10.33 workspace (`apps/*`, `packages/*`, per `pnpm-workspace.yaml`) driven by Turborepo 2.10.
Node 22 is pinned in `.nvmrc` only; `engines.node` sets a `>=22` floor and `packageManager` pins
pnpm (`pnpm@10.33.0`), not Node. CI reads Node from `.nvmrc` and pnpm from `packageManager`.

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

`apps/web/src/app` also holds the metadata files `sitemap.ts` and `robots.ts`, plus `error.tsx` and
`not-found.tsx`. `sitemap.ts`, `robots.ts`, `layout.tsx` and `components/json-ld.tsx` each read
`NEXT_PUBLIC_SITE_URL`, falling back to `https://miloscvetkovic.dev`. There are no route handlers
(`route.ts`) and no middleware.

## Commands

| Command                                                          | What it does                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                                       | `turbo dev` across every app                                            |
| `pnpm dev:web`                                                   | Next.js dev server on port 3000                                         |
| `pnpm dev:playground`                                            | Vite dev server for the sandbox                                         |
| `pnpm build`                                                     | `next build` (web) and `tsc -b && vite build` (playground)              |
| `pnpm lint`                                                      | ESLint in each app with `--max-warnings 0`                              |
| `pnpm lint:fix`                                                  | `eslint --fix` in each app, without `--max-warnings 0`                  |
| `pnpm typecheck`                                                 | `next typegen && tsc --noEmit` (web), `tsc -b` (playground)             |
| `pnpm test`                                                      | Vitest unit tests (web only)                                            |
| `pnpm test:e2e`                                                  | Playwright specs in `apps/web/e2e`                                      |
| `pnpm format`                                                    | Prettier over the whole repo, writing changes                           |
| `pnpm format:check`                                              | Prettier in check mode, no writes                                       |
| `pnpm clean`                                                     | `turbo clean` in both apps, then `rm -rf node_modules` at the root      |
| `pnpm prepare`                                                   | `husky`; runs on install and is what creates the git hooks              |
| `pnpm --filter web test:e2e`                                     | Playwright without going through Turborepo                              |
| `pnpm --filter web test:watch`                                   | Vitest in watch mode                                                    |
| `pnpm --filter web exec vitest run <path>`                       | One unit test file, e.g. `src/hooks/__tests__/use-is-hydrated.test.tsx` |
| `pnpm --filter web exec playwright install --with-deps chromium` | Needed once before the first e2e run                                    |

`pnpm lint:fix` drops `--max-warnings 0`, so it exits 0 on warnings that `pnpm lint` and CI fail on.
Always finish with `pnpm lint`.

`pnpm clean` only reaches the two apps, because `packages/*` define no `clean` task. Their
`node_modules` survive it and have to be deleted by hand before a truly cold reinstall.

`typecheck` and `test` declare `dependsOn: ["^build"]` in `turbo.json`. Nothing an app depends on
has a `build` task today (`@repo/prettier-config` is config only), so this is currently a no-op. It
is there so that a future buildable package is compiled before the apps typecheck against it.

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
- Dependabot runs weekly on Mondays for npm and github-actions. Minor and patch npm updates are
  grouped into one pull request and open npm pull requests are capped at five; github-actions bumps
  are not grouped.

## Conventions

- Conventional commits, enforced by `commitlint.config.mjs` (`@commitlint/config-conventional`).
  Branch prefixes match the commit type: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`.
- Formatting comes only from `packages/prettier-config`: semicolons, single quotes, trailing commas,
  two-space indent, 100 columns, LF, plus `prettier-plugin-tailwindcss`. Do not add local overrides.
- Data lives in `apps/web/src/data`. `case-studies.ts` is the single source of truth for project
  copy, metrics and tech stacks; pages read from it rather than restating any of it.
- Server components by default. Add `'use client'` only where browser APIs, React state or GSAP are
  actually needed.
- Tailwind v4 is CSS-first: the theme is declared in `apps/web/src/app/globals.css` and compiled by
  `@tailwindcss/postcss`. There is no `tailwind.config.js` and there should not be one.
- Components live in `apps/web/src/components`. `index.ts` is a barrel for the page-level ones
  (`ThemeProvider`, `useTheme`, `Navigation`, `Footer`, `Highlights`, `FeaturedWork`, `TechStack`,
  `CTA`, `PersonJsonLd`, `WebsiteJsonLd`). The hero and its phases live in
  `components/animated-hero` and are imported from there directly, not through the barrel.
  `app/layout.tsx` also imports from the component modules directly: every client module reachable
  from a server component's imports lands in that layout's client chunk, so a barrel import there
  would ship `FeaturedWork` to every route (see ADR 0009).
- `apps/web` resolves `@/*` to `src/*` (`paths` in `tsconfig.json`, mirrored by `resolve.alias` in
  `vitest.config.ts`). Import across folders as `@/components/...`, `@/data/...`, `@/hooks/...`, and
  keep relative imports for siblings inside one folder.

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
  with `pnpm start` inside `apps/web`, sets `forbidOnly`, retries twice, uses one worker and a 10s
  expect timeout. Locally it reuses a running dev server on port 3000.

## Working with this repo in Claude Code

- `.claude/settings.json` wires two PreToolUse guards, and they are not equivalent. The `Edit|Write`
  guard blocks writes to `.env*` (except `.env.example`), `pnpm-lock.yaml`, `node_modules/`,
  `.next/` and `dist/`, and fails closed (`exit 2`) when `jq` is missing. The `Bash` guard is
  narrower: it blocks only shell commands that redirect into or rewrite `.env*` or
  `pnpm-lock.yaml`, and it exits 0, allowing the command, when `jq` is missing. Nothing stops a
  shell command from writing into `node_modules/`, `.next/` or `dist/`. Treat the Gotchas list below
  as the rule; the hooks are a partial backstop, not the boundary.
- A PostToolUse hook runs `pnpm exec prettier --write` on files written inside `$CLAUDE_PROJECT_DIR`
  whose extension is `.ts .tsx .js .jsx .mjs .cjs .json .md .css .yml .yaml`, so do not hand-format
  those. Other extensions, `.mdx` and `.svg` among them, are left exactly as written. The
  Prettier call ends in `|| true`, so a formatting failure is silent and only surfaces at
  `pnpm format:check`.
- `.claude/agents/ui-reviewer.md` is a read-only review agent for `apps/web/src/components`: visual
  quality, GSAP cleanup and reduced motion, accessibility, component structure. Run it after
  changing a component.
- Before opening a pull request, work the checklist in `.github/pull_request_template.md`:
  `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus
  `pnpm --filter web test:e2e` when the UI changed. Paste the commands and their real output into
  the Verification section; "seems fine" is not evidence.
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
- `docs/adr` — numbered architecture decision records, indexed in `docs/adr/README.md`. Naming is
  `NNNN-kebab-title.md`, numbers are never reused, and the section order is Status, Date, Context,
  Decision, Consequences, Alternatives considered. An accepted record is not edited: supersede it
  with a new number and set the old status to `Superseded by NNNN`.
- `docs/runbooks` — operational procedures. `docs/runbooks/deploy.md` is the deployment procedure.
- `README.md` addresses a reader landing on GitHub; this file addresses an agent about to change
  code. Keep them consistent without duplicating each other.

## Gotchas

- Non-interactive shells have neither node nor pnpm on PATH. Run
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` before any node, pnpm or npx command.
- A fresh clone or git worktree has no git hooks until `pnpm install` has run `prepare`.
- Never hand-edit `pnpm-lock.yaml`, `.next/`, `node_modules/` or `.env*`; change dependencies through
  pnpm.
- `apps/web/README.md` is untouched `create-next-app` boilerplate: it says `npm run dev` and
  `app/page.tsx`, both wrong here. Ignore it. The root `README.md` and this file are the
  authoritative documents.
- To reproduce the CI e2e run locally:
  `pnpm --filter web build && CI=true pnpm --filter web test:e2e`. `pnpm --filter web start` serves
  the production build on port 3000 on its own.
- To point the site at a non-default origin locally, copy the root `.env.example` to
  `apps/web/.env.local` yourself; the PreToolUse guard blocks agent writes to `.env*`.
- The site is not deployed yet. `miloscvetkovic.dev` still points at a registrar parking page, and
  no Vercel project has been created.

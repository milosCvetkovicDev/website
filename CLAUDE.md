# Portfolio

Personal portfolio site. A Turborepo 2 + pnpm monorepo whose only shipping app is the Next.js site in
`apps/web`.

## Architecture

pnpm 10.33 workspace (`apps/*`, `packages/*`, per `pnpm-workspace.yaml`) driven by Turborepo 2.10.
Node 22 is pinned in `.nvmrc` only; `engines.node` sets a `>=22` floor and `packageManager` pins
pnpm (`pnpm@10.33.0`), not Node. CI reads Node from `.nvmrc` and pnpm from `packageManager`.

- `apps/web` — the site. Next.js 16 (App Router), React 19, Tailwind v4, GSAP + `@gsap/react`.
  Source in `src/{app,components,data,hooks,lib,test}`, e2e specs in `e2e/`.
- `apps/playground` — Vite 7 + React sandbox. Not deployed, no tests.
- `packages/prettier-config` — `@repo/prettier-config`. Referenced by `prettier.config.mjs` at the
  repo root and by `apps/web/prettier.config.mjs`, which adds
  `tailwindStylesheet: './src/app/globals.css'` so the class sorter sees the theme.
- `scripts/` at the repository root holds the scripts that run outside the apps:
  `check-allowbuilds-drift.mjs` (`pnpm check:allowbuilds`), `vercel-ignore-build.mjs` (Vercel's
  ignored build step, ADR 0016), and the `node:test` suites that `pnpm test:scripts` runs, one for
  each of those two plus `ai-refusals.test.mjs`. It is not a workspace and Turbo does not see it.
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

| Command                                                                 | What it does                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                                              | `turbo dev` across every app                                                                                                                                                         |
| `pnpm dev:web`                                                          | Next.js dev server on port 3000                                                                                                                                                      |
| `pnpm dev:playground`                                                   | Vite dev server for the sandbox                                                                                                                                                      |
| `pnpm build`                                                            | `next build` (web) and `tsc -b && vite build` (playground)                                                                                                                           |
| `pnpm lint`                                                             | ESLint in each app with `--max-warnings 0`                                                                                                                                           |
| `pnpm lint:fix`                                                         | `eslint --fix` in each app, without `--max-warnings 0`                                                                                                                               |
| `pnpm typecheck`                                                        | `next typegen && tsc --noEmit` (web), `tsc -b` (playground)                                                                                                                          |
| `pnpm test`                                                             | Vitest unit tests (web only)                                                                                                                                                         |
| `pnpm test:e2e`                                                         | Playwright specs in `apps/web/e2e`; `turbo.json` gives it `dependsOn: ["build"]`, so the root script builds `web` first. Prefer `pnpm --filter web test:e2e` locally, which does not |
| `pnpm format`                                                           | Prettier over the whole repo, writing changes                                                                                                                                        |
| `pnpm format:check`                                                     | Prettier in check mode, no writes                                                                                                                                                    |
| `pnpm check:allowbuilds`                                                | Checks `allowBuilds` entries against the versions the lockfile resolves                                                                                                              |
| `pnpm test:scripts`                                                     | `node:test` tests for the root `scripts/` gates                                                                                                                                      |
| `pnpm clean`                                                            | `turbo clean` in both apps, then `rm -rf node_modules` at the root                                                                                                                   |
| `pnpm prepare`                                                          | `husky`; runs on install and is what creates the git hooks                                                                                                                           |
| `pnpm --filter web test:e2e`                                            | Playwright without going through Turborepo                                                                                                                                           |
| `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`                       | Playwright on a port other than the default 3210                                                                                                                                     |
| `pnpm --filter web test:watch`                                          | Vitest in watch mode                                                                                                                                                                 |
| `pnpm --filter web exec vitest run <path>`                              | One unit test file, e.g. `src/hooks/__tests__/use-is-hydrated.test.tsx`                                                                                                              |
| `pnpm --filter web exec playwright install --with-deps chromium webkit` | Needed once before the first e2e run; the phone projects need webkit                                                                                                                 |

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
- CI is `.github/workflows/ci.yml`, two jobs. `quality`: install, `check:allowbuilds`,
  `test:scripts`, `format:check`, `lint`, `typecheck`, `test`, `build`. `e2e`: install chromium and
  webkit, build web, run the Playwright specs on all three projects; the report is uploaded as an
  artifact on failure or cancellation. Actions are SHA-pinned, `permissions: contents: read`, and
  concurrency cancels superseded runs on pull requests only.
- `main` has branch protection on, and both CI jobs are required checks. A required check is stored
  as the job's display name, so the two required contexts are the `name:` values in
  `.github/workflows/ci.yml` character for character, and a comment above each says so: renaming
  either job strands a required check that never reports and blocks every pull request. Protection
  also requires the branch to be up to date with `main`, signed commits, linear history (merge
  commits are refused; landing as a squash is the convention below, and rebase merging is also
  enabled) and
  resolved review threads, and it applies to administrators. Approving reviews required: 0, so the
  reviewer rule below is convention, not enforcement. See
  `docs/adr/0020-branch-protection-on-main.md`.
- Warnings are errors. Lint runs with `--max-warnings 0` in both apps, so a warning fails CI.
- Every route must load with a clean browser console, in both colour schemes.
  `apps/web/e2e/console-clean.spec.ts` fails on any console error, console warning or page error,
  React hydration mismatches included, so a stray `console.warn` fails the `e2e` job. Its routes come
  from `apps/web/e2e/routes.ts`, the one list the accessibility gate reads too: the six static
  routes, every case study derived from `src/data/case-studies.ts`, and a 404. `/` is also walked
  down through the story and back up (light scheme only), so the scroll-driven GSAP callbacks and the
  timers they schedule are watched too. The reduced-motion pass cannot cover those: every phase
  effect returns early under `reduce`.
- `eslint-disable` is not an acceptable fix for the React Hooks rules. `react-hooks/set-state-in-effect`
  in particular is pointing at a real hydration problem: restructure the component instead. See
  `docs/adr/0006-hydration-safe-client-state.md` and `apps/web/src/hooks/use-is-hydrated.ts`.
- Accessibility is gated. `apps/web/e2e/accessibility.spec.ts` runs axe-core with the rule set
  behind Lighthouse's accessibility category (kept in `e2e/axe.ts`) on all ten routes in
  `e2e/routes.ts`, in both colour schemes at the desktop viewport, at rest; again on `/` after the
  whole story has been scrolled; and again on `/` with a header nav link hovered and with one focused.
  `e2e/mobile/accessibility.spec.ts` runs the at-rest pass on `/` and `/work/self-healing-agent`
  under both phone projects. Any violation fails the `e2e` job. Each pass asserts a floor on how many
  nodes it measured, so content that stops being rendered or goes transparent fails too. Each
  desktop at-rest pass also holds a per-route, per-scheme budget of `incomplete` colour-contrast
  nodes (`INCOMPLETE_CONTRAST_BUDGET`): axe cannot decide text over a `backdrop-filter` or a
  gradient and does not count it as a violation, so that undecidable region may shrink but never
  grow. The budget is zero on eight of the ten routes, so the first blurred panel put behind text
  there fails; never widen a budget or lower a floor to quieten a failure. A new
  `text-[var(--accent)]` or an opacity-dimmed label fails there; see the accent token bullet under
  Conventions and ADR 0011, which superseded 0008.
- The AI-facing refusals are gated. `scripts/ai-refusals.test.mjs` runs under `pnpm test:scripts` and
  fails when a mechanism `docs/adr/0017-ai-discoverability-policy.md` refuses reappears: an
  `llms-full.txt`, `ai.txt`, `tdmrep.json`, `ai-plugin.json`, `agents.json`, `cv.json`, `resume.json`
  or `agent-skills` path anywhere under `apps/web`, an `AGENTS.md` under `apps/web/public` or as a
  route directory under the app router, a
  `middleware.ts` or `proxy.ts`, a `FAQPage`, `HowTo`, `speakable`, `SearchAction`, `potentialAction`
  or `modelContext` string under `apps/web/src`, an IndexNow reference, a `Content-Signal` line or a
  second `userAgent` group in `robots.ts`, or a `nonce` in `next.config.ts`. It also fails when that
  record's refusal table loses a row, a source URL or a date. Adding one of these is a deliberate
  act: supersede the record and delete the matching assertion in the same pull request.
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
- The accent colour has two tokens with different roles (ADR 0011, superseding 0008). `--accent` paints surfaces:
  solid fills that carry white text, borders, indicators and the `bg-[var(--accent)]/10` tints.
  `--accent-text` is the accent as text and the only accent allowed in a `text-` utility or a
  `color` style, because `--accent` misses WCAG AA as text in the dark theme (3.5:1 on the
  background, 3.2:1 on the card).
  Decorative SVG frames, brackets and lines drawn with `currentColor` keep `--accent`; icons that
  sit with text take `--accent-text`. A component with a hard-coded dark background scopes the dark
  tokens with the `dark` class **and** sets `color` on that same element: `color` inherits as an
  already-resolved value, so scoping alone leaves an unclassed child with the page theme's colour. Never dim text with an opacity modifier such as `/60` to make
  it look secondary, not even `aria-hidden` text (axe measures it anyway); use `--muted` instead.
  Never let a GSAP `from()`, `fromTo()` or `set()` leave text at a partial opacity: the "from"
  state renders immediately, before any scroll trigger fires.
- Status colours come from three theme tokens (ADR 0010): `--status-ok`, `--status-warn` and
  `--status-err`, used as `text-[var(--status-ok)]`, `bg-[var(--status-ok)]/10`,
  `border-[var(--status-ok)]/50` and so on for text, icons, borders, tints, bars, dots and glows
  alike, in the hero and on the work pages. Never use a palette status class such as
  `text-green-400` or `bg-red-500` in a component, nor a hard-coded status hex with a `dark:`
  override, and never dim status text: no alpha modifier on a status token used as a text colour
  and no resting `opacity-*` below 100 on an element whose text carries one (a reveal from
  `opacity-0` to full is fine). The light values are the first shades that pass AA on the HUD
  panels and on their own tints; anything dimmer fails. Inside `Terminal` the tokens resolve to
  their dark values in both themes.
- Components live in `apps/web/src/components`. `index.ts` is a barrel for the page-level ones
  (`ThemeProvider`, `useTheme`, `Navigation`, `Footer`, `Highlights`, `FeaturedWork`, `TechStack`,
  `CTA`, `PersonJsonLd`, `WebsiteJsonLd`). The hero and its phases live in
  `components/animated-hero` and are imported from there directly, not through the barrel.
  Layouts import from the component modules directly, never through the barrel: every client module
  reachable from a server component's imports lands in that layout's client chunk, so a barrel
  import in `app/layout.tsx` would ship `FeaturedWork` to every route (see ADR 0009). A
  `no-restricted-imports` rule in `apps/web/eslint.config.mjs`, scoped to `src/app/**/layout.tsx`,
  fails lint on it.
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
- Building a jsdom window costs about two seconds in every worker, and it is by far the largest
  single cost in the suite. A test file with no DOM in it declares `@vitest-environment node` in a
  docblock at the top, as the three `src/data/__tests__` files do.
- Two query patterns dominate a slow test file, and a CPU profile says which. `getByRole` with a
  `name` option recomputes the accessible name of every candidate on every call, so resolve an
  element once and reuse it unless the accessible name is what the test is asserting. And every
  GSAP tween reads its start value through `getComputedStyle`, which jsdom answers by matching its
  user-agent stylesheet against the element, so a mount that builds a timeline is expensive:
  prefer walking one mount through a lifecycle over re-mounting per assertion.
- `testTimeout` stays at the 5s default. A test that genuinely needs longer takes an explicit
  timeout as `it`'s third argument, with a comment saying why, as the phase lifecycle test in
  `src/components/animated-hero/__tests__/story-phases.test.tsx` does. Raising the global default
  hides the next slow test instead.
- e2e specs must wait for hydration before interacting, because events fired before it are lost.
  `e2e/hero.spec.ts` waits for the `System Boot` loader to be hidden, and also asserts the page
  title. That assertion is only a smoke check that the app rendered: it never could catch a second
  checkout of this site, which serves the same title character for character, and the not-found and
  error pages carry it too. Status and path are what catch a wrong page.
- `apps/web/playwright.config.ts` treats `CI=true` or `CI=1` as CI: it serves the production build
  with `pnpm start` inside `apps/web`, sets `forbidOnly`, retries twice, uses one worker and a 10s
  expect timeout. Locally it serves the dev server instead.
- It declares three projects. The desktop `chromium` project runs every spec outside `e2e/mobile/`;
  `mobile-chrome` (Pixel 7) and `mobile-safari` (iPhone 13, WebKit) run only `e2e/mobile/`, which is
  where a spec goes when it needs a phone viewport or `isMobile`. `src/test/playwright-config.test.ts`
  pins the split. A run that fails every test in milliseconds is a missing browser, usually webkit
  after a Playwright bump: rerun the install command with `chromium webkit`.
- Verified defects that an open task will fix are recorded as expected failures, `test.fail()` in
  Playwright and `it.fails` in Vitest, each naming its manifest row and fixing issue (see
  `.claude/epics/audit-remediation-2026-09/43.md`). An expected failure that passes fails the run, so
  the pull request that fixes the defect deletes the annotation in the same change.
- The two gate specs opt out of those retries: `e2e/console-clean.spec.ts` and
  `e2e/accessibility.spec.ts` both set `test.describe.configure({ retries: 0 })`, and so does every
  spec that carries an expected failure. A retry would turn an intermittent console message or axe
  violation, or an expected failure that has started passing, into a green "flaky" run, which is the
  one outcome they exist to prevent. Do not remove those overrides to quieten a failing run.
- Playwright always starts the server it tests. `reuseExistingServer` is `false` in both modes, so a
  port that is already taken aborts the run instead of testing whatever is answering on it. The port
  is 3210 by default, which leaves 3000 to `pnpm dev`; `.github/workflows/ci.yml` sets
  `PLAYWRIGHT_PORT: '3000'` on the `e2e` job, and `PLAYWRIGHT_PORT` overrides the default anywhere
  else. A value that is not an integer between 1 and 65535 throws at config load rather than falling
  back. The local dev server also builds into `.next-e2e` (`NEXT_DIST_DIR`, read by
  `apps/web/next.config.ts`), so it never fights a `pnpm dev` from the same checkout over
  `apps/web/.next`. See `docs/adr/0014-playwright-owns-its-server.md`.

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
- `.mcp.json` is tracked and configures one MCP server for this project, over HTTP. It needs
  authorising once per machine before its tools work, and nothing in the repository depends on it.
- `.claude/agents/ui-reviewer.md` is a read-only review agent for `apps/web/src/components`: visual
  quality, GSAP cleanup and reduced motion, accessibility, component structure. Run it after
  changing a component.
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
- `docs/adr` — numbered architecture decision records, indexed in `docs/adr/README.md`. Naming is
  `NNNN-kebab-title.md`, numbers are never reused, and the section order is Status, Date, Context,
  Decision, Consequences, Alternatives considered, optionally followed by Corrections. An accepted
  record's `## Decision` is never edited: supersede it with a new number and set the old status to
  `Superseded by ADR-NNNN`. Its other sections may be corrected when they state something that was
  false when the record was accepted, under the rules in
  `docs/adr/0012-correcting-accepted-records.md`, which sets the status to
  `Accepted (corrected YYYY-MM-DD)` and adds a dated, append-only `## Corrections` entry.
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
- `apps/web/next.config.ts` pins `turbopack.root` (which is also the file tracing root) to the
  workspace root, found by walking up from the directory Next evaluates the config in until a
  `pnpm-workspace.yaml` appears, and left to Next's own inference when there is none. Without it
  Next.js takes the outermost lockfile above the app as the root, so a git worktree nested under
  `.claude/worktrees/` was built against the parent checkout with a "multiple lockfiles" warning.
  Do not replace the search with a fixed `'..', '..'` hop: under the default loader the config is
  evaluated as `<projectDir>/next.config.compiled.js`, so the starting directory is whatever Next
  was invoked on, not this file, and `next info` from a subdirectory then resolves outside the
  repository. `apps/web/src/test/next-config.test.ts` pins all of this.
- Never hand-edit `pnpm-lock.yaml`, `.next/`, `node_modules/` or `.env*`; change dependencies through
  pnpm.
- `pnpm install` runs no dependency lifecycle scripts. `allowBuilds` in `pnpm-workspace.yaml` denies
  the two packages pnpm 10 would otherwise warn about (esbuild, unrs-resolver): their scripts only
  check the prebuilt platform binaries the lockfile already installs, and download one only when
  none is present. sharp has no entry because it has had no install script since 0.35.0, and an
  entry belongs there only while the package still declares one — an entry for a scriptless package
  would silently deny whatever a later release adds instead of letting pnpm report it. Each entry
  carries a `Reviewed at <version>` comment, and `pnpm check:allowbuilds` fails CI when one drifts
  from the lockfile or outlives its script, so a Dependabot bump of a denied package means reading
  the new script and updating the comment. That check fails closed: anything it cannot parse is an
  error, not a skip, so a legal but unrecognised edit to the block fails CI rather than passing
  unchecked. Its own tests are `pnpm test:scripts`. An `Ignored build scripts` warning naming a package
  without an entry is a new decision: run `pnpm ignored-builds` and `pnpm why -r <name>`, read its
  `scripts` under `node_modules/.pnpm/<name>@<version>/node_modules/<name>/`, then add it to
  `allowBuilds` as `true` or `false` with a comment; do not run `pnpm approve-builds --all`. A
  warning naming a package that already has an entry means the `node_modules` predates the entry:
  pnpm re-reports the builds recorded in `node_modules/.modules.yaml` until
  `pnpm clean && pnpm install`. Do not add `strictDepBuilds`, which turns that stale warning into a
  failed install (ADR 0013, `docs/adr/0013-dependency-build-scripts-reviewed.md`, superseding 0007).
- `apps/web/README.md` is untouched `create-next-app` boilerplate: it says `npm run dev` and
  `app/page.tsx`, both wrong here. Ignore it. The root `README.md` and this file are the
  authoritative documents.
- To reproduce the CI e2e run locally:
  `pnpm --filter web build && CI=true pnpm --filter web test:e2e`. `CI=true` chooses the production
  build and the runner hardening, not the port: the run serves 3210 like every other local run, so
  it works while another checkout holds 3000. `pnpm --filter web start` serves the production build
  on port 3000 on its own, which is what the hand-run Lighthouse commands in
  `docs/runbooks/deploy.md` expect.
- Two checkouts running the local e2e suite at the same moment both want 3210, and the second aborts
  with Playwright's `is already used` error. Give it another port:
  `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`.
- Nothing reuses a server any more, so a run killed part-way can leave an orphaned `next dev` holding
  3210 and every later run in that checkout aborts. Clear it with
  `lsof -ti tcp:3210 | xargs kill` rather than moving to another port, which only leaks the orphan.
- `.next-e2e` is known to seven places, not one: both `.gitignore` files, `.prettierignore`,
  `globalIgnores` in `apps/web/eslint.config.mjs`, the `include` list in `apps/web/tsconfig.json`,
  `.vercelignore` (the Vercel CLI never reads `.gitignore`, and the directory runs to ~150 MB) and
  the `clean` script in `apps/web/package.json`. The tsconfig entries are load-bearing: `next dev`
  appends its `distDir` type paths to that file itself, so without them every local e2e run rewrites
  a tracked file and `pnpm format:check` fails on the result. A different `NEXT_DIST_DIR` value would
  need all seven.
- Only an e2e run refreshes `.next-e2e`, and `apps/web/tsconfig.json` compiles the route types in it.
  If `pnpm typecheck` disagrees with CI about a route that was added, renamed or removed on another
  branch, the copy in `.next-e2e` is stale: `pnpm --filter web exec rm -rf .next-e2e`, or
  `pnpm --filter web clean`. Two local suites in the _same_ checkout on different ports also share
  it, so do not overlap them; two different checkouts are fine, they have their own.
- To point the site at a non-default origin locally, copy the root `.env.example` to
  `apps/web/.env.local` yourself; the PreToolUse guard blocks agent writes to `.env*`.
- The site is live at `https://miloscvetkovic.dev` since 2026-09-09: Vercel project `portfolio`,
  production from `main`, DNS at Namecheap (`docs/runbooks/deploy.md` has the records and the
  rollback). Merging to `main` deploys; there is no manual step.
- `vercel deploy` from the repository root uploads the working tree as filtered by `.vercelignore`
  plus the CLI's built-in list, never `.gitignore`. Mirror new `.gitignore` entries there; without it
  the 1.9 GB `.turbo` cache goes up and the upload fails. Per-deployment and branch `*.vercel.app`
  URLs redirect to a Vercel login; the production alias `portfolio-theta-gold-77.vercel.app` is
  public. `vercel curl <path> --deployment <url>` fetches the protected ones but creates a
  project-wide protection-bypass secret on first use, see `docs/runbooks/deploy.md`.
- The CI e2e log prints a three-line `[WebServer] Error: Internal: NoFallbackError` stack twice per
  run and still passes. It is the internal signal that routes an unknown `/work/*` slug to the
  site-level 404, once before `not-found-shell` and again when `console-clean` walks
  `/work/does-not-exist`; the response is a correct 404 and no browser console entry results. Do
  not chase it. The Vercel production log carries no such line, because the platform answers an
  unknown path from the cached static 404 without invoking the route
  (`docs/adr/0015-static-case-study-params.md`).
- Claude Code's in-app Browser pane logs React error #418 (hydration mismatch) on every page of the
  deployed site, while an unmodified headless Chromium (Playwright from `apps/web`) reports none
  across schemes, viewports and reduced motion. Judge console cleanliness with Playwright, not the
  pane.

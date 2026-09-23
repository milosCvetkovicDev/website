# Portfolio

Personal portfolio site. A Turborepo 2 + pnpm monorepo whose only shipping app is the Next.js site in
`apps/web`.

## Architecture

pnpm 10.34 workspace (`apps/*`, `packages/*`, `scripts`, per `pnpm-workspace.yaml`) driven by
Turborepo 2.10.
Node 22 is pinned in `.nvmrc` only; `engines.node` is
`^22.22.2 || ^24.15.0 || >=26.0.0` and `packageManager` pins pnpm
(`pnpm@10.34.5`), not Node. CI reads Node from `.nvmrc` and pnpm from `packageManager`. The range is
not a bare floor. It is the intersection of the `engines: {node: …}` ranges of the lockfile's
packages that install on linux x64 (CI, Vercel) or macOS, and it is re-derived whenever the lockfile
moves. Skip the optional binaries for other platforms (entries with `os`/`cpu`):
`@img/sharp-win32-ia32` declares `^20.9.0`, so an intersection over every entry is empty. A local
Node below the range makes pnpm print `WARN Unsupported engine` and carry on; `nvm install 22`
fixes it. See `docs/adr/0018-dependency-update-policy.md`.

- `apps/web` — the site. Next.js 16 (App Router), React 19, Tailwind v4, GSAP.
  Source in `src/{app,components,data,hooks,lib,test}`, e2e specs in `e2e/`.
- `apps/playground` — Vite 7 + React sandbox. Not deployed, no tests.
- `packages/prettier-config` — `@repo/prettier-config`. Referenced by `prettier.config.mjs` at the
  repo root and by `apps/web/prettier.config.mjs`, which adds
  `tailwindStylesheet: './src/app/globals.css'` so the class sorter sees the theme.
- `scripts/` at the repository root holds the scripts that run outside the apps:
  `check-allowbuilds-drift.mjs` (`pnpm check:allowbuilds`), `vercel-ignore-build.mjs` (Vercel's
  ignored build step, ADR 0016), `check-webserver-log.mjs` (the `e2e` job's server-log check),
  `check-docs-drift.ts` (`pnpm check:docs-drift`, TypeScript that Node 22 runs directly),
  `docs-drift-patch.mjs` (the docs drift workflow's check on what its agent changed),
  `agent-resume.sh` (the briefing for agent checkpoints, under Working with this repo in Claude
  Code), `flake-hunt.sh` and `flake-hunt-issue.sh` (the flake hunt, below under Quality gates),
  `flake-sweep.sh` (`pnpm test:e2e:sweep`, see Testing), `verify-flake.sh` (runs one e2e spec N
  times into `.verify`), and the `node:test` suites that `pnpm test:scripts` runs, one for each of
  those ten plus `docs-drift-workflow.test.mjs`, `ai-refusals.test.mjs`,
  `commitlint-config.test.mjs` and `claude-hooks.test.mjs` (the session hooks in `.claude/hooks`).
  It is a private workspace package, `@repo/scripts`, whose only task is `typecheck` (`tsc -p .`
  against `scripts/tsconfig.json`, which covers the `.mjs` and `.ts` files), so `turbo typecheck`
  type-checks it alongside the apps. It ships no source anyone imports: nothing depends on it, and
  the root scripts still call the scripts by path.
- `packages/eslint-config` and `packages/typescript-config` exist but no app references them yet.
  `apps/web` lints through its own `eslint.config.mjs` built on `eslint-config-next`, and each app
  has its own `tsconfig.json`.

## Routes (App Router)

`/`, `/about`, `/blog`, `/contact`, `/skills`, `/work`, `/work/[slug]`.

Every route's head comes from `buildMetadata()` in `apps/web/src/lib/metadata.ts`: its canonical,
complete Open Graph and Twitter blocks, and its robots directive. Next replaces `openGraph`,
`twitter` and `robots` wholesale per segment rather than merging them, so the root layout keeps only
what is true of every response, the 404s included (`metadataBase`, the title template and the
default Next requires beside it, the author, card type, site name, locale), and never a URL, a
description, a link-preview title or a robots directive.

`apps/web/src/app` also holds `error.tsx`, `not-found.tsx` and the metadata files: `sitemap.ts`,
`robots.ts`, `manifest.ts`, `icon.tsx` and `apple-icon.tsx` (the navigation's "MC" mark, drawn by
`src/lib/brand-mark.tsx`), and an `opengraph-image.tsx` in the root, in each static route's folder
and in `work/[slug]`, all over one card design in `src/lib/og-image.tsx`. Each folder needs
its own: a root image never reaches a page that declares its own `openGraph`. The one route handler,
`favicon.ico/route.ts`, packs the same mark into an ICO. All of them prerender at build time.
`sitemap.ts`, `robots.ts`, `layout.tsx` and `components/json-ld.tsx` each read
`NEXT_PUBLIC_SITE_URL`, falling back to `https://miloscvetkovic.dev`. There is no middleware.

## Commands

| Command                                                                 | What it does                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                                              | `turbo dev` across every app                                                                                                                                                         |
| `pnpm dev:web`                                                          | Next.js dev server on port 3000                                                                                                                                                      |
| `pnpm dev:playground`                                                   | Vite dev server for the sandbox                                                                                                                                                      |
| `pnpm build`                                                            | `next build` (web) and `tsc -b && vite build` (playground)                                                                                                                           |
| `pnpm lint`                                                             | ESLint in each app with `--max-warnings 0`                                                                                                                                           |
| `pnpm lint:fix`                                                         | `eslint --fix` in each app, without `--max-warnings 0`                                                                                                                               |
| `pnpm typecheck`                                                        | `turbo typecheck`: `next typegen && tsc --noEmit` (web), `tsc -b` (playground), `tsc -p .` (scripts)                                                                                 |
| `pnpm test`                                                             | Vitest unit tests (web only)                                                                                                                                                         |
| `pnpm test:e2e`                                                         | Playwright specs in `apps/web/e2e`; `turbo.json` gives it `dependsOn: ["build"]`, so the root script builds `web` first. Prefer `pnpm --filter web test:e2e` locally, which does not |
| `pnpm test:e2e:sweep e2e/<spec> [runs] [out-dir]`                       | Runs one spec file N times (10 by default) and summarises every test's outcomes and durations; see `scripts/flake-sweep.sh`                                                          |
| `pnpm format`                                                           | Prettier over the whole repo, writing changes                                                                                                                                        |
| `pnpm format:check`                                                     | Prettier in check mode, no writes                                                                                                                                                    |
| `pnpm check:allowbuilds`                                                | Checks `allowBuilds` entries against the versions the lockfile resolves                                                                                                              |
| `pnpm check:docs-drift`                                                 | Checks every claim in `docs/drift-manifest.json` against the repository and `gh api`; exit 1 on drift, 2 when a check could not run                                                  |
| `pnpm test:scripts`                                                     | `node:test` tests for the root `scripts/`                                                                                                                                            |
| `scripts/flake-hunt.sh [runs]`                                          | Runs the whole e2e suite N times (30 by default) and ranks specs by failure rate in `flake-hunt/flake-report.json`                                                                   |
| `pnpm clean`                                                            | `turbo clean` in both apps, then `rm -rf node_modules` at the root                                                                                                                   |
| `pnpm prepare`                                                          | `husky`; runs on install and is what creates the git hooks                                                                                                                           |
| `pnpm --filter web test:e2e`                                            | Playwright without going through Turborepo                                                                                                                                           |
| `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`                       | Playwright on a port other than the default 3210                                                                                                                                     |
| `pnpm --filter web test:watch`                                          | Vitest in watch mode                                                                                                                                                                 |
| `pnpm --filter web exec vitest run <path>`                              | One unit test file, e.g. `src/hooks/__tests__/use-is-hydrated.test.tsx`                                                                                                              |
| `pnpm --filter web exec playwright install --with-deps chromium webkit` | Needed once before the first e2e run; the phone projects need webkit                                                                                                                 |
| `scripts/agent-resume.sh [task-id ...]`                                 | Briefs each `.agent-state/<task-id>.json` checkpoint and checks it against git and gh; exits 1 when one is invalid or cannot be briefed                                              |
| `scripts/verify-flake.sh <runs> e2e/<spec>`                             | Runs one spec N times into `.verify` with pass rate and p50/p95; exits 0 all passed, 1 any failed, 2 usage, tool or lock error or unmeasured run, 130/129/143 on INT/HUP/TERM        |

`pnpm lint:fix` drops `--max-warnings 0`, so it exits 0 on warnings that `pnpm lint` and CI fail on.
Always finish with `pnpm lint`.

`pnpm clean` only reaches the two apps, because `packages/*` and `scripts` define no `clean` task.
Their `node_modules` survive it and have to be deleted by hand before a truly cold reinstall.

`typecheck` and `test` declare `dependsOn: ["^build"]` in `turbo.json`. Nothing an app depends on
has a `build` task today (`@repo/prettier-config` is config only), so this is currently a no-op. It
is there so that a future buildable package is compiled before the apps typecheck against it.

`pnpm typecheck` stays the plain `turbo typecheck`, and `scripts/` is type-checked as one of its
tasks: `@repo/scripts` runs `tsc -p .`, which checks every `scripts/**/*.mjs` with `checkJs`, and
`check-docs-drift.ts` as TypeScript, with `strict` against `scripts/tsconfig.json`. That type-check
gets `typescript` and `@types/node` from the package's own devDependencies, not the root's, and for
them pnpm adds only the package's importer block to the lockfile. As root devDependencies they would
also rewrite other packages' lockfile snapshots, because a root dependency is also what pnpm
resolves the root's own packages' peer dependencies to: a root `@types/node` would become the
`@types/node` peer root commitlint reaches through `cosmiconfig-typescript-loader`, in place of the
version pnpm installed for it. The measurement behind the choice is in PR 2's entry in
`.claude/epics/audit-remediation-2026-09/50.md`.

## Quality gates

- On commit: `.husky/pre-commit` runs `pnpm exec lint-staged`, `.husky/commit-msg` runs
  `pnpm exec commitlint --edit "$1"`. Both source `~/.nvm/nvm.sh` if pnpm is missing and abort with a
  message if it is still not on PATH.
- lint-staged has a config per package. The root one only runs `prettier --write`; `apps/web` and
  `apps/playground` run `eslint --fix --max-warnings 0` then `prettier --write` on TS/JS files.
- CI is `.github/workflows/ci.yml`, two jobs. `quality`: dependency review
  (`actions/dependency-review-action`, on pull requests only, straight after checkout; it fails a
  pull request that adds a dependency with a known advisory, dev tooling included, because GitHub's
  dependency graph scopes every `pnpm-lock.yaml` entry `runtime`, the action's default), then
  install, `check:allowbuilds`, `test:scripts`, `format:check`, `lint`, `typecheck`, `test`, `build`.
  `e2e`: install chromium and webkit, build web, run the Playwright specs on all three projects with
  their output teed into a log, then check that log with `scripts/check-webserver-log.mjs` whenever
  the suite ran; the report is uploaded as an artifact on failure or cancellation. Actions are
  SHA-pinned, `permissions: contents: read`, and concurrency cancels superseded runs on pull
  requests only.
  CodeQL default setup is on as well (ADR 0018): GitHub manages it, so it has no workflow file here,
  and branch protection does not require its checks. An alert on a line a pull request changes is
  also posted as a review thread, though, and the resolved-threads rule below blocks the merge until
  that thread is resolved: GitHub resolves it once the flagged code changes, and a writer can
  resolve it by hand or dismiss the alert.
- `.github/workflows/flake-hunt.yml` hunts flaky e2e tests every night at 02:17 UTC and on manual
  dispatch, never on a pull request, and none of its jobs is a required check. Six shards each run
  the whole suite five times against the production build with `scripts/flake-hunt.sh`; a report
  job merges the 30 runs into `flake-report.json` (an artifact, with each failure's trace and
  screenshot in the shard artifacts), counts a run no shard uploaded as an infrastructure error,
  and `scripts/flake-hunt-issue.sh` opens one issue labelled `flake-hunt` for the failing tests of
  every spec that failed in more than 5% of the completed runs it ran in, unless an open
  `flake-hunt` issue already names them. Only that job may write issues, and it opens one only for
  the schedule or a dispatch of the default branch. The hunt stops before its first run, failing
  the shard, when `apps/web/e2e/support/warm-routes.ts` is missing or no spec imports it. Locally,
  `scripts/flake-hunt.sh [runs]` runs the hunt and writes the report against the dev server,
  without an issue. 30 runs take hours and hold the Playwright port and that checkout's `.next-e2e`
  the whole time, so start it in the background from a worktree of its own, with `PLAYWRIGHT_PORT`
  set when another checkout runs e2e. Ctrl-C stops a hunt in the foreground only; stop a
  background one with `kill -TERM <pid>`, which exits 143 and still writes the report.
- `main` has branch protection on, and three checks are required: both CI jobs and
  `Commit messages`. A required check is stored as the job's display name, so the three required
  contexts are the `name:` values in `.github/workflows/ci.yml` and
  `.github/workflows/commitlint.yml` character for character, and a comment near each says so.
  Renaming any of those jobs strands a required check that never reports and blocks every pull
  request, and so does anything else that stops the job reporting under that name on every pull
  request, such as a matrix, a reusable-workflow call or a branch or path filter on its trigger;
  ADR 0021 gives the order for renaming, removing or adding one. Protection also requires the
  branch to be up to date with `main`, signed commits, linear history (merge commits are refused)
  and resolved review threads, and it applies to administrators. Squash is the only merge method
  the repository allows, with merge commits and rebase merging switched off; the squash commit
  defaults to the pull request title and an empty body, which the merge dialog or
  `gh pr merge --subject` and `--body` can still override. Approving reviews required: 0, so the
  reviewer rule below is convention, not enforcement. See
  `docs/adr/0021-squash-only-merges-and-required-checks.md`.
- Commit messages are checked in CI as well as on commit, because the squash commit GitHub writes to
  `main` never passes through the local hook. `.github/workflows/commitlint.yml`, job
  `Commit messages`, lints three things. The pull request title, twice: as written and with the
  ` (#NN)` GitHub appends to the squash commit's subject (the suffix alone can break
  `header-max-length`, and it hides `subject-full-stop`). Every commit between the pull request's
  base and head, which still runs when the title fails, so one failure cannot hide another. And on a
  push to `main` every commit from the previous tip to the new one, or only the new tip when the
  push created the branch. That push lint is the only one to see a squash body typed in the merge
  dialog, which no pull request event carries. The title and the push lint use
  `commitlint.squash.config.mjs`, which sets `defaultIgnores: false`: commitlint otherwise skips,
  and passes, any message shaped like `revert …`, `Reapply …`, `fixup! …`, `Merge branch … into …`
  or a bare version, and its merge pattern matches a line anywhere in the body. Its one exception
  is a revert with nothing else in the message (no body beyond `git revert`'s own line and
  `Co-authored-by:` trailers): `Revert "<header>"` as GitHub's revert button and `git revert` write
  it, or `Reapply "<header>"`, nested or not, up to 1000 characters. `<header>` needs a type from
  `type-enum`, a subject that starts and ends with a non-space and does not start with a capital,
  no trailing full stop, no `"`, and at most `header-max-length` characters. That approximates the
  rules rather than linting the header (checked against the rules on a table of wrapped headers),
  and a revert with any other body is linted like any other message. Anything else, a revert of a
  non-conventional title included, is retitled as a conventional `revert: …` header. The branch
  commits and `.husky/commit-msg` keep `commitlint.config.mjs` with the default ignores, because
  `git commit --fixup`, `git merge` and GitHub's "Update branch" write those shapes. That split
  relies on squash being the only merge method, which the repository settings enforce, so that a
  squash merge discards the branch commits; were rebase merging turned on, the branch step would
  need the squash config too. `scripts/commitlint-config.test.mjs` pins both configs against the
  rules commitlint loads, the hook, and which workflow step uses which config. The workflow re-runs
  on every `edited` event, a body edit included, and has no
  job-level `if`: GitHub reports a job skipped by a condition as Success, which would satisfy a
  required check on a title nobody linted. Commits on `main` from before the check stay as accepted
  history, because `main` is never rewritten: 28 of them fail it, and the four since commitlint
  arrived in #3 (54b8b80, d7d058d, a8b4a91, 3e98c14) each fail `body-max-line-length`.
- The web server's output is gated. The `e2e` job tees the Playwright run into a log under
  `shell: bash`, whose `pipefail` keeps a failing run failing through the pipe, and
  `scripts/check-webserver-log.mjs` then fails the job on any `[WebServer]` line outside ADR 0015's
  `Error: Internal: NoFallbackError` block (that message and its `at` frames), the accepted signal
  that sends an unknown `/work/*` slug to the 404. It does not try to recognise error shapes: only
  the server's stderr reaches the log, because `webServer.stdout` stays at Playwright's default,
  `'ignore'`, so every other server line is a finding, warnings included. A missing or empty log
  fails too, and so does a log with no `[WebServer]` line, which means the capture broke, since
  every run prints the allowlisted block. The check runs whenever the suite ran, passed or failed,
  and not after an earlier step failed, when there is no log to read. Its tests run in
  `pnpm test:scripts`.
- The root `scripts/` gates are type-checked, not linted. `@repo/scripts` has a `typecheck` task
  (`tsc -p .`, strict, `checkJs`) that `turbo typecheck` runs, so CI's existing typecheck step
  covers them without a step of its own. There is no root `eslint.config.*` on purpose: ADR 0003's
  per-package lint-staged split relies on its absence.
- Warnings are errors. Lint runs with `--max-warnings 0` in both apps, so a warning fails CI.
- The docs are checked for drift, outside the required checks. `docs/drift-manifest.json` catalogues
  the machine-verifiable claims in `docs/` that the checker can check (settings read with `gh api`,
  `path:line` citations, config values, package scripts; its `rules` block lists what is excluded),
  and `pnpm check:docs-drift` checks them. The `rules` block also says which claims are `live` and
  which are `historical`, read at the commit that wrote them because ADR 0012 forbids correcting a
  claim that was true then. A new link, backticked `pnpm` script command or `path:line` citation in
  `docs/`, in the forms `rules.coverage` lists, without a manifest entry is itself reported, so add
  the entry with the doc. `.github/workflows/docs-drift.yml` runs the check weekly and on every push
  to `main` that touches `docs/adr/`. When it finds drift, `claude -p` drafts a correction following
  `.github/prompts/docs-drift.md` in a job with no GitHub token, no shell and edits confined to
  `docs/`, and a separate job with no agent checks the change and opens one pull request, assigned
  to the owner. The workflow needs the `ANTHROPIC_API_KEY` and `DOCS_DRIFT_TOKEN` secrets and stops
  with a notice without them; it has not yet run with them. Protection and merge settings need an
  admin token, so CI reports those claims as skipped. The owner's token checks them locally; with
  any other token they cannot run (exit 2), so pass `--skip-requires admin`.
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
  are not grouped. Dependabot alerts are on; automated security updates stay off until the owner
  switches them on after #71, which clears the lockfile's advisories, has merged, so until then an
  alert opens no pull request. Once they are on, they are triggered by alerts rather than the Monday
  schedule, and a `security` group (`applies-to: security-updates`, `patterns: ['*']`) batches the
  security updates of each run into one pull request so they cannot fill the five-slot cap. Three
  majors are ignored, each with the upstream event that reopens it: `eslint` and `@eslint/js`
  (eslint-config-next pulls an eslint-plugin-react that ESLint 10 breaks —
  jsx-eslint/eslint-plugin-react#3977), `typescript` `>=7` (no classic compiler API at the root;
  typescript-eslint peers `<6.1.0`) and `@types/node` majors (they follow `.nvmrc` by hand). Adding
  one is a policy change, so read `docs/adr/0018-dependency-update-policy.md` first; deleting one
  without the trigger having fired puts the red pull request back. A `vite` group (`vite`,
  `@vitejs/*`, `vitest`, `@vitest/*`, majors included) goes ahead of `minor-and-patch` in the same
  pull request that makes `apps/web` declare `vite` directly, and not before: added now it would
  regenerate a red grouped pull request.

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
  fails lint on it. The rule is a pattern rather than one fixed path, and
  `apps/web/src/test/eslint-config.test.ts` pins the spellings it is known to catch (`@/components`
  and `../components`, bare, with a trailing slash, or as `/index` with or without a `.ts`, `.tsx`,
  `.js` or `.jsx` extension, and a nested layout's `../../components`) and the near misses it lets
  through. It does not see a dynamic `import()`, and it reads layouts only.
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
  The root layout renders `HydrationMarker` (`src/components/hydration-marker.tsx`) on every route:
  a hidden `#hydration-marker` whose `data-hydrated` is `false` in the served HTML and `true` once
  React has hydrated. Wait through `e2e/support/hydration.ts` rather than writing a wait of your
  own: `gotoHydrated(page, path)` for a navigation, `expectHydrated(page)` after `page.reload()`. A
  soft navigation needs neither, and a spec with JavaScript off must call neither, because the
  marker never flips. The helper also waits out the home page's `System Boot` loader until #47
  deletes it; #74 moves six of the inline loader waits into the helper, and #47 removes the rest
  with the loader. The marker hydrates with the layout, so content a page wraps in `<Suspense>` or
  puts under a `loading.tsx` would hydrate after it flips. No route puts `<main>` inside a
  boundary; the one boundary with content today, the decorative `TmuxBackground` on `/`, may
  hydrate after the marker. `e2e/hero.spec.ts` asserts the page title.
  That assertion is only a smoke check that the app rendered: it never could catch a second
  checkout of this site, which serves the same title character for character, and the not-found and
  error pages carry it too. Status and path are what catch a wrong page.
- `apps/web/playwright.config.ts` treats `CI=true` or `CI=1` as CI: it serves the production build
  with `pnpm start` inside `apps/web`, sets `forbidOnly`, retries twice, uses one worker and a 10s
  expect timeout, and sets `failOnFlakyTests`: a test that passes only on a retry fails the run, on
  all three projects, so the report and its `on-first-retry` trace are uploaded instead of discarded
  with a green job. Locally it serves the dev server instead.
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
- A flaky e2e test is root-caused before it is patched: reproduce it repeatedly, tell a cold first
  request apart from a logic fault, and prefer warming the destination route on the dev server
  before the timed step (a route compiles on its first request) over an arbitrary wait or a retry.
  Verify a fix with at least five consecutive runs in each mode, the dev server
  (`pnpm --filter web test:e2e`) and the production build
  (`pnpm --filter web build && CI=true pnpm --filter web test:e2e --retries=0`), and report the
  measured timings. Keep `--retries=0` on the production runs: under `CI=true` the config retries
  a failed test twice, and a run whose only failures passed on a retry is reported as flaky and
  exits 0.
- To tell a flaky e2e test from a slow or a broken one, sweep its file:
  `pnpm test:e2e:sweep e2e/<spec> [runs] [out-dir]` runs the whole file that many times (10 by
  default), into a new directory under `$TMPDIR` unless given one. Type it from the repository root
  or any directory outside a workspace package; inside one, such as `apps/web`, pnpm does not find
  the script, so use `pnpm -w test:e2e:sweep` there. It writes `summary.txt` (a line for each run
  that exited nonzero with no unexpected test or whose report carries errors outside any test, then
  per test and project: in how many of the runs it ran in it ended other than as declared, the runs
  it failed in, and its duration in each run), `runs.tsv` (exit code, seconds, load average and
  test counts per run) and `sweep.txt` (commit, mode, port), and keeps every JSON report and the
  output of each run with a failed or flaky test. A sweep takes minutes: start it in the background,
  and do not overlap it with another e2e run in the same checkout. Record the load with the result:
  parallel sessions on one machine cause timing failures that CI never sees. `COLD=1`, `CI=true`,
  signals and the exit codes are described at the top of `scripts/flake-sweep.sh`.
- A bare `Test timeout of Nms exceeded`, with no second error naming a call, means no Playwright
  call on the test's page, context or `request` was still pending when teardown closed them, because
  a pending one is named: `page.goto: Test timeout …`, `expect(locator).toBeHidden() failed`, or
  `apiRequestContext.get: Request context disposed.` for `request`. When every await in the test is
  such a call, a bare report means the run was slow and its deadline fell in its last steps, not
  that it was stuck. It proves nothing about an await outside Playwright (a Node `setTimeout` or
  `fetch`, a promise that never settles), which reports bare while it hangs, nor about an error
  thrown after the deadline, which is never reported. A setup or hook overrun says so
  (`while setting up "page"`).

## Working with this repo in Claude Code

- Trust facts, for auto mode and for any push: the repository is **public**
  (`github.com/milosCvetkovicDev/website`), so every push, pull request body and issue publishes.
  Keep confidential material, other repositories' code and machine paths out of it. `main` is
  protected: pull requests only, squash merge only, signed commits, required checks, no force
  pushes. Merging to `main` deploys `https://miloscvetkovic.dev` to production on Vercel.
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
- A SessionStart hook (`.claude/hooks/session-start.sh`) prints the first 20 lines of
  `git status -sb`, your open pull requests with their checks counted by conclusion (by status
  while a check is still running), giving `gh` 8 s, up to 4,000 bytes of the resume briefing from
  `scripts/agent-resume.sh`, and then the `.agent-state` notes changed in the last seven days,
  newest first: 40 lines and 300 bytes a line of each, with a pointer to the rest, until the output
  reaches 9,000 bytes. Claude Code caps hook output at 10,000 characters and gives the session only
  a preview of anything longer. A Stop hook (`.claude/hooks/stop.sh`) runs after every reply, not
  only at session end, and writes `.agent-state/last-session-<branch>.md`, with `%` and `/` in the
  branch name percent-encoded (`feat%2Fx`), or `last-session-~detached.md`. Both run git without
  optional locks, so neither holds `index.lock` against another session, and both exit 0 on any
  failure; git ignores `.agent-state`. It sits at the repository root rather than under `.claude`,
  because Claude Code protects `.claude` (except `.claude/worktrees`): allow rules cannot
  pre-approve a write there, the default and `acceptEdits` modes prompt for it (which a headless
  session cannot answer), `dontAsk` denies it and auto mode leaves it to the classifier, so only
  `bypassPermissions` writes there reliably. The snapshot is git state only; the checkpoint below
  is still yours to keep.
- `.mcp.json` is tracked and configures one MCP server for this project, over HTTP. It needs
  authorising once per machine before its tools work, and nothing in the repository depends on it.
- `.claude/agents/ui-reviewer.md` is a read-only review agent for `apps/web/src/components`: visual
  quality, GSAP cleanup and reduced motion, accessibility, component structure. Run it after
  changing a component.
- Every change ships as a pull request, because `main`'s protection refuses direct pushes: branch,
  commit with a Conventional Commit title (Quality gates describes how the squash title is linted),
  open it with `gh pr create`, and poll CI until every check on the head commit is green before
  calling the work done. Never squash-merge without the owner's explicit approval.
  `.claude/skills/open-pr/SKILL.md` walks the whole sequence.
- Long-running work keeps a checkpoint, `.agent-state/<task-id>.json` (a task id of lowercase
  letters, digits and hyphens, starting with a letter or digit), in the shape
  `scripts/agent-state.schema.json` defines: `goal`, numbered `plan_steps`, `current_step` (null
  once every step is in `completed_steps`), `completed_steps` with their evidence, `artifacts`
  (`branches` with whether each was pushed, `prs`, and `files` that should exist), `blockers`,
  `next_action` and `updated_at` in UTC. Write it before the first step. Update it after every
  meaningful step (a commit, a push, a pull request opened, a check result, a decision), not at the
  end of the work, and never rely on the final message for the handoff: a session stopped by a usage
  limit or a crash never writes one. On resuming, run `scripts/agent-resume.sh` (the SessionStart
  hook runs it at the start of every session) and act on its contradictions before anything else: a
  contradiction means the checkpoint is stale, so trust git and gh and update the checkpoint first.
  Failing checks on an open pull request are listed under "Needs attention" instead, since no
  update to the checkpoint clears them, and a finished task is not checked for branches that its
  merge deleted. Without task ids the briefing gives each finished task one line;
  `scripts/agent-resume.sh <task-id>` briefs it in full. `.agent-state` belongs to its checkout: a
  session sees only the checkpoints and notes of the checkout it runs in, and `git worktree remove`
  deletes a worktree's without asking, because ignored files do not count as untracked, so copy out
  what is still needed first. A Markdown note in `.agent-state` is still printed, but it is not
  validated or checked.
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
- Before editing a document that describes repository or CI settings, check each claim against the
  live settings (`gh api repos/milosCvetkovicDev/website`, `.../branches/main/protection`) rather
  than trusting the existing text, and cite code as a path with line numbers checked against
  current `main`.
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
  pnpm. pnpm's peer-suffix resolution for this dependency graph is not deterministic: now and then
  a resolution, on `main` as well, flips a few peer suffixes the other way (on 2026-09-16, the
  `@babel/core` suffix of `next` and `styled-jsx` and the suffixes of the
  `eslint-plugin-import`/`eslint-import-resolver-typescript` cycle). A lockfile diff that flips only
  such suffixes is pnpm's own output, not a hand edit. A plain `pnpm install` keeps the flip: the
  lockfile already matches the manifests, so resolution is skipped. Taking `main`'s whole lockfile
  with `git checkout` and resolving again (`pnpm install --resolution-only`) usually writes it back.
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
- `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` refuses any version published less than a day
  ago, so a non-frozen `pnpm install` or `pnpm update` can fail with
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION` naming a package released hours earlier — including an
  optional platform binary such as `@rollup/rollup-<platform>`, whose release tracks its parent's. The
  fix is to re-resolve that package (`pnpm update -r <name>`) so pnpm picks the newest mature version,
  not to add it to `minimumReleaseAgeExclude`, which is for a named, justified exception such as a
  security fix published the same day. CI's `pnpm install --frozen-lockfile` skips resolution and is
  unaffected. Dependabot mirrors the window with `cooldown.default-days: 1`, which applies to version
  updates only. ADR 0018.
- On pnpm 10.34.5, `pnpm update -r <patterns>` did not reach transitive copies without
  `--depth Infinity`, whatever the documented default says. A refresh aimed at an advisory in a transitive package will add the
  patched version for some dependents and silently leave the vulnerable copy pinned under others
  whose own ranges admitted the fix. Always pass `--depth Infinity` and re-run `pnpm audit` to confirm
  the count actually moved.
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
- The CI e2e log prints a three-line `[WebServer] Error: Internal: NoFallbackError` stack once for
  every request of an unknown `/work/*` slug, so several times per run, and still passes. It is the
  internal signal that routes such a slug to the site-level 404, and `not-found-shell`, `not-found`,
  `console-clean` and `hydration-marker` all request `/work/does-not-exist`; the response is a
  correct 404 and no browser console entry results. Do not chase it:
  `scripts/check-webserver-log.mjs` allowlists exactly that message with its stack frames and fails
  the job on any other `[WebServer]` line. The Vercel production log carries no such line, because
  the platform answers an unknown path from the cached static 404 without invoking the route
  (`docs/adr/0015-static-case-study-params.md`).
- Claude Code's in-app Browser pane logs React error #418 (hydration mismatch) on every page of the
  deployed site, while an unmodified headless Chromium (Playwright from `apps/web`) reports none
  across schemes, viewports and reduced motion. Judge console cleanliness with Playwright, not the
  pane.
- `gh` intermittently fails on writes while reads keep working: `gh pr create` and `gh pr edit`
  return a GraphQL "Something went wrong" or a REST 502. Retry at most three times with a pause,
  and run `gh pr list --head <branch>` before each retry, because the pull request may have been
  created anyway. Set a body that did not land over REST:
  `gh api -X PATCH repos/{owner}/{repo}/pulls/<N> -F body=@<file>`.

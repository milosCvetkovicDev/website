---
paths:
  - 'apps/web/next.config.ts'
  - 'apps/web/src/test/next-config.test.ts'
  - '.vercelignore'
  - '.gitignore'
  - 'scripts/vercel-ignore-build.mjs'
  - 'docs/runbooks/deploy.md'
  - '.env.example'
---

# Next.js config and deployment

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Routes (App Router)

Response headers come from one static `headers()` entry in `apps/web/next.config.ts` whose source,
`/:path*`, matches every path, `/_next/static` assets and the 404s included:
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a Content-Security-Policy, a
`Permissions-Policy` and a `Cross-Origin-Opener-Policy` (ADR 0023). Next's router sends a few
answers before it applies `headers()`, and those carry none of them: the 308s that strip a trailing
slash or collapse repeated slashes, and the plain 500 for a malformed percent-encoding.

## Gotchas

- `apps/web/next.config.ts` pins `turbopack.root` (which is also the file tracing root) to the
  workspace root, found by walking up from the directory Next evaluates the config in until a
  `pnpm-workspace.yaml` appears, and left to Next's own inference when there is none. Without it
  Next.js takes the outermost lockfile above the app as the root, so a git worktree nested under
  `.claude/worktrees/` was built against the parent checkout with a "multiple lockfiles" warning.
  Do not replace the search with a fixed `'..', '..'` hop: under the default loader the config is
  evaluated as `<projectDir>/next.config.compiled.js`, so the starting directory is whatever Next
  was invoked on, not this file, and `next info` from a subdirectory then resolves outside the
  repository. `apps/web/src/test/next-config.test.ts` pins all of this.
- `apps/web/next.config.ts` also sends the security headers (ADR 0023), and its CSP allows this
  origin only: a script, stylesheet, font, image (a `data:` one included) or connection from
  anywhere else is refused, and the browser logs the refusal as a console error.
  `e2e/console-clean.spec.ts` fails on it in the desktop `chromium` project, the only one that runs
  that spec; no WebKit project has a console gate, so a refusal only WebKit makes is not caught in
  CI. Adding an origin means widening `contentSecurityPolicy()` and its test in
  `src/test/next-config.test.ts` in the same change. `'unsafe-inline'` is in `script-src`
  on purpose: the theme script and the RSC payload are inline, and a per-request token instead is
  refused by ADR 0017 (`scripts/ai-refusals.test.mjs` fails on the word anywhere in the config).
  `next dev` alone adds `'unsafe-eval'` and `ws:` (NODE_ENV=development), and a Vercel preview
  build alone adds the Vercel Toolbar's origins and relaxes `Cross-Origin-Opener-Policy` from
  `same-origin` to `same-origin-allow-popups` (VERCEL_ENV=preview). `turbo.json` declares
  `VERCEL_ENV` in the `build` task's `env` so that it splits the cache key: Turborepo's strict mode
  passes `VERCEL_*` through to `next build` anyway, but leaves an undeclared one out of the hash.
  Never add `upgrade-insecure-requests`: WebKit applies it to `http://localhost`, which breaks the
  `mobile-safari` project.
- `.next-e2e` is known to seven places, not one: both `.gitignore` files, `.prettierignore`,
  `globalIgnores` in `apps/web/eslint.config.mjs`, the `include` list in `apps/web/tsconfig.json`,
  `.vercelignore` (the Vercel CLI never reads `.gitignore`, and the directory runs to ~150 MB) and
  the `clean` script in `apps/web/package.json`. The tsconfig entries are load-bearing: `next dev`
  appends its `distDir` type paths to that file itself, so without them every local e2e run rewrites
  a tracked file and `pnpm format:check` fails on the result. A different `NEXT_DIST_DIR` value would
  need all seven.
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

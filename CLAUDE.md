# Portfolio

## Architecture
Turborepo monorepo with pnpm:
- `apps/web` — Next.js 16, React 19, Tailwind v4, GSAP animations
- `apps/playground` — Experimental sandbox app
- `packages/eslint-config` — Shared ESLint configuration
- `packages/prettier-config` — Shared Prettier configuration
- `packages/typescript-config` — Shared TypeScript configuration

## Routes (App Router)
`/`, `/about`, `/blog`, `/contact`, `/skills`, `/work`, `/work/[slug]`

## Commands
```
pnpm dev:web              # Start Next.js dev server
pnpm dev:playground       # Start playground dev server
pnpm build                # Build all packages + apps
pnpm lint                 # Lint all
pnpm lint:fix             # Lint + auto-fix
pnpm format               # Prettier format all
pnpm format:check         # Check formatting without writing
pnpm typecheck            # TypeScript type checking
pnpm clean                # Remove all build artifacts + node_modules
```

## Conventions
- Conventional commits enforced via @commitlint/cli + husky (`@commitlint/config-conventional` — types: feat, fix, chore, docs, style, refactor, perf, test, build, ci)
- lint-staged on pre-commit: eslint --fix + prettier --write for code, prettier --write for json/md/css
- Tailwind v4 (CSS-based config via @tailwindcss/postcss, NOT tailwind.config.js)
- GSAP + @gsap/react for scroll-triggered and page transition animations
- Next.js App Router only — no Pages Router
- Data files in `src/data/`, components in `src/components/`
- Never edit `pnpm-lock.yaml`, `.next/`, or `node_modules/`

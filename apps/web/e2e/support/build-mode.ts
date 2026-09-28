/**
 * Whether this run serves the production build: `CI=true` or `CI=1`, which GitHub Actions sets and
 * which reproduces the CI path by hand (docs/runbooks/deploy.md). Anything else, `CI=false`
 * included, is a local run against the dev server.
 *
 * `playwright.config.ts` chooses `pnpm start` over `pnpm dev`, and its runner hardening, with this,
 * and a spec that tests what only a production build does (Next prefetches a `<Link>` only there)
 * skips with it, so the two cannot disagree about which server the suite is testing.
 */
export function servesProductionBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === 'true' || env.CI === '1';
}

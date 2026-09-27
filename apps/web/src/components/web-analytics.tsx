import { Analytics } from '@vercel/analytics/next';

/**
 * Vercel Web Analytics, rendered only in a production or preview deployment's build (ADR 0026). Its
 * script and beacons are on this origin, under a per-project path Vercel inlines at build time
 * (`NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG`), which the CSP's `'self'` already allows.
 * Anywhere else nothing renders: `next start` in CI would answer the package's default,
 * `/_vercel/insights/script.js`, with a 404 that Chromium logs as a console error, and under
 * `next dev` the package loads its debug script from
 * va.vercel-scripts.com, which the CSP refuses. The gate is `VERCEL_ENV`, not `VERCEL`: `vercel env
 * pull` writes `VERCEL="1"` into a local `.env.local`, which `next dev` loads, beside
 * `VERCEL_ENV="development"`.
 */
export function WebAnalytics() {
  const deployment = process.env.VERCEL_ENV;
  return deployment === 'production' || deployment === 'preview' ? <Analytics /> : null;
}

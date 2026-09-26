import { Analytics } from '@vercel/analytics/next';

/**
 * Vercel Web Analytics, rendered only in a build Vercel runs (`VERCEL=1`), previews included; ADR
 * 0026. Its production script and beacons are `/_vercel/insights/*` on this origin, which the CSP's
 * `'self'` already allows. Anywhere else nothing renders: `next start` in CI would answer that path
 * with a 404 that Chromium logs as a console error, and under `next dev` the package loads its debug
 * script from va.vercel-scripts.com, which the CSP refuses.
 */
export function WebAnalytics() {
  return process.env.VERCEL === '1' ? <Analytics /> : null;
}

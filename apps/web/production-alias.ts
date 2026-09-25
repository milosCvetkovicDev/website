/**
 * The Vercel project's public production alias. It serves every deployment `main` promotes, the
 * same bytes as https://miloscvetkovic.dev, and unlike the per-deployment and branch URLs it is not
 * behind a Vercel login, so without a header a search engine could index it as a second copy of
 * the site (live-3, pages-7, #48; ADR 0025). Change it if the Vercel project is renamed or its
 * production domain changes. The tests read this constant, so they cannot catch a wrong value:
 * after the deploy, `curl -sSI https://<alias>/about` has to show `x-robots-tag: noindex` (ADR 0025
 * has the whole check).
 *
 * Next matches a `has` value as an anchored regular expression against the request's host with
 * its port removed, so the unescaped dots here also match any one character. Nothing that answers
 * for this deployment differs from the alias in only those places, and the apex never matches.
 */
export const PRODUCTION_ALIAS_HOST = 'portfolio-theta-gold-77.vercel.app';

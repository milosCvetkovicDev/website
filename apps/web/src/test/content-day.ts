/**
 * A day as the case studies write theirs, `7 October 2026`, spelled out here rather than read from
 * `lib/content-date.ts`'s month table, so a page test and the formatter cannot share a mistake in
 * it. Shared by the /about and /privacy page tests and the JSON-LD test, so the copies cannot drift
 * apart (#57); `e2e/seo-surface.spec.ts` checks the served text against `Intl`'s en-GB date instead.
 */
export const DAY_AS_WRITTEN =
  /^([1-9]|[12]\d|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/;

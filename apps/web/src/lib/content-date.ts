/**
 * Content dates: the `YYYY-MM-DD` strings a case study's `publishedAt` and `updatedAt` hold in
 * `src/data/case-studies.ts`, and a static route's entry in `src/data/static-routes.ts`.
 *
 * The visible string is built from a fixed month table and the date's own digits, never from the
 * build machine's locale or timezone: the page is prerendered, so whatever the build machine would
 * have said is frozen into the HTML, and a change of build environment would silently change
 * published text. Nothing here reads `Intl`, `toLocale*` or a `Date`'s local getters.
 *
 * `e2e/seo-surface.spec.ts` imports this module directly, outside the bundler, so it stays free of
 * imports: `server-only` or an asset here would stop that whole spec file loading. Playwright
 * resolves the `@/` alias, but `next.config.ts` reaches this module through `case-studies.ts`, and
 * Next's config loader does not (ADR 0030; `next-config.test.ts` loads the config that way).
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The earliest year a content date may name. Nothing on this site predates it, so an earlier year
 * is a typo (`0026-09-09` for `2026-09-09`) that would otherwise render as `9 September 26`.
 */
const EARLIEST_YEAR = 2000;

/** How far the earliest zone's clock runs ahead of UTC: UTC+14, Kiribati's Line Islands. */
const EARLIEST_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

/**
 * Midnight UTC at the start of the day a `YYYY-MM-DD` string names, or `null` when it names none:
 * another shape, a year before 2000, month 13, the 30th of February. `Date` rolls a day the month
 * does not have over into the next month, so the day is built and then read back, and anything
 * that does not survive the round trip is refused.
 */
function startOfDay(date: string): Date | null {
  const match = DAY.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  if (year < EARLIEST_YEAR) return null;
  const start = new Date(Date.UTC(year, month, day));
  const roundTrips =
    start.getUTCFullYear() === year && start.getUTCMonth() === month && start.getUTCDate() === day;
  return roundTrips ? start : null;
}

/**
 * A stored content date as a reader sees it: `2026-09-09` becomes `9 September 2026`. Total: any
 * string that is not a real `YYYY-MM-DD` day gives `null` rather than a half-built or invented date.
 */
export function formatContentDate(date: string): string | null {
  const start = startOfDay(date);
  if (!start) return null;
  return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
}

/**
 * A page's one stored date as a reader sees it, for a static route's "Last updated" line. Throws,
 * naming `page` and the stored value, when it is not a real day, so a typo fails the prerender
 * rather than printing a blank or a malformed date.
 */
export function formatPageDate(page: string, date: string): string {
  const formatted = formatContentDate(date);
  if (!formatted) {
    throw new Error(
      `${page}: a content date must be a real YYYY-MM-DD day from ${EARLIEST_YEAR} on, ` +
        `got ${JSON.stringify(date)}`,
    );
  }
  return formatted;
}

/**
 * A page's published and updated dates as a reader sees them. Throws, naming `page` and the stored
 * values, when either date is not a real day or the page was updated before it was published. The
 * page's TechArticle marks up the same two values, so a page must not quietly drop its visible
 * dates while the markup keeps them: the prerender fails the build instead. Deliberately clock-free,
 * so a build's output depends on its inputs alone; "not in the future" is the unit suite's check,
 * through `isPublishableContentDate`.
 */
export function formatContentDates(
  page: string,
  publishedAt: string,
  updatedAt: string,
): { published: string; updated: string } {
  const published = formatContentDate(publishedAt);
  const updated = formatContentDate(updatedAt);
  if (!published || !updated) {
    throw new Error(
      `${page}: content dates must be real YYYY-MM-DD days from ${EARLIEST_YEAR} on, ` +
        `got publishedAt ${JSON.stringify(publishedAt)} and updatedAt ${JSON.stringify(updatedAt)}`,
    );
  }
  if (updatedAt < publishedAt) {
    throw new Error(`${page}: updatedAt ${updatedAt} is before publishedAt ${publishedAt}`);
  }
  return { published, updated };
}

/**
 * Whether `date` is a real `YYYY-MM-DD` day (as `formatContentDate` reads one) that has begun by
 * `now`, so a page may carry it. A bare date names a calendar day rather than an instant, and the
 * first zone to reach a day is UTC+14, so a day counts as begun once it has begun there: a
 * deliberate tolerance of up to 14 hours against the UTC date. Judging by the UTC date instead
 * would reject a date written just after local midnight anywhere east of Greenwich, for hours.
 */
export function isPublishableContentDate(date: string, now: Date): boolean {
  const start = startOfDay(date);
  if (!start || !Number.isFinite(now.getTime())) return false;
  return start.getTime() - EARLIEST_ZONE_OFFSET_MS <= now.getTime();
}

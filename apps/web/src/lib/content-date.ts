/**
 * Content dates: the `YYYY-MM-DD` strings a case study's `publishedAt` and `updatedAt` hold in
 * `src/data/case-studies.ts`, and a static route's entry in `src/data/static-routes.ts`.
 *
 * The visible string is built from a fixed month table and the date's own digits, never from the
 * build machine's locale or timezone: the page is prerendered, so whatever the build machine would
 * have said is frozen into the HTML, and a change of build environment would silently change
 * published text. Nothing here reads `Intl`, `toLocale*` or a `Date`'s local getters.
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

/** How far the earliest zone's clock runs ahead of UTC: UTC+14, Kiribati's Line Islands. */
const EARLIEST_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

/**
 * Midnight UTC at the start of the day a `YYYY-MM-DD` string names, or `null` when it names none:
 * another shape, month 13, the 30th of February. `Date` rolls a day the month does not have over
 * into the next month, so the day is built and then read back, and anything that does not survive
 * the round trip is refused.
 */
function startOfDay(date: string): Date | null {
  const match = DAY.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const start = new Date(0);
  // setUTCFullYear rather than Date.UTC, which reads a year below 100 as 1900 plus that year.
  start.setUTCFullYear(year, month, day);
  const roundTrips =
    start.getUTCFullYear() === year && start.getUTCMonth() === month && start.getUTCDate() === day;
  return roundTrips ? start : null;
}

/**
 * A stored content date as a reader sees it: `2026-09-09` becomes `9 September 2026`. Total: any
 * string that is not a real `YYYY-MM-DD` day gives `null`, so a caller renders nothing rather than a
 * half-built or invented date.
 */
export function formatContentDate(date: string): string | null {
  const start = startOfDay(date);
  if (!start) return null;
  return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
}

/**
 * Whether `date` is a real `YYYY-MM-DD` day that has begun by `now`. A bare date names a calendar
 * day rather than an instant, and the first zone to reach a day is UTC+14, so a day counts as begun
 * once it has begun there. Judging against the UTC date instead would reject a date written just
 * after local midnight anywhere east of Greenwich, for hours.
 */
export function isContentDate(date: string, now: Date): boolean {
  const start = startOfDay(date);
  if (!start || !Number.isFinite(now.getTime())) return false;
  return start.getTime() - EARLIEST_ZONE_OFFSET_MS <= now.getTime();
}

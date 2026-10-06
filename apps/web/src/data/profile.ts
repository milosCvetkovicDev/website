/**
 * Facts about the person the site describes, each stated once (#49). A page that states one reads
 * it from here, so the Person JSON-LD, the hero's player card and `/about` cannot disagree.
 *
 * The years of experience are derived rather than written down: a count typed into the copy goes
 * stale every January, and the site used to print two different ones. Every route is prerendered,
 * so the figure is the one the build computed. It moves on only when a build actually runs in the
 * new year: Turborepo replays a cached `.next` when no build input changed, and the year is not an
 * input, so a redeploy of an unchanged tree keeps last year's figure (docs/runbooks/deploy.md, "The
 * years of experience in January"). Read it only from server modules: a client component would
 * compute it again in the visitor's browser, and a page built in December and hydrated in January
 * would then disagree with its own markup. `__tests__/profile.test.ts` fails when a client module
 * reaches it.
 *
 * The place, the certification and the occupation below are facts the Person JSON-LD asserts, so
 * each is one a page shows (#57, ADR 0031).
 */
import type { Fact } from './pages/about';

/** The year of the first role in the `/about` timeline, where the career the site counts starts. */
export const CAREER_START_YEAR = 2013;

/**
 * The calendar year of `asOf` (the current time by default) minus `CAREER_START_YEAR`, in UTC, so a
 * build gives the same answer in any time zone. It counts calendar years, not completed years from
 * a start date: the figure goes up on 1 January, whatever month the first role began in.
 *
 * Throws a `RangeError` on an invalid date, or on one that would state less than one year, rather
 * than print "NaN years" or "0 years" into prerendered pages.
 */
export function yearsOfExperience(asOf: Date = new Date()): number {
  const years = asOf.getUTCFullYear() - CAREER_START_YEAR;
  if (!Number.isFinite(years) || years < 1) {
    throw new RangeError(
      `yearsOfExperience: ${Number.isNaN(asOf.getTime()) ? 'an invalid date' : asOf.toISOString()} ` +
        `gives ${years} years since ${CAREER_START_YEAR}`,
    );
  }
  return years;
}

/**
 * The first day of the year in which `yearsOfExperience(asOf)` took its value, as an ISO date. The
 * routes that print the figure change what they say on that day with no commit, so their content
 * dates (`static-routes.ts`) can be no earlier.
 */
export function experienceFigureSince(asOf: Date = new Date()): string {
  return `${CAREER_START_YEAR + yearsOfExperience(asOf)}-01-01`;
}

/**
 * The certification `/about` lists under Credentials, and the Person JSON-LD's `hasCredential`
 * (#57). The markup may assert only what a page shows, so both read it from here.
 */
export const CERTIFICATION = 'Angular Certified Architect';

/**
 * Where the person is based, as `/about` shows it ("Belgrade, Serbia" under Credentials, and the
 * description's "Based in Belgrade."): the Person JSON-LD's `address` and the place of its
 * occupation read the same two names (#57).
 */
export const LOCATION = { locality: 'Belgrade', country: 'Serbia' } as const;

/**
 * The occupation the Person JSON-LD's `hasOccupation` names (#57), as the pages print it: the
 * eyebrows of /work, /skills and /contact, and the home page's `h1` in lower case. Those lines
 * still write it themselves; `e2e/seo-surface.spec.ts` fails when no page shows it.
 */
export const OCCUPATION = 'Senior Full-Stack Engineer';

/**
 * The `/about` quick fact that states the total, label and figure together. The row lives here
 * whole rather than in the page record, so no copy module spells out a years figure of its own
 * (`single-source-metrics.test.ts`, R34).
 */
export function experienceFact(asOf?: Date): Fact {
  return { label: 'Years shipping code', value: String(yearsOfExperience(asOf)) };
}

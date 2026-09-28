/**
 * Facts about the person the site describes, each stated once (#49). A page that states one reads
 * it from here, so the Person JSON-LD, the hero's player card and `/about` cannot disagree.
 *
 * The years of experience are derived rather than written down: a count typed into the copy goes
 * stale every January, and the site used to print two different ones. Every route is prerendered,
 * so the figure is the build's and moves on with the first deploy of a new year. Read it only from
 * server modules: a client component would compute it again in the visitor's browser, and a page
 * built in December and hydrated in January would then disagree with its own markup.
 */

/** The year of the first role in the `/about` timeline, where the career the site counts starts. */
export const CAREER_START_YEAR = 2013;

/**
 * Whole calendar years since `CAREER_START_YEAR` as of `asOf` (the current time by default), in UTC,
 * so a build gives the same answer in any time zone.
 */
export function yearsOfExperience(asOf: Date = new Date()): number {
  return asOf.getUTCFullYear() - CAREER_START_YEAR;
}

/**
 * The `/about` quick fact that states the total, label and figure together. The row lives here
 * whole rather than in the page record, so no copy module spells out a years figure of its own
 * (`single-source-metrics.test.ts`, R34).
 */
export function experienceFact(asOf?: Date): { readonly label: string; readonly value: string } {
  return { label: 'Years shipping code', value: String(yearsOfExperience(asOf)) };
}

import type { CaseStudyHighlight } from './case-studies';

/**
 * The /work stats bar's production figure (#58), counted from the studies rather than written down.
 * The bar used to read "100% In Production", a literal that went false the day the self-healing
 * agent was retired and nobody edited the bar. Pure, and it reads only each study's
 * `highlight.status`, so a unit test can change a status and watch the figure move.
 */

type Status = CaseStudyHighlight['status'];

/** The one field of a study the figure reads. */
type Counted = readonly { highlight: { status: Status } }[];

/**
 * Which statuses count as running in production. A record over the whole union rather than a list
 * of the running ones, so a status added to `CaseStudyHighlight` fails `pnpm typecheck` here until
 * someone decides which side of the line it falls on. Frozen, so no importer can move the figure.
 */
export const RUNS_IN_PRODUCTION: Readonly<Record<Status, boolean>> = Object.freeze({
  LIVE: true,
  PRODUCTION: true,
  RETIRED: false,
});

/**
 * How many of the studies run in production, and out of how many: every study, the same count the
 * bar's Projects figure shows, so the two cannot disagree. It throws rather than print a figure
 * that means nothing: for no studies at all ("0 of 0"), and for a status the record does not
 * classify, which the type forbids but a cast or untyped data can still bring in (a plain lookup
 * would count it as not running, or as running for a key such as `constructor`).
 */
export function productionCount(studies: Counted): { running: number; total: number } {
  if (studies.length === 0) throw new Error('productionCount: there are no case studies to count');
  let running = 0;
  for (const { highlight } of studies) {
    if (!Object.hasOwn(RUNS_IN_PRODUCTION, highlight.status)) {
      throw new Error(`productionCount: unclassified status ${JSON.stringify(highlight.status)}`);
    }
    if (RUNS_IN_PRODUCTION[highlight.status]) running += 1;
  }
  return { running, total: studies.length };
}

/** The count as the bar prints it: `2 of 3`. */
export function productionFigure(studies: Counted): string {
  const { running, total } = productionCount(studies);
  return `${running} of ${total}`;
}

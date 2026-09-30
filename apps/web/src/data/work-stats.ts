import type { CaseStudyHighlight } from './case-studies';

/**
 * The /work stats bar's production figure (#58), counted from the studies rather than written down.
 * The bar used to read "100% In Production", a literal that went false the day the self-healing
 * agent was retired and nobody edited the bar. Pure, and it reads only each study's
 * `highlight.status`, so a unit test can change a status and watch the figure move.
 */

type Status = CaseStudyHighlight['status'];

/**
 * Which statuses count as running in production. A record over the whole union rather than a list
 * of the running ones, so a status added to `CaseStudyHighlight` fails `pnpm typecheck` here until
 * someone decides which side of the line it falls on.
 */
export const RUNS_IN_PRODUCTION: Readonly<Record<Status, boolean>> = {
  LIVE: true,
  PRODUCTION: true,
  RETIRED: false,
};

/**
 * How many of the studies run in production, out of all of them: `2 of 3`. The denominator is every
 * study, the same count the bar's Projects figure shows, so the two cannot disagree.
 */
export function productionFigure(studies: readonly { highlight: { status: Status } }[]): string {
  const running = studies.filter(({ highlight }) => RUNS_IN_PRODUCTION[highlight.status]).length;
  return `${running} of ${studies.length}`;
}

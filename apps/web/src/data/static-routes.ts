import { experienceFigureSince } from './profile';

/**
 * When the visible content of each static route last changed, as ISO dates (`YYYY-MM-DD`). The
 * sitemap sends them as `lastmod`; a crawler that sees every page claim to change on every deploy
 * learns to ignore the field. Bump a route's date by hand in the commit that changes what it says.
 * A case study's dates live on its entry in `case-studies.ts`.
 *
 * From git, the last commit to change what each route visibly says: `/` 2026-09-30 (#47: the story's
 * progress dots and readout name each section by its phase title), /work and /skills 2026-10-01
 * (#58: the stats bar's production figure counted from the studies' statuses and "Left Unfinished"
 * dropped, and the line saying the proficiency bars are self-assessed), /about 2026-09-28 (#49: the
 * years of experience read from data/profile.ts), /contact 2026-09-23 (d1da60f, #116, which changed
 * the hero subtitle and the eyebrows) and /blog 2026-01-27 (696c2ef). The later commits to /blog
 * changed only formatting, colour tokens, metadata or Open Graph images. /privacy was added on
 * 2026-09-27.
 *
 * One change needs no commit: `/` (the hero's XP row) and /about (its description and first quick
 * fact) print the years of experience, which `data/profile.ts` derives from the build's clock, so
 * their text changes on 1 January by itself. Their date is therefore the later of the one recorded
 * here and the day the printed figure took effect.
 */
const figureSince = experienceFigureSince();
const laterOf = (recorded: string, derived: string) => (recorded > derived ? recorded : derived);

export const STATIC_ROUTE_UPDATED = {
  '/': laterOf('2026-09-30', figureSince),
  '/about': laterOf('2026-09-28', figureSince),
  '/work': '2026-10-01',
  '/skills': '2026-10-01',
  '/blog': '2026-01-27',
  '/contact': '2026-09-23',
  '/privacy': '2026-09-27',
} as const satisfies Record<string, string>;

export type StaticRoute = keyof typeof STATIC_ROUTE_UPDATED;

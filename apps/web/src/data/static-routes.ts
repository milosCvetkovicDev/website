import { experienceFigureSince } from './profile';

/**
 * When the visible content of each static route last changed, as ISO dates (`YYYY-MM-DD`). The
 * sitemap sends them as `lastmod`; a crawler that sees every page claim to change on every deploy
 * learns to ignore the field. Bump a route's date by hand in the commit that changes what it says.
 * A case study's dates live on its entry in `case-studies.ts`, and a post's in `posts.ts`.
 *
 * /blog's date covers what /blog itself says. Once a post is published, /blog lists each post's
 * title, summary and publication day, and its `lastmod` is the latest of this date and every
 * published post's `publishedAt` (`sitemap.ts`, #61). Publishing a post, or updating only its body,
 * needs no bump here. Changing a published post's title or summary, unpublishing a post or removing
 * one changes the list without a new `publishedAt`: bump /blog's date in that commit.
 *
 * From git, the last commit to change what each route visibly says: /about and /skills 2026-10-03
 * (#58: the /about quick facts and timeline and the /skills toolkit became captioned tables, whose
 * wide ones stack into rows on a phone, dated the day they are expected to merge; before it, on
 * 2026-10-02, #57's "Last updated" line at the foot of /about, which prints this date),
 * `/` and /work 2026-10-01 (#49: the self-healing agent's figure relabelled "errors resolved
 * autonomously" on the home and /work cards and in the About timeline, whose 2021 entry lost its
 * unsourced 40%; #58: the three questions answered after the /about story, the stats bar's
 * production figure counted from the studies' statuses and "Left Unfinished" dropped, and the line
 * on /skills saying the proficiency bars are self-assessed), /contact 2026-09-23 (d1da60f, #116, which
 * changed the hero subtitle and the eyebrows) and /blog 2026-01-27 (696c2ef). The later commits to
 * /blog changed only formatting, colour tokens, metadata or Open Graph images. /privacy was added
 * on 2026-09-27.
 *
 * One change needs no commit: `/` (the hero's XP row) and /about (its description and first quick
 * fact) print the years of experience, which `data/profile.ts` derives from the build's clock, so
 * their text changes on 1 January by itself. Their date is therefore the later of the one recorded
 * here and the day the printed figure took effect.
 */
const figureSince = experienceFigureSince();
const laterOf = (recorded: string, derived: string) => (recorded > derived ? recorded : derived);

export const STATIC_ROUTE_UPDATED = {
  '/': laterOf('2026-10-01', figureSince),
  '/about': laterOf('2026-10-03', figureSince),
  '/work': '2026-10-01',
  '/skills': '2026-10-03',
  '/blog': '2026-01-27',
  '/contact': '2026-09-23',
  '/privacy': '2026-09-27',
} as const satisfies Record<string, string>;

export type StaticRoute = keyof typeof STATIC_ROUTE_UPDATED;

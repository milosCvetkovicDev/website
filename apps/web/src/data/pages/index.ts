import type { StaticRoute } from '@/data/static-routes';
import { aboutRecord } from './about';
import { blogRecord } from './blog';
import { contactRecord } from './contact';
import { homePage } from './home';
import { privacyRecord } from './privacy';
import { skillsRecord } from './skills';
import type { PageRecord } from './types';
import { workRecord } from './work';

/**
 * Every static route's page record, keyed by its path: what each route's Markdown twin at
 * `<path>/index.md` renders through `pageToMarkdown()` (#59). `satisfies` over `StaticRoute` makes
 * this the whole list: a route added to `STATIC_ROUTE_UPDATED` without a record here fails
 * typecheck, and so does a record for a route that is not there.
 *
 * Server code only. The story's client components import `./home` directly, and must keep doing so:
 * importing this module would put every record, and the case studies the work record reads, into
 * the home page's client chunk.
 */
export const pages = {
  '/': homePage,
  '/about': aboutRecord,
  '/work': workRecord,
  '/skills': skillsRecord,
  '/blog': blogRecord,
  '/contact': contactRecord,
  '/privacy': privacyRecord,
} as const satisfies Record<StaticRoute, PageRecord>;

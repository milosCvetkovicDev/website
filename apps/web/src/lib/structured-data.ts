import type { PageRecord } from '@/data/pages/types';
import { yearsOfExperience } from '@/data/profile';
import { socialProfiles } from '@/data/social';
import { formatContentDate } from './content-date';
import { assertPathname } from './pathname';
import { siteOrigin } from './site-origin';

/**
 * The site's JSON-LD nodes, as plain objects (#57, ADR 0031). `components/json-ld.tsx` renders each
 * one into its own `<script type="application/ld+json">` through `serializeJsonLd`; nothing here
 * escapes or renders anything.
 *
 * The nodes form one graph. Every node carries an `@id`, and a node that names another does it with
 * a reference, `{ '@id': … }` and nothing else, so no fact is written twice and nothing restates
 * what the node it points at owns. The root layout renders the Person and the WebSite on every
 * route, the 404 included; each page adds its own WebPage (a ProfilePage on /about), and a case
 * study adds its TechArticle and its BreadcrumbList. The blocks stay separate rather than one
 * `@graph`: the `@id` references are what join them.
 *
 * Every URL is absolute on `siteOrigin()`, `NEXT_PUBLIC_SITE_URL` as a bare origin, falling back to
 * production, and a route's URL is its canonical, built from the same pathname its `buildMetadata()`
 * call receives, the way Next resolves it: the origin alone for `/`. A value that is not an http(s)
 * origin throws when this module loads, so the build fails rather than ship broken ids.
 */

const siteUrl = siteOrigin();

const CONTEXT = 'https://schema.org';
const NAME = 'Milos Cvetkovic';

/** The one Person: who the site is by and about. */
export const PERSON_ID = `${siteUrl}/#person`;
/** The one WebSite every page is part of. */
export const WEBSITE_ID = `${siteUrl}/#website`;

/** A reference to another node: its `@id` alone, so the fact stays with the node that owns it. */
export interface NodeReference {
  '@id': string;
}

const reference = (id: string): NodeReference => ({ '@id': id });

/** The absolute URL of a route, as its canonical link writes it: the origin alone for `/`. */
export function canonicalUrl(path: string): string {
  assertPathname(path, 'canonicalUrl');
  return path === '/' ? siteUrl : `${siteUrl}${path}`;
}

/**
 * A node that belongs to one route: its canonical, then `#` and the node's role. The root keeps its
 * slash, so its ids read like the Person's and the WebSite's (`<origin>/#webpage`).
 */
function routeNodeId(path: string, role: 'webpage' | 'article' | 'breadcrumb'): string {
  return `${path === '/' ? `${canonicalUrl(path)}/` : canonicalUrl(path)}#${role}`;
}

/** The `@id` of a route's page node: its WebPage, or /about's ProfilePage. */
export const webPageId = (path: string) => routeNodeId(path, 'webpage');

/** The text of a route's title, as `buildMetadata()` gets it: a plain or an absolute title. */
function titleText(title: PageRecord['title']): string {
  const text = typeof title === 'string' ? title : title.absolute;
  if (text.trim() === '')
    throw new Error('webPage: a page node needs a name, and this one is blank');
  return text;
}

/** A content date as stored, `YYYY-MM-DD`; anything else throws, so the prerender fails. */
function contentDate(date: string, node: string): string {
  if (formatContentDate(date) === null) {
    throw new Error(`${node}: ${JSON.stringify(date)} is not a YYYY-MM-DD day`);
  }
  return date;
}

export function person() {
  return {
    '@context': CONTEXT,
    '@type': 'Person',
    '@id': PERSON_ID,
    name: NAME,
    url: siteUrl,
    jobTitle: 'Senior Full Stack Engineer & Architect',
    // The total is career experience, read from the profile; the AI-native work is the recent
    // part of it (the About timeline starts it in 2025), so the sentence keeps the two apart.
    description: `Senior Full Stack Engineer & Architect with ${yearsOfExperience()} years of experience in software engineering, now building AI-native systems, self-healing agents, and cloud-native architecture.`,
    knowsAbout: [
      'TypeScript',
      'React',
      'NestJS',
      'Node.js',
      'Azure',
      'Terraform',
      'Claude Code',
      'DDD',
      'Kubernetes',
      'AI-Native Development',
      'Self-Healing Agents',
      'Clean Architecture',
      'Legacy Modernization',
      'DevOps',
    ],
    // The profiles the footer and the pages link to, from their one source (#49).
    sameAs: socialProfiles.map(({ href }) => href),
  };
}

export function website() {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: NAME,
    url: siteUrl,
    description:
      'Portfolio of Milos Cvetkovic - Senior Full-Stack Engineer specializing in AI-native development and legacy modernization.',
    inLanguage: 'en',
    author: reference(PERSON_ID),
    publisher: reference(PERSON_ID),
  };
}

/**
 * A route's page node: part of the WebSite and about the Person. `name` is the title the route
 * passes to `buildMetadata()`. A route with a breadcrumb trail names it, and renders the
 * `breadcrumbList()` with the same `path` beside it.
 */
export function webPage({
  path,
  name,
  breadcrumb = false,
}: {
  path: string;
  name: PageRecord['title'];
  breadcrumb?: boolean;
}) {
  return {
    '@context': CONTEXT,
    '@type': 'WebPage',
    '@id': webPageId(path),
    url: canonicalUrl(path),
    name: titleText(name),
    isPartOf: reference(WEBSITE_ID),
    about: reference(PERSON_ID),
    ...(breadcrumb && { breadcrumb: reference(routeNodeId(path, 'breadcrumb')) }),
  };
}

/**
 * /about's page node. It is that route's WebPage, so /about renders this and no `webPage()`: a page
 * about one person, whose `mainEntity` is the Person. Its `name` is that person's name, as #57
 * specifies for a ProfilePage, not the route's title: the one page node whose name is not its head's.
 * `dateModified` is the date the page shows in its "Last updated" line, never a date it does not show.
 */
export function profilePage({ path, dateModified }: { path: string; dateModified: string }) {
  return {
    '@context': CONTEXT,
    '@type': 'ProfilePage',
    '@id': webPageId(path),
    url: canonicalUrl(path),
    name: NAME,
    dateModified: contentDate(dateModified, 'profilePage'),
    isPartOf: reference(WEBSITE_ID),
    mainEntity: reference(PERSON_ID),
  };
}

/**
 * A technical write-up on its own route, by the Person. The page it is the main entity of is that
 * route's WebPage, so the article carries no `url` of its own. Its image is the route's own card,
 * served at `<canonical>/og-image.png`, a prerendered route whose URL carries no hash.
 */
export function techArticle({
  path,
  headline,
  description,
  datePublished,
  dateModified,
  keywords,
}: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  keywords: readonly string[];
}) {
  return {
    '@context': CONTEXT,
    '@type': 'TechArticle',
    '@id': routeNodeId(path, 'article'),
    headline,
    description,
    image: `${canonicalUrl(path)}/og-image.png`,
    author: reference(PERSON_ID),
    mainEntityOfPage: reference(webPageId(path)),
    isPartOf: reference(WEBSITE_ID),
    datePublished: contentDate(datePublished, 'techArticle'),
    dateModified: contentDate(dateModified, 'techArticle'),
    keywords,
  };
}

/** One step of a breadcrumb trail: what it is called, and the route it links to. */
export interface Crumb {
  name: string;
  path: string;
}

/**
 * The trail from the home page down to the route at `path`, which is its last step. A trail that is
 * shorter than two steps, does not start at `/` or end at `path`, repeats a route or has a blank
 * name throws, so the prerender fails rather than ship a trail a results page cannot show.
 */
export function breadcrumbList({ path, trail }: { path: string; trail: readonly Crumb[] }) {
  if (
    trail.length < 2 ||
    trail[0].path !== '/' ||
    trail[trail.length - 1].path !== path ||
    new Set(trail.map((crumb) => crumb.path)).size !== trail.length ||
    trail.some((crumb) => crumb.name.trim() === '')
  ) {
    throw new Error(
      `breadcrumbList: the trail for ${path} must run from / to it in two named steps or more, ` +
        'each route once',
    );
  }
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    '@id': routeNodeId(path, 'breadcrumb'),
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: canonicalUrl(crumb.path),
    })),
  };
}

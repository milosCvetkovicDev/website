import type {
  BreadcrumbList,
  ListItem,
  Person,
  ProfilePage,
  TechArticle,
  TechArticleLeaf,
  WebPage,
  WebPageLeaf,
  WebSite,
  WithContext,
} from 'schema-dts';
import type { PageRecord } from '@/data/pages/types';
import { CERTIFICATION, LOCATION, OCCUPATION, yearsOfExperience } from '@/data/profile';
import { social, socialProfiles } from '@/data/social';
import type { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
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
 * study or a post adds its TechArticle and its BreadcrumbList. The blocks stay separate rather than
 * one `@graph`: the `@id` references are what join them.
 *
 * Every builder's object ends with `satisfies WithContext<T>`, `T` being its schema-dts type, so a
 * misspelled predicate fails `pnpm typecheck` on the line that wrote it (#57 AC 8, 57c).
 * `satisfies` rather than an annotation keeps the object's own type. The object around a
 * conditional spread does not check the keys the spread adds, so each spread's own object carries
 * `satisfies SpreadPredicates<…Leaf>`, which also keeps it from setting the node's `@type` or
 * `@id`; and `map` types its callback's object before the list it returns is checked, so each
 * ListItem a trail maps to carries `satisfies ListItem`. The types change nothing at run time.
 * `lib/__tests__/structured-data-types.test.ts` holds schema-dts to catching each kind of
 * misspelling, and fails when a builder, a spread or a ListItem loses its `satisfies`.
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

/**
 * What a conditional spread may add to a node of type `Leaf`: any of its predicates, but never the
 * `@type` or `@id` the node's own literal sets, which a later spread would otherwise overwrite.
 */
export type SpreadPredicates<Leaf> = Partial<Omit<Leaf, '@type' | '@id'>>;

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

/**
 * The route whose ProfilePage the Person is the main entity of. A literal, held to the static
 * routes by its type, rather than /about's page record: the root layout renders the Person on every
 * route, the 404 included, and that record runs code when it loads (it throws when a case study it
 * reads is missing), which would take every route's Person down with /about (57b).
 */
const ABOUT_PATH = '/about' satisfies keyof typeof STATIC_ROUTE_UPDATED;

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
    throw new Error(`${node}: "${date}" is not a YYYY-MM-DD day`);
  }
  return date;
}

/**
 * The person the site is by and about, with only the facts its pages show (#57, ADR 0031's
 * visible-facts rule): the X handle as an alias, the place and the certification /about lists, and
 * the occupation the page eyebrows name, as the occupation and the job title, each read from the
 * module that also feeds the page. No employer or school is asserted, because the /about timeline
 * names neither. `knowsAbout` keeps the entries some route's text shows (57b dropped "Self-Healing
 * Agents", which none did), and the description states only what pages print, besides the years
 * (57b dropped "self-healing agents", which the pages call retired, and "cloud-native
 * architecture", which no page says). The Person describe in `e2e/seo-surface.spec.ts` finds each
 * string here, and each clause of the description, in the served text of a page as a whole word,
 * and each profile as a rendered link, unless its `NOT_PAGE_TEXT` names what holds that path
 * instead, so a fact added here that no page shows fails there.
 */
export function person() {
  return {
    '@context': CONTEXT,
    '@type': 'Person',
    '@id': PERSON_ID,
    name: NAME,
    // The handle after an `@`, as the Twitter card's creator writes it; the X profile, whose URL
    // ends with it, is among the `sameAs` below.
    alternateName: `@${social.x.handle}`,
    url: siteUrl,
    jobTitle: OCCUPATION,
    // The total is career experience, read from the profile; the AI-native work is the recent
    // part of it (the About timeline starts it in 2025), so the sentence keeps the two apart.
    description: `${OCCUPATION} with ${yearsOfExperience()} years of experience in software engineering, now building AI-native systems.`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: LOCATION.locality,
      addressCountry: LOCATION.country,
    },
    hasCredential: {
      '@type': 'EducationalOccupationalCredential',
      name: CERTIFICATION,
      credentialCategory: 'certification',
    },
    // No `occupationLocation`: /about lists the work as remote-first since 2020, so the place is
    // the person's address, not the occupation's (the owner's decision on #57).
    hasOccupation: { '@type': 'Occupation', name: OCCUPATION },
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
      'Clean Architecture',
      'Legacy Modernization',
      'DevOps',
    ],
    // The profiles the footer and the pages link to, from their one source (#49).
    sameAs: socialProfiles.map(({ href }) => href),
    // The page about this person is /about's ProfilePage. The Person is served on every route and
    // that node only on /about, so this is the one reference that names a node on another route;
    // the graph tests let it through by name and hold it to /about's node instead (57b).
    mainEntityOfPage: reference(webPageId(ABOUT_PATH)),
  } satisfies WithContext<Person>;
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
  } satisfies WithContext<WebSite>;
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
    ...(breadcrumb &&
      ({
        breadcrumb: reference(routeNodeId(path, 'breadcrumb')),
      } satisfies SpreadPredicates<WebPageLeaf>)),
  } satisfies WithContext<WebPage>;
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
  } satisfies WithContext<ProfilePage>;
}

/**
 * A technical write-up on its own route, by the Person: a case study, or a post (#61). The page it is
 * the main entity of is that route's WebPage, so the article carries no `url` of its own. Its image
 * is the route's own card, served at `<canonical>/og-image.png`, a prerendered route whose URL
 * carries no hash.
 *
 * `description` and `keywords` are for a page that prints them, as ADR 0031's fifth decision asks:
 * a case study shows its description and its tags, so its article carries both, while a post page
 * shows neither (its summary is only the head's description, its tags are drawn on its card alone),
 * so a post's article carries neither, and the node leaves out a predicate it is not given. Both
 * keys are required, `undefined` being the way to leave one out, so a case study that drops either
 * line fails to compile rather than ship an article without it. A blank headline, an empty
 * description or an empty keywords list throws, so the prerender fails rather than serve an empty
 * predicate.
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
  description: string | undefined;
  datePublished: string;
  dateModified: string;
  keywords: readonly string[] | undefined;
}) {
  if (headline.trim() === '') {
    throw new Error('techArticle: an article needs a headline, and this one is blank');
  }
  if (description?.trim() === '' || keywords?.length === 0) {
    throw new Error('techArticle: an empty description or keywords list; leave it out');
  }
  return {
    '@context': CONTEXT,
    '@type': 'TechArticle',
    '@id': routeNodeId(path, 'article'),
    headline,
    ...(description !== undefined && ({ description } satisfies SpreadPredicates<TechArticleLeaf>)),
    image: `${canonicalUrl(path)}/og-image.png`,
    author: reference(PERSON_ID),
    mainEntityOfPage: reference(webPageId(path)),
    isPartOf: reference(WEBSITE_ID),
    datePublished: contentDate(datePublished, 'techArticle'),
    dateModified: contentDate(dateModified, 'techArticle'),
    ...(keywords !== undefined && ({ keywords } satisfies SpreadPredicates<TechArticleLeaf>)),
  } satisfies WithContext<TechArticle>;
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
    itemListElement: trail.map(
      (crumb, index) =>
        ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: canonicalUrl(crumb.path),
        }) satisfies ListItem,
    ),
  } satisfies WithContext<BreadcrumbList>;
}

/**
 * Any node a builder here returns: what `components/json-ld.tsx` renders. `WithContext<WebPage>`
 * already holds the ProfilePage, so that member adds nothing to the type; it stays so the union
 * names each builder's type, and tsc folds it away (`--extendedDiagnostics` reports the same type
 * and instantiation counts for the web project with it and without it).
 */
export type JsonLdNode =
  | WithContext<Person>
  | WithContext<WebSite>
  | WithContext<WebPage>
  | WithContext<ProfilePage>
  | WithContext<TechArticle>
  | WithContext<BreadcrumbList>;

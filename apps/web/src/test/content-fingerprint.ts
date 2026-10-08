/**
 * The served text of every route that carries a content date, reduced to a fingerprint, for the
 * content-date manifest (`src/data/content-dates.json`, #191). The manifest pairs each route's
 * date with the fingerprint of what it says, so a later check can tell a change of copy from a
 * change of date by comparing two manifests, without building either side.
 *
 * What counts as served text: the route's page component rendered by React's own server renderer
 * (`react-dom/static`'s `prerender`, which waits for every Suspense boundary), with its `script`,
 * `style`, `template` and `time` elements removed and the rest read as `textContent` with its
 * whitespace collapsed; plus the body of its Markdown twin, as its `index.md` handler serves it.
 * The route's own content dates are masked in both, in their ISO and their `formatContentDate`
 * forms, so moving a date alone leaves the fingerprint where it was.
 *
 * Because it is rendered text and not source, a comment, a type, an import or a reformatted line
 * cannot move a fingerprint, and copy that lives in a page or hero component counts without a map
 * of which file feeds which route. What it does not see: the layout's chrome (header, footer, nav:
 * `app/layout.tsx` wraps every page and is rendered by none of them), text held in attributes
 * (`alt`, `aria-label`, `title`), and anything only the browser renders, after hydration or GSAP.
 *
 * The page is parsed by the small extractor below rather than a DOM, so the test that uses it runs
 * in the node environment, as the server render does, without paying for a jsdom window. It reads
 * React's server output, not arbitrary HTML: React escapes `<`, `>` and `"` inside attribute values
 * and writes no nested `template`, which is what lets a tag end at the first `>`.
 */
import { createHash } from 'node:crypto';
import { createElement, type ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import AboutPage from '@/app/about/page';
import { GET as aboutTwin } from '@/app/about/index.md/route';
import PostPage from '@/app/blog/[slug]/page';
import { GET as postTwin } from '@/app/blog/[slug]/index.md/route';
import BlogPage from '@/app/blog/page';
import { GET as blogTwin } from '@/app/blog/index.md/route';
import ContactPage from '@/app/contact/page';
import { GET as contactTwin } from '@/app/contact/index.md/route';
import { GET as homeTwin } from '@/app/index.md/route';
import Home from '@/app/page';
import PrivacyPage from '@/app/privacy/page';
import { GET as privacyTwin } from '@/app/privacy/index.md/route';
import sitemap from '@/app/sitemap';
import SkillsPage from '@/app/skills/page';
import { GET as skillsTwin } from '@/app/skills/index.md/route';
import CaseStudyPage from '@/app/work/[slug]/page';
import { GET as caseStudyTwin } from '@/app/work/[slug]/index.md/route';
import WorkPage from '@/app/work/page';
import { GET as workTwin } from '@/app/work/index.md/route';
import { caseStudies } from '@/data/case-studies';
import { pages } from '@/data/pages';
import { publishedPosts } from '@/data/posts';
import { STATIC_ROUTE_UPDATED, type StaticRoute } from '@/data/static-routes';
import { formatContentDate } from '@/lib/content-date';

/** One route the manifest records. */
export interface ContentRoute {
  /** The URL path, as the sitemap sends it. */
  readonly path: string;
  /**
   * The route's content date: its sitemap `lastmod`, or for a route the sitemap leaves out (/blog
   * while no post is published) its own date in `static-routes.ts`.
   */
  readonly updated: string;
  /** The dates the route prints as its own, masked out of its text. */
  readonly dates: readonly string[];
  /** The page's `h1`, from its record: a render that lost the page cannot pass for one. */
  readonly heading: string;
}

/** What a route serves: its page as HTML and its Markdown twin's body. */
export interface RenderedRoute {
  readonly html: string;
  readonly twin: string;
}

/**
 * Each static route's page and twin. `satisfies` over `StaticRoute` makes this the whole list: a
 * route added to `STATIC_ROUTE_UPDATED` fails typecheck until it is added here too.
 */
const STATIC_PAGES = {
  '/': { Page: Home, twin: homeTwin },
  '/about': { Page: AboutPage, twin: aboutTwin },
  '/work': { Page: WorkPage, twin: workTwin },
  '/skills': { Page: SkillsPage, twin: skillsTwin },
  '/blog': { Page: BlogPage, twin: blogTwin },
  '/contact': { Page: ContactPage, twin: contactTwin },
  '/privacy': { Page: PrivacyPage, twin: privacyTwin },
} as const satisfies Record<StaticRoute, { Page: () => ReactNode; twin: () => Response }>;

const isStaticRoute = (path: string): path is StaticRoute => Object.hasOwn(STATIC_PAGES, path);

const unique = (values: readonly string[]) => [...new Set(values)];

/** Each sitemap entry's `lastmod`, keyed by its URL path. */
function sitemapDates(): Map<string, string> {
  return new Map(
    sitemap().map(({ url, lastModified }) => {
      const path = new URL(url).pathname;
      if (typeof lastModified !== 'string') {
        throw new Error(`sitemap: ${path} has no YYYY-MM-DD lastmod, got ${String(lastModified)}`);
      }
      return [path, lastModified];
    }),
  );
}

/**
 * Every route with a content date, in no particular order: each static route (so /blog's Coming
 * Soon page while no post is published), each case study and each published post.
 */
export function contentRoutes(): ContentRoute[] {
  const lastmod = sitemapDates();
  const staticRoutes = (Object.keys(STATIC_ROUTE_UPDATED) as StaticRoute[]).map((path) => {
    const own = STATIC_ROUTE_UPDATED[path];
    // /blog lists each post with the day it was published, and those days feed its lastmod.
    const listed = path === '/blog' ? publishedPosts.map((post) => post.publishedAt) : [];
    const updated = lastmod.get(path) ?? own;
    return {
      path,
      updated,
      dates: unique([updated, own, ...listed]),
      heading: pages[path].heading,
    };
  });
  const studies = caseStudies.map((study) => {
    const path = `/work/${study.slug}`;
    const updated = lastmod.get(path) ?? study.updatedAt;
    return {
      path,
      updated,
      dates: unique([updated, study.publishedAt, study.updatedAt]),
      heading: study.title,
    };
  });
  const posts = publishedPosts.map((post) => {
    const path = `/blog/${post.slug}`;
    const updated = lastmod.get(path) ?? post.updatedAt;
    return {
      path,
      updated,
      dates: unique([updated, post.publishedAt, post.updatedAt]),
      heading: post.title,
    };
  });
  return [...staticRoutes, ...studies, ...posts];
}

/**
 * `node` as React's server renderer writes it, every Suspense boundary resolved. An error React
 * reports while rendering fails the call rather than leaving a partial page to be fingerprinted.
 */
export async function renderHtml(node: ReactNode): Promise<string> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(node, { onError: (error) => void errors.push(error) });
  const html = await new Response(prelude).text();
  if (errors.length > 0) throw errors[0];
  return html;
}

const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) });

/** The request a dynamic twin handler is called with: it reads only its params. */
const twinRequest = (path: string) => new Request(`https://miloscvetkovic.dev${path}/index.md`);

/** The page at `path` as HTML and its twin's body: a static route, a case study or a post. */
export async function renderRoute(path: string): Promise<RenderedRoute> {
  if (isStaticRoute(path)) {
    const { Page, twin } = STATIC_PAGES[path];
    return { html: await renderHtml(createElement(Page)), twin: await twin().text() };
  }
  const study = /^\/work\/([^/]+)$/.exec(path);
  if (study) {
    const page = await CaseStudyPage(slugParams(study[1]));
    const twin = await caseStudyTwin(twinRequest(path), slugParams(study[1]));
    return { html: await renderHtml(page), twin: await twin.text() };
  }
  const post = /^\/blog\/([^/]+)$/.exec(path);
  if (post) {
    const page = await PostPage(slugParams(post[1]));
    const twin = await postTwin(twinRequest(path), slugParams(post[1]));
    return { html: await renderHtml(page), twin: await twin.text() };
  }
  throw new Error(`renderRoute: no page renders ${JSON.stringify(path)}`);
}

// Elements whose content is not text a reader is shown as copy: scripts (the JSON-LD among them),
// styles, inert templates, and `time`, which holds a content date.
const DROPPED_ELEMENTS = /<(script|style|template|time)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const TAGS = /<\/?[A-Za-z][^>]*>/g;
const ENTITIES = /&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi;
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/**
 * The text `html` shows a reader: what `textContent` would read once the `script`, `style`,
 * `template` and `time` elements are removed, with every run of whitespace collapsed to one space.
 */
export function servedText(html: string): string {
  return html
    .replace(DROPPED_ELEMENTS, '')
    .replace(COMMENTS, '')
    .replace(TAGS, '')
    .replace(ENTITIES, (_entity, decimal?: string, hex?: string, name?: string) =>
      decimal !== undefined
        ? String.fromCodePoint(Number(decimal))
        : hex !== undefined
          ? String.fromCodePoint(Number.parseInt(hex, 16))
          : NAMED[name!.toLowerCase()],
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a masked date reads as. */
export const DATE_MASK = '<date>';

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text` with each of `dates` (`YYYY-MM-DD`) replaced by `DATE_MASK`, in both forms a page or twin
 * prints one: the ISO day and `formatContentDate`'s `3 October 2026`. A form is matched whole, so
 * `3 October 2026` leaves `13 October 2026` alone. Throws on a date that is not a real day.
 */
export function maskDates(text: string, dates: readonly string[]): string {
  const forms = dates.flatMap((date) => {
    const shown = formatContentDate(date);
    if (!shown) throw new Error(`maskDates: ${JSON.stringify(date)} is not a real YYYY-MM-DD day`);
    return [date, shown];
  });
  if (forms.length === 0) return text;
  // Longest first, so that no form is cut short by another that it contains.
  const alternatives = unique(forms)
    .sort((a, b) => b.length - a.length)
    .map(escaped);
  return text.replace(new RegExp(`(?<!\\d)(?:${alternatives.join('|')})(?!\\d)`, 'g'), DATE_MASK);
}

/** The first 16 hex digits of the SHA-256 of a route's page text and twin text, kept apart. */
export function fingerprint(pageText: string, twinText: string): string {
  return createHash('sha256')
    .update(JSON.stringify([pageText, twinText]))
    .digest('hex')
    .slice(0, 16);
}

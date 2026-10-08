import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, caseStudyPageTitle } from '@/data/case-studies';
import { pages } from '@/data/pages';
import { publishedPosts } from '@/data/posts';
import { yearsOfExperience } from '@/data/profile';
import { socialProfiles } from '@/data/social';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { yearsClausesAboutAi, yearsFigures } from '@/test/experience-claims';
import { hostileTitlePost } from '@/test/fixtures/posts';

// The home page's story, its featured work and its tech stack are client components with nothing
// to say about JSON-LD and a costly mount; the graph rows below render the page around them.
vi.mock('@/components/animated-hero', () => ({
  AnimatedHero: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@/components/animated-hero/hero-content', () => ({ HeroContent: () => null }));
vi.mock('@/components', () => ({ FeaturedWork: () => null, TechStack: () => null }));

// No post is published yet, so the real index is empty and every post row below would hold over
// nothing. The file swaps it for an index built over the fixtures by `buildPostIndex`, the code the
// real exports come from, as `post-page.test.tsx` does (#61, 61f).
vi.mock('@/data/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/posts')>();
  const { fixturePosts } = await import('@/test/fixtures/posts');
  return { ...actual, posts: fixturePosts, ...actual.buildPostIndex(fixturePosts) };
});

/**
 * The JSON-LD blocks.
 *
 * Row R32 of the RED manifest, fixed by #48, plus the assertions that hold the blocks' shape.
 *
 * The blocks used to write their object into a `<script>` element through bare `JSON.stringify`, which
 * leaves `</script>` exactly as it found it, and a browser's tokeniser ends the script at the first one
 * it sees, whatever the JSON thinks. The values that reach it are `NEXT_PUBLIC_SITE_URL` and the
 * case-study data, configuration rather than visitor input, so this was a hardening row rather than a
 * live hole. Every block now goes through `serializeJsonLd`, which writes `<` as `\u003c`.
 *
 * `siteUrl` is read at module scope in `lib/structured-data.ts`, which builds the nodes this module
 * renders, so each case re-imports the module with the variable already set. `vi.resetModules` in
 * `beforeEach` is what makes that work; without it the second import returns the first evaluation
 * and the test would silently assert nothing.
 *
 * The offline structured-data gate (#55, FR-4). A describe below renders every block the site
 * serves, the Person and the WebSite from the root layout, a WebPage for every static route but
 * /about, /about's ProfilePage, and a WebPage, a TechArticle and a BreadcrumbList for every case
 * study and every published post (the fixtures, through the mock above), and runs each payload
 * through `parseJsonLdBlock`: valid JSON, one object, an `@context` of
 * `https://schema.org` and a non-empty `@type`. It needs no network, so it is the hard gate;
 * `e2e/structured-data.spec.ts` asks validator.schema.org about the vocabulary as well, and fails
 * open, because that endpoint is undocumented.
 *
 * The graph (#57, ADR 0031). Two rows there were expected failures until #57 joined the nodes into
 * one `@id` graph: every node carries an `@id`; and a WebPage node exists, and WebSite, WebPage and
 * Person reference each other by `@id`. The last describe holds the graph to that on every route,
 * rendering each page after the root layout's two blocks: every node has an `@id` of its own, every
 * reference names a node the same route serves and carries nothing but that `@id`, and the route's
 * types are pinned. One reference is let through by name (57b): the Person, rendered on every route,
 * is the main entity of /about's ProfilePage, which only /about serves, so a row there holds it to
 * that node instead. `e2e/seo-surface.spec.ts` checks the same sets in the served HTML.
 *
 * Typing (57c): every payload object in `lib/structured-data.ts` ends with
 * `satisfies WithContext<T>`, `T` being its schema-dts 2.1.0 node type (`Person`, `WebSite`,
 * `WebPage`, `ProfilePage`, `TechArticle`, `BreadcrumbList`), and `JsonLd` takes only their union,
 * `JsonLdNode`. `satisfies` rather than a `: WithContext<Person>` annotation keeps the object's own
 * literal type and still checks excess properties, so a misspelled predicate is a `pnpm typecheck`
 * error on the line that wrote it: `jobTitel` fails with TS2561, "Did you mean to write
 * 'jobTitle'?", and a misspelled key in the nested PostalAddress with TS1360 naming it. Two places
 * the outer `satisfies` does not reach carry their own: the object each conditional spread adds
 * (`satisfies SpreadPredicates<TechArticleLeaf>` or `<WebPageLeaf>`, which also refuse an `@type`
 * or `@id`) and each ListItem a trail maps to (`satisfies ListItem`).
 * `lib/__tests__/structured-data-types.test.ts` keeps schema-dts catching each kind under
 * `pnpm typecheck` and fails `pnpm test` when one of those `satisfies` is removed, and
 * `e2e/structured-data.spec.ts` still asks validator.schema.org about what is served. This file
 * imports nothing from schema-dts: the types check what the code writes; this file checks what
 * renders.
 */

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

/** Imports a fresh copy of the module with `NEXT_PUBLIC_SITE_URL` set to `siteUrl`. */
async function importWithSiteUrl(siteUrl?: string) {
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
  vi.resetModules();
  return import('../json-ld');
}

/** The raw text of every ld+json script the given elements rendered. */
function jsonLdBlocks(container: HTMLElement): string[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')].map(
    (script) => script.innerHTML,
  );
}

/** One JSON-LD node: the object at the root of an ld+json block. */
type JsonLdNode = Record<string, unknown> & { '@context': string; '@type': string | string[] };

/**
 * One ld+json payload, parsed and checked: valid JSON, one object rather than an array or a scalar,
 * an `@context` of exactly `https://schema.org`, and a non-empty `@type`. Returns the node, and throws
 * an error naming the first thing that is wrong. Pure: no DOM and no network, so the gate is the same
 * with the machine offline.
 *
 * `@type` may be a list, as JSON-LD allows, provided it is not empty and holds only non-empty names. A
 * block with no `@type` at its root, a bare `@graph` for instance, is refused: #57's design keeps
 * separate blocks joined by `@id` rather than one `@graph`. Below the root, an object needs no type
 * (`{ '@id': … }` is a reference), but one that declares a `@type` (a ListItem, an author) is held to
 * the same rule. Every `@id`, `url`, `item` and `mainEntityOfPage` string, at any depth, must be an
 * absolute http(s) URL: a relative one resolves against whatever page a crawler found it on.
 */
function parseJsonLdBlock(raw: string): JsonLdNode {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`not valid JSON: ${(error as Error).message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    const shape = Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value;
    throw new Error(`not a JSON-LD node: the payload is ${shape}, not one object`);
  }
  const node = value as Record<string, unknown>;
  if (node['@context'] !== 'https://schema.org') {
    throw new Error(`@context is ${JSON.stringify(node['@context'])}, not "https://schema.org"`);
  }
  if (!isTypeName(node['@type'])) {
    throw new Error(
      `@type is ${JSON.stringify(node['@type']) ?? 'missing'}: a node needs a non-empty type`,
    );
  }
  checkNested(node, '');
  return node as JsonLdNode;
}

/** A non-empty name, or a non-empty list of non-empty names. */
function isTypeName(type: unknown): boolean {
  const types: unknown[] = Array.isArray(type) ? type : [type];
  return types.length > 0 && types.every((name) => typeof name === 'string' && name.trim() !== '');
}

/** The predicates whose string values are links, and so must be absolute. */
const LINK_KEYS = new Set(['@id', 'url', 'item', 'mainEntityOfPage']);

/** Whether a string is an absolute http(s) URL. */
function isAbsoluteUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Walks every value below `value`, refusing an empty nested `@type` and a relative link. */
function checkNested(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkNested(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (key === '@type' && path !== '' && !isTypeName(entry)) {
      throw new Error(`${at} is ${JSON.stringify(entry)}: a typed object needs a non-empty type`);
    }
    if (LINK_KEYS.has(key) && typeof entry === 'string' && !isAbsoluteUrl(entry)) {
      throw new Error(`${at} is ${JSON.stringify(entry)}, not an absolute http(s) URL`);
    }
    checkNested(entry, at);
  }
}

/** Every link string in a node, at any depth, as `path: value`. */
function linksOf(value: unknown, path = ''): { at: string; link: string }[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => linksOf(entry, `${path}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const at = path === '' ? key : `${path}.${key}`;
    return LINK_KEYS.has(key) && typeof entry === 'string'
      ? [{ at, link: entry }]
      : linksOf(entry, at);
  });
}

/** The `@id` a node or a reference object carries, or `undefined` when it has none. */
function idOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as Record<string, unknown>)['@id'];
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/** The `@id`s a predicate's value names: one reference, or each entry of a list of them. */
function idsOf(value: unknown): string[] {
  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values.map(idOf).filter((id): id is string => id !== undefined);
}

/** WebPage and the subtypes a route's page node might be: /about's is a ProfilePage. */
const WEB_PAGE_TYPES = [
  'WebPage',
  'AboutPage',
  'CollectionPage',
  'ContactPage',
  'ItemPage',
  'ProfilePage',
] as const;

/** Whether a node is of the given type, `@type` being a name or a list of names. */
function hasType(node: JsonLdNode, name: string): boolean {
  return Array.isArray(node['@type']) ? node['@type'].includes(name) : node['@type'] === name;
}

/**
 * Every reference in a node: an object below the root that carries an `@id`, with the path it sits
 * at. A reference is the whole of the link from one node to another, so it holds nothing else; a
 * typed object without an `@id`, such as a ListItem, is part of its node rather than a reference.
 */
function referencesOf(value: unknown, path = ''): { at: string; ref: Record<string, unknown> }[] {
  if (Array.isArray(value))
    return value.flatMap((entry, i) => referencesOf(entry, `${path}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  const own =
    path !== '' && '@id' in value ? [{ at: path, ref: value as Record<string, unknown> }] : [];
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, entry]) =>
      referencesOf(entry, path === '' ? key : `${path}.${key}`),
    ),
  ];
}

/**
 * The one reference allowed to name a node on another route, by where it sits (57b). The Person is
 * rendered on every route and is the main entity of /about's ProfilePage, which only /about serves,
 * as ADR 0031's Decision 7 asks. A row in the graph describe holds it to that node instead, and it
 * still carries nothing but its `@id`.
 */
const CROSS_ROUTE_REFERENCES: ReadonlySet<string> = new Set(['Person.mainEntityOfPage']);

/**
 * What is wrong with one route's graph: a node with no `@id`, two nodes with one `@id`, a reference
 * that names no node the route serves (but for `CROSS_ROUTE_REFERENCES`), and a reference that
 * carries more than its `@id`, which would restate a fact the node it names already owns.
 */
function graphProblems(nodes: JsonLdNode[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const node of nodes) {
    const id = idOf(node);
    if (id === undefined) problems.push(`a ${String(node['@type'])} with no @id`);
    else if (ids.has(id)) problems.push(`two nodes with the @id ${id}`);
    else ids.add(id);
  }
  for (const node of nodes) {
    for (const { at, ref } of referencesOf(node)) {
      const where = `${String(node['@type'])}.${at}`;
      const id = idOf(ref);
      if (id === undefined || (!ids.has(id) && !CROSS_ROUTE_REFERENCES.has(where))) {
        problems.push(`${where} names ${String(ref['@id'])}, which no node on the route has`);
      }
      const extra = Object.keys(ref).filter((key) => key !== '@id');
      if (extra.length > 0) problems.push(`${where} carries ${extra.join(', ')} beside its @id`);
    }
  }
  return problems;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  vi.resetModules();
});

describe('the JSON-LD blocks', () => {
  it('render valid JSON-LD with the types search engines look for', async () => {
    const { PersonJsonLd, WebsiteJsonLd } = await importWithSiteUrl('https://example.test');
    const { container } = render(
      <>
        <PersonJsonLd />
        <WebsiteJsonLd />
      </>,
    );

    const blocks = jsonLdBlocks(container).map(
      (body) => JSON.parse(body) as Record<string, unknown>,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block['@type'])).toEqual(['Person', 'WebSite']);
    for (const block of blocks) {
      expect(block['@context']).toBe('https://schema.org');
      expect(block.name).toBe('Milos Cvetkovic');
      expect(block.url).toBe('https://example.test');
    }
  });

  it('falls back to the production origin when NEXT_PUBLIC_SITE_URL is unset', async () => {
    const { WebsiteJsonLd } = await importWithSiteUrl(undefined);
    const { container } = render(<WebsiteJsonLd />);

    const [block] = jsonLdBlocks(container).map((body) => JSON.parse(body) as { url: string });
    expect(block.url).toBe('https://miloscvetkovic.dev');
  });

  it('gives the Person block the profile links it claims elsewhere, from the one social source', async () => {
    // `sameAs` is `data/social.ts`'s list, in its order, so the footer, the pages and the Person cannot
    // disagree about a profile (#49, AC 15). The literal hrefs are the oracle: comparing the block with
    // the module alone would pass with a profile URL typed wrong in the module.
    const { PersonJsonLd } = await importWithSiteUrl('https://example.test');
    const { container } = render(<PersonJsonLd />);

    const [block] = jsonLdBlocks(container).map((body) => JSON.parse(body) as { sameAs: string[] });
    expect(block.sameAs).toEqual(socialProfiles.map(({ href }) => href));
    expect(block.sameAs).toEqual([
      'https://www.linkedin.com/in/milos-cvetkovic-dev',
      'https://github.com/milosCvetkovicDev',
      'https://x.com/milos_dev',
    ]);
  });

  it('describes the Person with the facts /about shows, and nothing it does not (57b)', async () => {
    // The whole node, so a predicate added or left behind fails here. Each fact is one the pages
    // show (#57 AC 6): the handle of a profile the site links to, the locality, the country and the
    // certification of /about's credentials, the occupation the page eyebrows name (the job title
    // too), a description whose every clause but the years a page prints, and knowsAbout trimmed
    // to entries some route's text carries; `e2e/seo-surface.spec.ts` finds each one in the served
    // pages. The literals are the oracle, as for `sameAs` above: comparing the node with the
    // modules it reads would pass with a fact typed wrong in them. No employer or school is
    // asserted, because the /about timeline names neither (ADR 0031, Decision 6).
    const { PersonJsonLd } = await importWithSiteUrl('https://example.test');
    const { container } = render(<PersonJsonLd />);
    const [person] = jsonLdBlocks(container).map(parseJsonLdBlock);
    expect(person).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': 'https://example.test/#person',
      name: 'Milos Cvetkovic',
      alternateName: '@milos_dev',
      url: 'https://example.test',
      jobTitle: 'Senior Full-Stack Engineer',
      description: `Senior Full-Stack Engineer with ${yearsOfExperience()} years of experience in software engineering, now building AI-native systems.`,
      address: { '@type': 'PostalAddress', addressLocality: 'Belgrade', addressCountry: 'Serbia' },
      hasCredential: {
        '@type': 'EducationalOccupationalCredential',
        name: 'Angular Certified Architect',
        credentialCategory: 'certification',
      },
      hasOccupation: { '@type': 'Occupation', name: 'Senior Full-Stack Engineer' },
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
      sameAs: [
        'https://www.linkedin.com/in/milos-cvetkovic-dev',
        'https://github.com/milosCvetkovicDev',
        'https://x.com/milos_dev',
      ],
      mainEntityOfPage: { '@id': 'https://example.test/about#webpage' },
    });
  });

  it('builds the Person without loading /about’s page record (57b)', async () => {
    // The root layout renders the Person on every route, the 404 included. /about's record throws
    // when it loads if a case study it reads is missing, which may break /about but must not take
    // the Person, and with it every route's JSON-LD, down too.
    vi.doMock('@/data/pages/about', () => {
      throw new Error('the /about record failed to load');
    });
    try {
      const { PersonJsonLd } = await importWithSiteUrl('https://example.test');
      const { container } = render(<PersonJsonLd />);
      const [person] = jsonLdBlocks(container).map(parseJsonLdBlock);
      expect(person.mainEntityOfPage).toEqual({ '@id': 'https://example.test/about#webpage' });
    } finally {
      vi.doUnmock('@/data/pages/about');
    }
  });

  it('describes the Person by the derived years of career experience, not as AI-native work (#49)', async () => {
    // The description used to put the whole career down as AI-native work, which the site's own
    // timeline (AI from 2025) and /skills (AI/LLM Integration, 2+) contradict, and printed a fixed
    // count that goes stale every January. A later year proves the figure is read from the profile.
    const descriptionIn = async () => {
      const { PersonJsonLd } = await importWithSiteUrl('https://example.test');
      const { container, unmount } = render(<PersonJsonLd />);
      const [person] = jsonLdBlocks(container).map(
        (body) => JSON.parse(body) as { description: string },
      );
      unmount();
      return person.description;
    };

    const today = await descriptionIn();
    expect(today).toContain(`${yearsOfExperience()} years of experience`);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
      const later = await descriptionIn();
      expect(later).toContain('18 years of experience');
      for (const description of [today, later]) {
        // One figure, and the clause that states it names no AI work.
        expect(yearsFigures(description)).toHaveLength(1);
        expect(yearsClausesAboutAi(description)).toEqual([]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('R32 (#48): a value containing </script> does not close the script element early', async () => {
    // The attack shape, minimal: anything that reaches a block and contains a closing tag ends the
    // script where the JSON did not expect it. `JSON.stringify` leaves it untouched. The row was
    // written with the site URL as the carrier; since 57a that is refused before any block renders,
    // because `siteOrigin()` accepts a bare http(s) origin only. So the content carries it instead:
    // the Person's profile links, and every prop a page block takes.
    const hostile = '</script><script>window.x=1</script>';
    await expect(importWithSiteUrl(`https://example.test/${hostile}`)).rejects.toThrow(
      /is not an origin/,
    );

    vi.doMock('@/data/social', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/data/social')>();
      return {
        ...actual,
        socialProfiles: actual.socialProfiles.map((profile) => ({
          ...profile,
          href: `${profile.href}/${hostile}`,
        })),
      };
    });
    try {
      const {
        PersonJsonLd,
        WebsiteJsonLd,
        WebPageJsonLd,
        TechArticleJsonLd,
        BreadcrumbListJsonLd,
        PostWebPageJsonLd,
        PostArticleJsonLd,
        PostBreadcrumbJsonLd,
      } = await importWithSiteUrl('https://example.test');
      const study = { ...caseStudies[0], title: hostile, description: hostile, tags: [hostile] };
      const post = { ...hostileTitlePost, title: hostile, summary: hostile, tags: [hostile] };
      const { container } = render(
        <>
          <PersonJsonLd />
          <WebsiteJsonLd />
          <WebPageJsonLd path="/skills" name={hostile} />
          <TechArticleJsonLd caseStudy={study} />
          <BreadcrumbListJsonLd caseStudy={study} />
          <PostWebPageJsonLd post={post} />
          <PostArticleJsonLd post={post} />
          <PostBreadcrumbJsonLd post={post} />
        </>,
      );

      const blocks = jsonLdBlocks(container);
      expect(blocks).toHaveLength(8);
      // The hostile text did reach the Person, both pages, both articles and both trails.
      expect(blocks.filter((body) => body.includes('\\u003c/script>'))).toHaveLength(7);
      const offenders = blocks
        .map((body, index) => ({ index, body }))
        .filter(({ body }) => body.toLowerCase().includes('</script'))
        .map(({ index, body }) => `block ${index + 1}: ${body.slice(0, 120)}`);

      expect(
        offenders,
        'a block bypasses serializeJsonLd: every ld+json script must write `<` as `\\u003c`, ' +
          'which keeps the JSON valid and the script element closed where it should be.',
      ).toEqual([]);
    } finally {
      vi.doUnmock('@/data/social');
    }
  });

  it('writes every id and url on the bare origin, whatever NEXT_PUBLIC_SITE_URL ends with (57a)', async () => {
    // Next resolves the canonical through `new URL(siteUrl)`, which drops a trailing slash; the
    // graph has to read the value the same way, or `https://example.test/` writes `…test//about`
    // and no page node's url matches its canonical. A value with a path cannot be an origin at all.
    const { PersonJsonLd, WebPageJsonLd, BreadcrumbListJsonLd } =
      await importWithSiteUrl(' https://example.test/ ');
    const { container } = render(
      <>
        <PersonJsonLd />
        <WebPageJsonLd path="/skills" name="Skills" />
        <BreadcrumbListJsonLd caseStudy={caseStudies[0]} />
      </>,
    );
    const [person, page, crumbs] = jsonLdBlocks(container).map(parseJsonLdBlock);
    expect(person['@id']).toBe('https://example.test/#person');
    expect(person.url).toBe('https://example.test');
    expect(page).toMatchObject({
      '@id': 'https://example.test/skills#webpage',
      url: 'https://example.test/skills',
    });
    expect((crumbs.itemListElement as { item: string }[]).map(({ item }) => item)).toEqual([
      'https://example.test',
      'https://example.test/work',
      `https://example.test/work/${caseStudies[0].slug}`,
    ]);

    for (const configured of ['https://example.test/base', 'example.test', 'ftp://example.test']) {
      await expect(importWithSiteUrl(configured), configured).rejects.toThrow(/is not an origin/);
    }
  });

  it('escapes < without changing what a JSON parser reads', async () => {
    const { serializeJsonLd } = await importWithSiteUrl('https://example.test');
    const value = { url: 'https://example.test/</script><script>window.x=1</script>', n: 1 };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it('gives the Person an @id that the WebSite names as its author and publisher (#57)', async () => {
    // The WebSite names the Person by reference only: the Person's facts live in its own block,
    // so a second copy here could only drift from it.
    const { PersonJsonLd, WebsiteJsonLd } = await importWithSiteUrl('https://example.test');
    const { container } = render(
      <>
        <PersonJsonLd />
        <WebsiteJsonLd />
      </>,
    );
    const [person, website] = jsonLdBlocks(container).map(
      (body) => JSON.parse(body) as Record<string, unknown>,
    );
    expect(person['@id']).toBe('https://example.test/#person');
    expect(website['@id']).toBe('https://example.test/#website');
    expect(website.inLanguage).toBe('en');
    expect(website.author).toEqual({ '@id': 'https://example.test/#person' });
    expect(website.publisher).toEqual({ '@id': 'https://example.test/#person' });
  });

  it('gives each route a WebPage at its canonical, part of the WebSite and about the Person (#57)', async () => {
    // The url is the canonical Next writes for the same pathname: the origin alone for `/`. The
    // name is the title the route hands to `buildMetadata()`, an absolute one included.
    const { WebPageJsonLd } = await importWithSiteUrl('https://example.test');
    const nodeFor = (element: ReactElement) => {
      const { container, unmount } = render(element);
      const [node] = jsonLdBlocks(container).map(parseJsonLdBlock);
      unmount();
      return node;
    };

    expect(nodeFor(<WebPageJsonLd path="/" name={{ absolute: 'Home, absolutely' }} />)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': 'https://example.test/#webpage',
      url: 'https://example.test',
      name: 'Home, absolutely',
      isPartOf: { '@id': 'https://example.test/#website' },
      about: { '@id': 'https://example.test/#person' },
    });
    expect(nodeFor(<WebPageJsonLd path="/skills" name="Skills" />)).toMatchObject({
      '@id': 'https://example.test/skills#webpage',
      url: 'https://example.test/skills',
      name: 'Skills',
    });
    const study = nodeFor(<WebPageJsonLd path="/work/a-study" name="A study" breadcrumb />);
    expect(study.breadcrumb).toEqual({ '@id': 'https://example.test/work/a-study#breadcrumb' });
    expect(nodeFor(<WebPageJsonLd path="/skills" name="Skills" />)).not.toHaveProperty(
      'breadcrumb',
    );
  });

  it('dates /about’s ProfilePage with the day its page shows, and names the Person its subject (#57)', async () => {
    const { ProfilePageJsonLd } = await importWithSiteUrl('https://example.test');
    const { container } = render(<ProfilePageJsonLd path="/about" dateModified="2026-10-02" />);
    const [node] = jsonLdBlocks(container).map(parseJsonLdBlock);
    expect(node).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      '@id': 'https://example.test/about#webpage',
      url: 'https://example.test/about',
      name: 'Milos Cvetkovic',
      dateModified: '2026-10-02',
      isPartOf: { '@id': 'https://example.test/#website' },
      mainEntity: { '@id': 'https://example.test/#person' },
    });
  });
});

describe('the case-study JSON-LD blocks', () => {
  it('describe each study as a TechArticle by the site’s Person, from the data file', async () => {
    const { TechArticleJsonLd } = await importWithSiteUrl('https://example.test');
    for (const study of caseStudies) {
      const { container, unmount } = render(<TechArticleJsonLd caseStudy={study} />);
      const [article] = jsonLdBlocks(container).map(
        (body) => JSON.parse(body) as Record<string, unknown>,
      );
      const url = `https://example.test/work/${study.slug}`;
      // The whole node, so a predicate added or left behind fails here: the article's page is its
      // WebPage, named by `@id`, so it carries no `url` of its own (#57).
      expect(article).toEqual({
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: study.title,
        description: study.description,
        image: `${url}/og-image.png`,
        author: { '@id': 'https://example.test/#person' },
        mainEntityOfPage: { '@id': `${url}#webpage` },
        isPartOf: { '@id': 'https://example.test/#website' },
        datePublished: study.publishedAt,
        dateModified: study.updatedAt,
        keywords: study.tags,
      });
      unmount();
    }
  });

  it('give each study a Home > Work > study breadcrumb', async () => {
    const { BreadcrumbListJsonLd } = await importWithSiteUrl('https://example.test');
    const [study] = caseStudies;
    const { container } = render(<BreadcrumbListJsonLd caseStudy={study} />);
    const [crumbs] = jsonLdBlocks(container).map(
      (body) => JSON.parse(body) as { '@type': string; '@id': string; itemListElement: unknown[] },
    );
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs['@id']).toBe(`https://example.test/work/${study.slug}#breadcrumb`);
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.test' },
      { '@type': 'ListItem', position: 2, name: 'Work', item: 'https://example.test/work' },
      {
        '@type': 'ListItem',
        position: 3,
        name: study.title,
        item: `https://example.test/work/${study.slug}`,
      },
    ]);
  });
});

describe('the post JSON-LD blocks (#61, 61f)', () => {
  it('has published fixtures to describe', () => {
    // The control: every row below walks `publishedPosts`, so an empty list would pass them all.
    expect(publishedPosts.length).toBeGreaterThan(0);
  });

  it('describe each published post as a TechArticle by the site’s Person, with its own dates', async () => {
    const { PostArticleJsonLd } = await importWithSiteUrl('https://example.test');
    for (const post of publishedPosts) {
      const { container, unmount } = render(<PostArticleJsonLd post={post} />);
      const [article] = jsonLdBlocks(container).map(parseJsonLdBlock);
      const url = `https://example.test/blog/${post.slug}`;
      // The whole node, so a predicate added or left behind fails here. The case study's node, less
      // what a post page does not show (ADR 0031's fifth decision): no `description`, since the
      // summary is only the page's meta description, and no `keywords`, since a post's tags are
      // drawn on its card alone. No new node type either, not even BlogPosting (#61).
      expect(article, post.slug).toEqual({
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: post.title,
        image: `${url}/og-image.png`,
        author: { '@id': 'https://example.test/#person' },
        mainEntityOfPage: { '@id': `${url}#webpage` },
        isPartOf: { '@id': 'https://example.test/#website' },
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
      });
      unmount();
    }
  });

  it('give each post a Home > Writing > post breadcrumb, Writing being /blog’s own title', async () => {
    const { PostBreadcrumbJsonLd } = await importWithSiteUrl('https://example.test');
    expect(pages['/blog'].title).toBe('Writing');
    for (const post of publishedPosts) {
      const { container, unmount } = render(<PostBreadcrumbJsonLd post={post} />);
      const [crumbs] = jsonLdBlocks(container).map(parseJsonLdBlock);
      const url = `https://example.test/blog/${post.slug}`;
      expect(crumbs, post.slug).toEqual({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.test' },
          { '@type': 'ListItem', position: 2, name: 'Writing', item: 'https://example.test/blog' },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      });
      unmount();
    }
  });

  it('keeps the hostile fixture title inside its scripts, and reads it back as written', async () => {
    const { PostArticleJsonLd, PostBreadcrumbJsonLd } =
      await importWithSiteUrl('https://example.test');
    // The control: the fixture's title carries a `<`, the character the escape exists for, so
    // the `not.toContain('<')` below proves it was escaped rather than never there.
    expect(hostileTitlePost.title).toContain('<');
    const { container } = render(
      <>
        <PostArticleJsonLd post={hostileTitlePost} />
        <PostBreadcrumbJsonLd post={hostileTitlePost} />
      </>,
    );
    const blocks = jsonLdBlocks(container);
    expect(blocks).toHaveLength(2);
    expect(container.children).toHaveLength(2);
    for (const body of blocks) expect(body).not.toContain('<');
    const [article, crumbs] = blocks.map(parseJsonLdBlock);
    expect(article.headline).toBe(hostileTitlePost.title);
    expect((crumbs.itemListElement as { name: string }[])[2].name).toBe(hostileTitlePost.title);
  });
});

/** The static routes but /about, which renders a ProfilePage rather than a WebPage. */
const WEB_PAGE_ROUTES = (Object.keys(pages) as (keyof typeof pages)[]).filter(
  (path) => path !== '/about',
);

describe('the builders refuse a node they cannot mark up truthfully (57a)', () => {
  // Each throws at prerender, so a bad trail, date or name fails the build instead of shipping.
  const builders = async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
    vi.resetModules();
    return import('@/lib/structured-data');
  };

  it('accepts a trail from / down to the route, and refuses any other', async () => {
    const { breadcrumbList } = await builders();
    const path = '/work/a-study';
    const home = { name: 'Home', path: '/' };
    const work = { name: 'Work', path: '/work' };
    const study = { name: 'A study', path };
    expect(breadcrumbList({ path, trail: [home, work, study] }).itemListElement).toHaveLength(3);

    const refused: [string, { name: string; path: string }[]][] = [
      ['one step', [study]],
      ['a trail ending elsewhere', [home, work]],
      ['a trail not starting at /', [work, study]],
      ['a route repeated', [home, work, work, study]],
      ['a blank name', [home, { ...work, name: ' ' }, study]],
    ];
    for (const [label, trail] of refused) {
      expect(() => breadcrumbList({ path, trail }), label).toThrow(/breadcrumbList: the trail/);
    }
  });

  it('refuses a date that is not a YYYY-MM-DD day, and a blank page name', async () => {
    const { profilePage, techArticle, webPage } = await builders();
    expect(profilePage({ path: '/about', dateModified: '2026-10-02' }).dateModified).toBe(
      '2026-10-02',
    );
    for (const date of ['', '2026-10-2', '2026-02-30', '2026-10-02T00:00:00Z']) {
      expect(() => profilePage({ path: '/about', dateModified: date }), date).toThrow(
        /profilePage: .* is not a YYYY-MM-DD day/,
      );
      const article = { path: '/work/x', headline: 'X', description: 'X', keywords: ['X'] };
      expect(
        () => techArticle({ ...article, datePublished: date, dateModified: '2026-10-02' }),
        date,
      ).toThrow(/techArticle: .* is not a YYYY-MM-DD day/);
      expect(
        () => techArticle({ ...article, datePublished: '2026-10-02', dateModified: date }),
        date,
      ).toThrow(/techArticle: .* is not a YYYY-MM-DD day/);
    }
    for (const name of ['', '  ', { absolute: '' }]) {
      expect(() => webPage({ path: '/skills', name }), JSON.stringify(name)).toThrow(/blank/);
    }
  });

  it('refuses an article with a blank headline or an empty description or keywords (61f)', async () => {
    const { techArticle } = await builders();
    const article = {
      path: '/work/x',
      headline: 'X',
      description: 'X',
      datePublished: '2026-10-02',
      dateModified: '2026-10-02',
      keywords: ['X'],
    };
    // The control: the same input with each predicate given, or left out with `undefined`, builds.
    expect(techArticle(article)).toMatchObject({ description: 'X', keywords: ['X'] });
    const bare = techArticle({ ...article, description: undefined, keywords: undefined });
    expect(bare).not.toHaveProperty('description');
    expect(bare).not.toHaveProperty('keywords');
    for (const headline of ['', '  ']) {
      expect(() => techArticle({ ...article, headline }), JSON.stringify(headline)).toThrow(
        /techArticle: an article needs a headline/,
      );
    }
    for (const empty of [{ description: '' }, { description: ' ' }, { keywords: [] }]) {
      expect(() => techArticle({ ...article, ...empty }), JSON.stringify(empty)).toThrow(
        /techArticle: an empty description or keywords list/,
      );
    }
  });
});

/**
 * Every block the site serves, each component rendered on its own: the layout's two, a WebPage for
 * each static route but /about, /about's ProfilePage, then each case study's three in data order,
 * then each published post's three, newest first. One render per component means a block is named
 * by the render that produced it, never by its position among the others, so a component that
 * renders two blocks or none cannot shift the blame onto its neighbours.
 */
async function renderEveryBlock(): Promise<{ source: string; blocks: string[] }[]> {
  const {
    PersonJsonLd,
    WebsiteJsonLd,
    WebPageJsonLd,
    ProfilePageJsonLd,
    TechArticleJsonLd,
    BreadcrumbListJsonLd,
    PostWebPageJsonLd,
    PostArticleJsonLd,
    PostBreadcrumbJsonLd,
  } = await importWithSiteUrl('https://example.test');
  const elements: [string, ReactElement][] = [
    ['PersonJsonLd', <PersonJsonLd key="person" />],
    ['WebsiteJsonLd', <WebsiteJsonLd key="website" />],
    ...WEB_PAGE_ROUTES.map((path): [string, ReactElement] => [
      `WebPageJsonLd (${path})`,
      <WebPageJsonLd key="page" path={path} name={pages[path].title} />,
    ]),
    [
      'ProfilePageJsonLd (/about)',
      <ProfilePageJsonLd
        key="profile"
        path="/about"
        dateModified={STATIC_ROUTE_UPDATED['/about']}
      />,
    ],
    ...caseStudies.flatMap((study): [string, ReactElement][] => [
      [
        `WebPageJsonLd (${study.slug})`,
        <WebPageJsonLd
          key="page"
          path={`/work/${study.slug}`}
          name={caseStudyPageTitle(study)}
          breadcrumb
        />,
      ],
      [`TechArticleJsonLd (${study.slug})`, <TechArticleJsonLd key="article" caseStudy={study} />],
      [
        `BreadcrumbListJsonLd (${study.slug})`,
        <BreadcrumbListJsonLd key="crumbs" caseStudy={study} />,
      ],
    ]),
    ...publishedPosts.flatMap((post): [string, ReactElement][] => [
      [`PostWebPageJsonLd (${post.slug})`, <PostWebPageJsonLd key="page" post={post} />],
      [`PostArticleJsonLd (${post.slug})`, <PostArticleJsonLd key="article" post={post} />],
      [`PostBreadcrumbJsonLd (${post.slug})`, <PostBreadcrumbJsonLd key="crumbs" post={post} />],
    ]),
  ];
  return elements.map(([source, element]) => {
    const { container, unmount } = render(element);
    const blocks = jsonLdBlocks(container);
    unmount();
    return { source, blocks };
  });
}

/** The one block a render produced, parsed; throws, naming the source, on anything else. */
function onlyNode({ source, blocks }: { source: string; blocks: string[] }): JsonLdNode {
  if (blocks.length !== 1) throw new Error(`${source}: rendered ${blocks.length} blocks, not 1`);
  try {
    return parseJsonLdBlock(blocks[0]);
  } catch (error) {
    throw new Error(`${source}: ${(error as Error).message}`);
  }
}

describe('the offline structured-data gate (#55)', () => {
  it('parses every block the site serves as schema.org JSON-LD with a type', async () => {
    expect(caseStudies.length, 'the data file must define case studies').toBeGreaterThan(0);
    expect(publishedPosts.length, 'the mocked index must hold published posts').toBeGreaterThan(0);
    const rendered = await renderEveryBlock();
    expect(rendered).toHaveLength(
      2 + Object.keys(pages).length + 3 * caseStudies.length + 3 * publishedPosts.length,
    );

    const problems: string[] = [];
    for (const entry of rendered) {
      try {
        // Every link the block carries points into the site under test: the blocks are rendered
        // with `NEXT_PUBLIC_SITE_URL` set to https://example.test, so a link on any other origin
        // was built from something else. The origin is compared, not a prefix, so a host such as
        // https://example.test.evil does not pass.
        for (const { at, link } of linksOf(onlyNode(entry))) {
          if (new URL(link).origin !== 'https://example.test') {
            problems.push(`${entry.source}: ${at} is ${link}, outside the site under test`);
          }
        }
      } catch (error) {
        problems.push((error as Error).message);
      }
    }
    expect(problems).toEqual([]);
  });

  it('refuses a malformed block, invalid JSON, a missing @type and a foreign @context', () => {
    // The checker is what the row above trusts, so it is proven to refuse each shape it exists for.
    // A well-formed node passes, so the refusals below are about the one thing each case breaks.
    const good = { '@context': 'https://schema.org', '@type': 'Person', name: 'x' };
    expect(parseJsonLdBlock(JSON.stringify(good))).toEqual(good);
    expect(
      parseJsonLdBlock(JSON.stringify({ ...good, '@type': ['Person', 'Patient'] }))['@type'],
    ).toEqual(['Person', 'Patient']);

    expect(() => parseJsonLdBlock('{"@context":"https://schema.org","@type":"Person",')).toThrow(
      /^not valid JSON: /,
    );
    expect(() => parseJsonLdBlock('')).toThrow(/^not valid JSON: /);
    expect(() => parseJsonLdBlock(JSON.stringify([good]))).toThrow(/the payload is an array/);
    expect(() => parseJsonLdBlock('null')).toThrow(/the payload is null/);
    expect(() => parseJsonLdBlock('"Person"')).toThrow(/the payload is string/);

    const untyped: Record<string, unknown> = { ...good };
    delete untyped['@type'];
    expect(() => parseJsonLdBlock(JSON.stringify(untyped))).toThrow(/^@type is missing/);
    expect(() => parseJsonLdBlock(JSON.stringify({ ...good, '@type': '' }))).toThrow(
      /^@type is "": a node needs a non-empty type/,
    );
    expect(() => parseJsonLdBlock(JSON.stringify({ ...good, '@type': [] }))).toThrow(
      /^@type is \[\]/,
    );
    expect(() =>
      parseJsonLdBlock(JSON.stringify({ '@context': 'https://schema.org', '@graph': [good] })),
    ).toThrow(/^@type is missing/);

    expect(() => parseJsonLdBlock(JSON.stringify({ ...good, '@context': undefined }))).toThrow(
      /^@context is undefined, not "https:\/\/schema\.org"/,
    );
    expect(() =>
      parseJsonLdBlock(JSON.stringify({ ...good, '@context': 'http://schema.org' })),
    ).toThrow(/^@context is "http:\/\/schema\.org"/);
  });

  it('refuses an empty nested @type and a relative link at any depth', () => {
    const good = { '@context': 'https://schema.org', '@type': 'Person', name: 'x' };
    expect(() =>
      parseJsonLdBlock(JSON.stringify({ ...good, author: { '@type': '', name: 'y' } })),
    ).toThrow(/^author\.@type is "": a typed object needs a non-empty type/);
    expect(() =>
      parseJsonLdBlock(
        JSON.stringify({ ...good, itemListElement: [{ '@type': 'ListItem', item: '/work' }] }),
      ),
    ).toThrow(/^itemListElement\[0\]\.item is "\/work", not an absolute http\(s\) URL/);
    expect(() => parseJsonLdBlock(JSON.stringify({ ...good, url: '' }))).toThrow(/^url is ""/);
    expect(() => parseJsonLdBlock(JSON.stringify({ ...good, '@id': '#person' }))).toThrow(
      /^@id is "#person"/,
    );
    expect(() =>
      parseJsonLdBlock(JSON.stringify({ ...good, mainEntityOfPage: 'javascript:alert(1)' })),
    ).toThrow(/^mainEntityOfPage is "javascript:alert\(1\)"/);
    // A reference needs no type, and an absolute link passes at any depth.
    const linked = {
      ...good,
      '@id': 'https://example.test/#person',
      knows: [{ '@id': 'https://example.test/#friend' }],
    };
    expect(parseJsonLdBlock(JSON.stringify(linked))).toEqual(linked);
    expect(linksOf(linked)).toEqual([
      { at: '@id', link: 'https://example.test/#person' },
      { at: 'knows[0].@id', link: 'https://example.test/#friend' },
    ]);
  });

  it('#57: every node carries an @id', async () => {
    // A node here is the object at the root of a block: a ListItem is part of its list, and
    // `{ '@id': … }` objects are references to nodes. Without an `@id`, nothing can point at it.
    const missing = (await renderEveryBlock())
      .map((entry) => ({ node: onlyNode(entry), source: entry.source }))
      .filter(({ node }) => idOf(node) === undefined)
      .map(({ node, source }) => `${source}: a ${String(node['@type'])} with no @id`);
    expect(missing).toEqual([]);
  });

  it('#57: a WebPage node exists, and WebSite, WebPage and Person link by @id', async () => {
    // The references checked are the ones #57 designs: the WebSite's author is the Person, and the
    // WebPage is part of the WebSite and about the Person. Each has to name the `@id` of a node that
    // rendered alongside it. The page node may be any of the WebPage types.
    const { PersonJsonLd, WebsiteJsonLd, WebPageJsonLd } =
      await importWithSiteUrl('https://example.test');
    const { container } = render(
      <>
        <PersonJsonLd />
        <WebsiteJsonLd />
        <WebPageJsonLd path="/" name="Milos Cvetkovic" />
      </>,
    );
    const nodes = jsonLdBlocks(container).map(parseJsonLdBlock);
    const find = (...types: string[]) =>
      nodes.find((node) => types.some((type) => hasType(node, type)));
    const person = find('Person');
    const website = find('WebSite');
    const webPage = find(...WEB_PAGE_TYPES);

    const problems: string[] = [];
    if (!person) problems.push('no Person node renders');
    if (!website) problems.push('no WebSite node renders');
    if (!webPage) problems.push('WebPageJsonLd renders no WebPage node');
    const references: [string, JsonLdNode | undefined, string, JsonLdNode | undefined][] = [
      ['WebSite', website, 'author', person],
      ['WebPage', webPage, 'isPartOf', website],
      ['WebPage', webPage, 'about', person],
    ];
    for (const [fromType, from, predicate, to] of references) {
      if (!from || !to) continue;
      const target = idOf(to);
      const named = idsOf(from[predicate]);
      if (target === undefined || !named.includes(target)) {
        problems.push(
          `${fromType}.${predicate} names ${named.join(', ') || 'no @id'}, not the ` +
            `${String(to['@type'])} node's @id ${target ?? '(it has none)'}`,
        );
      }
    }
    expect(problems).toEqual([]);
  });
});

/**
 * Every route's JSON-LD as the route renders it: the root layout's Person and WebSite (the layout
 * renders `PersonJsonLd` and `WebsiteJsonLd` on every route, the 404 included; it is not rendered
 * here, since it owns `<html>`), then the page's own blocks, from the real page module. Imported
 * after `importWithSiteUrl`, so the pages share its fresh module graph and its site URL.
 * `e2e/seo-surface.spec.ts` checks the same sets in the HTML the server sends.
 */
async function renderEveryRoute(): Promise<
  { route: string; nodes: JsonLdNode[]; html: string; title: unknown }[]
> {
  const { PersonJsonLd, WebsiteJsonLd } = await importWithSiteUrl('https://example.test');
  const [home, about, work, skills, contact, blog, privacy, study, post, notFound] =
    await Promise.all([
      import('@/app/page'),
      import('@/app/about/page'),
      import('@/app/work/page'),
      import('@/app/skills/page'),
      import('@/app/contact/page'),
      import('@/app/blog/page'),
      import('@/app/privacy/page'),
      import('@/app/work/[slug]/page'),
      import('@/app/blog/[slug]/page'),
      import('@/app/not-found'),
    ]);
  // Each route with the title its head is given: the page module's own metadata, the very value
  // Next reads, so a page that hands `buildMetadata()` one title and its page node another fails.
  type Route = [string, () => ReactElement | Promise<ReactElement>, () => unknown];
  const routes: Route[] = [
    ['/', () => <home.default />, () => home.metadata.title],
    ['/about', () => <about.default />, () => about.metadata.title],
    ['/work', () => <work.default />, () => work.metadata.title],
    ['/skills', () => <skills.default />, () => skills.metadata.title],
    ['/contact', () => <contact.default />, () => contact.metadata.title],
    ['/blog', () => <blog.default />, () => blog.metadata.title],
    ['/privacy', () => <privacy.default />, () => privacy.metadata.title],
    ...caseStudies.map((caseStudy): Route => {
      const params = () => ({ params: Promise.resolve({ slug: caseStudy.slug }) });
      return [
        `/work/${caseStudy.slug}`,
        () => study.default(params()),
        async () => (await study.generateMetadata(params())).title,
      ];
    }),
    // The published posts: the fixtures, through the mock at the top of this file.
    ...publishedPosts.map(({ slug }): Route => {
      const params = () => ({ params: Promise.resolve({ slug }) });
      return [
        `/blog/${slug}`,
        () => post.default(params()),
        async () => (await post.generateMetadata(params())).title,
      ];
    }),
    ['404', () => <notFound.default />, () => notFound.metadata.title],
  ];
  const rendered = [];
  for (const [route, page, headTitle] of routes) {
    // A page that throws fails every row of the describe from its hook, so the error names it.
    let element: ReactElement;
    let title: unknown;
    try {
      element = await page();
      title = await headTitle();
    } catch (error) {
      throw new Error(`${route} did not render: ${(error as Error).message}`);
    }
    const { container, unmount } = render(
      <>
        <PersonJsonLd />
        <WebsiteJsonLd />
        {element}
      </>,
    );
    const nodes = jsonLdBlocks(container).map((raw, index) => {
      try {
        return parseJsonLdBlock(raw);
      } catch (error) {
        throw new Error(`${route}, block ${index + 1}: ${(error as Error).message}`);
      }
    });
    rendered.push({ route, nodes, html: container.innerHTML, title });
    unmount();
  }
  return rendered;
}

/** The types a route serves, in the order its blocks render: the layout's two, then the page's. */
function expectedTypes(route: string): string[] {
  if (route === '404') return ['Person', 'WebSite'];
  if (route === '/about') return ['Person', 'WebSite', 'ProfilePage'];
  // A case study and a post are both an article on a page of their own (#61, 61f).
  if (route.startsWith('/work/') || route.startsWith('/blog/')) {
    return ['Person', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'];
  }
  return ['Person', 'WebSite', 'WebPage'];
}

/** The one node of a type on a route, or an error naming the route. */
function nodeOfType(route: string, nodes: JsonLdNode[], type: string): JsonLdNode {
  const found = nodes.filter((node) => hasType(node, type));
  if (found.length !== 1) throw new Error(`${route}: ${found.length} ${type} nodes, not 1`);
  return found[0];
}

describe('the JSON-LD graph on every route (#57)', () => {
  // One render of every route serves every row below; a route costs one jsdom render each.
  let routes: Awaited<ReturnType<typeof renderEveryRoute>> = [];
  beforeAll(async () => {
    routes = await renderEveryRoute();
  });

  it('renders every route, the case studies, the posts and the 404 included', () => {
    // `pages` is the whole list of static routes (it is typed over `StaticRoute`), so a route added
    // there and not here fails.
    const rendered = routes.map(({ route }) => route);
    expect(rendered.filter((route) => route in pages).sort()).toEqual(Object.keys(pages).sort());
    // The control for the post rows: an empty list would let them all pass.
    expect(publishedPosts.length).toBeGreaterThan(0);
    expect(rendered).toEqual([
      '/',
      '/about',
      '/work',
      '/skills',
      '/contact',
      '/blog',
      '/privacy',
      ...caseStudies.map(({ slug }) => `/work/${slug}`),
      ...publishedPosts.map(({ slug }) => `/blog/${slug}`),
      '404',
    ]);
  });

  it('serves each route its pinned set of node types', () => {
    const served = Object.fromEntries(
      routes.map(({ route, nodes }) => [route, nodes.map((node) => node['@type'])]),
    );
    const expected = Object.fromEntries(routes.map(({ route }) => [route, expectedTypes(route)]));
    expect(served).toEqual(expected);
  });

  it('joins each route into one graph: own ids, references that resolve and carry only an @id', () => {
    const problems = routes.flatMap(({ route, nodes }) =>
      graphProblems(nodes).map((problem) => `${route}: ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  it('gives each page node the route’s canonical and the title its head carries', () => {
    // The title is the one the page module hands Next (its `metadata` or `generateMetadata()`), not
    // the data record it was built from. /about is the one exception: #57 names its ProfilePage
    // after the person the page is about, so its name is the real name, not the head's title.
    const textOf = (title: unknown) =>
      typeof title === 'object' && title !== null && 'absolute' in title
        ? (title as { absolute: string }).absolute
        : title;
    for (const { route, nodes, title } of routes) {
      if (route === '404') continue;
      const page = nodeOfType(route, nodes, route === '/about' ? 'ProfilePage' : 'WebPage');
      const canonical = route === '/' ? 'https://example.test' : `https://example.test${route}`;
      const name = route === '/about' ? 'Milos Cvetkovic' : textOf(title);
      expect(typeof name, `${route}: a head title`).toBe('string');
      expect(page, route).toMatchObject({ url: canonical, name });
    }
  });

  it('points each case study’s article and breadcrumb at its page, the trail ordered to it', () => {
    for (const study of caseStudies) {
      const route = `/work/${study.slug}`;
      const { nodes } = routes.find((entry) => entry.route === route)!;
      const page = nodeOfType(route, nodes, 'WebPage');
      const article = nodeOfType(route, nodes, 'TechArticle');
      const crumbs = nodeOfType(route, nodes, 'BreadcrumbList');
      expect(article.mainEntityOfPage, route).toEqual({ '@id': page['@id'] });
      expect(page.breadcrumb, route).toEqual({ '@id': crumbs['@id'] });
      expect(crumbs.itemListElement, route).toEqual([
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.test' },
        { '@type': 'ListItem', position: 2, name: 'Work', item: 'https://example.test/work' },
        { '@type': 'ListItem', position: 3, name: study.title, item: page.url },
      ]);
    }
  });

  it('points each post’s article and breadcrumb at its page, dated as its data, the trail ordered to it', () => {
    for (const entry of publishedPosts) {
      const route = `/blog/${entry.slug}`;
      const { nodes } = routes.find((rendered) => rendered.route === route)!;
      const page = nodeOfType(route, nodes, 'WebPage');
      const article = nodeOfType(route, nodes, 'TechArticle');
      const crumbs = nodeOfType(route, nodes, 'BreadcrumbList');
      expect(article.mainEntityOfPage, route).toEqual({ '@id': page['@id'] });
      expect(article['@id'], route).toBe(`${String(page.url)}#article`);
      expect([article.datePublished, article.dateModified], route).toEqual([
        entry.publishedAt,
        entry.updatedAt,
      ]);
      expect(page.breadcrumb, route).toEqual({ '@id': crumbs['@id'] });
      expect(crumbs.itemListElement, route).toEqual([
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.test' },
        { '@type': 'ListItem', position: 2, name: 'Writing', item: 'https://example.test/blog' },
        { '@type': 'ListItem', position: 3, name: entry.title, item: page.url },
      ]);
    }
  });

  it('makes the Person on every route the main entity of /about’s ProfilePage (57b)', () => {
    // The one reference `graphProblems` lets through by name: it names a node only /about serves,
    // so it is held to that node here, the 404's Person included.
    const about = routes.find((entry) => entry.route === '/about')!;
    const profile = nodeOfType('/about', about.nodes, 'ProfilePage');
    expect(profile['@id']).toBe('https://example.test/about#webpage');
    for (const { route, nodes } of routes) {
      expect(nodeOfType(route, nodes, 'Person').mainEntityOfPage, route).toEqual({
        '@id': profile['@id'],
      });
    }
  });

  it('dates /about’s ProfilePage with the day its "Last updated" line shows', () => {
    const { nodes, html } = routes.find((entry) => entry.route === '/about')!;
    const profile = nodeOfType('/about', nodes, 'ProfilePage');
    expect(profile.dateModified).toBe(STATIC_ROUTE_UPDATED['/about']);

    const page = document.createElement('div');
    page.innerHTML = html;
    const lines = [...page.querySelectorAll('p')].filter((p) =>
      p.textContent?.startsWith('Last updated'),
    );
    expect(lines, 'one "Last updated" line on /about').toHaveLength(1);
    const time = lines[0].querySelector('time');
    expect(time?.getAttribute('dateTime') ?? time?.getAttribute('datetime')).toBe(
      profile.dateModified,
    );
    expect(lines[0].textContent).toBe(`Last updated ${String(profile.dateModified)}.`);
  });

  it('refuses a node without an @id, a repeated @id, a dangling reference and a padded one', () => {
    // The checker is what the rows above trust, so it is proven to refuse each shape it exists for.
    const node = (type: string, id?: string, extra: Record<string, unknown> = {}) =>
      ({
        '@context': 'https://schema.org',
        '@type': type,
        ...(id && { '@id': id }),
        ...extra,
      }) as JsonLdNode;
    const person = node('Person', 'https://example.test/#person');
    expect(graphProblems([person, node('WebSite', 'https://example.test/#website')])).toEqual([]);

    expect(graphProblems([person, node('WebSite')])).toEqual(['a WebSite with no @id']);
    expect(graphProblems([person, node('Thing', 'https://example.test/#person')])).toEqual([
      'two nodes with the @id https://example.test/#person',
    ]);
    expect(
      graphProblems([
        person,
        node('WebPage', 'https://example.test/#webpage', {
          isPartOf: { '@id': 'https://example.test/#website' },
        }),
      ]),
    ).toEqual([
      'WebPage.isPartOf names https://example.test/#website, which no node on the route has',
    ]);
    expect(
      graphProblems([
        person,
        node('WebSite', 'https://example.test/#website', {
          author: { '@id': 'https://example.test/#person', '@type': 'Person', name: 'x' },
        }),
      ]),
    ).toEqual(['WebSite.author carries @type, name beside its @id']);
    // A list of references is checked entry by entry, and a typed object without an `@id` (a
    // ListItem) is part of its node, not a reference.
    expect(
      graphProblems([
        person,
        node('BreadcrumbList', 'https://example.test/x#breadcrumb', {
          itemListElement: [{ '@type': 'ListItem', position: 1, item: 'https://example.test' }],
          about: [{ '@id': 'https://example.test/#person' }, { '@id': 'https://example.test/#x' }],
        }),
      ]),
    ).toEqual([
      'BreadcrumbList.about[1] names https://example.test/#x, which no node on the route has',
    ]);
    // The cross-route exemption is by name (57b): the Person's mainEntityOfPage may name a page
    // node this route does not serve, but the same predicate on another node, another predicate on
    // the Person, an empty reference and a padded one are still refused.
    const elsewhere = { '@id': 'https://example.test/about#webpage' };
    const site = node('WebSite', 'https://example.test/#website');
    expect(
      graphProblems([
        node('Person', 'https://example.test/#person', { mainEntityOfPage: elsewhere }),
        site,
      ]),
    ).toEqual([]);
    expect(
      graphProblems([
        node('Person', 'https://example.test/#person', { about: elsewhere }),
        node('WebSite', 'https://example.test/#website', { mainEntityOfPage: elsewhere }),
      ]),
    ).toEqual([
      'Person.about names https://example.test/about#webpage, which no node on the route has',
      'WebSite.mainEntityOfPage names https://example.test/about#webpage, which no node on the route has',
    ]);
    expect(
      graphProblems([
        node('Person', 'https://example.test/#person', { mainEntityOfPage: { '@id': '' } }),
        site,
      ]),
    ).toEqual(['Person.mainEntityOfPage names , which no node on the route has']);
    expect(
      graphProblems([
        node('Person', 'https://example.test/#person', {
          mainEntityOfPage: { ...elsewhere, '@type': 'ProfilePage' },
        }),
        site,
      ]),
    ).toEqual(['Person.mainEntityOfPage carries @type beside its @id']);
  });
});

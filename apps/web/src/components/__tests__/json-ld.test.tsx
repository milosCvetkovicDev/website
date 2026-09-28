import { render } from '@testing-library/react';
import { Fragment, type ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies } from '@/data/case-studies';

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
 * `siteUrl` is read at module scope in `json-ld.tsx`, so each case re-imports the module with the
 * variable already set. `vi.resetModules` in `beforeEach` is what makes that work; without it the
 * second import returns the first evaluation and the test would silently assert nothing.
 *
 * The offline structured-data gate (#55, FR-4). The last describe renders every block the site
 * serves, the Person and the WebSite from the root layout and a TechArticle and a BreadcrumbList for
 * every case study, and runs each payload through `parseJsonLdBlock`: valid JSON, one object, an
 * `@context` of `https://schema.org` and a non-empty `@type`. It needs no network, so it is the hard
 * gate; `e2e/structured-data.spec.ts` asks validator.schema.org about the vocabulary as well, and
 * fails open, because that endpoint is undocumented.
 *
 * Two rows there are expected failures naming #57, which joins the nodes into one `@id` graph: every
 * node carries an `@id`; and a WebPage node exists, and WebSite, WebPage and Person reference each
 * other by `@id`. Today only the Person and the WebSite have ids, and nothing renders a WebPage. #57
 * deletes the `it.fails` markers when it lands; an expected failure that passes fails the run.
 *
 * Typing, the convention #57 applies at the definition site: every payload object is written with
 * `satisfies WithContext<T>`, `T` being its schema-dts node type (`Person`, `WebSite`, `WebPage`,
 * `ProfilePage`, `TechArticle`, `BreadcrumbList`), for example
 * `{ '@context': 'https://schema.org', '@type': 'Person', … } satisfies WithContext<Person>`.
 * `satisfies` rather than a `: WithContext<Person>` annotation keeps the object's own literal type,
 * and it still checks excess properties, so a misspelled predicate is a `pnpm typecheck` error on the
 * line that wrote it: with schema-dts 2.0.0 and TypeScript 6.0.3, `jobTitel` fails with TS2561, "Did
 * you mean to write 'jobTitle'?" (checked 2026-09-28). This file imports nothing from schema-dts. The
 * types check what the code writes; this file checks what renders.
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
 * separate blocks joined by `@id` rather than one `@graph`.
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
  const type = node['@type'];
  const types: unknown[] = Array.isArray(type) ? type : [type];
  if (
    types.length === 0 ||
    !types.every((name) => typeof name === 'string' && name.trim() !== '')
  ) {
    throw new Error(`@type is ${JSON.stringify(type) ?? 'missing'}: a node needs a non-empty type`);
  }
  return node as JsonLdNode;
}

/** The `@id` a node or a reference object carries, or `undefined` when it has none. */
function idOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as Record<string, unknown>)['@id'];
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/** Whether a node is of the given type, `@type` being a name or a list of names. */
function hasType(node: JsonLdNode, name: string): boolean {
  return Array.isArray(node['@type']) ? node['@type'].includes(name) : node['@type'] === name;
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

  it('gives the Person block the profile links it claims elsewhere', async () => {
    // Green, and the floor under R38's rename: `sameAs` lists the same three profiles the footer links
    // to, so #49 renaming the X entry must not leave the two disagreeing about the URL.
    const { PersonJsonLd } = await importWithSiteUrl('https://example.test');
    const { container } = render(<PersonJsonLd />);

    const [block] = jsonLdBlocks(container).map((body) => JSON.parse(body) as { sameAs: string[] });
    expect(block.sameAs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('linkedin.com/in/'),
        expect.stringContaining('github.com/'),
        expect.stringContaining('x.com/'),
      ]),
    );
  });

  it('R32 (#48): a site URL containing </script> does not close the script element early', async () => {
    // The attack shape, minimal: anything that reaches the block and contains a closing tag ends the
    // script where the JSON did not expect it. `JSON.stringify` leaves it untouched, so both blocks
    // emit it literally.
    const hostile = 'https://example.test/</script><script>window.x=1</script>';
    const { PersonJsonLd, WebsiteJsonLd } = await importWithSiteUrl(hostile);
    const { container } = render(
      <>
        <PersonJsonLd />
        <WebsiteJsonLd />
      </>,
    );

    const offenders = jsonLdBlocks(container)
      .map((body, index) => ({ index, body }))
      .filter(({ body }) => body.toLowerCase().includes('</script'))
      .map(({ index, body }) => `block ${index + 1}: ${body.slice(0, 120)}`);

    expect(
      offenders,
      'a block bypasses serializeJsonLd: every ld+json script must write `<` as `\\u003c`, ' +
        'which keeps the JSON valid and the script element closed where it should be.',
    ).toEqual([]);
  });

  it('escapes < without changing what a JSON parser reads', async () => {
    const { serializeJsonLd } = await importWithSiteUrl('https://example.test');
    const value = { url: 'https://example.test/</script><script>window.x=1</script>', n: 1 };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it('gives the Person an @id that the WebSite names as its author', async () => {
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
    expect(website.author).toMatchObject({
      '@type': 'Person',
      '@id': 'https://example.test/#person',
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
      expect(article).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: study.title,
        description: study.description,
        url,
        mainEntityOfPage: url,
        image: `${url}/og-image.png`,
        author: { '@id': 'https://example.test/#person' },
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
      (body) => JSON.parse(body) as { '@type': string; itemListElement: unknown[] },
    );
    expect(crumbs['@type']).toBe('BreadcrumbList');
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

/** Every block the site serves, rendered: the layout's two, then each case study's two in data order. */
async function renderEveryBlock() {
  const { PersonJsonLd, WebsiteJsonLd, TechArticleJsonLd, BreadcrumbListJsonLd } =
    await importWithSiteUrl('https://example.test');
  const { container } = render(
    <>
      <PersonJsonLd />
      <WebsiteJsonLd />
      {caseStudies.map((study) => (
        <Fragment key={study.slug}>
          <TechArticleJsonLd caseStudy={study} />
          <BreadcrumbListJsonLd caseStudy={study} />
        </Fragment>
      ))}
    </>,
  );
  // What rendered each block, in the order they render, so a failure names the component and study.
  const sources = [
    'PersonJsonLd',
    'WebsiteJsonLd',
    ...caseStudies.flatMap(({ slug }) => [
      `TechArticleJsonLd (${slug})`,
      `BreadcrumbListJsonLd (${slug})`,
    ]),
  ];
  return { blocks: jsonLdBlocks(container), sources };
}

describe('the offline structured-data gate (#55)', () => {
  it('parses every block the site serves as schema.org JSON-LD with a type', async () => {
    expect(caseStudies.length, 'the data file must define case studies').toBeGreaterThan(0);
    const { blocks, sources } = await renderEveryBlock();
    expect(blocks, 'one block per component per case study').toHaveLength(sources.length);

    const problems: string[] = [];
    blocks.forEach((raw, index) => {
      try {
        parseJsonLdBlock(raw);
      } catch (error) {
        problems.push(`${sources[index]}: ${(error as Error).message}`);
      }
    });
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

  it.fails('#57: every node carries an @id', async () => {
    // Today the Person and the WebSite carry one and every TechArticle and BreadcrumbList does not, so
    // nothing else can point at an article or a breadcrumb trail. A node here is the object at the root
    // of a block: a ListItem is part of its list, and `{ '@id': … }` objects are references to nodes.
    const { blocks, sources } = await renderEveryBlock();
    const missing = blocks
      .map((raw, index) => ({ node: parseJsonLdBlock(raw), source: sources[index] }))
      .filter(({ node }) => idOf(node) === undefined)
      .map(({ node, source }) => `${source}: a ${String(node['@type'])} with no @id`);
    expect(missing, 'every node carries an @id').toEqual([]);
  });

  it.fails('#57: a WebPage node exists, and WebSite, WebPage and Person link by @id', async () => {
    // #57 adds a WebPageJsonLd for every route. It is looked up by name because it does not exist yet,
    // and a static import would not compile; the props are this row's guess at #57's API, which #57
    // adjusts here if its own differ when it deletes the marker. The references checked are the ones
    // #57 designs: the WebSite's author is the Person, and the WebPage is part of the WebSite and about
    // the Person. Each has to name the `@id` of a node that rendered alongside it.
    const jsonLd = await importWithSiteUrl('https://example.test');
    const { PersonJsonLd, WebsiteJsonLd } = jsonLd;
    const { WebPageJsonLd } = jsonLd as unknown as {
      WebPageJsonLd?: ComponentType<{ path: string; name: string }>;
    };
    const { container } = render(
      <>
        <PersonJsonLd />
        <WebsiteJsonLd />
        {WebPageJsonLd ? <WebPageJsonLd path="/" name="Milos Cvetkovic" /> : null}
      </>,
    );
    const nodes = jsonLdBlocks(container).map(parseJsonLdBlock);
    const find = (type: string) => nodes.find((node) => hasType(node, type));
    const person = find('Person');
    const website = find('WebSite');
    const webPage = find('WebPage');

    const problems: string[] = [];
    if (!person) problems.push('no Person node renders');
    if (!website) problems.push('no WebSite node renders');
    if (!webPage) {
      problems.push(
        WebPageJsonLd
          ? 'WebPageJsonLd renders no WebPage node'
          : 'no WebPage node renders: json-ld.tsx exports no WebPageJsonLd',
      );
    }
    const references: [string, JsonLdNode | undefined, string, JsonLdNode | undefined][] = [
      ['WebSite', website, 'author', person],
      ['WebPage', webPage, 'isPartOf', website],
      ['WebPage', webPage, 'about', person],
    ];
    for (const [fromType, from, predicate, to] of references) {
      if (!from || !to) continue;
      const target = idOf(to);
      const named = idOf(from[predicate]);
      if (target === undefined || named !== target) {
        problems.push(
          `${fromType}.${predicate} names ${named ?? 'no @id'}, not the ${String(to['@type'])} node's ` +
            `@id ${target ?? '(it has none)'}`,
        );
      }
    }
    expect(
      problems,
      'a WebPage node exists, and WebSite, WebPage and Person reference each other by @id',
    ).toEqual([]);
  });
});

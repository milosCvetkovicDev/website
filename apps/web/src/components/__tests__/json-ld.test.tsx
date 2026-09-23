import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies } from '@/data/case-studies';

/**
 * The two JSON-LD blocks.
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

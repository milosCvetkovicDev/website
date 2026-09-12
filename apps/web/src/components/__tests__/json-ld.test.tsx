import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two JSON-LD blocks.
 *
 * Row R32 of the RED manifest, fixed by #48, plus the green assertions that hold their shape.
 *
 * Both blocks write their object into a `<script>` element without escaping it, so anything that ends
 * up inside can close the script tag early. `JSON.stringify` escapes nothing relevant: it leaves
 * `</script>` exactly as it found it, and a browser's tokeniser ends the script at the first one it
 * sees, whatever the JSON thinks. The value that reaches it is `NEXT_PUBLIC_SITE_URL`, which is
 * configuration rather than visitor input, so this is a hardening row rather than a live hole — and it
 * is one line to fix and impossible to notice later, which is exactly the kind of thing a baseline is
 * for.
 *
 * `siteUrl` is read at module scope (`json-ld.tsx:4`), so each case re-imports the module with the
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

  it.fails(
    'R32 (#48): a site URL containing </script> does not close the script element early',
    async () => {
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
        'json-ld.tsx:41 and :59 pass the object through bare JSON.stringify. Escape the output ' +
          'before it reaches the script element — replacing `<` with `\\u003c` is enough, and keeps ' +
          'the JSON valid.',
      ).toEqual([]);
    },
  );
});

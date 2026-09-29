/**
 * The social profiles (#49, pages-22): one module holds them, and every page, the footer and the
 * JSON-LD `sameAs` read it.
 *
 * The first block pins the records themselves. The literal hrefs below are the oracle: a test that
 * compared the module with itself could not notice a profile URL typed wrong in the one place it now
 * lives. The last block is AC 15's grep kept as a test, so a profile URL pasted back into a page, a
 * record or a component fails the run rather than waiting for someone to grep.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { social, socialProfiles } from '../social';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The profiles as the site has linked them since launch, in the order it lists them. */
const EXPECTED = [
  { id: 'linkedin', name: 'LinkedIn', href: 'https://www.linkedin.com/in/milos-cvetkovic-dev' },
  { id: 'github', name: 'GitHub', href: 'https://github.com/milosCvetkovicDev' },
  { id: 'x', name: 'X', href: 'https://x.com/milos_dev' },
];

describe('socialProfiles', () => {
  it('lists LinkedIn, GitHub and X, in that order, at their profile URLs', () => {
    expect(socialProfiles.map(({ id, name, href }) => ({ id, name, href }))).toEqual(EXPECTED);
  });

  it('names the X profile for X, not for Twitter', () => {
    // The product was renamed in 2023; the footer's link and its glyph read this name.
    expect(social.x.name).toBe('X');
    expect(socialProfiles.map(({ name }) => name).join(' ')).not.toMatch(/twitter/i);
  });

  it('keys every profile by its own id, and lists each keyed profile once', () => {
    expect(Object.entries(social).map(([key, profile]) => [key, profile.id])).toEqual(
      Object.values(social).map(({ id }) => [id, id]),
    );
    expect([...socialProfiles].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      Object.values(social).sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it('gives every profile a handle that is the last segment of its URL', () => {
    for (const { id, href, handle } of socialProfiles) {
      const url = new URL(href);
      expect(url.protocol, id).toBe('https:');
      expect(url.search + url.hash, id).toBe('');
      expect(handle, id).not.toMatch(/^@|\//);
      expect(url.pathname.split('/').at(-1), id).toBe(handle);
    }
  });
});

/**
 * Every file under `src` that ships, less the tests: the tests keep their literal hrefs as an
 * oracle (this file's `EXPECTED`, the footer's and the JSON-LD block's), which is the point of them.
 * Fonts and other binaries are skipped by extension.
 */
const SHIPPED_TEXT = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.(?:[cm]?[jt]sx?|css|json|md|mdx|txt)$/.test(name))
  .filter((name) => !/(^|\/)__tests__\//.test(name) && !/\.test\.[jt]sx?$/.test(name))
  .sort();

/**
 * A profile's address without its scheme and `www.`, lower-cased: `linkedin.com/in/<handle>`. X
 * profiles are matched on the old `twitter.com` host too, which still redirects to them.
 */
const profileAddresses = socialProfiles.flatMap(({ id, href }) => {
  const { hostname, pathname } = new URL(href);
  const address = `${hostname.replace(/^www\./, '')}${pathname}`.toLowerCase();
  return id === 'x' ? [address, address.replace(/^x\.com\//, 'twitter.com/')] : [address];
});

describe('the one source of the profile URLs (AC 15)', () => {
  it('scans a non-trivial set of files', () => {
    // An emptied or mis-rooted file list would make the next test pass vacuously.
    expect(SHIPPED_TEXT).toContain('data/social.ts');
    expect(SHIPPED_TEXT.length).toBeGreaterThan(50);
  });

  it('writes a profile URL in data/social.ts and nowhere else under src', () => {
    const hits: string[] = [];
    for (const file of SHIPPED_TEXT) {
      if (file === 'data/social.ts') continue;
      readFileSync(join(SRC, file), 'utf8')
        .split('\n')
        .forEach((text, index) => {
          const line = text.toLowerCase();
          for (const address of profileAddresses) {
            if (line.includes(address)) hits.push(`${file}:${index + 1} restates ${address}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});

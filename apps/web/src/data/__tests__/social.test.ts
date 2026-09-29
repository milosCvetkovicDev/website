/**
 * The social profiles (#49, pages-22): one module holds them, and every page, the footer and the
 * JSON-LD `sameAs` read it.
 *
 * The first block pins the records themselves. The literal hrefs below are the oracle: a test that
 * compared the module with itself could not notice a profile URL typed wrong in the one place it now
 * lives. The second block is AC 15's grep kept as a test, so a profile URL or handle pasted back into
 * a page, a record or a component fails the run rather than waiting for someone to grep. The last
 * checks that each page record's labelled profile link names the platform it links to.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aboutCopy } from '../pages/about';
import { socialLinks } from '../pages/contact';
import { skillsCopy } from '../pages/skills';
import { workCopy } from '../pages/work';
import { social, socialProfiles } from '../social';

/** `apps/web`, the root the scan below walks `src` and `public` from. */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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

/** A pattern's special characters escaped, so a handle matches as the literal it is. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every text file that ships from `src` and `public`, as a POSIX path from the app root, less the
 * tests: they keep their literal hrefs as an oracle (this file's `EXPECTED`, the footer's and the
 * JSON-LD block's), which is the point of them. Fonts, images and other binaries are skipped by
 * extension. `readdirSync`'s `recursive` needs Node 20.1, below the `engines.node` floor of 22.22.
 */
const SHIPPED_TEXT = ['src', 'public']
  .flatMap((root) =>
    readdirSync(join(APP, root), { recursive: true, encoding: 'utf8' }).map((name) =>
      [root, ...name.split(sep)].join('/'),
    ),
  )
  .filter((name) =>
    /\.(?:[cm]?[jt]sx?|css|json|md|mdx|txt|svg|xml|html|ya?ml|webmanifest)$/.test(name),
  )
  .filter((name) => !/(^|\/)__tests__\//.test(name) && !/\.test\.[jt]sx?$/.test(name))
  .sort();

/**
 * Each profile's handle as a standalone token, case-insensitively: bare, after an `@`, or at the end
 * of its URL on any host (`x.com/milos_dev`, the old `twitter.com/milos_dev`, a URL built from parts).
 * A handle followed by `/` and more path is left alone: that is a resource the account owns, such as
 * a repository or a post, not the profile restated.
 */
const handlePatterns = socialProfiles.map(({ id, handle }) => ({
  id,
  pattern: new RegExp(`(?<![\\w-])${escape(handle)}(?![\\w-]|/[\\w-])`, 'i'),
}));

describe('the one source of the profile URLs (AC 15)', () => {
  it('scans a non-trivial set of files', () => {
    // An emptied or mis-rooted file list would make the next test pass vacuously.
    expect(SHIPPED_TEXT).toContain('src/data/social.ts');
    expect(SHIPPED_TEXT.some((name) => name.startsWith('public/'))).toBe(true);
    expect(SHIPPED_TEXT.length).toBeGreaterThan(50);
  });

  it('matches a restated profile, and not a resource the account owns', () => {
    const hits = (text: string) =>
      handlePatterns.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);

    expect(hits("href: 'https://x.com/milos_dev',")).toEqual(['x']);
    expect(hits('https://twitter.com/Milos_Dev?ref=site')).toEqual(['x']);
    expect(hits("creator: '@milos_dev'")).toEqual(['x']);
    expect(hits('https://github.com/milosCvetkovicDev/')).toEqual(['github']);
    expect(hits('`https://www.linkedin.com/in/${"milos-cvetkovic-dev"}`')).toEqual(['linkedin']);
    expect(hits('https://github.com/milosCvetkovicDev/website')).toEqual([]);
    expect(hits('https://x.com/milos_dev/status/1')).toEqual([]);
    expect(
      hits('https://x.com/milos_dev2 and https://github.com/milosCvetkovicDev-archive'),
    ).toEqual([]);
  });

  it('writes a profile handle in data/social.ts and nowhere else under src or public', () => {
    const hits: string[] = [];
    for (const file of SHIPPED_TEXT) {
      if (file === 'src/data/social.ts') continue;
      readFileSync(join(APP, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const { id, pattern } of handlePatterns) {
            if (pattern.test(line)) hits.push(`${file}:${index + 1} restates the ${id} profile`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});

/**
 * Every link a page record labels with a profile, with that label. The home page's closing CTA and
 * the case studies' write theirs in the component; `e2e/story.spec.ts` and `e2e/case-study.spec.ts`
 * pin those two.
 */
const labelledLinks = [
  ...socialLinks.flatMap(({ name, cta, href }) => [
    { at: `/contact card "${name}"`, label: name, href },
    { at: `/contact button "${cta}"`, label: cta, href },
  ]),
  ...aboutCopy.connect.links.map(({ name, href }) => ({
    at: `/about "${name}"`,
    label: name,
    href,
  })),
  { at: '/skills CTA', label: skillsCopy.cta.linkedIn.text, href: skillsCopy.cta.linkedIn.href },
  { at: '/work CTA', label: workCopy.cta.link.text, href: workCopy.cta.link.href },
];

describe('the page records that link to a profile', () => {
  it('link every profile from /contact and /about', () => {
    for (const links of [socialLinks, aboutCopy.connect.links]) {
      expect(links.map(({ href }) => href)).toEqual(EXPECTED.map(({ href }) => href));
    }
  });

  it('name, in each label, the platform the link goes to and no other', () => {
    // A rename in `data/social.ts` then cannot leave a page's label behind, and a "Follow on
    // LinkedIn" button cannot point at the GitHub profile. "X / Twitter" passes: it names X.
    const named = (label: string) =>
      EXPECTED.filter(({ name }) => new RegExp(`(?<!\\w)${escape(name)}(?!\\w)`).test(label)).map(
        ({ href }) => href,
      );
    const problems = labelledLinks
      .filter(({ label, href }) => named(label).join() !== href)
      .map(({ at, href }) => `${at} links to ${href}`);
    expect(labelledLinks.length).toBeGreaterThanOrEqual(10);
    expect(problems).toEqual([]);
  });
});

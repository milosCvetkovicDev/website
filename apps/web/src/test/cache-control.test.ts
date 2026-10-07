/**
 * The pure half of `e2e-live/markdown-negotiation.spec.ts` (#217): the caching fields and entity
 * tags that decide whether the live check's revalidation ground holds. Production sends one shape
 * (`public, max-age=0, must-revalidate`), so every other branch is exercised only here, and a
 * flipped condition would turn the live check into one that always passes. No DOM.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  cacheBound,
  directiveBound,
  entityTag,
  listElements,
  parseDirectives,
  variesOnAccept,
  type HeaderLine,
} from '../../e2e/support/cache-control';

const cc = (...values: string[]): HeaderLine[] =>
  values.map((value) => ({ name: 'Cache-Control', value }));

const boundOf = (...values: string[]) => {
  const directives = parseDirectives(values);
  return directives === undefined ? 'unparseable' : directiveBound(directives);
};

describe('listElements', () => {
  it('splits on commas outside quoted strings and drops empty elements', () => {
    expect(listElements('public, max-age=0 ,, must-revalidate')).toEqual([
      'public',
      'max-age=0',
      'must-revalidate',
    ]);
    expect(listElements('no-cache="set-cookie, x-a", max-age=0')).toEqual([
      'no-cache="set-cookie, x-a"',
      'max-age=0',
    ]);
    expect(listElements('')).toEqual([]);
  });

  it('refuses a quoted string that is not terminated', () => {
    expect(listElements('no-cache="foo, max-age=3600')).toBeUndefined();
    expect(listElements('x="a\\')).toBeUndefined();
  });
});

describe('parseDirectives', () => {
  it('lower-cases names, unescapes quoted values and keeps a directive sent twice', () => {
    expect(parseDirectives(['Max-Age=0, max-age=60', 'x="a\\"b, c"', 'no-cache'])).toEqual(
      new Map([
        ['max-age', ['0', '60']],
        ['x', ['a"b, c']],
        ['no-cache', [undefined]],
      ]),
    );
  });

  it('refuses any element that is not a cache-directive, so a malformed header fails closed', () => {
    for (const value of [
      'no-cache="foo, max-age=3600',
      'no-cache="set-cookie',
      'max-age = 3600',
      'x-ext = "no-cache"',
      'max-age=0; must-revalidate',
      'max-age="0"x',
    ]) {
      expect(parseDirectives([value]), value).toBeUndefined();
    }
  });
});

describe('directiveBound', () => {
  it('counts what Vercel sends, and a bare no-cache, as revalidated before every reuse', () => {
    expect(boundOf('public, max-age=0, must-revalidate')).toBe('revalidate');
    expect(boundOf('no-cache')).toBe('revalidate');
    expect(boundOf('public', 'max-age=0', 'must-revalidate')).toBe('revalidate');
    expect(boundOf('max-age=00, must-revalidate, s-maxage=0')).toBe('revalidate');
    // `private` neither gives nor takes a bound: it only keeps shared caches out.
    expect(boundOf('private, max-age=0, must-revalidate')).toBe('revalidate');
  });

  it('counts no-store as nothing stored, whatever comes with it', () => {
    expect(boundOf('no-store')).toBe('no-store');
    expect(boundOf('no-store, max-age=600, stale-while-revalidate=60')).toBe('no-store');
  });

  it('counts a directive that takes no argument only where every occurrence has none', () => {
    // RFC 9111 gives no-store, no-cache's unqualified form and must-revalidate no argument, and
    // lets a cache act on the first of two occurrences (4.2.1), so a qualified one is no bound.
    expect(boundOf('no-store="x", no-cache')).toBe('revalidate');
    for (const value of [
      'no-store="x"',
      'no-store="x", max-age=600',
      'no-cache="set-cookie", no-cache',
      'no-cache, no-cache="set-cookie"',
      'max-age=0, must-revalidate="no"',
      'max-age=0, must-revalidate, must-revalidate=x',
    ]) {
      expect(boundOf(value), value).toBeUndefined();
    }
  });

  it('gives no bound where a cache may reuse the response without asking', () => {
    for (const value of [
      'public, max-age=600',
      'public, max-age=0',
      'must-revalidate',
      'public',
      'private',
      'max-age=0, max-age=600, must-revalidate',
      'max-age, must-revalidate',
      'no-cache="set-cookie", max-age=600',
      'no-cache="set-cookie"',
      'public, max-age=0, must-revalidate, s-maxage=600',
      'public, max-age=0, must-revalidate, s-maxage',
      'max-age=0, must-revalidate, s-maxage=0, s-maxage=60',
      'public, max-age=0, must-revalidate, stale-while-revalidate=60',
      'no-cache, stale-if-error=600',
    ]) {
      expect(boundOf(value), value).toBeUndefined();
    }
  });
});

describe('cacheBound', () => {
  it('passes the shape production sends', () => {
    expect(cacheBound(cc('public, max-age=0, must-revalidate'))).toEqual({ bound: 'revalidate' });
    expect(cacheBound(cc('no-store'))).toEqual({ bound: 'no-store' });
  });

  it('gives no bound without Cache-Control, which leaves a cache a heuristic lifetime', () => {
    expect(cacheBound([])).toEqual({ bound: undefined, reason: 'it sent no Cache-Control' });
    expect(cacheBound([{ name: 'expires', value: 'Thu, 01 Jan 1970 00:00:00 GMT' }]).bound).toBe(
      undefined,
    );
  });

  it('names the field and what it sent when there is no bound', () => {
    expect(cacheBound(cc('public, max-age=600'))).toEqual({
      bound: undefined,
      reason: 'it sent cache-control: "public, max-age=600"',
    });
    expect(cacheBound(cc('no-cache="foo, max-age=3600'))).toEqual({
      bound: undefined,
      reason: 'it sent cache-control: "no-cache="foo, max-age=3600", which does not parse',
    });
  });

  it('holds a targeted field a CDN downstream obeys to the same rule', () => {
    const base = cc('public, max-age=0, must-revalidate');
    expect(cacheBound([...base, { name: 'CDN-Cache-Control', value: 'max-age=3600' }])).toEqual({
      bound: undefined,
      reason: 'it sent cdn-cache-control: "max-age=3600"',
    });
    expect(cacheBound([...base, { name: 'Surrogate-Control', value: 'max-age=3600' }]).bound).toBe(
      undefined,
    );
    expect(cacheBound([...base, { name: 'cdn-cache-control', value: 'no-store' }])).toEqual({
      bound: 'revalidate',
    });
    expect(
      cacheBound([...cc('no-store'), { name: 'cdn-cache-control', value: 'no-store' }]),
    ).toEqual({ bound: 'no-store' });
  });

  it('holds a vendor’s own targeted field (RFC 9213) and nginx’s lifetime field too', () => {
    const base = cc('public, max-age=0, must-revalidate');
    expect(
      cacheBound([...base, { name: 'Cloudflare-CDN-Cache-Control', value: 'max-age=86400' }]),
    ).toEqual({
      bound: undefined,
      reason: 'it sent cloudflare-cdn-cache-control: "max-age=86400"',
    });
    expect(
      cacheBound([...base, { name: 'Vercel-CDN-Cache-Control', value: 'max-age=86400' }]).bound,
    ).toBe(undefined);
    expect(cacheBound([...base, { name: 'X-Accel-Expires', value: '3600' }])).toEqual({
      bound: undefined,
      reason: 'it sent x-accel-expires: "3600"',
    });
    expect(cacheBound([...base, { name: 'X-Accel-Expires', value: '0' }])).toEqual({
      bound: 'revalidate',
    });
  });
});

describe('entityTag', () => {
  const etag = (...values: string[]) => values.map((value) => ({ name: 'ETag', value }));

  it('reads one strong or weak entity tag and its opaque part, which If-None-Match compares', () => {
    expect(entityTag(etag('"d3f5b3"'))).toEqual({ tag: '"d3f5b3"', opaque: 'd3f5b3' });
    expect(entityTag(etag('W/"d3f5b3"'))).toEqual({ tag: 'W/"d3f5b3"', opaque: 'd3f5b3' });
    expect(entityTag(etag('""'))).toEqual({ tag: '""', opaque: '' });
  });

  it('refuses a missing tag, two ETag lines and a value that is not an entity tag', () => {
    expect(entityTag([]).reason).toBe('it sent 0 ETag lines (none)');
    expect(entityTag(etag('"a"', '"b"')).reason).toBe('it sent 2 ETag lines ("a" | "b")');
    for (const value of ['abc', 'W/abc', '"a", "b"', '"a"b"', 'w/"a"']) {
      expect(entityTag(etag(value)).reason, value).toBe(`its ETag (${value}) is not an entity tag`);
    }
  });
});

describe('variesOnAccept', () => {
  it('holds for accept and for *, and not for Next’s own Vary', () => {
    expect(variesOnAccept(['rsc', 'accept'])).toBe(true);
    expect(variesOnAccept(['*'])).toBe(true);
    expect(
      variesOnAccept([
        'rsc',
        'next-router-state-tree',
        'next-router-prefetch',
        'next-router-segment-prefetch',
      ]),
    ).toBe(false);
    expect(variesOnAccept([])).toBe(false);
  });
});

/**
 * The pure half of `e2e-live/markdown-negotiation.spec.ts` (#217, ADR 0030's correction of
 * 2026-10-07): what a response's caching fields allow a cache downstream to do with it, and its
 * entity tag. They decide whether the live check can fail at all, so they fail closed: a field that
 * does not parse, a tag that is not one well-formed entity tag, gives no bound. Unit-tested in
 * `src/test/cache-control.test.ts`. No Playwright at run time: a response is its header lines.
 */

/** One header line as Playwright's `headersArray()` gives it: a field sent twice comes twice. */
export interface HeaderLine {
  name: string;
  value: string;
}

/** Every value of the field `name` on the response, in order, the name matched without case. */
export const fieldValues = (headers: readonly HeaderLine[], name: string): string[] =>
  headers.filter((line) => line.name.toLowerCase() === name).map(({ value }) => value);

/** RFC 9110's `token`, one or more `tchar`. */
const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";

/**
 * One `cache-directive` (RFC 9111, 5.2) as a whole list element: a name, then optionally `=` and a
 * token or a quoted string. The grammar has no whitespace around `=`.
 */
const DIRECTIVE = new RegExp(`^(${TOKEN})(?:=(?:(${TOKEN})|"((?:[^"\\\\]|\\\\.)*)"))?$`);

/**
 * The elements of a comma-separated field value (RFC 9110, 5.6.1), with commas inside a quoted
 * string kept, or `undefined` when a quoted string is not terminated. Empty elements are dropped,
 * as the list syntax allows them.
 */
export function listElements(value: string): string[] | undefined {
  const elements: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quoted && char === '\\') {
      if (i + 1 === value.length) {
        return undefined;
      }
      current += char + value[i + 1];
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
    }
    if (char === ',' && !quoted) {
      elements.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (quoted) {
    return undefined;
  }
  elements.push(current);
  return elements.map((element) => element.trim()).filter(Boolean);
}

/** Every directive by lower-cased name, with every value it was given (`undefined` for none). */
export type Directives = Map<string, (string | undefined)[]>;

/**
 * The directives on every line of a `Cache-Control`-shaped field, so a directive sent twice is seen
 * twice, quoted values unescaped; `undefined` when any element is not a `cache-directive`.
 */
export function parseDirectives(values: readonly string[]): Directives | undefined {
  const directives: Directives = new Map();
  for (const value of values) {
    const elements = listElements(value);
    if (elements === undefined) {
      return undefined;
    }
    for (const element of elements) {
      const match = DIRECTIVE.exec(element);
      if (match === null) {
        return undefined;
      }
      const [, name, token, quoted] = match;
      const given = quoted === undefined ? token : quoted.replace(/\\(.)/g, '$1');
      const key = name.toLowerCase();
      directives.set(key, [...(directives.get(key) ?? []), given]);
    }
  }
  return directives;
}

const isZero = (value: string | undefined) => value !== undefined && /^0+$/.test(value);

/**
 * What a set of directives leaves a cache: `no-store`, nothing stored at all; `revalidate`, nothing
 * reused without asking the origin first; `undefined`, a reuse without asking.
 *
 * - `no-store` (RFC 9111, 5.2.2.5): no cache stores the response, whatever else is sent.
 * - `stale-while-revalidate` and `stale-if-error` (RFC 5861) let a cache answer from a stale copy,
 *   and an `s-maxage` above zero gives a shared cache a lifetime of its own, so each leaves no
 *   bound.
 *   `s-maxage=0` does not: it implies `proxy-revalidate` (5.2.2.10).
 * - `no-cache` without field names (5.2.2.4): every reuse is revalidated. With field names it holds
 *   only those fields back, so it does not count.
 * - otherwise every `max-age` given must be zero, and `must-revalidate` present (5.2.2.2), so a
 *   stale copy is never served. A `max-age` sent twice counts only when both are zero.
 *
 * `private` alone is no bound: a private cache, a browser's or an agent's HTTP client's, may still
 * store the response and reuse it. `Expires` and `Pragma` need no reading: every bound above makes
 * a cache ignore them (5.3, 5.4).
 */
export function directiveBound(directives: Directives): 'no-store' | 'revalidate' | undefined {
  if (directives.has('no-store')) {
    return 'no-store';
  }
  if (directives.has('stale-while-revalidate') || directives.has('stale-if-error')) {
    return undefined;
  }
  if (!(directives.get('s-maxage') ?? []).every(isZero)) {
    return undefined;
  }
  if (directives.get('no-cache')?.includes(undefined)) {
    return 'revalidate';
  }
  const maxAge = directives.get('max-age') ?? [];
  return maxAge.length > 0 && maxAge.every(isZero) && directives.has('must-revalidate')
    ? 'revalidate'
    : undefined;
}

/**
 * The fields that set a cache's lifetime for a response: `Cache-Control` for every cache, and the
 * targeted fields a CDN downstream may obey in its place, `CDN-Cache-Control` (RFC 9213) and
 * `Surrogate-Control`.
 */
const LIFETIME_FIELDS = ['cache-control', 'cdn-cache-control', 'surrogate-control'] as const;

export type CacheBound =
  { bound: 'no-store' | 'revalidate'; reason?: undefined } | { bound: undefined; reason: string };

/**
 * What every cache downstream may do with the response: `no-store` or `revalidate` when every
 * lifetime field it sent bounds it (the weaker of the two when they differ), or a reason naming the
 * field that does not. A response without `Cache-Control` leaves a cache a heuristic lifetime
 * (RFC 9111, 4.2.2), so it gets no bound either.
 */
export function cacheBound(headers: readonly HeaderLine[]): CacheBound {
  if (fieldValues(headers, 'cache-control').length === 0) {
    return { bound: undefined, reason: 'it sent no Cache-Control' };
  }
  let bound: 'no-store' | 'revalidate' = 'no-store';
  for (const field of LIFETIME_FIELDS) {
    const values = fieldValues(headers, field);
    if (values.length === 0) {
      continue;
    }
    const sent = `${field}: "${values.join(', ')}"`;
    const directives = parseDirectives(values);
    if (directives === undefined) {
      return { bound: undefined, reason: `it sent ${sent}, which does not parse` };
    }
    const own = directiveBound(directives);
    if (own === undefined) {
      return { bound: undefined, reason: `it sent ${sent}` };
    }
    if (own === 'revalidate') {
      bound = 'revalidate';
    }
  }
  return { bound };
}

/** RFC 9110's `entity-tag` (8.8.3): an optional weak prefix, then `etagc` between quotes. */
const ENTITY_TAG = /^(W\/)?"([\x21\x23-\x7e\x80-\xff]*)"$/;

export type EntityTag = { tag: string; opaque: string; reason?: undefined } | { reason: string };

/**
 * The response's one entity tag, and its opaque part, which is what `If-None-Match` compares
 * (weakly, RFC 9110 13.1.2: `W/"x"` matches `"x"`). A response with none, with two `ETag` lines or
 * with one that is not an entity tag gives a reason instead: a cache could not name it.
 */
export function entityTag(headers: readonly HeaderLine[]): EntityTag {
  const values = fieldValues(headers, 'etag');
  if (values.length !== 1) {
    return { reason: `it sent ${values.length} ETag lines (${values.join(' | ') || 'none'})` };
  }
  const tag = values[0].trim();
  const match = ENTITY_TAG.exec(tag);
  if (match === null) {
    return { reason: `its ETag (${tag}) is not an entity tag` };
  }
  return { tag, opaque: match[2] };
}

/**
 * Whether a `Vary` keeps the two representations apart in every cache that honours it: it lists
 * `accept`, or it is `*`, which no cache can match without asking the origin (RFC 9110, 12.5.5).
 */
export const variesOnAccept = (vary: readonly string[]) =>
  vary.includes('accept') || vary.includes('*');

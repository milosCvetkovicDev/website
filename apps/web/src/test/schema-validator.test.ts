/**
 * The pure half of `e2e/structured-data.spec.ts`: what counts as validator.schema.org's verdict, and
 * which ld+json elements a served document holds (`e2e/support/json-ld.ts`, which every spec reads
 * JSON-LD through). These branches decide whether a check can fail at all, so a flipped condition
 * here would turn one into a check that always passes. No DOM.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { jsonLdNodes, jsonLdOpenTagCount, jsonLdScripts } from '../../e2e/support/json-ld';
import {
  XSSI_PREFIX,
  clip,
  describeErrors,
  readVerdict,
  type ValidatorReport,
} from '../../e2e/support/schema-validator';

/** An answer as the validator writes it: the XSSI guard, a newline, then the JSON. */
const answer = (report: unknown) => `${XSSI_PREFIX}\n${JSON.stringify(report)}`;

/** A C0 or C1 control character, the escape that starts an ANSI sequence among them. */
const isControl = (code: number) => code < 0x20 || (code >= 0x7f && code <= 0x9f);

const clean = { totalNumErrors: 0, totalNumWarnings: 0, numObjects: 2, errors: [] };

describe('readVerdict', () => {
  it('takes a clean answer that read objects as a verdict with no errors', () => {
    expect(readVerdict(200, answer(clean))).toEqual({ reached: true, report: clean });
  });

  it('takes an answer with errors as a verdict, so the check can fail', () => {
    const report = {
      totalNumErrors: 1,
      numObjects: 1,
      errors: [{ errorType: 'INVALID_PREDICATE', args: ['jobTitel', 'Person'] }],
    };
    expect(readVerdict(200, answer(report))).toEqual({ reached: true, report });
    // A block that is not JSON: errors, and no object read. Still a verdict about what was sent.
    const parseError = {
      totalNumErrors: 1,
      numObjects: 0,
      errors: [{ errorType: 'JSON_PARSE_ERROR' }],
    };
    expect(readVerdict(200, answer(parseError)).reached).toBe(true);
  });

  it('reads an answer without the XSSI prefix too', () => {
    expect(readVerdict(200, JSON.stringify(clean)).reached).toBe(true);
  });

  it('reaches no verdict on a non-2xx answer, and says when the request itself was refused', () => {
    for (const status of [400, 403, 404, 413]) {
      expect(readVerdict(status, answer(clean))).toEqual({
        reached: false,
        why: `it refused the request with ${status}, so the endpoint's contract may have changed`,
      });
    }
    for (const status of [408, 429, 500, 503, 302]) {
      expect(readVerdict(status, '')).toEqual({ reached: false, why: `it answered ${status}` });
    }
  });

  it('reaches no verdict on a body that is not a report', () => {
    expect(readVerdict(200, '<html>busy</html>')).toMatchObject({ reached: false });
    expect(readVerdict(200, `${XSSI_PREFIX}\n`)).toMatchObject({ reached: false });
    expect(readVerdict(200, answer(null))).toMatchObject({ reached: false });
    expect(readVerdict(200, answer([clean]))).toMatchObject({ reached: false });
    expect(readVerdict(200, answer({ numObjects: 2 }))).toMatchObject({
      reached: false,
      why: expect.stringMatching(/^its body has no error count/),
    });
  });

  it('refuses an error count or object count that is not a count', () => {
    for (const totalNumErrors of ['0', -1, 0.5, null]) {
      expect(readVerdict(200, answer({ ...clean, totalNumErrors })).reached).toBe(false);
    }
    // A string "0" is truthy: read as a count it would pass as having read an object.
    for (const numObjects of ['0', '2', -1, 1.5]) {
      expect(readVerdict(200, answer({ ...clean, numObjects })).reached).toBe(false);
    }
  });

  it('reaches no verdict when it read nothing: the empty-html answer is not a pass', () => {
    // What an empty `html` field answers, measured 2026-09-28.
    const empty = { totalNumErrors: 0, numObjects: 0, fetchError: 'NOT_FOUND' };
    expect(readVerdict(200, answer(empty))).toMatchObject({ reached: false });
    expect(readVerdict(200, answer({ totalNumErrors: 0, numObjects: 0 }))).toEqual({
      reached: false,
      why: 'it read no object (numObjects 0)',
    });
    expect(readVerdict(200, answer({ totalNumErrors: 0 }))).toEqual({
      reached: false,
      why: 'it read no object (numObjects none)',
    });
  });

  it('reaches no verdict on a fetch error, whatever the error count', () => {
    const fetchFailed = { totalNumErrors: 1, numObjects: 0, fetchError: 'FETCH_ERROR' };
    expect(readVerdict(200, answer(fetchFailed))).toEqual({
      reached: false,
      why: 'it could not read what was sent (fetchError FETCH_ERROR)',
    });
  });

  it('keeps control characters from a third-party body out of the reason it prints', () => {
    const verdict = readVerdict(200, `\u001b[31m<html>\n\tbusy\u0007</html>${'x'.repeat(300)}`);
    expect(verdict.reached).toBe(false);
    const why = verdict.reached ? '' : verdict.why;
    expect([...why].filter((char) => isControl(char.codePointAt(0) ?? 0))).toEqual([]);
    expect(why).toMatch(/^its 200 body is not JSON: \[31m<html> busy <\/html>x+$/);
    expect(why.length).toBeLessThanOrEqual('its 200 body is not JSON: '.length + 120);
  });
});

describe('clip', () => {
  it('replaces control characters, collapses whitespace and cuts to length', () => {
    expect(clip('a\u001b[0m\r\n\tb\u009bc')).toBe('a [0m b c');
    expect(clip('x'.repeat(200))).toHaveLength(120);
    expect(clip('abcdef', 3)).toBe('abc');
  });
});

describe('describeErrors', () => {
  it('names each error with its arguments, objects included', () => {
    const report: ValidatorReport = {
      totalNumErrors: 3,
      errors: [
        { errorType: 'INVALID_PREDICATE', args: ['jobTitel', 'Person'] },
        { errorType: 'MISSING_FIELD', args: [{ field: 'name' }, null, 3] },
        { args: [] },
      ],
    };
    expect(describeErrors(report)).toBe(
      'INVALID_PREDICATE(jobTitel, Person); MISSING_FIELD({"field":"name"}, null, 3); UNKNOWN_ERROR()',
    );
  });

  it('reads an entry that is not an object, and a report that lists none', () => {
    const odd = { totalNumErrors: 2, errors: [null, 'x'] } as unknown as ValidatorReport;
    expect(describeErrors(odd)).toBe('null; "x"');
    expect(describeErrors({ totalNumErrors: 1 })).toBe('(the report lists none)');
    expect(describeErrors({ totalNumErrors: 1, errors: [] })).toBe('(the report lists none)');
  });
});

describe('jsonLdScripts', () => {
  const block = '{"@context":"https://schema.org","@type":"Person"}';

  it('finds a block whatever the order and quoting of its attributes', () => {
    const html = [
      `<script type="application/ld+json">${block}</script>`,
      `<script id="a" type="application/ld+json">${block}</script>`,
      `<script nonce="n" type='application/ld+json'>${block}</script>`,
      `<SCRIPT TYPE=application/ld+json>${block}</SCRIPT>`,
    ].join('\n');
    expect(jsonLdScripts(html)).toHaveLength(4);
    expect(jsonLdOpenTagCount(html)).toBe(4);
  });

  it('skips other scripts and the escaped copy in the flight payload', () => {
    const html = [
      `<script type="application/ld+json">${block}</script>`,
      '<script src="/_next/static/chunks/main.js" async=""></script>',
      '<script>self.__next_f.push([1,"[\\"$\\",\\"script\\",null,{\\"type\\":\\"application/ld+json\\"}]"])</script>',
    ].join('');
    expect(jsonLdScripts(html)).toEqual([`<script type="application/ld+json">${block}</script>`]);
    expect(jsonLdOpenTagCount(html)).toBe(1);
  });

  it('counts an open tag the element pattern misses, so the spec sees the gap', () => {
    // An unterminated element: the pattern cannot take it, the independent count still sees it.
    const html = `<script type="application/ld+json">${block}</script><script type="application/ld+json">${block}`;
    expect(jsonLdScripts(html)).toHaveLength(1);
    expect(jsonLdOpenTagCount(html)).toBe(2);
  });

  it('ends an element at an end tag with whitespace or attributes, as HTML does', () => {
    const html = [
      `<script type="application/ld+json">${block}</script >`,
      `<script type="application/ld+json">${block}</script\n>`,
      `<script type="application/ld+json">${block}</script x>`,
    ].join('');
    expect(jsonLdScripts(html)).toHaveLength(3);
    expect(jsonLdOpenTagCount(html)).toBe(3);
  });

  it('reads neither a data-type attribute nor a longer type as ld+json, and counts both', () => {
    const html = [
      `<script data-type="application/ld+json" src="/x.js"></script>`,
      `<script type="application/ld+jsonp">${block}</script>`,
      `<script type="application/ld+json; charset=utf-8">${block}</script>`,
    ].join('');
    expect(jsonLdScripts(html)).toEqual([]);
    expect(jsonLdOpenTagCount(html)).toBe(3);
  });
});

describe('jsonLdNodes', () => {
  const tag = (body: string) => `<script type="application/ld+json">${body}</script>`;

  it('parses every block, in document order', () => {
    const html = tag('{"@type":"Person"}') + '<p>x</p>' + tag('{"@type":"WebSite"}');
    expect(jsonLdNodes(html, '/')).toEqual([{ '@type': 'Person' }, { '@type': 'WebSite' }]);
    expect(jsonLdNodes('<p>no blocks</p>', '/')).toEqual([]);
  });

  it('takes the body as written, without decoding entities, as the HTML parser does', () => {
    expect(jsonLdNodes(tag('{"name":"a &amp; b"}'), '/')).toEqual([{ name: 'a &amp; b' }]);
  });

  it('refuses a tag naming the type that it could not read, naming the route', () => {
    expect(() => jsonLdNodes(tag('{}') + '<script type="application/ld+json">{}', '/work')).toThrow(
      '/work: 2 script tags mention application/ld+json, but 1 could be read as ld+json elements',
    );
    expect(() => jsonLdNodes('<script data-type="application/ld+json"></script>', '/')).toThrow(
      /1 script tags mention application\/ld\+json, but 0/,
    );
  });

  it('refuses a block that does not parse, naming the route, the index and the text', () => {
    expect(() => jsonLdNodes(tag('{}') + tag('{"a":'), '/about')).toThrow(
      /^\/about: JSON-LD block 1 does not parse \(SyntaxError: .*\): \{"a":$/,
    );
  });

  it('refuses a block that is not one node: an array, a primitive, or an @graph', () => {
    for (const body of ['[{"@type":"Person"}]', '"Person"', 'null', '{"@graph":[]}']) {
      expect(() => jsonLdNodes(tag(body), '/')).toThrow(
        `/: JSON-LD block 0 is not one node: ${body}`,
      );
    }
  });
});

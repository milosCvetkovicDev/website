// Tests for the content-date pairing check (#191). Run with `pnpm test:scripts` (node:test, no
// dependency).
//
// apps/web/src/data/content-dates.json pairs every route's content date with a fingerprint of its
// served text, and the unit suite keeps it true. The check compares that file at a pull request's
// head with the file at its merge base: a route whose text moved without its date, or whose date
// moved without its text or backwards, fails, unless the pull request body excuses it with a
// `Content-Date-Exception: <route> <reason>` line. Every rule gets a case that fails and one that
// passes, because a check only ever seen passing may be one that cannot fail.
//
// Fixtures are built at module level, never inside a `describe` body: on Node 22 a throw there is
// reported as "not ok" while the run still exits 0.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  compareManifests,
  formatReport,
  MANIFEST_PATH,
  parseExceptions,
  parseManifest,
} from './check-content-dates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const script = join(here, 'check-content-dates.mjs');

/** The manifest as committed, so the check is proved to read what the unit suite writes. */
const committedManifest = readFileSync(join(root, MANIFEST_PATH), 'utf8');
const workflow = readFileSync(join(root, '.github', 'workflows', 'content-dates.yml'), 'utf8');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccc';

/**
 * Serialises entries the way the unit suite writes the file: one line per route.
 *
 * @param {Record<string, { updated: string, text: string }>} entries
 */
const manifestText = (entries) =>
  `{\n${Object.entries(entries)
    .map(([route, entry]) => `  ${JSON.stringify(route)}: ${JSON.stringify(entry)}`)
    .join(',\n')}\n}\n`;

/** @param {Record<string, { updated: string, text: string }>} entries */
const manifest = (entries) => parseManifest(manifestText(entries), 'the fixture');

const BASE = manifest({
  '/': { updated: '2026-10-05', text: A },
  '/about': { updated: '2026-10-07', text: A },
  '/work': { updated: '2026-10-05', text: A },
});

/**
 * The base with one route's entry replaced.
 *
 * @param {string} route
 * @param {{ updated: string, text: string }} entry
 */
const withRoute = (route, entry) => {
  const copy = new Map(BASE);
  copy.set(route, entry);
  return copy;
};

/** @param {string} body */
const exceptionsIn = (body) => parseExceptions(body);

describe('parseManifest', () => {
  it('reads the manifest the unit suite commits', () => {
    const parsed = parseManifest(committedManifest, MANIFEST_PATH);
    assert.ok(parsed.size > 0, 'the committed manifest lists no route');
    assert.ok(parsed.has('/'), 'the committed manifest has no entry for /');
    for (const [route, entry] of parsed) {
      assert.match(route, /^\//);
      assert.match(entry.updated, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(entry.text, /^[0-9a-f]{16}$/);
    }
  });

  it('keeps every route and its two values', () => {
    assert.deepEqual([...BASE.keys()], ['/', '/about', '/work']);
    assert.deepEqual(BASE.get('/about'), { updated: '2026-10-07', text: A });
  });

  it('refuses text that is not JSON', () => {
    assert.throws(() => parseManifest('{ "/": ', 'the head manifest'), /the head manifest/);
  });

  it('refuses a top level that is not an object', () => {
    for (const source of ['[]', 'null', '"/"', '1']) {
      assert.throws(() => parseManifest(source, 'x'), /an object/, source);
    }
  });

  it('refuses a key that is not a route path', () => {
    for (const route of ['about', '', '/ab out', '/a\nb']) {
      assert.throws(
        () => parseManifest(JSON.stringify({ [route]: { updated: '2026-10-07', text: A } }), 'x'),
        /route/,
        JSON.stringify(route),
      );
    }
  });

  it('refuses an entry whose date is not a real day in YYYY-MM-DD', () => {
    for (const updated of ['2026-02-30', '2026-13-01', '7 October 2026', '2026-10-07T00:00:00Z']) {
      assert.throws(() => manifest({ '/': { updated, text: A } }), /updated/, updated);
    }
  });

  it('refuses an entry whose text is not a 16-digit hex fingerprint', () => {
    for (const text of ['abc', `${A}0`, 'AAAAAAAAAAAAAAAA', 'gggggggggggggggg']) {
      assert.throws(() => manifest({ '/': { updated: '2026-10-07', text } }), /text/, text);
    }
  });

  it('refuses an entry with a missing or an extra field', () => {
    assert.throws(() => parseManifest('{"/": {"updated": "2026-10-07"}}', 'x'), /text/);
    assert.throws(
      () => parseManifest(`{"/": {"updated": "2026-10-07", "text": "${A}", "title": "x"}}`, 'x'),
      /title/,
    );
    assert.throws(() => parseManifest('{"/": "2026-10-07"}', 'x'), /object/);
  });

  it('refuses a route listed twice, which JSON.parse would silently collapse', () => {
    const twice = `{\n  "/": {"updated":"2026-10-05","text":"${A}"},\n  "/": {"updated":"2026-10-06","text":"${B}"}\n}\n`;
    assert.throws(() => parseManifest(twice, 'x'), /"\/" twice/);
  });

  it('refuses a route listed twice when the first value is not an object', () => {
    const twice = `{\n  "/": "left by a conflict",\n  "/": {"updated":"2026-10-06","text":"${B}"}\n}\n`;
    assert.throws(() => parseManifest(twice, 'x'), /"\/" twice/);
  });

  it('refuses a field listed twice inside one entry', () => {
    const twice = `{\n  "/": {"updated":"2026-10-05","updated":"2026-10-06","text":"${A}"}\n}\n`;
    assert.throws(() => parseManifest(twice, 'x'), /"updated" twice/);
  });

  it('reads a key that merely contains an escaped quote or brace as one key', () => {
    const odd = `{\n  "/a\\"{": {"updated":"2026-10-05","text":"${A}"},\n  "/b": {"updated":"2026-10-05","text":"${A}"}\n}\n`;
    assert.deepEqual([...parseManifest(odd, 'x').keys()], ['/a"{', '/b']);
  });

  it('takes a year below 100 as written, not as 19xx', () => {
    // Date.UTC maps the years 0 to 99 onto 1900 to 1999, which made a real day "not a real day".
    const early = manifestText({ '/': { updated: '0099-12-31', text: A } });
    assert.equal(parseManifest(early, 'x').get('/')?.updated, '0099-12-31');
    assert.throws(
      () => parseManifest(manifestText({ '/': { updated: '0099-02-29', text: A } }), 'x'),
      /not a real day/,
    );
  });
});

describe('parseExceptions', () => {
  it('reads the route and the reason from a line that starts with the key', () => {
    assert.deepEqual(exceptionsIn('Content-Date-Exception: /about date moved to the merge day'), [
      { route: '/about', reason: 'date moved to the merge day', line: 1 },
    ]);
  });

  it('reads every exception in a body, with its line number', () => {
    const body = [
      '## Summary',
      '',
      'Content-Date-Exception: /work/a the three studies share UPDATED_AT',
      'Content-Date-Exception: /work/b the three studies share UPDATED_AT',
    ].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route, line }) => [route, line]),
      [
        ['/work/a', 3],
        ['/work/b', 4],
      ],
    );
  });

  it('reads a body with CRLF line endings, as GitHub stores a body typed in its editor', () => {
    const body = 'Summary\r\n\r\nContent-Date-Exception: /about date moved to the merge day\r\n';
    assert.deepEqual(exceptionsIn(body), [
      { route: '/about', reason: 'date moved to the merge day', line: 3 },
    ]);
  });

  it('reads a body with lone CR line endings too', () => {
    assert.deepEqual(
      exceptionsIn('x\rContent-Date-Exception: /about why').map((e) => e.line),
      [2],
    );
  });

  it('ignores the key anywhere but at the start of a line', () => {
    for (const body of [
      '  Content-Date-Exception: /about indented',
      '> Content-Date-Exception: /about quoted',
      '- Content-Date-Exception: /about listed',
      "PR_BODY='Content-Date-Exception: /about in a command'",
      '`Content-Date-Exception: /about` in code',
      'see Content-Date-Exception: /about mid-line',
    ]) {
      assert.deepEqual(exceptionsIn(body), [], body);
    }
  });

  it('ignores an example in a fenced code block, and reads the lines after the fence', () => {
    const body = [
      '```',
      'Content-Date-Exception: <route> <reason>',
      '```',
      '~~~~ text',
      'Content-Date-Exception: /work inside tildes',
      '~~~',
      'Content-Date-Exception: /work still inside: a shorter fence does not close it',
      '~~~~',
      '  ```',
      'Content-Date-Exception: /work inside an indented fence',
      '  ```',
      'Content-Date-Exception: /about after the fences',
    ].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route, line }) => [route, line]),
      [['/about', 12]],
    );
  });

  it('ignores everything after a fence that never closes, as GitHub renders it', () => {
    assert.deepEqual(exceptionsIn('```\nContent-Date-Exception: /about why'), []);
  });

  it('ignores a line inside an HTML comment, which the rendered body hides from a reviewer', () => {
    const body = [
      '<!-- hidden',
      'Content-Date-Exception: /work hidden',
      '-->',
      '<!-- one line --> <!-- and another',
      'Content-Date-Exception: /work hidden too',
      'still hidden --> visible again',
      'Content-Date-Exception: /about shown <!-- a note that opens a comment',
      'Content-Date-Exception: /work hidden by the note',
    ].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route, line }) => [route, line]),
      [['/about', 7]],
    );
  });

  it('does not take a comment marker in inline code for a comment', () => {
    const body = [
      'Hide a note with `<!--` and `-->`, or with ``<!-- like this``.',
      '',
      'Content-Date-Exception: /about shown after the code span',
    ].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route }) => route),
      ['/about'],
    );
  });

  it('closes a comment opened mid-paragraph at the end of that paragraph', () => {
    // An inline comment cannot outlive its paragraph: unclosed, GitHub shows `<!--` as text.
    const body = [
      'A paragraph that mentions <!-- without closing it',
      'Content-Date-Exception: /work treated as hidden, the safe side',
      '',
      'Content-Date-Exception: /about in the next paragraph',
    ].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route, line }) => [route, line]),
      [['/about', 4]],
    );
  });

  it('keeps a comment that starts a line open across blank lines until it closes', () => {
    const body = [
      '<!-- a template note',
      '',
      'Content-Date-Exception: /work hidden',
      '',
      '-->',
      'Content-Date-Exception: /about shown',
    ].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route }) => route),
      ['/about'],
    );
  });

  it('reads <!--> and <!---> as comments that close themselves', () => {
    for (const empty of ['<!-->', '<!--->']) {
      const body = `${empty}\nContent-Date-Exception: /about shown`;
      assert.deepEqual(
        exceptionsIn(body).map(({ route }) => route),
        ['/about'],
        empty,
      );
    }
  });

  it('does not take three backticks with a backtick after them for a fence', () => {
    // CommonMark: a backtick fence's info string may not contain a backtick, so this is code.
    const body = ['```code``` mid-line', 'Content-Date-Exception: /about shown'].join('\n');
    assert.deepEqual(
      exceptionsIn(body).map(({ route }) => route),
      ['/about'],
    );
    // A tilde fence's info string may hold a backtick.
    assert.deepEqual(exceptionsIn('~~~ `x`\nContent-Date-Exception: /about hidden'), []);
  });

  it('reads a line that holds U+2028, and a body that starts with a byte order mark', () => {
    assert.deepEqual(
      exceptionsIn('Content-Date-Exception: /about why more').map(({ route }) => route),
      ['/about'],
    );
    assert.deepEqual(
      exceptionsIn('﻿Content-Date-Exception: /about why').map(({ route }) => route),
      ['/about'],
    );
  });

  it('reads a route written in backticks, or with a trailing slash or punctuation', () => {
    for (const [written, route] of [
      ['`/about`', '/about'],
      ['`/about`,', '/about'],
      ['/about/', '/about'],
      ['/about,', '/about'],
      ['/about;', '/about'],
      ['/about.', '/about'],
      ['/', '/'],
      ['`/`', '/'],
    ]) {
      assert.deepEqual(
        exceptionsIn(`Content-Date-Exception: ${written} why`).map((e) => [e.route, e.reason]),
        [[route, 'why']],
        written,
      );
    }
    // Letter case is part of a route.
    assert.deepEqual(
      exceptionsIn('Content-Date-Exception: /About why').map((e) => e.route),
      ['/About'],
    );
  });

  it('reads the key in any letter case, as git reads a trailer key', () => {
    assert.deepEqual(
      exceptionsIn('content-date-exception: /about why').map((e) => e.route),
      ['/about'],
    );
  });

  it('ignores a key spelled differently or without its colon', () => {
    for (const body of [
      'Content-Date-Exceptions: /about why',
      'Content-Date-Exception /about why',
      'Content-Date-Exception : /about why',
    ]) {
      assert.deepEqual(exceptionsIn(body), [], body);
    }
  });

  it('drops one separator between the route and the reason', () => {
    for (const body of [
      'Content-Date-Exception: /about - why',
      'Content-Date-Exception: /about — why',
      'Content-Date-Exception: /about: why',
      'Content-Date-Exception:/about   why  ',
    ]) {
      assert.deepEqual(
        exceptionsIn(body).map(({ route, reason }) => [route, reason]),
        [['/about', 'why']],
        body,
      );
    }
  });

  it('keeps an exception with no reason or no route, for the comparison to refuse', () => {
    assert.deepEqual(exceptionsIn('Content-Date-Exception: /about'), [
      { route: '/about', reason: '', line: 1 },
    ]);
    assert.deepEqual(exceptionsIn('Content-Date-Exception: /about -'), [
      { route: '/about', reason: '', line: 1 },
    ]);
    assert.deepEqual(exceptionsIn('Content-Date-Exception:   '), [
      { route: '', reason: '', line: 1 },
    ]);
  });

  it('reads nothing from an empty or missing body', () => {
    assert.deepEqual(exceptionsIn(''), []);
    assert.deepEqual(parseExceptions(undefined), []);
  });
});

describe('compareManifests', () => {
  it('passes when nothing moved', () => {
    const result = compareManifests(BASE, BASE, []);
    assert.equal(result.ok, true);
    assert.equal(result.compared, 3);
    assert.deepEqual(result.findings, []);
  });

  it('passes when a route moved its text and its date forward together', () => {
    const result = compareManifests(
      BASE,
      withRoute('/about', { updated: '2026-10-08', text: B }),
      [],
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
  });

  it('fails a route whose text moved without its date, naming the route', () => {
    const result = compareManifests(
      BASE,
      withRoute('/about', { updated: '2026-10-07', text: B }),
      [],
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.findings.map(({ route, excused }) => [route, excused]),
      [['/about', false]],
    );
    assert.match(result.findings[0].problems.join(' '), /served text changed.*2026-10-07/);
  });

  it('fails a route whose date moved without its text, naming the route', () => {
    const result = compareManifests(
      BASE,
      withRoute('/work', { updated: '2026-10-08', text: A }),
      [],
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.findings.map(({ route }) => route),
      ['/work'],
    );
    assert.match(
      result.findings[0].problems.join(' '),
      /2026-10-05 to 2026-10-08.*served text did not change/,
    );
  });

  it('fails a date that moved backwards, even with the text', () => {
    const result = compareManifests(
      BASE,
      withRoute('/about', { updated: '2026-10-06', text: B }),
      [],
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings[0].problems.length, 1);
    assert.match(result.findings[0].problems[0], /backwards, from 2026-10-07 to 2026-10-06/);
  });

  it('gives a date moved backwards without the text both problems', () => {
    const result = compareManifests(
      BASE,
      withRoute('/about', { updated: '2026-10-01', text: A }),
      [],
    );
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].problems.length, 2);
  });

  it('names every route out of step, in manifest order', () => {
    const head = new Map(BASE);
    head.set('/', { updated: '2026-10-05', text: B });
    head.set('/work', { updated: '2026-10-09', text: A });
    const result = compareManifests(BASE, head, []);
    assert.deepEqual(
      result.findings.map(({ route }) => route),
      ['/', '/work'],
    );
  });

  it('passes a route that is only at the head, and lists it as new', () => {
    const head = new Map(BASE);
    head.set('/blog/first-post', { updated: '2026-10-10', text: C });
    const result = compareManifests(BASE, head, []);
    assert.equal(result.ok, true);
    assert.deepEqual(result.added, ['/blog/first-post']);
    assert.equal(result.compared, 3);
  });

  it('passes a route that is only at the merge base, and lists it as removed', () => {
    const head = new Map(BASE);
    head.delete('/work');
    const result = compareManifests(BASE, head, []);
    assert.equal(result.ok, true);
    assert.deepEqual(result.removed, ['/work']);
    assert.equal(result.compared, 2);
  });

  it('passes with no manifest at the merge base, comparing nothing', () => {
    const result = compareManifests(null, BASE, []);
    assert.equal(result.ok, true);
    assert.equal(result.baseMissing, true);
    assert.equal(result.compared, 0);
    assert.deepEqual(result.added, []);
  });

  it('excuses a route out of step that an exception names, and marks it needed', () => {
    const head = withRoute('/about', { updated: '2026-10-08', text: A });
    const result = compareManifests(
      BASE,
      head,
      exceptionsIn('Content-Date-Exception: /about date moved to the merge day'),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.findings.map(({ route, excused }) => [route, excused]),
      [['/about', true]],
    );
    assert.deepEqual(result.exceptions, [
      { route: '/about', reason: 'date moved to the merge day', line: 1, needed: true },
    ]);
  });

  it('excuses a date moved backwards as well', () => {
    const head = withRoute('/about', { updated: '2026-10-01', text: B });
    const result = compareManifests(
      BASE,
      head,
      exceptionsIn('Content-Date-Exception: /about the post went back to draft'),
    );
    assert.equal(result.ok, true);
  });

  it('lists an exception no route needed, and still passes', () => {
    const result = compareManifests(BASE, BASE, exceptionsIn('Content-Date-Exception: /work why'));
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.exceptions.map(({ route, needed }) => [route, needed]),
      [['/work', false]],
    );
  });

  it('excuses only the route an exception names', () => {
    const head = new Map(BASE);
    head.set('/about', { updated: '2026-10-08', text: A });
    head.set('/work', { updated: '2026-10-08', text: A });
    const result = compareManifests(BASE, head, exceptionsIn('Content-Date-Exception: /work why'));
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.findings.map(({ route, excused }) => [route, excused]),
      [
        ['/about', false],
        ['/work', true],
      ],
    );
  });

  it('fails an exception that gives no reason, and excuses nothing with it', () => {
    const head = withRoute('/about', { updated: '2026-10-08', text: A });
    const result = compareManifests(BASE, head, exceptionsIn('Content-Date-Exception: /about'));
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].excused, false);
    assert.equal(result.invalid.length, 1);
    assert.match(result.invalid[0], /line 1.*\/about.*no reason/);
  });

  it('fails an exception that names a route the head manifest does not list', () => {
    // `/about/` reads as /about, but letter case is part of a route.
    for (const route of ['/abuot', '/About', '/work']) {
      const head = new Map(BASE);
      head.delete('/work');
      const result = compareManifests(
        BASE,
        head,
        exceptionsIn(`Content-Date-Exception: ${route} why`),
      );
      assert.equal(result.ok, false, route);
      assert.match(result.invalid[0], /does not list/, route);
    }
  });

  it('fails an exception that names no route', () => {
    const result = compareManifests(BASE, BASE, exceptionsIn('Content-Date-Exception:'));
    assert.equal(result.ok, false);
    assert.match(result.invalid[0], /names no route/);
  });

  it('checks the exceptions when the merge base has no manifest too', () => {
    const result = compareManifests(null, BASE, exceptionsIn('Content-Date-Exception: /nope why'));
    assert.equal(result.ok, false);
  });
});

describe('formatReport', () => {
  const context = { head: 'abc1234', mergeBase: 'def5678' };

  it('prints every exception as "Exception: <route> - <reason> (needed|not needed)"', () => {
    const head = withRoute('/about', { updated: '2026-10-08', text: A });
    const body = [
      'Content-Date-Exception: /about date moved to the merge day',
      'Content-Date-Exception: /work nothing to excuse',
    ].join('\n');
    const lines = formatReport(compareManifests(BASE, head, exceptionsIn(body)), context);
    assert.ok(
      lines.includes('Exception: /about - date moved to the merge day (needed)'),
      lines.join('\n'),
    );
    assert.ok(
      lines.includes('Exception: /work - nothing to excuse (not needed)'),
      lines.join('\n'),
    );
  });

  it('names a route out of step at the start of its line, and says how to fix it', () => {
    const head = withRoute('/about', { updated: '2026-10-07', text: B });
    const text = formatReport(compareManifests(BASE, head, []), context).join('\n');
    assert.match(text, /^\/about: its served text changed/m);
    assert.match(text, /content-dates:update/);
    assert.match(text, /Content-Date-Exception: <route> <reason>/);
  });

  it('marks an excused route as excused', () => {
    const head = withRoute('/about', { updated: '2026-10-08', text: A });
    const text = formatReport(
      compareManifests(BASE, head, exceptionsIn('Content-Date-Exception: /about why')),
      context,
    ).join('\n');
    assert.match(text, /^\/about: .*\(excused\)$/m);
  });

  it('ends a pass by saying whether an exception carried it', () => {
    const paired = withRoute('/about', { updated: '2026-10-08', text: B });
    const clean = formatReport(compareManifests(BASE, paired, []), context);
    assert.equal(clean.at(-1), 'Every route compared moves its content date with its served text.');

    const dateOnly = withRoute('/about', { updated: '2026-10-08', text: A });
    const excused = formatReport(
      compareManifests(BASE, dateOnly, exceptionsIn('Content-Date-Exception: /about why')),
      context,
    );
    assert.equal(
      excused.at(-1),
      'Every route compared moves its content date with its served text, or has an exception.',
    );

    const first = formatReport(compareManifests(null, BASE, []), context);
    assert.equal(first.length, 1, first.join('\n'));
  });

  it('lists new and removed routes, and the commits it compared', () => {
    const head = new Map(BASE);
    head.delete('/work');
    head.set('/blog/first-post', { updated: '2026-10-10', text: C });
    const text = formatReport(compareManifests(BASE, head, []), context).join('\n');
    assert.match(text, /abc1234/);
    assert.match(text, /def5678/);
    assert.match(text, /^New route: \/blog\/first-post$/m);
    assert.match(text, /^Removed route: \/work$/m);
  });

  it('gives a notice when the merge base has no manifest', () => {
    const text = formatReport(compareManifests(null, BASE, []), context).join('\n');
    assert.match(text, /^Notice: .*def5678.*no apps\/web\/src\/data\/content-dates\.json/m);
  });

  it('never starts a line with text from the pull request body', () => {
    // GitHub reads a line that starts with `::` as a workflow command.
    const body = 'Content-Date-Exception: ::error::forged reason';
    const lines = formatReport(compareManifests(BASE, BASE, exceptionsIn(body)), context);
    for (const line of lines) assert.doesNotMatch(line, /^::/, line);
  });

  it('escapes control characters in text from the pull request body', () => {
    // An escape sequence in the log can recolour, hide or overwrite what a reviewer audits.
    const body = [
      'Content-Date-Exception: /about red \u001b[31mtext\u0008 and a bell\u0007',
      'Content-Date-Exception: /ab\u001b[8mout hidden route',
    ].join('\n');
    const lines = formatReport(compareManifests(BASE, BASE, exceptionsIn(body)), context);
    const text = lines.join('\n');
    assert.doesNotMatch(text, /\p{Cc}(?<!\n)/u, text);
    assert.ok(
      lines.includes('Exception: /about - red \\x1b[31mtext\\x08 and a bell\\x07 (not needed)'),
      text,
    );
    assert.match(text, /names \/ab\\x1b\[8mout, which/);
  });

  it('says to put a date back when the date moved without the text or backwards', () => {
    const dateOnly = withRoute('/about', { updated: '2026-10-08', text: A });
    const text = formatReport(compareManifests(BASE, dateOnly, []), context).join('\n');
    assert.match(text, /put its content date back/);
    assert.doesNotMatch(text, /content-dates:update/);
  });

  it('says to move the date when the text moved, and names the same-day case', () => {
    const copyOnly = withRoute('/about', { updated: '2026-10-07', text: B });
    const text = formatReport(compareManifests(BASE, copyOnly, []), context).join('\n');
    assert.match(text, /content-dates:update/);
    assert.match(text, /already the day of this change/);
    assert.doesNotMatch(text, /put its content date back/);
  });
});

describe('the command', () => {
  // A throwaway repository, hermetic: no user or system git config (signing, hooks, templates), and
  // git may not walk up out of the scratch directory into this one.
  /** @type {Record<string, string>} */
  const sha = {};
  /** @type {Record<string, string>} */
  const events = {};
  let scratch = '';
  let repo = '';

  const baseEnv = () => ({
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: scratch,
  });

  /** @param {...string} args */
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'init.defaultBranch=main',
        ...args,
      ],
      { cwd: repo, env: baseEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();

  /**
   * Commits on `branch`, which starts at `from` when it does not exist yet.
   *
   * @param {string} branch
   * @param {string | null} from
   * @param {Record<string, string | null>} files a null deletes the file
   * @param {string} message
   */
  const commit = (branch, from, files, message) => {
    if (from) git('switch', '-q', '-C', branch, from);
    for (const [path, text] of Object.entries(files)) {
      if (text === null) git('rm', '-q', path);
      else {
        mkdirSync(dirname(join(repo, path)), { recursive: true });
        writeFileSync(join(repo, path), text);
      }
    }
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  /** @param {Record<string, { updated: string, text: string }>} changes */
  const fixtureManifest = (changes = {}) =>
    manifestText({
      '/': { updated: '2026-10-05', text: A },
      '/about': { updated: '2026-10-07', text: A },
      '/work': { updated: '2026-10-05', text: A },
      ...changes,
    });

  before(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'check-content-dates-')));
    repo = join(scratch, 'repo');
    mkdirSync(repo);
    git('init', '-q');
    // Before the manifest existed.
    sha.empty = commit('main', null, { 'README.md': '# fixture\n' }, 'before the manifest');
    // A pull request opened before the manifest landed, which adds it.
    sha.adds = commit('adds', sha.empty, { [MANIFEST_PATH]: fixtureManifest() }, 'add it');
    // The manifest lands on main.
    sha.base = commit('main', sha.empty, { [MANIFEST_PATH]: fixtureManifest() }, 'manifest');
    // A branch that moves /about's copy and date together.
    sha.paired = commit(
      'paired',
      sha.base,
      { [MANIFEST_PATH]: fixtureManifest({ '/about': { updated: '2026-10-08', text: B } }) },
      'copy and date',
    );
    // main moves on after the branch forked: /work's copy and date, so /work at the branch is
    // behind main's. Compared with main's tip rather than the merge base, the branch would seem to
    // move /work's date backwards.
    sha.mainAhead = commit(
      'main',
      sha.base,
      { [MANIFEST_PATH]: fixtureManifest({ '/work': { updated: '2026-10-09', text: C } }) },
      'main moves on',
    );
    sha.copyOnly = commit(
      'copy-only',
      sha.base,
      { [MANIFEST_PATH]: fixtureManifest({ '/about': { updated: '2026-10-07', text: B } }) },
      'copy without date',
    );
    sha.noManifest = commit('no-manifest', sha.base, { [MANIFEST_PATH]: null }, 'drop it');
    sha.malformed = commit('malformed', sha.base, { [MANIFEST_PATH]: '{ "/": ' }, 'break it');
    git('switch', '-q', '--orphan', 'orphan');
    sha.orphan = commit('orphan', null, { [MANIFEST_PATH]: fixtureManifest() }, 'orphan root');
    // A merge base whose manifest is malformed, and a head that repairs it.
    sha.malformedBase = commit('broken-base', sha.empty, { [MANIFEST_PATH]: '{ "/": ' }, 'broken');
    sha.repaired = commit(
      'repaired',
      sha.malformedBase,
      { [MANIFEST_PATH]: fixtureManifest() },
      'fix',
    );
    // The manifest's path as a directory, and as a symbolic link.
    sha.directory = commit(
      'directory',
      sha.base,
      { [MANIFEST_PATH]: null, [`${MANIFEST_PATH}/inner.json`]: '{}\n' },
      'a directory',
    );
    git('switch', '-q', '-C', 'symlink', sha.base);
    git('rm', '-q', MANIFEST_PATH);
    mkdirSync(dirname(join(repo, MANIFEST_PATH)), { recursive: true });
    symlinkSync('../../../../README.md', join(repo, MANIFEST_PATH));
    git('add', '-A');
    git('commit', '-q', '-m', 'a symbolic link');
    sha.symlink = git('rev-parse', 'HEAD');
    // main moves on again with a date-only change to /, which its own pull request excused. The
    // paired branch then merges main. Its event's base SHA can still be sha.base, from before main
    // moved: against that, the merged branch seems to move the date of / itself.
    sha.dateOnlyMain = commit(
      'main',
      sha.mainAhead,
      {
        [MANIFEST_PATH]: fixtureManifest({
          '/': { updated: '2026-10-06', text: A },
          '/work': { updated: '2026-10-09', text: C },
        }),
      },
      'date only, excused on its own pull request',
    );
    git('switch', '-q', '-C', 'merged-main', sha.paired);
    writeFileSync(
      join(repo, MANIFEST_PATH),
      fixtureManifest({
        '/': { updated: '2026-10-06', text: A },
        '/about': { updated: '2026-10-08', text: B },
        '/work': { updated: '2026-10-09', text: C },
      }),
    );
    git('add', '-A');
    const tree = git('write-tree');
    sha.mergedMain = git(
      'commit-tree',
      tree,
      '-p',
      sha.paired,
      '-p',
      sha.dateOnlyMain,
      '-m',
      'merge main',
    );
    git('reset', '-q', '--hard', sha.mergedMain);
    git('switch', '-q', 'main');
    // The event payload GitHub writes for a pull request, which the workflow passes with --event.
    events.copyFix = join(scratch, 'event-copy-fix.json');
    writeFileSync(
      events.copyFix,
      JSON.stringify({
        pull_request: {
          body: '## Summary\r\n\r\nContent-Date-Exception: /about copy fix only\r\n',
        },
      }),
    );
    events.nullBody = join(scratch, 'event-null-body.json');
    writeFileSync(events.nullBody, JSON.stringify({ pull_request: { body: null } }));
    events.push = join(scratch, 'event-push.json');
    writeFileSync(events.push, JSON.stringify({ ref: 'refs/heads/main' }));
    events.broken = join(scratch, 'event-broken.json');
    writeFileSync(events.broken, '{ "pull_request": ');
  });

  after(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  /**
   * @param {string[]} args
   * @param {{
   *   body?: string,
   *   cwd?: string,
   *   entry?: string,
   *   env?: Record<string, string>,
   *   nodeArgs?: string[],
   * }} [options]
   */
  const run = (args, { body, cwd = repo, entry = script, env = {}, nodeArgs = [] } = {}) =>
    spawnSync(process.execPath, [...nodeArgs, entry, ...args], {
      cwd,
      env: { ...baseEnv(), ...(body === undefined ? {} : { PR_BODY: body }), ...env },
      encoding: 'utf8',
    });

  /** @param {ReturnType<typeof run>} result */
  const output = (result) => `exit ${result.status}\n${result.stdout}${result.stderr}`;

  it('compares the head with the merge base, not with the tip of the base branch', () => {
    const result = run(['--base', sha.mainAhead, '--head', sha.paired]);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, new RegExp(`merge base ${sha.base.slice(0, 7)}`));
    assert.doesNotMatch(result.stdout, /\/work/);
  });

  it('exits 1 for copy that moved without its date, naming the route', () => {
    const result = run(['--base', sha.mainAhead, '--head', sha.copyOnly]);
    assert.equal(result.status, 1, output(result));
    assert.match(result.stdout, /^\/about: its served text changed/m);
  });

  it('exits 0 for the same commit with an exception in a CRLF body, and lists it', () => {
    const body = '## Summary\r\n\r\nContent-Date-Exception: /about copy fix only\r\n';
    const result = run(['--base', sha.mainAhead, '--head', sha.copyOnly], { body });
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /^Exception: \/about - copy fix only \(needed\)$/m);
  });

  it('exits 1 for an exception that names a route the head does not list', () => {
    const body = 'Content-Date-Exception: /abuot typo';
    const result = run(['--base', sha.base, '--head', sha.paired], { body });
    assert.equal(result.status, 1, output(result));
    assert.match(result.stdout, /\/abuot/);
  });

  it('exits 0 with a notice when the merge base has no manifest', () => {
    const result = run(['--base', sha.empty, '--head', sha.adds]);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /^Notice: /m);
  });

  it('exits 2 when the head has no manifest', () => {
    const result = run(['--base', sha.base, '--head', sha.noManifest]);
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /no apps\/web\/src\/data\/content-dates\.json/);
  });

  it('exits 2 when the head manifest is malformed', () => {
    const result = run(['--base', sha.base, '--head', sha.malformed]);
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /could not run/);
  });

  it('exits 2 when the two commits share no history', () => {
    const result = run(['--base', sha.base, '--head', sha.orphan]);
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /merge base/);
  });

  it('exits 2 for a revision that is not a commit in this repository', () => {
    for (const revision of ['0123456789abcdef0123456789abcdef01234567', 'no-such-branch']) {
      const result = run(['--base', revision, '--head', sha.paired]);
      assert.equal(result.status, 2, output(result));
      assert.match(result.stderr, new RegExp(revision));
    }
  });

  it('exits 2 outside a git repository', () => {
    const outside = join(scratch, 'not-a-repository');
    mkdirSync(outside, { recursive: true });
    const result = run(['--base', 'HEAD'], { cwd: outside });
    assert.equal(result.status, 2, output(result));
  });

  it('exits 2 on a usage error', () => {
    for (const args of [
      [],
      ['--head', sha.paired],
      ['--base'],
      ['--base', ''],
      ['--base', '--head', sha.paired],
      ['--base', sha.base, '--base', sha.base],
      ['--base', sha.base, '--verbose'],
      ['--base', sha.base, 'extra'],
      ['--base', sha.base, '--event'],
      ['--base', sha.base, '--event', events.push, '--event', events.push],
    ]) {
      const result = run(args);
      assert.equal(result.status, 2, `${JSON.stringify(args)}\n${output(result)}`);
      assert.match(result.stderr, /usage:/, JSON.stringify(args));
    }
  });

  it('takes HEAD when --head is left out, and accepts the -- that pnpm passes on', () => {
    git('switch', '-q', 'copy-only');
    try {
      const result = run(['--', '--base', sha.base]);
      assert.equal(result.status, 1, output(result));
      assert.match(result.stdout, /^\/about: /m);
    } finally {
      git('switch', '-q', 'main');
    }
  });

  it('runs from a subdirectory of the repository', () => {
    const result = run(['--base', sha.base, '--head', sha.copyOnly], {
      cwd: join(repo, 'apps', 'web'),
    });
    assert.equal(result.status, 1, output(result));
  });

  it('compares with the base branch as it is, which a stale base SHA would not', () => {
    // The merged branch carries main's excused date-only change to /. Against the stale base, its
    // merge base is from before that change, which is then counted against this pull request.
    const stale = run(['--base', sha.base, '--head', sha.mergedMain]);
    assert.equal(stale.status, 1, output(stale));
    assert.match(stale.stdout, /^\/: its content date moved/m);
    const fresh = run(['--base', sha.dateOnlyMain, '--head', sha.mergedMain]);
    assert.equal(fresh.status, 0, output(fresh));
    assert.match(fresh.stdout, new RegExp(`merge base ${sha.dateOnlyMain.slice(0, 7)}`));
  });

  it('exits 2 when the manifest at the merge base is malformed', () => {
    const result = run(['--base', sha.malformedBase, '--head', sha.repaired]);
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /at the merge base is not JSON/);
  });

  it('exits 2 when the manifest is a directory', () => {
    const result = run(['--base', sha.base, '--head', sha.directory]);
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /is a tree, not a file/);
  });

  it('exits 2 when the manifest is a symbolic link, and says so', () => {
    const result = run(['--base', sha.base, '--head', sha.symlink]);
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /is a symbolic link, not a file/);
  });

  it('exits 2, not 1, when something other than the check fails', () => {
    // git's output in an unexpected shape: a TypeError, not a CheckError. Exit 1 would read as a
    // route out of step.
    const preload = [
      "import childProcess from 'node:child_process';",
      "import { syncBuiltinESMExports } from 'node:module';",
      'childProcess.execFileSync = () => undefined;',
      'syncBuiltinESMExports();',
    ].join('\n');
    const result = run(['--base', sha.base, '--head', sha.copyOnly], {
      nodeArgs: ['--import', `data:text/javascript,${encodeURIComponent(preload)}`],
    });
    assert.equal(result.status, 2, output(result));
    assert.match(result.stderr, /could not run: .*TypeError/s);
  });

  it('can be imported with any argument after it, without running or crashing', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(script).href)})`,
        'not-a-path',
      ],
      { cwd: repo, env: baseEnv(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, output(result));
    assert.equal(result.stdout, '');
  });

  it('reads the body from the event payload with --event, ignoring PR_BODY', () => {
    const args = ['--base', sha.mainAhead, '--head', sha.copyOnly];
    const result = run([...args, '--event', events.copyFix], {
      body: 'Content-Date-Exception: /work not this one',
    });
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /^Exception: \/about - copy fix only \(needed\)$/m);
    assert.doesNotMatch(result.stdout, /not this one/);

    const empty = run([...args, '--event', events.nullBody]);
    assert.equal(empty.status, 1, output(empty));
  });

  it('exits 2 for an event that is not a pull request, or that it cannot read', () => {
    for (const event of [events.push, events.broken, join(scratch, 'no-such-event.json')]) {
      const result = run(['--base', sha.base, '--head', sha.paired, '--event', event]);
      assert.equal(result.status, 2, `${event}\n${output(result)}`);
      assert.match(result.stderr, /could not run: .*event/, event);
    }
  });

  it('in GitHub Actions, stops workflow commands around the report and annotates findings', () => {
    // The runner reads `##[command]` anywhere in a line, so a reason could forge an annotation or
    // mask log text; nothing is a command between stop-commands and its token.
    const body = 'Content-Date-Exception: /work ##[error]forged ::warning::too';
    const result = run(['--base', sha.mainAhead, '--head', sha.copyOnly], {
      body,
      env: { GITHUB_ACTIONS: 'true' },
    });
    assert.equal(result.status, 1, output(result));
    const lines = result.stdout.trimEnd().split('\n');
    const stop = /^::stop-commands::([0-9a-f-]{36})$/.exec(lines[0]);
    assert.ok(stop, lines[0]);
    const resume = lines.indexOf(`::${stop[1]}::`);
    assert.ok(resume > 0, result.stdout);
    assert.ok(
      lines.slice(0, resume).some((line) => line.includes('##[error]forged')),
      result.stdout,
    );
    assert.deepEqual(lines.slice(resume + 1), [
      '::error title=Content dates::/about: its served text and its content date moved apart; ' +
        'the job log says how to fix it',
    ]);

    const outside = run(['--base', sha.mainAhead, '--head', sha.copyOnly], { body });
    assert.doesNotMatch(outside.stdout, /stop-commands|^::error/m);
  });

  it('in GitHub Actions, annotates an invalid exception without quoting the body', () => {
    const result = run(['--base', sha.base, '--head', sha.paired], {
      body: 'Content-Date-Exception: /abuot typo',
      env: { GITHUB_ACTIONS: 'true' },
    });
    assert.equal(result.status, 1, output(result));
    assert.match(
      result.stdout,
      /^::error title=Content dates::An exception in the pull request body is invalid; the job log names it$/m,
    );
    assert.doesNotMatch(result.stdout, /^::error.*abuot/m);
  });

  it('in GitHub Actions, raises the missing merge-base manifest as a notice', () => {
    const result = run(['--base', sha.empty, '--head', sha.adds], {
      env: { GITHUB_ACTIONS: 'true' },
    });
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /^::notice title=Content dates::The merge base has no /m);
  });

  it('still runs when invoked through a symlinked path', () => {
    // Node resolves symlinks in import.meta.url but not in process.argv[1]: compared plainly, the
    // command would decide it was imported, skip main() and exit 0 having checked nothing.
    const linked = join(scratch, 'linked-scripts');
    symlinkSync(here, linked, 'dir');
    const result = run(['--base', sha.base, '--head', sha.copyOnly], {
      entry: join(linked, 'check-content-dates.mjs'),
    });
    assert.equal(result.status, 1, output(result));
  });
});

describe('.github/workflows/content-dates.yml', () => {
  const lines = workflow.split('\n');

  it('is named Content dates, as is its one job', () => {
    assert.ok(lines.includes('name: Content dates'));
    assert.deepEqual(
      lines.filter((line) => /^ {4}name: /.test(line)),
      ['    name: Content dates'],
    );
  });

  it('runs on every pull request event that can change the head, the base or the body', () => {
    assert.ok(lines.includes('  pull_request:'));
    assert.ok(lines.includes('    types: [opened, edited, synchronize, reopened]'));
    assert.doesNotMatch(workflow, /^\s+(paths|paths-ignore|branches|branches-ignore):/m);
  });

  it('reads the repository and nothing else', () => {
    assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m);
    assert.doesNotMatch(workflow, /: write\b/);
  });

  it('cancels superseded runs on pull requests only', () => {
    assert.ok(lines.includes("  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
  });

  it('pins every action to a commit SHA', () => {
    const uses = lines.filter((line) => /^\s+(- )?uses: /.test(line));
    assert.ok(uses.length > 0);
    for (const line of uses) assert.match(line, /@[0-9a-f]{40} # v\d/, line.trim());
  });

  it('fetches the whole history, which the merge base needs', () => {
    assert.match(workflow, /fetch-depth: 0/);
  });

  it('installs nothing: the check uses Node built-ins only', () => {
    const code = lines.filter((line) => !/^\s*#/.test(line)).join('\n');
    assert.doesNotMatch(code, /pnpm|npm (ci|install)|yarn|cache:/);
    const source = readFileSync(script, 'utf8');
    const specifiers = [...source.matchAll(/\bfrom\s+'([^']+)'|^import\s+'([^']+)'/gm)].map(
      (match) => match[1] ?? match[2],
    );
    assert.ok(specifiers.length > 0, 'no import found in the script');
    for (const specifier of specifiers) assert.match(specifier, /^node:/, specifier);
  });

  it('reads the body from the event payload, and never interpolates it into the script', () => {
    // The body is attacker-controlled input: interpolated into `run`, it would be shell code. In
    // the environment, a body of multi-byte text near GitHub's limit outgrows one variable's
    // 128 KiB on Linux and fails the step before the script starts.
    const run = lines.filter((line) => /^\s+run: /.test(line));
    assert.deepEqual(
      run.map((line) => line.trim()),
      [
        'run: node scripts/check-content-dates.mjs --base "origin/$BASE_REF" --head "$HEAD_SHA" --event "$GITHUB_EVENT_PATH"',
      ],
    );
    assert.doesNotMatch(workflow, /pull_request\.body/);
    assert.doesNotMatch(workflow, /PR_BODY:/);
    assert.ok(lines.includes('          BASE_REF: ${{ github.base_ref }}'));
    assert.ok(lines.includes('          HEAD_SHA: ${{ github.event.pull_request.head.sha }}'));
    assert.doesNotMatch(workflow, /continue-on-error/);
  });

  it('compares with the base branch as fetched, not the event payload base SHA', () => {
    // The payload's base SHA can lag the branch: a head that has merged newer base commits would
    // then be charged with their changes.
    assert.doesNotMatch(workflow, /base\.sha/);
  });

  it('keeps the token out of .git/config while it runs code from the pull request', () => {
    assert.match(workflow, /^ {10}persist-credentials: false$/m);
  });

  it('runs the same command as the root package script', () => {
    assert.equal(
      rootPackage.scripts['check:content-dates'],
      'node scripts/check-content-dates.mjs',
    );
  });
});

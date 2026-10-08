#!/usr/bin/env node
// Checks that a pull request moves each route's content date with its served text (#191).
//
// The rule has been prose since #56: the commit that changes what a page visibly says bumps its
// content date, and no other commit does. The dates are the sitemap's `lastmod`, the case studies'
// TechArticle dates and /about's `dateModified`, so a copy change without a bump makes all of them
// claim the page is older than it is, and a bump without one claims a change that did not happen.
//
// apps/web/src/data/content-dates.json holds one line per route: its content date (`updated`, the
// sitemap's `lastmod`) and a fingerprint of the text it serves (`text`). The unit suite renders
// every route and fails when the file disagrees, so a pull request that passes `pnpm test` carries a
// true manifest. Comments, types and formatting cannot move a fingerprint, and a date bump alone
// moves only `updated` (apps/web/src/data/__tests__/content-dates.test.tsx proves both). This
// script reads the file at the pull request's head and at its merge base, and for every route in
// both it fails when
//
//   1. the text changed and the date did not;
//   2. the date changed and the text did not;
//   3. the date moved backwards.
//
// A route only at the head is new and a route only at the merge base was removed: each is listed
// and passes. A merge base with no manifest (a branch from before the file existed) passes with a
// notice, having nothing to compare.
//
// The escape is a line in the pull request body, `Content-Date-Exception: <route> <reason>`, read
// from the PR_BODY environment variable: a reviewer reads it in the body, and the output lists every
// one, needed or not. It excuses every finding on its route. An exception that names a route the
// head manifest does not list, or gives no reason, fails the check.
//
// Run with `pnpm check:content-dates -- --base <rev> [--head <rev>]` (HEAD when left out); CI's
// `Content dates` workflow passes the pull request's base and head SHAs. Exit codes follow
// scripts/check-adr-index.mjs: 0 in step, 1 out of step, 2 when the check could not run (no or a
// malformed manifest at the head, a revision git cannot resolve, no merge base, a usage error). It
// never exits 0 because it could not see, and it uses Node built-ins only, so the workflow installs
// nothing. See docs/adr/0035-content-dates-move-with-served-text.md.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Where the unit suite writes the manifest, relative to the repository root. */
export const MANIFEST_PATH = 'apps/web/src/data/content-dates.json';

/** The key of an exception line in a pull request body. */
export const EXCEPTION_KEY = 'Content-Date-Exception';

const USAGE = 'usage: node scripts/check-content-dates.mjs --base <rev> [--head <rev>]';

/** A route path: a leading slash, then no whitespace or control character. */
const ROUTE = /^\/[^\s\p{Cc}]*$/u;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** The first 16 hex digits of a sha256, as apps/web/src/test/content-fingerprint.ts writes them. */
const FINGERPRINT = /^[0-9a-f]{16}$/;
/** An exception line: the key at the very start of a line, in any letter case, then a colon. */
const EXCEPTION_LINE = new RegExp(`^${EXCEPTION_KEY}:(.*)$`, 'i');
/** One separator a writer may put between the route and the reason. */
const SEPARATOR = /^(?:[-–—:]\s*)/;
/** A Markdown code fence: three or more backticks or tildes, indented at most three spaces. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** A failure that stops the check outright, as opposed to a route out of step. */
export class CheckError extends Error {}

/**
 * @typedef {{ updated: string, text: string }} Entry
 * @typedef {Map<string, Entry>} Manifest
 * @typedef {{ route: string, reason: string, line: number }} Exception
 * @typedef {{ route: string, problems: string[], excused: boolean }} Finding
 * @typedef {{
 *   ok: boolean,
 *   baseMissing: boolean,
 *   compared: number,
 *   findings: Finding[],
 *   added: string[],
 *   removed: string[],
 *   exceptions: (Exception & { needed: boolean })[],
 *   invalid: string[],
 * }} Comparison
 */

/**
 * Whether `value` is a real day written YYYY-MM-DD.
 *
 * @param {string} value
 */
function isRealDay(value) {
  const match = DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Reads a manifest, refusing anything the unit suite would not have written: a top level that is
 * not an object, a key that is not a route path, an entry that is not exactly `{ updated, text }`,
 * a date that is not a real day, a fingerprint that is not 16 hex digits, or a route listed twice.
 *
 * @param {string} source
 * @param {string} label names the file in an error, such as "the manifest at the head"
 * @returns {Manifest}
 */
export function parseManifest(source, label) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new CheckError(`${label} is not JSON: ${messageOf(error)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CheckError(`${label} is not an object of routes`);
  }

  /** @type {Manifest} */
  const manifest = new Map();
  for (const [route, value] of Object.entries(parsed)) {
    if (!ROUTE.test(route)) {
      throw new CheckError(`${label} has the key ${JSON.stringify(route)}, which is not a route`);
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new CheckError(`${label}: ${route} is not an object of { updated, text }`);
    }
    const fields = Object.keys(value).sort();
    if (fields.join() !== 'text,updated') {
      throw new CheckError(
        `${label}: ${route} has the fields ${fields.join(', ') || 'none'}, not text and updated`,
      );
    }
    const { updated, text } = /** @type {Record<string, unknown>} */ (value);
    if (typeof updated !== 'string' || !isRealDay(updated)) {
      throw new CheckError(
        `${label}: ${route} has updated ${JSON.stringify(updated)}, not a real day in YYYY-MM-DD`,
      );
    }
    if (typeof text !== 'string' || !FINGERPRINT.test(text)) {
      throw new CheckError(
        `${label}: ${route} has text ${JSON.stringify(text)}, not a 16-digit hex fingerprint`,
      );
    }
    manifest.set(route, { updated, text });
  }

  // JSON.parse keeps the last of two equal keys without a word, which would hide one side of a
  // conflict resolved by hand. Every key whose value is an object is a route, because no entry
  // holds an object, so counting those keys in the source finds a route listed twice.
  /** @type {Set<string>} */
  const seen = new Set();
  for (const match of source.matchAll(/("(?:[^"\\]|\\.)*")\s*:\s*\{/g)) {
    const route = JSON.parse(match[1]);
    if (seen.has(route)) throw new CheckError(`${label} lists ${JSON.stringify(route)} twice`);
    seen.add(route);
  }
  return manifest;
}

/**
 * Reads every `Content-Date-Exception: <route> <reason>` line from a pull request body.
 *
 * The key counts only at the very start of a line the rendered body shows as text, so a quote, a
 * list item, an indented example or a mention mid-sentence is not an exception, and neither is a
 * line inside a fenced code block or inside an HTML comment, which a reviewer reading the body never
 * sees. Its letter case is free, as git's is for a trailer key. The route is the first word after
 * the colon and the reason is the rest, less one separator (`-`, an en or em dash, or `:`). An
 * exception without a route or a reason is kept, so that the comparison can refuse it with its line
 * number. A body may end its lines with LF, CRLF or CR: GitHub stores the body typed in its editor
 * with CRLF.
 *
 * @param {string | undefined} body
 * @returns {Exception[]}
 */
export function parseExceptions(body) {
  if (!body) return [];
  /** @type {Exception[]} */
  const exceptions = [];
  /** @type {{ marker: string, length: number } | null} the open fence, if any */
  let fence = null;
  let inComment = false;
  body.split(/\r\n|\r|\n/).forEach((text, index) => {
    if (fence) {
      // A fence closes on a line of the same character, at least as long, and nothing else.
      const close = FENCE.exec(text);
      if (
        close &&
        close[1][0] === fence.marker &&
        close[1].length >= fence.length &&
        text.trim() === close[1]
      ) {
        fence = null;
      }
      return;
    }
    if (inComment) {
      inComment = commentOpenAfter(text, true);
      return;
    }
    const open = FENCE.exec(text);
    if (open) {
      fence = { marker: open[1][0], length: open[1].length };
      return;
    }
    inComment = commentOpenAfter(text, false);
    const match = EXCEPTION_LINE.exec(text);
    if (!match) return;
    const value = match[1].trim();
    const route = value.split(/\s/, 1)[0] ?? '';
    const reason = value.slice(route.length).trim().replace(SEPARATOR, '').trim();
    exceptions.push({ route: route.replace(/:$/, ''), reason, line: index + 1 });
  });
  return exceptions;
}

/**
 * Whether an HTML comment is still open at the end of a line, given whether one was open at its
 * start.
 *
 * @param {string} text
 * @param {boolean} open
 */
function commentOpenAfter(text, open) {
  let state = open;
  let at = 0;
  for (;;) {
    const marker = state ? '-->' : '<!--';
    const found = text.indexOf(marker, at);
    if (found === -1) return state;
    state = !state;
    at = found + marker.length;
  }
}

/**
 * Compares the manifest at the merge base with the one at the head.
 *
 * @param {Manifest | null} base null when the merge base has no manifest
 * @param {Manifest} head
 * @param {Exception[]} exceptions
 * @returns {Comparison}
 */
export function compareManifests(base, head, exceptions) {
  /** @type {string[]} */
  const invalid = [];
  /** @type {Set<string>} */
  const excusable = new Set();
  for (const { route, reason, line } of exceptions) {
    if (route === '') {
      invalid.push(`the ${EXCEPTION_KEY} on line ${line} of the body names no route`);
    } else if (!head.has(route)) {
      invalid.push(
        `the ${EXCEPTION_KEY} on line ${line} of the body names ${route}, which the manifest ` +
          'at the head does not list',
      );
    } else if (reason === '') {
      invalid.push(
        `the ${EXCEPTION_KEY} on line ${line} of the body names ${route} but gives no reason`,
      );
    } else {
      excusable.add(route);
    }
  }

  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const removed = [];
  let compared = 0;

  if (base) {
    for (const [route, now] of head) {
      const before = base.get(route);
      if (!before) {
        added.push(route);
        continue;
      }
      compared += 1;
      const textMoved = before.text !== now.text;
      const dateMoved = before.updated !== now.updated;
      /** @type {string[]} */
      const problems = [];
      if (textMoved && !dateMoved) {
        problems.push(
          `its served text changed, but its content date did not (still ${now.updated})`,
        );
      }
      if (dateMoved && !textMoved) {
        problems.push(
          `its content date moved from ${before.updated} to ${now.updated}, but its served text ` +
            'did not change',
        );
      }
      if (now.updated < before.updated) {
        problems.push(`its content date moved backwards, from ${before.updated} to ${now.updated}`);
      }
      if (problems.length > 0) findings.push({ route, problems, excused: excusable.has(route) });
    }
    for (const route of base.keys()) if (!head.has(route)) removed.push(route);
  }

  const outOfStep = new Set(findings.map(({ route }) => route));
  return {
    ok: invalid.length === 0 && findings.every(({ excused }) => excused),
    baseMissing: base === null,
    compared,
    findings,
    added,
    removed,
    exceptions: exceptions
      .filter(({ route, reason }) => head.has(route) && reason !== '')
      .map((exception) => ({ ...exception, needed: outOfStep.has(exception.route) })),
    invalid,
  };
}

/**
 * The report, one line per item. A line never starts with text from the pull request body, which
 * GitHub would read as a workflow command if it began with `::`; routes from the manifest can start
 * a line, because the manifest's routes are checked to start with `/`.
 *
 * @param {Comparison} result
 * @param {{ head: string, mergeBase: string }} context short SHAs
 * @returns {string[]}
 */
export function formatReport(result, { head, mergeBase }) {
  /** @type {string[]} */
  const lines = [];
  if (result.baseMissing) {
    lines.push(
      `Notice: the merge base ${mergeBase} has no ${MANIFEST_PATH}, so there is nothing to ` +
        `compare the head ${head} with.`,
    );
  } else {
    lines.push(
      `Content dates: the head ${head} against its merge base ${mergeBase}, ` +
        `${result.compared} route(s) compared.`,
    );
  }
  for (const route of result.added) lines.push(`New route: ${route}`);
  for (const route of result.removed) lines.push(`Removed route: ${route}`);
  for (const { route, reason, needed } of result.exceptions) {
    lines.push(`Exception: ${route} - ${reason} (${needed ? 'needed' : 'not needed'})`);
  }
  for (const { route, problems, excused } of result.findings) {
    lines.push(`${route}: ${problems.join('; ')}${excused ? ' (excused)' : ''}`);
  }
  for (const problem of result.invalid) lines.push(`Invalid exception: ${problem}.`);

  if (result.ok) {
    lines.push('Every route compared moves its content date with its served text.');
    return lines;
  }
  lines.push(
    '',
    'A route whose served text changes moves its content date in the same pull request, and only',
    'then: STATIC_ROUTE_UPDATED in apps/web/src/data/static-routes.ts for a static route, a case',
    "study's updatedAt in apps/web/src/data/case-studies.ts, a post's dates in",
    'apps/web/src/data/posts.ts. Regenerate the manifest with `pnpm --filter web content-dates:update`',
    'in the same commit. For a deliberate exception, add a line to the pull request body:',
    `${EXCEPTION_KEY}: <route> <reason>`,
  );
  return lines;
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs git, turning any failure into a CheckError that carries git's own message.
 *
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = /** @type {{ stderr?: unknown }} */ (error).stderr;
    const detail = typeof stderr === 'string' && stderr.trim() ? stderr.trim() : messageOf(error);
    throw new CheckError(`git ${args.join(' ')} failed: ${detail}`);
  }
}

/**
 * @param {string} revision
 * @param {string} root
 */
function resolveCommit(revision, root) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], root).trim();
  } catch {
    throw new CheckError(`${revision} is not a commit in this repository`);
  }
}

/**
 * The manifest's text at a commit, or null when the commit has no manifest. `ls-tree` tells the
 * two apart: it prints nothing for an absent path, and fails only when git itself does.
 *
 * @param {string} commit
 * @param {string} root
 */
function manifestAt(commit, root) {
  const listing = git(['ls-tree', '-z', commit, '--', MANIFEST_PATH], root);
  if (listing === '') return null;
  const type = listing.split(/\s/)[1];
  if (type !== 'blob') {
    throw new CheckError(`${MANIFEST_PATH} at ${commit.slice(0, 7)} is a ${type}, not a file`);
  }
  return git(['cat-file', 'blob', `${commit}:${MANIFEST_PATH}`], root);
}

/**
 * @param {string[]} argv
 * @returns {{ base: string, head: string } | null} null on a usage error
 */
function parseArgs(argv) {
  const args = [...argv];
  // `pnpm check:content-dates -- --base <rev>` passes the `--` on to the script.
  if (args[0] === '--') args.shift();
  /** @type {Record<string, string>} */
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag !== '--base' && flag !== '--head') return null;
    if (flag in values) return null;
    // A value that starts with `-` would reach git as an option.
    if (value === undefined || value === '' || value.startsWith('-')) return null;
    values[flag] = value;
  }
  if (!values['--base']) return null;
  return { base: values['--base'], head: values['--head'] ?? 'HEAD' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  /** @type {Comparison} */
  let result;
  /** @type {{ head: string, mergeBase: string }} */
  let context;
  try {
    const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
    const base = resolveCommit(args.base, root);
    const head = resolveCommit(args.head, root);
    /** @type {string} */
    let mergeBase;
    try {
      mergeBase = git(['merge-base', base, head], root).trim();
    } catch {
      throw new CheckError(`${args.base} and ${args.head} have no merge base`);
    }

    const headText = manifestAt(head, root);
    if (headText === null) {
      throw new CheckError(`the head ${head.slice(0, 7)} has no ${MANIFEST_PATH}`);
    }
    const headManifest = parseManifest(headText, `${MANIFEST_PATH} at the head`);
    const baseText = manifestAt(mergeBase, root);
    const baseManifest =
      baseText === null ? null : parseManifest(baseText, `${MANIFEST_PATH} at the merge base`);

    result = compareManifests(baseManifest, headManifest, parseExceptions(process.env.PR_BODY));
    context = { head: head.slice(0, 7), mergeBase: mergeBase.slice(0, 7) };
  } catch (error) {
    if (!(error instanceof CheckError)) throw error;
    console.error(`Content date check could not run: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  for (const line of formatReport(result, context)) console.log(line);
  // `exitCode` rather than `process.exit()`, so the report is flushed before the process ends.
  process.exitCode = result.ok ? 0 : 1;
}

/**
 * Whether this module was started as the command, as opposed to imported by its tests. Both sides
 * go through `realpathSync`, for the reason check-allowbuilds-drift.mjs gives at the same guard: a
 * path through a symlinked directory would otherwise compare unequal, skip `main()` and exit 0
 * having checked nothing.
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (startedAsCommand()) main();

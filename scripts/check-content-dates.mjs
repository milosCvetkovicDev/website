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
// The escape is a line in the pull request body, `Content-Date-Exception: <route> <reason>`: a
// reviewer reads it in the body, and the output lists every one, needed or not. It excuses every
// finding on its route. An exception that names a route the head manifest does not list, or gives
// no reason, fails the check. The body comes from the event payload GitHub writes, with
// `--event <path>`, or else from the PR_BODY environment variable, for a run by hand.
//
// Run with `pnpm check:content-dates -- --base <rev> [--head <rev>] [--event <path>]` (HEAD when
// --head is left out); CI's `Content dates` workflow passes the base branch as fetched, the pull
// request's head SHA and its event payload. Exit codes follow scripts/check-adr-index.mjs: 0 in
// step, 1 out of step, 2 when the check could not run (no or a malformed manifest at the head or the
// merge base, a revision git cannot resolve, no merge base, an unreadable event, a usage error, or
// any other failure). It never exits 0 because it could not see, and it uses Node built-ins only, so
// the workflow installs nothing. See docs/adr/0035-content-dates-move-with-served-text.md.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Where the unit suite writes the manifest, relative to the repository root. */
export const MANIFEST_PATH = 'apps/web/src/data/content-dates.json';

/** The key of an exception line in a pull request body. */
export const EXCEPTION_KEY = 'Content-Date-Exception';

const USAGE =
  'usage: node scripts/check-content-dates.mjs --base <rev> [--head <rev>] [--event <path>]';

/** A route path: a leading slash, then no whitespace or control character. */
const ROUTE = /^\/[^\s\p{Cc}]*$/u;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** The first 16 hex digits of a sha256, as apps/web/src/test/content-fingerprint.ts writes them. */
const FINGERPRINT = /^[0-9a-f]{16}$/;
/**
 * An exception line: the key at the very start of a line, in any letter case, then a colon. `s`
 * lets the reason hold U+2028 and U+2029, which Markdown does not end a line on.
 */
const EXCEPTION_LINE = new RegExp(`^${EXCEPTION_KEY}:(.*)$`, 'is');
/** One separator a writer may put between the route and the reason. */
const SEPARATOR = /^(?:[-–—:]\s*)/;
/**
 * A Markdown code fence: three or more backticks or tildes, indented at most three spaces, then an
 * info string, which after backticks may not hold a backtick (CommonMark: that line is inline code).
 */
const FENCE = /^ {0,3}(?:(`{3,})(?!.*`)|(~{3,}))/s;
/** An HTML block of comment type: `<!--` at the start of a line, indented at most three spaces. */
const COMMENT_BLOCK = /^ {0,3}<!--/;
/** A code span on one line: a run of backticks, closed by a run of the same length. */
const CODE_SPAN = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;
/** A character that would act on a terminal or the log viewer rather than print. */
const CONTROL = /[\p{Cc}\u2028\u2029]/gu;

/** A failure that stops the check outright, as opposed to a route out of step. */
export class CheckError extends Error {}

/**
 * @typedef {{ updated: string, text: string }} Entry
 * @typedef {Map<string, Entry>} Manifest
 * @typedef {{ route: string, reason: string, line: number }} Exception
 * @typedef {{ route: string, problems: string[], textMoved: boolean, excused: boolean }} Finding
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
  // setUTCFullYear, because Date.UTC reads the years 0 to 99 as 1900 to 1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
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
  // conflict resolved by hand, a route or a field inside an entry.
  const twice = repeatedKey(source);
  if (twice !== null) throw new CheckError(`${label} lists ${JSON.stringify(twice)} twice`);
  return manifest;
}

/**
 * The first key that one object of a JSON text lists twice, or null. The text has already parsed,
 * so a small walk suffices: strings, the brackets that open and close objects and arrays, and the
 * colon that marks the string before it as a key.
 *
 * @param {string} source JSON that JSON.parse accepts
 * @returns {string | null}
 */
function repeatedKey(source) {
  /** @type {(Set<string> | null)[]} one entry per open bracket: an object's keys, or null */
  const open = [];
  /** @type {string | null} the last string read, until a colon or another token follows it */
  let pending = null;
  for (let at = 0; at < source.length; at += 1) {
    const char = source[at];
    if (char === '"') {
      let end = at + 1;
      while (source[end] !== '"') end += source[end] === '\\' ? 2 : 1;
      pending = JSON.parse(source.slice(at, end + 1));
      at = end;
      continue;
    }
    if (char === ':' && pending !== null) {
      const keys = open.at(-1);
      if (keys) {
        if (keys.has(pending)) return pending;
        keys.add(pending);
      }
    } else if (char === '{') open.push(new Set());
    else if (char === '[') open.push(null);
    else if (char === '}' || char === ']') open.pop();
    if (!/\s/.test(char)) pending = null;
  }
  return null;
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
 * number. The route is read the way a writer may type it in Markdown: in backticks, or followed by
 * a slash, a comma, a full stop, a semicolon or a colon. A body may end its lines with LF, CRLF or
 * CR (GitHub stores the body typed in its editor with CRLF), and may start with a byte order mark.
 *
 * Comments follow how GitHub renders them. One that starts a line (an HTML block) hides every line
 * until the one that closes it, blank lines included. One opened mid-line ends with its paragraph
 * at the latest: GitHub would show an unclosed one as text, and the lines after it are treated as
 * hidden anyway, which can only drop an exception, never let a hidden one through. A `<!--` in a
 * code span opens nothing, and `<!-->` and `<!--->` close themselves.
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
  /** @type {'block' | 'inline' | null} the open comment, if any, and how it opened */
  let comment = null;
  body
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\r|\n/)
    .forEach((text, index) => {
      if (fence) {
        // A fence closes on a line of the same character, at least as long, and nothing else.
        const close = fenceOf(text);
        if (
          close &&
          close[0] === fence.marker &&
          close.length >= fence.length &&
          text.trim() === close
        ) {
          fence = null;
        }
        return;
      }
      if (comment === 'inline' && text.trim() === '') {
        comment = null;
        return;
      }
      if (comment) {
        // The line starts hidden, so it is not an exception whatever follows the close.
        if (!commentOpenAfter(text, true)) comment = null;
        return;
      }
      const open = fenceOf(text);
      if (open) {
        fence = { marker: open[0], length: open.length };
        return;
      }
      if (COMMENT_BLOCK.test(text)) {
        if (commentOpenAfter(text, false)) comment = 'block';
        return;
      }
      if (commentOpenAfter(text.replace(CODE_SPAN, ''), false)) comment = 'inline';
      const match = EXCEPTION_LINE.exec(text);
      if (!match) return;
      const value = match[1].trim();
      const token = value.split(/\s/, 1)[0] ?? '';
      const reason = value.slice(token.length).trim().replace(SEPARATOR, '').trim();
      exceptions.push({ route: routeOf(token), reason, line: index + 1 });
    });
  return exceptions;
}

/**
 * The fence a line opens or closes, such as "```" or "~~~~", or null.
 *
 * @param {string} text
 */
function fenceOf(text) {
  const match = FENCE.exec(text);
  return match ? (match[1] ?? match[2]) : null;
}

/**
 * The route an exception names, from the word after its key: without backticks around it, the
 * punctuation a sentence puts after it, or a trailing slash (but `/` stays `/`).
 *
 * @param {string} token
 */
function routeOf(token) {
  return token
    .replace(/[:,.;]+$/, '')
    .replace(/^`+|`+$/g, '')
    .replace(/[:,.;]+$/, '')
    .replace(/(?<=.)\/+$/, '');
}

/**
 * Whether an HTML comment is still open at the end of a line, given whether one was open at its
 * start. A comment closes on the first `-->` after its `<!`, so `<!-->` and `<!--->` close
 * themselves.
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
    // After an opening `<!--`, the search for its close starts at the first `-`.
    at = found + (state ? marker.length : 2);
    state = !state;
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
        `the ${EXCEPTION_KEY} on line ${line} of the body names ${printable(route)}, which the ` +
          'manifest at the head does not list',
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
      if (problems.length > 0) {
        findings.push({ route, problems, textMoved, excused: excusable.has(route) });
      }
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
 * Text from the pull request body with every control character, U+2028 and U+2029 written as an
 * escape, so that it cannot recolour, hide or overwrite the log a reviewer reads.
 *
 * @param {string} text
 */
function printable(text) {
  return text.replace(CONTROL, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x100
      ? `\\x${code.toString(16).padStart(2, '0')}`
      : `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

/**
 * The report, one line per item. A line never starts with text from the pull request body, which
 * GitHub would read as a workflow command if it began with `::`; routes from the manifest can start
 * a line, because the manifest's routes are checked to start with `/`. Text from the body has its
 * control characters escaped. In GitHub Actions the command also stops workflow commands around the
 * report, because the runner reads the legacy `##[command]` form anywhere in a line.
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
    lines.push(
      `Exception: ${printable(route)} - ${printable(reason)} (${needed ? 'needed' : 'not needed'})`,
    );
  }
  for (const { route, problems, excused } of result.findings) {
    lines.push(`${route}: ${problems.join('; ')}${excused ? ' (excused)' : ''}`);
  }
  for (const problem of result.invalid) lines.push(`Invalid exception: ${problem}.`);

  if (result.ok) {
    // With no manifest at the merge base, nothing was compared, and the notice says so.
    if (result.baseMissing) return lines;
    lines.push(
      result.findings.length === 0
        ? 'Every route compared moves its content date with its served text.'
        : 'Every route compared moves its content date with its served text, or has an exception.',
    );
    return lines;
  }
  const unexcused = result.findings.filter(({ excused }) => !excused);
  lines.push('');
  if (unexcused.length > 0) {
    lines.push(
      'A route whose served text changes moves its content date in the same pull request, and',
      'only then.',
    );
  }
  if (unexcused.some(({ textMoved }) => textMoved)) {
    lines.push(
      'Where the text changed, move the date: STATIC_ROUTE_UPDATED in',
      "apps/web/src/data/static-routes.ts for a static route, a case study's updatedAt in",
      "apps/web/src/data/case-studies.ts, a post's dates in apps/web/src/data/posts.ts, then",
      'regenerate the manifest with `pnpm --filter web content-dates:update` in the same commit.',
      'Dates are days: when the date is already the day of this change, because another pull',
      'request changed the route the same day, the date cannot move, and an exception says so.',
    );
  }
  if (unexcused.some(({ textMoved }) => !textMoved)) {
    lines.push(
      'Where only the date moved, or it moved backwards, put its content date back to the one at',
      'the merge base.',
    );
  }
  lines.push(
    'For a deliberate exception, add a line to the pull request body:',
    `${EXCEPTION_KEY}: <route> <reason>`,
  );
  return lines;
}

/**
 * Workflow commands that annotate the run in GitHub Actions: one error per route out of step, one
 * for invalid exceptions and a notice for a merge base without the manifest. They carry no text from
 * the pull request body, only manifest routes, which are checked to hold no whitespace or control
 * character, with `%` escaped as a command's data needs.
 *
 * @param {Comparison} result
 * @returns {string[]}
 */
export function annotations(result) {
  const title = 'title=Content dates';
  /** @type {string[]} */
  const lines = [];
  if (result.baseMissing) {
    lines.push(
      `::notice ${title}::The merge base has no ${MANIFEST_PATH}, so nothing was compared`,
    );
  }
  for (const { route, excused } of result.findings) {
    if (excused) continue;
    lines.push(
      `::error ${title}::${route.replaceAll('%', '%25')}: its served text and its content date ` +
        'moved apart; the job log says how to fix it',
    );
  }
  if (result.invalid.length > 0) {
    lines.push(
      `::error ${title}::An exception in the pull request body is invalid; the job log names it`,
    );
  }
  return lines;
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs git, turning any failure into a CheckError that carries git's own message. It may not ask
 * for credentials, and gives up after a minute, so that a blocked git cannot hang a run.
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
      timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
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
 * two apart: it prints nothing for an absent path, and fails only when git itself does. A symbolic
 * link is a blob too, whose text is the link's target, so its mode is checked as well.
 *
 * @param {string} commit
 * @param {string} root
 */
function manifestAt(commit, root) {
  const listing = git(['ls-tree', '-z', commit, '--', MANIFEST_PATH], root);
  if (listing === '') return null;
  const [mode, type] = listing.split(/\s/);
  const at = `${MANIFEST_PATH} at ${commit.slice(0, 7)}`;
  if (type !== 'blob') throw new CheckError(`${at} is a ${type}, not a file`);
  if (mode === '120000') throw new CheckError(`${at} is a symbolic link, not a file`);
  return git(['cat-file', 'blob', `${commit}:${MANIFEST_PATH}`], root);
}

/**
 * The pull request body from the event payload GitHub writes to GITHUB_EVENT_PATH. Read from the
 * file rather than the environment, because Linux caps one environment variable at 128 KiB, which a
 * body of multi-byte text within GitHub's 65,536 characters can pass.
 *
 * @param {string} path
 */
function bodyFromEvent(path) {
  /** @type {unknown} */
  let event;
  try {
    event = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new CheckError(`the event ${path} cannot be read as JSON: ${messageOf(error)}`);
  }
  const pullRequest = /** @type {{ pull_request?: { body?: unknown } }} */ (event)?.pull_request;
  if (pullRequest === null || typeof pullRequest !== 'object') {
    throw new CheckError(`the event ${path} is not a pull request's`);
  }
  const { body } = pullRequest;
  if (body === null || body === undefined) return '';
  if (typeof body !== 'string')
    throw new CheckError(`the event ${path} has a body that is no text`);
  return body;
}

/**
 * @param {string[]} argv
 * @returns {{ base: string, head: string, event: string | null } | null} null on a usage error
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
    if (flag !== '--base' && flag !== '--head' && flag !== '--event') return null;
    if (flag in values) return null;
    // A value that starts with `-` would reach git as an option.
    if (value === undefined || value === '' || value.startsWith('-')) return null;
    values[flag] = value;
  }
  if (!values['--base']) return null;
  return {
    base: values['--base'],
    head: values['--head'] ?? 'HEAD',
    event: values['--event'] ?? null,
  };
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

    const body = args.event === null ? process.env.PR_BODY : bodyFromEvent(args.event);
    result = compareManifests(baseManifest, headManifest, parseExceptions(body));
    context = { head: head.slice(0, 7), mergeBase: mergeBase.slice(0, 7) };
  } catch (error) {
    // Anything else is a failure to run too: exit 1 would read as a route out of step.
    const detail =
      error instanceof CheckError
        ? error.message
        : error instanceof Error
          ? (error.stack ?? error.message)
          : String(error);
    console.error(`Content date check could not run: ${detail}`);
    process.exitCode = 2;
    return;
  }

  const report = formatReport(result, context);
  if (process.env.GITHUB_ACTIONS === 'true') {
    // A token nobody could have written into the body ends the stop.
    const token = randomUUID();
    console.log(`::stop-commands::${token}`);
    for (const line of report) console.log(line);
    console.log(`::${token}::`);
    for (const line of annotations(result)) console.log(line);
  } else {
    for (const line of report) console.log(line);
  }
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
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    // An argument that is no path, as after `node -e`: started as a command, it would be this file.
    return false;
  }
}

if (startedAsCommand()) main();

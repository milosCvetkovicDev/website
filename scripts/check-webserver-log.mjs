#!/usr/bin/env node
// Reads a captured Playwright run's output and fails on any error the web server printed.
//
// Nothing in the suite looks at the server's own stderr, so a server-side error on a page that still
// renders something passes every gate. The CI logs of three green runs each carry two
// `[WebServer] Error: Internal: NoFallbackError` blocks, and 51 tests pass beside them.
//
// One block is allowed, and only that one: ADR 0015 fixes the case-study slugs at build time, so an
// unknown /work/* slug reaches the router's fallback path and Next logs NoFallbackError on its way
// to the 404. That trade-off is recorded, so it is allowlisted by its exact message. Anything else
// the server prints as an error is a finding.
//
// Usage: `node scripts/check-webserver-log.mjs <log file>`. Prints whatever it did not allow and
// exits 1, or exits 0 quietly.
//
// The rule this file shares with check-allowbuilds-drift.mjs: never exit 0 because it could not see.
// A missing, unreadable or empty log is a failure with a message, not a skip -- an empty log means
// the capture broke, and a check that shrugs at that is worse than no check.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ADR = 'docs/adr/0015-static-case-study-params.md';

/** The one server error this repository has decided to accept, matched on its whole message. */
const ALLOWED = new Set(['Error: Internal: NoFallbackError']);

// Playwright prefixes every line the web server writes with this. Not anchored to the start of the
// line: a log downloaded from a GitHub Actions run carries the job name, the step and a timestamp in
// front of it, and the check has to read that shape as well as the raw tee'd output CI feeds it.
const PREFIX = /\[WebServer\]/;

/**
 * Whether a line begins an error block. Covers a thrown Error's `name: message` first line and
 * Next's own `⨯` marker, which it uses for the server-side errors it formats itself.
 *
 * @param {string} text a `[WebServer]` line with its prefix removed, trimmed
 * @returns {boolean}
 */
function startsError(text) {
  return /^⨯/.test(text) || /^[\w$.]*Error\b/.test(text);
}

/**
 * Whether a line continues the error block above it: a stack frame, a cause, or the tail of one.
 *
 * @param {string} text a `[WebServer]` line with its prefix removed, trimmed
 * @returns {boolean}
 */
function continuesError(text) {
  return /^(at\s|Caused by:|\.{3}\s|[}{\][])/.test(text);
}

/**
 * @typedef {{ message: string, lines: string[] }} ErrorBlock
 */

/**
 * Every error the web server printed, as blocks. A line that neither starts an error nor continues
 * one is ordinary server output and closes the block above it.
 *
 * @param {string} log the captured output
 * @returns {ErrorBlock[]}
 */
export function collectErrorBlocks(log) {
  /** @type {ErrorBlock[]} */
  const blocks = [];
  /** @type {ErrorBlock | null} */
  let open = null;

  for (const line of log.split('\n')) {
    const match = line.match(PREFIX);
    if (match?.index === undefined) {
      // A line from the test runner, not the server. It cannot continue a server stack.
      open = null;
      continue;
    }
    const text = line.slice(match.index + match[0].length).trim();
    if (startsError(text)) {
      open = { message: text, lines: [text] };
      blocks.push(open);
    } else if (open && continuesError(text)) {
      open.lines.push(text);
    } else {
      open = null;
    }
  }

  return blocks;
}

/**
 * The blocks that are not allowlisted.
 *
 * @param {ErrorBlock[]} blocks
 * @returns {ErrorBlock[]}
 */
export function unexpectedBlocks(blocks) {
  return blocks.filter((block) => !ALLOWED.has(block.message));
}

/**
 * Checks one log. Returns the exit status and the lines to print, so the tests can assert both
 * without driving a process.
 *
 * @param {string | undefined} path the log file
 * @param {(file: string) => string} [readLog] injected by the tests
 * @returns {{ status: number, output: string[] }}
 */
export function check(path, readLog = (file) => readFileSync(file, 'utf8')) {
  if (!path) {
    return { status: 1, output: ['usage: node scripts/check-webserver-log.mjs <log file>'] };
  }

  let log;
  try {
    log = readLog(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 1, output: [`cannot read the Playwright log (${path}): ${message}`] };
  }

  if (log.trim() === '') {
    return {
      status: 1,
      output: [
        `the Playwright log (${path}) is empty, so this check verified nothing.`,
        'The capture step is what broke; the run itself may well have passed.',
      ],
    };
  }

  const unexpected = unexpectedBlocks(collectErrorBlocks(log));
  if (unexpected.length === 0) return { status: 0, output: [] };

  const plural = unexpected.length === 1 ? '' : 's';
  const output = [
    `The web server printed ${unexpected.length} error${plural} nobody allowlisted:`,
    '',
  ];
  for (const block of unexpected) {
    for (const line of block.lines) output.push(`  ${line}`);
    output.push('');
  }
  output.push(
    `Only \`${[...ALLOWED].join('`, `')}\` is accepted, as the trade-off ${ADR} records.`,
    'A server-side error on a page that still renders is invisible to every other gate, so this one',
    'fails. Fix the error, or record the decision and add its message to ALLOWED.',
  );
  return { status: 1, output };
}

function main() {
  const { status, output } = check(process.argv[2]);
  for (const line of output) console.error(line);
  process.exitCode = status;
}

/**
 * Importable for its tests; runs only when started as the command. Both sides go through
 * `realpathSync` for the reason check-allowbuilds-drift.mjs documents: Node resolves
 * `import.meta.url` and leaves `process.argv[1]` as typed, so a path that reaches this file through
 * a symlinked directory would otherwise skip `main()` and exit 0 in silence.
 *
 * @returns {boolean}
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (startedAsCommand()) main();

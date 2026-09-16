#!/usr/bin/env node
// Reads a captured Playwright run's output and fails on anything the web server printed that is not
// allowlisted.
//
// Nothing in the suite looks at the server's own output, so a server-side error on a page that still
// renders something passes every gate. Green CI runs carry `[WebServer] Error: Internal:
// NoFallbackError` blocks in their logs, and every test passes beside them.
//
// Every `[WebServer]` line is a finding unless it belongs to an allowlisted block. The check does not
// try to recognise what an error looks like, because a list of known shapes passes every shape it
// does not know. It does not have to: Playwright forwards a web server's stdout only when
// `webServer.stdout` is 'pipe' (or `DEBUG=pw:webserver` is set), and apps/web/playwright.config.ts
// leaves it at the default, 'ignore'. What reaches the log is the server's stderr, which is where
// Next and Node write errors and warnings.
//
// One block is allowed, and only that one: ADR 0015 fixes the case-study slugs at build time, so an
// unknown /work/* slug reaches the router's fallback path and Next logs NoFallbackError on its way
// to the 404. That trade-off is recorded, so the block is allowlisted by its exact message, together
// with the `at` stack frames that follow it and nothing else.
//
// Usage: `node scripts/check-webserver-log.mjs <log file>`. Prints whatever it did not allow and
// exits 1, or prints what it read and exits 0.
//
// The rule this file shares with check-allowbuilds-drift.mjs: never exit 0 because it could not see.
// A missing, unreadable or empty log is a failure with a message, not a skip, and so is a log with no
// `[WebServer]` line in it: the not-found specs request an unknown slug in every run, so ADR 0015's
// block is always there, and a log without a single server line means the capture broke.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const ADR = 'docs/adr/0015-static-case-study-params.md';

/** The one server error this repository has decided to accept, matched on its whole message. */
const ALLOWED = new Set(['Error: Internal: NoFallbackError']);

// A line the web server wrote: Playwright's prefix at the start of the line, as the tee'd output CI
// feeds this has it, or after the job, the step and the timestamp that a log downloaded from a GitHub
// Actions run puts in front of it. Anchored, so a runner line that only quotes the prefix, in an
// assertion message say, is not read as server output.
const SERVER_LINE =
  /^(?:[^\t]*\t[^\t]*\t)?(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z )?\[WebServer\](?: |$)/;

/** A stack frame, the only kind of line an allowlisted block may carry after its message. */
const FRAME = /^at\s/;

/**
 * Consecutive lines the web server printed. `allowed` blocks are ADR 0015's; every other block is a
 * finding.
 *
 * @typedef {{ message: string, lines: string[], allowed: boolean }} ServerBlock
 */

/**
 * Everything the web server printed, as blocks. A runner line or a blank server line closes the block
 * above it.
 *
 * Colour codes are stripped before anything is matched. Playwright strips them itself only while its
 * own output is not a terminal and FORCE_COLOR is unset; it sets FORCE_COLOR=1 for the server, so
 * with that variable in the runner's environment a dimmed prefix or a red `⨯` would reach the log
 * and defeat every match below.
 *
 * @param {string} log the captured output
 * @returns {ServerBlock[]}
 */
export function collectServerBlocks(log) {
  /** @type {ServerBlock[]} */
  const blocks = [];
  /** @type {ServerBlock | null} */
  let open = null;

  for (const raw of log.split('\n')) {
    const line = stripVTControlCharacters(raw);
    const match = SERVER_LINE.exec(line);
    if (!match) {
      // A line from the test runner, not the server. It cannot continue a server block.
      open = null;
      continue;
    }
    const text = line.slice(match[0].length).trim();
    if (text === '') {
      open = null;
    } else if (ALLOWED.has(text)) {
      open = { message: text, lines: [text], allowed: true };
      blocks.push(open);
    } else if (open && (open.allowed ? FRAME.test(text) : true)) {
      open.lines.push(text);
    } else {
      open = { message: text, lines: [text], allowed: false };
      blocks.push(open);
    }
  }

  return blocks;
}

/**
 * The blocks that are not allowlisted.
 *
 * @param {ServerBlock[]} blocks
 * @returns {ServerBlock[]}
 */
export function unexpectedBlocks(blocks) {
  return blocks.filter((block) => !block.allowed);
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

  const blocks = collectServerBlocks(log);
  if (blocks.length === 0) {
    return {
      status: 1,
      output: [
        `the Playwright log (${path}) has no [WebServer] line, so this check saw no server output.`,
        'The not-found specs request an unknown /work/* slug in every run, which prints the',
        `NoFallbackError block ${ADR} accepts, so a log without it means the capture broke: the`,
        "server's stderr was not forwarded, Playwright's prefix changed, or the suite never ran (a",
        'pnpm filter that matches no package exits 0). If a Next upgrade stopped printing that block,',
        'this check needs another sign that the capture works.',
      ],
    };
  }

  const unexpected = unexpectedBlocks(blocks);
  if (unexpected.length === 0) {
    const lines = blocks.reduce((sum, block) => sum + block.lines.length, 0);
    return {
      status: 0,
      output: [
        `web server log: ${lines} lines, all in ${blocks.length} allowlisted blocks (${ADR}).`,
      ],
    };
  }

  const plural = unexpected.length === 1 ? '' : 's';
  const output = [
    `The web server printed ${unexpected.length} block${plural} of output nobody allowlisted:`,
    '',
  ];
  for (const block of unexpected) {
    for (const line of block.lines) output.push(`  ${line}`);
    output.push('');
  }
  output.push(
    `Only \`${[...ALLOWED].join('`, `')}\` and its stack frames are accepted, as the trade-off ${ADR}`,
    'records. A server-side error on a page that still renders is invisible to every other gate, so',
    'this one fails. Fix what the server reported, or record the decision and add its message to',
    'ALLOWED.',
  );
  return { status: 1, output };
}

function main() {
  const { status, output } = check(process.argv[2]);
  for (const line of output) (status === 0 ? console.log : console.error)(line);
  process.exitCode = status;
}

/**
 * Importable for its tests; runs only when started as the command. Both sides go through
 * `realpathSync` for the reason check-allowbuilds-drift.mjs documents: Node resolves
 * `import.meta.url` and leaves `process.argv[1]` as typed, so a path that reaches this file through
 * a symlinked directory would otherwise skip `main()` and exit 0 in silence.
 *
 * Nothing catches what `realpathSync` throws. Answering `false` for a path that no longer resolves
 * would skip `main()` and exit 0 having checked nothing; the uncaught error exits 1 and names it.
 *
 * @returns {boolean}
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (startedAsCommand()) main();

#!/usr/bin/env node
// Reads a captured Playwright run's output and fails on anything the web server printed that is not
// allowlisted.
//
// Nothing in the suite looks at the server's own output, so a server-side error on a page that still
// renders something passes every gate. Under Next 16.3, green CI runs carried `[WebServer] Error:
// Internal: NoFallbackError` blocks in their logs, and every test passed beside them.
//
// Every `[WebServer]` line is a finding unless it belongs to an allowlisted block. The check does not
// try to recognise what an error looks like, because a list of known shapes passes every shape it
// does not know. It does not have to: Playwright forwards a web server's stdout only when
// `webServer.stdout` is 'pipe' (or `DEBUG=pw:webserver` is set), and apps/web/playwright.config.ts
// leaves it at the default, 'ignore'. What reaches the log is the server's stderr, which is where
// Next and Node write errors and warnings.
//
// One block is allowed, and only that one: ADR 0015 fixes the case-study slugs at build time, so an
// unknown /work/* slug reaches the router's fallback path, where Next 16.3 logged NoFallbackError
// on its way to the 404. That trade-off is recorded, so the block is allowlisted by its exact
// message, together with the `at` stack frames that follow it and nothing else. Next 16.4 no
// longer logs it on that path; it stays allowed, and is not required.
//
// Usage: `node scripts/check-webserver-log.mjs <log file>`. Prints whatever it did not allow and
// exits 1, or prints what it read and exits 0.
//
// The rule this file shares with check-allowbuilds-drift.mjs: never exit 0 because it could not see.
// A missing, unreadable or empty log is a failure with a message, not a skip, and so is a log
// without the canary exactly once. CI's web server command writes CANARY to its stderr before
// `next start`, so a log with it shows the capture works, and since 16.4 a green run's server writes
// nothing else there: until 16.4 the NoFallbackError block in every run was that sign. A log
// without the canary means the capture broke or is not from CI's e2e job, and a log with it twice
// holds two runs. The canary is never a finding itself.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const ADR = 'docs/adr/0015-static-case-study-params.md';

/**
 * The line CI's web server command writes to its stderr once, before `next start`
 * (apps/web/playwright.config.ts), matched on its whole text. `src/test/playwright-config.test.ts`
 * in apps/web fails when the command and this differ.
 */
export const CANARY = 'check-webserver-log canary: the web server stderr reaches this log';

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
    } else if (text === CANARY) {
      // One line, never part of another block and never continued.
      blocks.push({ message: text, lines: [text], allowed: true });
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
        "CI's web server command prints the canary line to its stderr before the server starts, so",
        "a log without any server line means the capture broke: the server's stderr was not",
        "forwarded, Playwright's prefix changed, or the suite never ran (a pnpm filter that",
        'matches no package exits 0).',
      ],
    };
  }

  const canaries = blocks.filter((block) => block.message === CANARY).length;
  const unexpected = unexpectedBlocks(blocks);
  if (unexpected.length === 0 && canaries === 1) {
    const allowed = blocks.filter((block) => block.message !== CANARY);
    const lines = allowed.reduce((sum, block) => sum + block.lines.length, 0);
    const rest =
      allowed.length === 0
        ? 'and no other server output.'
        : `and ${lines} lines, all in ${allowed.length} allowlisted blocks (${ADR}).`;
    return { status: 0, output: [`web server log: the canary line once ${rest}`] };
  }

  /** @type {string[]} */
  const output = [];
  if (unexpected.length > 0) {
    const plural = unexpected.length === 1 ? '' : 's';
    output.push(
      `The web server printed ${unexpected.length} block${plural} of output nobody allowlisted:`,
      '',
    );
    for (const block of unexpected) {
      for (const line of block.lines) output.push(`  ${line}`);
      output.push('');
    }
    output.push(
      `Only \`${[...ALLOWED].join('`, `')}\` and its stack frames are accepted, as the`,
      `trade-off ${ADR} records. A server-side error on a page that still renders is invisible to`,
      'every other gate, so this one fails. Fix what the server reported, or record the decision',
      'and add its message to ALLOWED.',
    );
  }
  if (canaries === 0) {
    if (output.length > 0) output.push('');
    output.push(
      `the Playwright log (${path}) has no canary line, so this check cannot tell that it saw the`,
      "server's stderr. CI's web server command (apps/web/playwright.config.ts) prints",
      `\`[WebServer] ${CANARY}\` once before \`next start\`; without it the`,
      "capture broke, or the log is not from CI's e2e job: the local dev server does not print it.",
    );
  } else if (canaries > 1) {
    if (output.length > 0) output.push('');
    output.push(
      `the Playwright log (${path}) has the canary line ${canaries} times, where one Playwright`,
      'run starts its web server, and prints it, once: the log holds more than one run.',
    );
  }
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

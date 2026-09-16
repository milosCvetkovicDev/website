// Tests for the web-server log gate. Run with `pnpm test:scripts` (node:test, no dependency).
//
// The log this reads is the only place a server-side error shows up at all, so the cases that matter
// are the ones where a naive check exits 0: an error in a shape it does not recognise, an error
// hidden behind the allowlisted block, a log that was never captured, and a process that never runs
// the check at all.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { check, collectServerBlocks, unexpectedBlocks } from './check-webserver-log.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-webserver-log.mjs');

/** The allowlisted block as a green CI run printed it, verbatim from run 34696123296. */
const ALLOWED_BLOCK = [
  '[WebServer] Error: Internal: NoFallbackError',
  '[WebServer]     at m (.next/server/chunks/ssr/1_4v_next_dist_0xagw6n._.js:2:1229)',
  '[WebServer]     at responseGenerator (.next/server/chunks/ssr/1_4v_next_dist_0xagw6n._.js:2:4580)',
].join('\n');

// The shape of a green CI run: the web server's stdout is not forwarded, so the only server lines
// are ADR 0015's blocks, between the runner's own lines.
const GREEN_RUN = [
  'Running 176 tests using 1 worker',
  '  ✓  1 [chromium] › e2e/console-clean.spec.ts:22:5 › / has a clean console (2.1s)',
  ALLOWED_BLOCK,
  '  ✓  2 [chromium] › e2e/not-found-shell.spec.ts:9:5 › an unknown slug 404s (0.9s)',
  ALLOWED_BLOCK,
  '  176 passed (9.5m)',
  '',
].join('\n');

/**
 * Checks `log` in-process, as the command would, and returns the status and the printed text.
 *
 * @param {string} log
 */
const checkLog = (log) => {
  const { status, output } = check('e2e.log', () => log);
  return { status, text: output.join('\n') };
};

/**
 * Checks `log` through the real file path, the way CI does, and returns the process result.
 *
 * @param {string} log
 * @param {{ write?: boolean }} [options] `write: false` leaves the log file missing
 */
function run(log, { write = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'webserver-log-')));
  const path = join(dir, 'e2e.log');
  try {
    if (write) writeFileSync(path, log);
    const result = spawnSync(process.execPath, [script, path], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr, stdout: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('check-webserver-log', () => {
  it('passes a run whose only server output is the allowlisted NoFallbackError blocks', () => {
    const result = run(GREEN_RUN);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    // A pass says what it read, so a green CI step shows that it saw the server at all.
    assert.match(result.stdout, /6 lines, all in 2 allowlisted blocks/);
  });

  it('fails the same run with one more error, and prints that error', () => {
    const result = run(`${GREEN_RUN}[WebServer] Error: boom\n`);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: boom/);
    // The allowlisted blocks are not reprinted: the output is what has to be acted on.
    assert.doesNotMatch(result.stderr, /NoFallbackError\n/);
  });

  it('fails an empty log rather than reporting that it found nothing', () => {
    const result = run('');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is empty, so this check verified nothing/);
  });

  it('fails a log that is only whitespace', () => {
    const result = run('\n  \n\t\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is empty/);
  });

  it('fails a missing log', () => {
    const result = run('', { write: false });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read the Playwright log/);
  });

  it('fails when it is given no log at all', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /usage:/);
  });

  // Every CI run prints ADR 0015's block, so a log with runner output and no server line at all is
  // a capture that broke: stderr not forwarded, a renamed prefix, or a pnpm filter that matched no
  // package and exited 0 without running a single test.
  it('fails a log that has runner output but no [WebServer] line', () => {
    for (const log of [
      'Running 176 tests using 1 worker\n  176 passed (9.5m)\n',
      'No projects matched the filters in "/home/runner/work/website/website"\n',
    ]) {
      const { status, text } = checkLog(log);
      assert.equal(status, 1, log);
      assert.match(text, /has no \[WebServer\] line/);
    }
  });

  it('fails a log whose only server lines are blank', () => {
    const { status, text } = checkLog('Running 1 test\n[WebServer] \n[WebServer]\n');
    assert.equal(status, 1);
    assert.match(text, /has no \[WebServer\] line/);
  });

  // A downloaded GitHub Actions log carries the job name, step and timestamp in front of every line.
  // The check has to read that shape too, or pasting a CI log into it silently reports nothing.
  it('reads the [WebServer] prefix after the job, step and timestamp of a downloaded CI log', () => {
    const ciShape = [
      'End-to-end (Playwright)\tUNKNOWN STEP\t2026-09-12T13:21:31.1282257Z [WebServer] Error: Internal: NoFallbackError',
      'End-to-end (Playwright)\tUNKNOWN STEP\t2026-09-12T13:21:31.1284739Z [WebServer]     at m (x.js:2:1229)',
      'End-to-end (Playwright)\tUNKNOWN STEP\t2026-09-12T13:21:32.0000000Z [WebServer] TypeError: nope is not a function',
    ].join('\n');
    const blocks = collectServerBlocks(ciShape);
    assert.deepEqual(
      blocks.map((block) => block.message),
      ['Error: Internal: NoFallbackError', 'TypeError: nope is not a function'],
    );
    assert.equal(blocks[0]?.lines.length, 2);
    assert.equal(unexpectedBlocks(blocks).length, 1);
    assert.equal(checkLog(ciShape).status, 1);
  });

  // The check does not recognise errors by shape, so none of these can pass for not starting with a
  // `<Name>Error`: whatever the server writes to stderr outside ADR 0015's block is a finding.
  for (const line of [
    '⨯ unhandledRejection: something went wrong',
    '[Error: no stack] { digest: "1" }',
    'Failed to handle request: Error: boom',
    'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
    'DOMException [AbortError]: This operation was aborted',
    'Unhandled Rejection at: Promise { <rejected> }',
    '(node:1234) UnhandledPromiseRejectionWarning: Error: x',
    '⚠ metadataBase property in metadata export is not set',
  ]) {
    it(`fails on server output shaped ${JSON.stringify(line)}`, () => {
      const { status, text } = checkLog(`${GREEN_RUN}[WebServer] ${line}\n`);
      assert.equal(status, 1);
      assert.ok(text.includes(line), text);
    });
  }

  // An allowlisted block carries its stack frames and nothing else, so a line that follows it is
  // judged on its own rather than absorbed.
  it('does not let an error that follows the allowlisted block hide inside it', () => {
    const log = `${ALLOWED_BLOCK}\n[WebServer] [Error: real failure]\n[WebServer] { digest: '1' }\n`;
    const { status, text } = checkLog(log);
    assert.equal(status, 1);
    assert.match(text, /\[Error: real failure\]/);
    assert.match(text, /digest/);
    const blocks = collectServerBlocks(log);
    assert.equal(blocks[0]?.lines.length, 3);
    assert.deepEqual(unexpectedBlocks(blocks)[0]?.lines, [
      '[Error: real failure]',
      "{ digest: '1' }",
    ]);
  });

  // Playwright strips colour itself only when its own output is not a terminal and FORCE_COLOR is
  // unset. It sets FORCE_COLOR=1 for the server, so these are what reach the log otherwise.
  it("reads Next's red ⨯ marker as a finding", () => {
    const { status, text } = checkLog(
      `${GREEN_RUN}[WebServer] \u001b[31m\u001b[1m⨯\u001b[22m\u001b[39m Failed to render /work/x TypeError: boom\n`,
    );
    assert.equal(status, 1);
    assert.match(text, /⨯ Failed to render \/work\/x TypeError: boom/);
  });

  it('reads a line whose [WebServer] prefix Playwright dimmed', () => {
    const dim = (/** @type {string} */ text) => `\u001b[2m[WebServer] \u001b[22m${text}`;
    const log = [
      dim('Error: Internal: NoFallbackError'),
      dim('\u001b[90m    at m (node:internal/vm:209:10)\u001b[39m'),
      dim('TypeError: boom'),
    ].join('\n');
    const blocks = collectServerBlocks(log);
    assert.deepEqual(
      blocks.map((block) => [block.message, block.lines.length, block.allowed]),
      [
        ['Error: Internal: NoFallbackError', 2, true],
        ['TypeError: boom', 1, false],
      ],
    );
    assert.equal(checkLog(log).status, 1);
  });

  // A stderr chunk that ends mid-line reaches the log with the next chunk's prefix inside the line.
  // Neither fragment may pass.
  it('fails an error line split across two stderr chunks', () => {
    const { status, text } = checkLog(`${GREEN_RUN}[WebServer] TypeErr[WebServer] or: boom\n`);
    assert.equal(status, 1);
    assert.match(text, /TypeErr/);
  });

  it('keeps the stack frames of an unexpected error with it', () => {
    const blocks = collectServerBlocks(
      ['[WebServer] Error: boom', '[WebServer]     at Object.<anonymous> (a.js:1:1)'].join('\n'),
    );
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lines.length, 2);
  });

  it('does not attach a runner line that happens to follow a server error', () => {
    const blocks = collectServerBlocks(
      ['[WebServer] Error: boom', '  ✓  1 [chromium] › e2e/a.spec.ts:1:1 › x (1ms)'].join('\n'),
    );
    assert.equal(blocks[0]?.lines.length, 1);
  });

  // Anchored: a runner line that quotes the prefix, in an assertion message say, is not server output.
  it('does not read a runner line that quotes the prefix as server output', () => {
    const log = `${GREEN_RUN}    Expected: "[WebServer] Error: x"\n`;
    assert.equal(checkLog(log).status, 0);
  });

  it('reports an unreadable log rather than treating it as clean', () => {
    const result = check('/nope/e2e.log', () => {
      throw new Error('EACCES: permission denied');
    });
    assert.equal(result.status, 1);
    assert.match(result.output.join('\n'), /EACCES/);
  });
});

// Whether `main()` runs at all is a property of the process, so the entry guard is tested by spawning
// it, as check-allowbuilds-drift.test.mjs tests its own copy.
describe('the command entry guard', () => {
  /**
   * A copy of the script and a log with an unexpected error in it, reachable both by its real path
   * and through a symlinked directory. The temp directory is resolved first: macOS's /var is itself
   * a symlink to /private/var.
   */
  function buildFixture() {
    const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'webserver-log-entry-')));
    try {
      const real = join(root, 'real');
      mkdirSync(join(real, 'scripts'), { recursive: true });
      copyFileSync(script, join(real, 'scripts', basename(script)));
      writeFileSync(join(root, 'e2e.log'), `${GREEN_RUN}[WebServer] Error: boom\n`);
      symlinkSync(real, join(root, 'link'), 'dir');
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
    return {
      root,
      log: join(root, 'e2e.log'),
      /** @param {string} via */
      scriptIn: (via) => join(root, via, 'scripts', basename(script)),
    };
  }

  /** @param {string[]} args */
  const node = (args) =>
    spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH } });

  for (const via of ['real', 'link']) {
    it(`runs the check, and fails, when started by a ${via === 'real' ? 'real' : 'symlinked'} path`, () => {
      const fixture = buildFixture();
      try {
        const result = node([fixture.scriptIn(via), fixture.log]);
        assert.equal(result.status, 1, `expected exit 1 via ${via}, got ${result.status}`);
        assert.match(result.stderr, /Error: boom/);
      } finally {
        rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }

  it('does not run the check when the module is imported rather than started', () => {
    const fixture = buildFixture();
    try {
      const importer = join(fixture.root, 'importer.mjs');
      writeFileSync(
        importer,
        `await import(${JSON.stringify(pathToFileURL(fixture.scriptIn('real')).href)});\nconsole.log('imported');\n`,
      );
      const result = node([importer]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /imported/);
      assert.doesNotMatch(result.stderr, /usage:/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  // A module hook moves the script's directory away after Node has read the file and before its top
  // level runs, so neither side of the guard resolves any more. Answering `false` there skipped
  // main() and exited 0 having checked nothing.
  it('exits non-zero, rather than 0 in silence, when its own path no longer resolves', () => {
    const fixture = buildFixture();
    try {
      const target = pathToFileURL(fixture.scriptIn('real')).href;
      const hooks = join(fixture.root, 'hooks.mjs');
      writeFileSync(
        hooks,
        [
          "import { renameSync } from 'node:fs';",
          'export async function load(url, context, nextLoad) {',
          '  const result = await nextLoad(url, context);',
          `  if (url === ${JSON.stringify(target)}) {`,
          `    renameSync(${JSON.stringify(join(fixture.root, 'real'))}, ${JSON.stringify(join(fixture.root, 'moved'))});`,
          '  }',
          '  return result;',
          '}',
        ].join('\n'),
      );
      const register = join(fixture.root, 'register.mjs');
      writeFileSync(
        register,
        `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(hooks).href)});\n`,
      );
      const result = node([
        '--import',
        pathToFileURL(register).href,
        fixture.scriptIn('real'),
        fixture.log,
      ]);
      assert.notEqual(result.status, 0, 'a guard that cannot resolve its path must not exit 0');
      assert.match(result.stderr, /ENOENT/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

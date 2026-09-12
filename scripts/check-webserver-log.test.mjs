// Tests for the web-server log gate. Run with `pnpm test:scripts` (node:test, no dependency).
//
// The log this reads is the only place a server-side error shows up at all, so the cases that matter
// are the ones where a naive check exits 0: an error it does not recognise as one, an error hidden
// behind the allowlisted block, and a log that was never captured.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { check, collectErrorBlocks, unexpectedBlocks } from './check-webserver-log.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-webserver-log.mjs');

/** The two blocks a green run on `main` prints, verbatim from CI run 34696123296. */
const ALLOWED_BLOCK = [
  '[WebServer] Error: Internal: NoFallbackError',
  '[WebServer]     at m (.next/server/chunks/ssr/1_4v_next_dist_0xagw6n._.js:2:1229)',
  '[WebServer]     at responseGenerator (.next/server/chunks/ssr/1_4v_next_dist_0xagw6n._.js:2:4580)',
].join('\n');

const GREEN_RUN = [
  '[WebServer]   ▲ Next.js 16.3.4',
  '[WebServer]   - Local:        http://localhost:3000',
  '[WebServer]  ✓ Ready in 421ms',
  '  ✓  1 [chromium] › e2e/console-clean.spec.ts:22:5 › / has a clean console (2.1s)',
  ALLOWED_BLOCK,
  '  ✓  2 [chromium] › e2e/not-found-shell.spec.ts:9:5 › an unknown slug 404s (0.9s)',
  ALLOWED_BLOCK,
  '  51 passed (1.7m)',
  '',
].join('\n');

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
  it('passes a run whose only server errors are the allowlisted NoFallbackError blocks', () => {
    const result = run(GREEN_RUN);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
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

  // A downloaded GitHub Actions log carries the job name, step and timestamp in front of every line.
  // The check has to read that shape too, or pasting a CI log into it silently reports nothing.
  it('reads the [WebServer] prefix mid-line, as a downloaded CI log has it', () => {
    const ciShape = [
      'End-to-end (Playwright)\tUNKNOWN STEP\t2026-09-12T13:21:31.1282257Z [WebServer] Error: Internal: NoFallbackError',
      'End-to-end (Playwright)\tUNKNOWN STEP\t2026-09-12T13:21:31.1284739Z [WebServer]     at m (x.js:2:1229)',
      'End-to-end (Playwright)\tUNKNOWN STEP\t2026-09-12T13:21:32.0000000Z [WebServer] TypeError: nope is not a function',
    ].join('\n');
    const blocks = collectErrorBlocks(ciShape);
    assert.deepEqual(
      blocks.map((block) => block.message),
      ['Error: Internal: NoFallbackError', 'TypeError: nope is not a function'],
    );
    assert.equal(blocks[0].lines.length, 2);
    assert.equal(unexpectedBlocks(blocks).length, 1);
  });

  // Next formats some server-side errors itself, with a ⨯ instead of a stack's first line.
  it("recognises Next's ⨯ marker as an error", () => {
    const blocks = collectErrorBlocks('[WebServer] ⨯ unhandledRejection: something went wrong\n');
    assert.equal(blocks.length, 1);
    assert.equal(unexpectedBlocks(blocks).length, 1);
  });

  it('keeps a stack frame with its error and does not open a block of its own', () => {
    const blocks = collectErrorBlocks(
      ['[WebServer] Error: boom', '[WebServer]     at Object.<anonymous> (a.js:1:1)'].join('\n'),
    );
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0].lines.length, 2);
  });

  it('does not attach a runner line that happens to follow a server error', () => {
    const blocks = collectErrorBlocks(
      ['[WebServer] Error: boom', '  ✓  1 [chromium] › e2e/a.spec.ts:1:1 › x (1ms)'].join('\n'),
    );
    assert.equal(blocks[0].lines.length, 1);
  });

  it('ignores ordinary server output', () => {
    assert.deepEqual(
      collectErrorBlocks(['[WebServer]  ✓ Ready in 421ms', '[WebServer]   ▲ Next.js'].join('\n')),
      [],
    );
  });

  it('reports an unreadable log rather than treating it as clean', () => {
    const result = check('/nope/e2e.log', () => {
      throw new Error('EACCES: permission denied');
    });
    assert.equal(result.status, 1);
    assert.match(result.output.join('\n'), /EACCES/);
  });
});

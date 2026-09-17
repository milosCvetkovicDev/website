// Tests for scripts/verify-flake.sh. Run with `pnpm test:scripts` (node:test).
//
// The script is copied into a temporary tree shaped like this repository, under a directory whose
// name holds a space and regular-expression metacharacters. Its apps/web/node_modules/.bin holds a
// stub `playwright` run by node, as the real pnpm shim execs node, so that it receives a Ctrl-C
// sent to the process group even when started in the background. For each run the stub replays a
// Playwright JSON report and an exit code prepared by the test, can sleep first, and records its
// arguments, its pid and every SIGINT it gets. A do-nothing `pnpm` and, where the platform reads
// it, a `sysctl` that reports a fixed load average sit first on PATH. No browser or server starts.
// What is under test is the contract in the script's header.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'verify-flake.sh');
const PROC_LOADAVG = existsSync('/proc/loadavg');

const STUB_PLAYWRIGHT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const stub = process.env.STUB;
const countFile = path.join(stub, 'count');
const n = (fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0) + 1;
fs.writeFileSync(countFile, String(n));
const args = process.argv.slice(2);
fs.writeFileSync(path.join(stub, 'args-' + n), [process.cwd(), ...args].join('\\n') + '\\n');
const file = (name) => path.join(stub, 'run-' + n + '.' + name);
const read = (name, fallback) =>
  fs.existsSync(file(name)) ? fs.readFileSync(file(name), 'utf8') : fallback;
const env = process.env;
// Playwright's own precedence: _FILE, then _DIR joined with _NAME, then _NAME.
const report = env.PLAYWRIGHT_JSON_OUTPUT_FILE ||
  (env.PLAYWRIGHT_JSON_OUTPUT_DIR
    ? path.join(env.PLAYWRIGHT_JSON_OUTPUT_DIR, env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'report.json')
    : env.PLAYWRIGHT_JSON_OUTPUT_NAME);
const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
function finish(code) {
  if (fs.existsSync(file('json')) && report) fs.copyFileSync(file('json'), report);
  if (output) {
    fs.mkdirSync(path.join(output, 'x-failed'), { recursive: true });
    fs.writeFileSync(path.join(output, 'x-failed', 'error-context.md'), 'context');
  }
  process.exit(code);
}
fs.writeFileSync(path.join(stub, 'pid-' + n), String(process.pid));
let interrupts = 0;
process.on('SIGINT', () => {
  interrupts += 1;
  fs.appendFileSync(path.join(stub, 'sigint-' + n), 'SIGINT\\n');
  // Stay a while, as Playwright does while it stops its server, so that a second SIGINT sent
  // on the same signal would be recorded even on a loaded machine.
  if (interrupts === 1) setTimeout(() => process.exit(130), 3000);
});
setTimeout(() => finish(Number(read('exit', '0'))), Number(read('sleep', '0')));
`;

/** @type {string} */
let root;
/** @type {string} */
let stub;
/** @type {string} */
let cwd;

beforeEach(() => {
  // Resolved, because bash reports the physical path of a symlinked tmpdir (macOS /var).
  root = realpathSync(mkdtempSync(join(tmpdir(), 'verify flake (a+b) [c]-')));
  mkdirSync(join(root, 'repo/scripts'), { recursive: true });
  mkdirSync(join(root, 'repo/apps/web/e2e/mobile'), { recursive: true });
  mkdirSync(join(root, 'repo/apps/web/node_modules/.bin'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'repo/scripts/verify-flake.sh'));
  writeFileSync(join(root, 'repo/apps/web/e2e/x.spec.ts'), '');
  writeFileSync(join(root, 'repo/apps/web/e2e/mobile/x.spec.ts'), '');
  const playwright = join(root, 'repo/apps/web/node_modules/.bin/playwright');
  writeFileSync(playwright, STUB_PLAYWRIGHT);
  chmodSync(playwright, 0o755);
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  writeFileSync(join(stub, 'bin/pnpm'), '#!/bin/sh\nexit 99\n');
  chmodSync(join(stub, 'bin/pnpm'), 0o755);
  writeFileSync(join(stub, 'bin/sysctl'), '#!/bin/sh\necho "{ 7.25 1.00 1.00 }"\n');
  chmodSync(join(stub, 'bin/sysctl'), 0o755);
  cwd = join(root, 'cwd');
  mkdirSync(cwd);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * Prepares run N of the stub: the report it writes (null for none), the exit code and a delay.
 *
 * @param {number} n
 * @param {object | null} body
 * @param {number} [exit]
 * @param {{ sleepMs?: number }} [options]
 */
function plan(n, body, exit = 0, { sleepMs = 0 } = {}) {
  if (body !== null) writeFileSync(join(stub, `run-${n}.json`), JSON.stringify(body));
  writeFileSync(join(stub, `run-${n}.exit`), String(exit));
  if (sleepMs) writeFileSync(join(stub, `run-${n}.sleep`), String(sleepMs));
}

/** @param {Record<string, string>} env */
const environment = (env) => ({
  ...process.env,
  // Unset in the child unless a test sets them: CI=true on the runner would pick CI mode.
  CI: '',
  PLAYWRIGHT_JSON_OUTPUT_FILE: '',
  PLAYWRIGHT_JSON_OUTPUT_DIR: '',
  PLAYWRIGHT_JSON_OUTPUT_NAME: '',
  ...env,
  STUB: stub,
  PATH: `${join(stub, 'bin')}:${process.env.PATH}`,
});

const invocations = () =>
  existsSync(join(stub, 'count')) ? Number(readFileSync(join(stub, 'count'), 'utf8')) : 0;

// Generous: every run starts several node processes, which take seconds each on a loaded machine.
/**
 * @param {string[]} args
 * @param {{ env?: Record<string, string>, timeout?: number }} [options]
 */
function sweep(args, { env = {}, timeout = 300_000 } = {}) {
  const result = spawnSync('bash', [join(root, 'repo/scripts/verify-flake.sh'), ...args], {
    cwd,
    encoding: 'utf8',
    env: environment(env),
    timeout,
  });
  return { ...result, invocations: invocations() };
}

/**
 * Starts a sweep as the leader of its own process group, for the signal tests.
 *
 * @param {string[]} args
 * @param {{ closeOutput?: boolean }} [options]
 */
function sweepInBackground(args, { closeOutput = false } = {}) {
  const child = spawn('bash', [join(root, 'repo/scripts/verify-flake.sh'), ...args], {
    cwd,
    env: environment({}),
    detached: true,
  });
  let stdout = '';
  let stderr = '';
  if (closeOutput) {
    // As `2>&1 | true` leaves it: every write to stdout or stderr meets a closed pipe.
    child.stdout.destroy();
    child.stderr.destroy();
  } else {
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
  }
  const exited = new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr })),
  );
  return { child, exited };
}

/**
 * @param {string} path
 * @param {number} [ms]
 */
async function waitFor(path, ms = 120_000) {
  for (let waited = 0; waited < ms; waited += 50) {
    if (existsSync(path)) return;
    await sleep(50);
  }
  throw new Error(`${path} never appeared`);
}

/** A pid no process has any more. */
function deadPid() {
  const { pid } = spawnSync('true');
  assert.equal(alive(pid), false);
  return pid;
}

/** @param {number} pid */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {{
 *   title: string,
 *   status: string,
 *   line?: number,
 *   project?: string,
 *   declared?: string,
 *   durations?: number[],
 *   describe?: string,
 * }} Test
 */

/**
 * A Playwright JSON report. Each test is { title, status, line?, project?, declared?, durations?,
 * describe? }; a test with a describe title sits in a suite of that name inside the file's suite.
 *
 * @param {Test[]} tests
 * @param {{ errors?: { message: string }[], file?: string }} [options]
 */
function report(tests, { errors = [], file = 'x.spec.ts' } = {}) {
  /** @param {string} status */
  const count = (status) => tests.filter((t) => t.status === status).length;
  /**
   * @param {Test} t
   * @param {number} i
   */
  const spec = (t, i) => ({
    title: t.title,
    file,
    line: t.line ?? 10 + i,
    tests: [
      {
        projectName: t.project ?? 'chromium',
        expectedStatus: t.declared ?? 'passed',
        status: t.status,
        results: (t.durations ?? [100]).map((duration) => ({ duration })),
      },
    ],
  });
  const describes = [
    ...new Set(tests.filter((t) => t.describe !== undefined).map((t) => t.describe)),
  ];
  return {
    config: { rootDir: join(root, 'repo/apps/web/e2e') },
    suites: [
      {
        title: file,
        file,
        specs: tests
          .map((t, i) => /** @type {[Test, number]} */ ([t, i]))
          .filter(([t]) => t.describe === undefined)
          .map(([t, i]) => spec(t, i)),
        suites: describes.map((title) => ({
          title,
          file,
          specs: tests
            .map((t, i) => /** @type {[Test, number]} */ ([t, i]))
            .filter(([t]) => t.describe === title)
            .map(([t, i]) => spec(t, i)),
          suites: [],
        })),
      },
    ],
    errors,
    stats: {
      expected: count('expected'),
      unexpected: count('unexpected'),
      flaky: count('flaky'),
      skipped: count('skipped'),
    },
  };
}

const passing = (durations = [100]) => report([{ title: 'works', status: 'expected', durations }]);
const failing = () => report([{ title: 'works', status: 'unexpected', durations: [500] }]);

const verifyDir = () => join(cwd, '.verify');
/** @param {string} name */
const readJson = (name) => JSON.parse(readFileSync(join(verifyDir(), name), 'utf8'));
const summary = () => readFileSync(join(verifyDir(), 'summary.txt'), 'utf8');

/**
 * The summary row whose test column starts with `test`, split into its six columns.
 *
 * @param {string} test
 */
function row(test) {
  const line = summary()
    .split('\n')
    .find((l) => l.includes(`  ${test}`));
  assert.ok(line, `no summary row for ${test} in:\n${summary()}`);
  return line.trim().split(/ {2,}/);
}

/**
 * Every stderr line of a sweep that met no error: progress lines and the closing pointer.
 *
 * @param {string} stderr
 */
function assertQuietStderr(stderr) {
  for (const line of stderr.split('\n').filter(Boolean)) {
    assert.match(
      line,
      /^(run \d+\/\d+ (passed|FAILED): .*|verify-flake: reports in .*)$/,
      `unexpected stderr line: ${line}`,
    );
  }
}

describe('arguments', () => {
  it('rejects anything other than two arguments', () => {
    for (const args of [[], ['3'], ['3', 'e2e/x.spec.ts', 'extra']]) {
      const run = sweep(args);
      assert.equal(run.status, 2, `args ${JSON.stringify(args)}`);
      assert.match(run.stderr, /usage: scripts\/verify-flake\.sh <runs> <spec/);
    }
  });

  it('rejects a run count that is not a positive integer without leading zeros', () => {
    for (const runs of ['0', '-1', 'abc', '010', '2.5', '']) {
      const run = sweep([runs, 'e2e/x.spec.ts']);
      assert.equal(run.status, 2, `runs '${runs}'`);
      assert.match(run.stderr, /runs must be a positive integer without leading zeros/);
      assert.equal(run.invocations, 0);
    }
  });

  it('rejects more than 1000 runs before starting any', () => {
    for (const runs of ['1001', '99999', '100000']) {
      const run = sweep([runs, 'e2e/x.spec.ts'], { timeout: 30_000 });
      assert.equal(run.status, 2, `${runs}: finished in time with exit 2`);
      assert.match(run.stderr, new RegExp(`runs must be at most 1000, got ${runs}`));
      assert.equal(run.invocations, 0);
    }
  });

  it('rejects a spec that does not exist, before touching .verify', () => {
    mkdirSync(verifyDir());
    writeFileSync(join(verifyDir(), 'keep'), '');
    const run = sweep(['3', 'e2e/missing.spec.ts']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /no e2e\/missing\.spec\.ts in /);
    assert.equal(run.invocations, 0);
    assert.ok(existsSync(join(verifyDir(), 'keep')), 'an earlier .verify survives a bad spec');
  });

  it('accepts ./, apps/web/ and an absolute path, and runs the spec anchored from apps/web', () => {
    const web = join(root, 'repo/apps/web');
    for (const spec of [
      'e2e/x.spec.ts',
      './e2e/x.spec.ts',
      'apps/web/e2e/x.spec.ts',
      `${web}/e2e/x.spec.ts`,
    ]) {
      rmSync(join(stub, 'count'), { force: true });
      plan(1, passing());
      const run = sweep(['1', spec]);
      assert.equal(run.status, 0, `${spec}: ${run.stderr}`);
      const [dir, ...argv] = readFileSync(join(stub, 'args-1'), 'utf8').trim().split('\n');
      assert.equal(dir, web);
      const escaped = `${web}/e2e/x.spec.ts`.replace(/[\][\\.*^$(){}?+|]/g, '\\$&');
      assert.match(web, /[ (+[]/, 'the tree has metacharacters to escape');
      assert.deepEqual(argv, [
        'test',
        `^${escaped}$`,
        '--reporter=json',
        '--output',
        join(verifyDir(), 'run-1-results'),
      ]);
    }
  });

  it('rejects an absolute spec outside apps/web', () => {
    const run = sweep(['1', join(root, 'repo/scripts/verify-flake.sh')]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /is not inside/);
  });
});

describe('recording runs', () => {
  it('passes when every run passes, and wraps each report with the run it came from', () => {
    for (const n of [1, 2, 3]) plan(n, passing(), 0, { sleepMs: n === 1 ? 300 : 0 });
    const run = sweep(['3', 'e2e/x.spec.ts']);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.invocations, 3);
    for (const n of [1, 2, 3]) {
      const body = readJson(`run-${n}.json`);
      assert.equal(body.verify.run, n);
      assert.equal(body.verify.exitCode, 0);
      assert.equal(typeof body.verify.durationMs, 'number');
      assert.ok(body.verify.durationMs >= 0);
      if (PROC_LOADAVG) assert.equal(typeof body.verify.load1, 'number');
      else assert.equal(body.verify.load1, 7.25, 'the load average the system reported');
      assert.deepEqual(body.stats, passing().stats, 'the Playwright report is kept whole');
      assert.ok(existsSync(join(verifyDir(), `run-${n}.log`)));
      assert.ok(!existsSync(join(verifyDir(), `run-${n}.playwright.json`)));
      assert.ok(
        !existsSync(join(verifyDir(), `run-${n}-results`)),
        'a passing run keeps no results',
      );
    }
    assert.ok(readJson('run-1.json').verify.durationMs >= 250, 'the wall duration of a slow run');
    assert.match(summary(), /^runs passed {2}3\/3 \(100\.0%\)$/m);
    assert.match(run.stdout, /runs passed {2}3\/3/, 'the summary goes to stdout');
    assert.doesNotMatch(run.stdout, /^run \d/m, 'progress lines do not');
    assert.match(run.stderr, /^run 1\/3 passed: 1 expected/m);
    assertQuietStderr(run.stderr);
  });

  it('records a run with failing tests, keeps going, keeps its results and exits 1', () => {
    plan(1, passing());
    plan(2, failing(), 1);
    plan(3, passing());
    const run = sweep(['3', 'e2e/x.spec.ts']);
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.invocations, 3, 'a failing run does not stop the sweep');
    assert.equal(readJson('run-2.json').verify.exitCode, 1);
    assert.ok(existsSync(join(verifyDir(), 'run-2-results/x-failed/error-context.md')));
    assert.match(summary(), /^runs passed {2}2\/3 \(66\.7%\)$/m);
    assert.deepEqual(row('x.spec.ts:10'), [
      '2/3',
      '66.7',
      '0',
      '100',
      '500',
      'x.spec.ts:10 works [chromium]',
    ]);
    assert.match(run.stderr, /^run 2\/3 FAILED: 0 expected, 1 unexpected/m);
    assertQuietStderr(run.stderr);
  });

  it('counts a run whose test needed a retry as failed, and keeps its results', () => {
    plan(1, report([{ title: 'works', status: 'flaky', durations: [100, 900] }]));
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 1, run.stderr);
    assert.match(summary(), /^runs passed {2}0\/1 \(0\.0%\)$/m);
    assert.deepEqual(row('x.spec.ts:10'), [
      '0/1',
      '0.0',
      '1',
      '900',
      '900',
      'x.spec.ts:10 works [chromium]',
    ]);
    assert.ok(existsSync(join(verifyDir(), 'run-1-results')), 'a flaky run keeps its results');
  });

  it('treats a test.fail() that fails as passing, and marks skipped tests', () => {
    plan(
      1,
      report([
        { title: 'known bug', status: 'expected', declared: 'failed' },
        { title: 'not here', status: 'skipped', declared: 'skipped', durations: [] },
      ]),
    );
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(row('x.spec.ts:10'), [
      '1/1',
      '100.0',
      '0',
      '100',
      '100',
      'x.spec.ts:10 known bug [chromium] (declared failed)',
    ]);
    assert.deepEqual(row('x.spec.ts:11'), [
      '0/0',
      '-',
      '0',
      '-',
      '-',
      'x.spec.ts:11 not here [chromium] (declared skipped), skipped 1x',
    ]);
  });

  it('keeps tests apart that share a file, line and title under different describes', () => {
    plan(
      1,
      report([
        { title: 'axe', status: 'expected', line: 12, describe: 'light' },
        { title: 'axe', status: 'unexpected', line: 12, describe: 'dark' },
        { title: 'clicks', status: 'expected', line: 20, describe: '' },
      ]),
      1,
    );
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 1, run.stderr);
    assert.equal(row('x.spec.ts:12 dark > axe')[0], '0/1');
    assert.equal(row('x.spec.ts:12 light > axe')[0], '1/1');
    assert.equal(row('x.spec.ts:20 clicks')[0], '1/1', 'an anonymous describe adds nothing');
  });

  it('keeps one test apart per project', () => {
    plan(
      1,
      report([
        { title: 'menu', status: 'expected', line: 12, project: 'mobile-chrome' },
        { title: 'menu', status: 'unexpected', line: 12, project: 'mobile-safari' },
      ]),
      1,
    );
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 1, run.stderr);
    assert.equal(row('x.spec.ts:12 menu [mobile-chrome]')[0], '1/1');
    assert.equal(row('x.spec.ts:12 menu [mobile-safari]')[0], '0/1');
  });

  it('records every run when the reader of its output has gone away', async () => {
    for (const n of [1, 2, 3]) plan(n, passing(), 0, { sleepMs: 300 });
    const { exited } = sweepInBackground(['3', 'e2e/x.spec.ts'], { closeOutput: true });
    const done = await exited;
    assert.equal(done.code, 0, 'exit 0, as every run passed');
    assert.equal(invocations(), 3);
    for (const n of [1, 2, 3]) {
      const body = readJson(`run-${n}.json`);
      assert.equal(body.verify.run, n);
      assert.ok(Number.isInteger(body.verify.durationMs), 'a clean duration');
      assert.ok(!existsSync(join(verifyDir(), `run-${n}.playwright.json`)));
    }
    assert.match(summary(), /^verify-flake: e2e\/x\.spec\.ts, 3 runs, dev server$/m);
    assert.doesNotMatch(summary(), /stopped early/);
  });

  it('writes the report where it says despite PLAYWRIGHT_JSON_OUTPUT_* in the environment', () => {
    plan(1, passing());
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    const run = sweep(['1', 'e2e/x.spec.ts'], {
      env: {
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(elsewhere, 'file.json'),
        PLAYWRIGHT_JSON_OUTPUT_DIR: elsewhere,
        PLAYWRIGHT_JSON_OUTPUT_NAME: 'name.json',
      },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readJson('run-1.json').verify.run, 1);
  });

  it('names the server mode it measured: CI=true and CI=1 are CI, anything else is not', () => {
    for (const [ci, mode] of [
      ['', 'dev server'],
      ['true', 'production build (CI)'],
      ['1', 'production build (CI)'],
      ['false', 'dev server'],
    ]) {
      rmSync(join(stub, 'count'), { force: true });
      plan(1, passing());
      const run = sweep(['1', 'e2e/x.spec.ts'], { env: { CI: ci } });
      assert.equal(run.status, 0, run.stderr);
      const escaped = mode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        summary(),
        new RegExp(`^verify-flake: e2e/x\\.spec\\.ts, 1 runs, ${escaped}$`, 'm'),
        `CI='${ci}'`,
      );
    }
  });
});

describe('.verify', () => {
  it('replaces an earlier .verify once the first run is recorded', () => {
    mkdirSync(verifyDir());
    writeFileSync(join(verifyDir(), 'run-9.json'), '{}');
    plan(1, passing());
    assert.equal(sweep(['1', 'e2e/x.spec.ts']).status, 0);
    assert.ok(!existsSync(join(verifyDir(), 'run-9.json')));
    assert.ok(!existsSync(join(cwd, '.verify.previous')), 'the earlier one is gone');
    assert.ok(!existsSync(join(cwd, '.verify.lock')), 'the lock is released');
  });

  it('keeps an earlier .verify when the sweep stops before recording a run', () => {
    mkdirSync(verifyDir());
    writeFileSync(join(verifyDir(), 'summary.txt'), 'the earlier sweep');
    plan(
      1,
      report([], { errors: [{ message: 'Error: http://localhost:3210 is already used' }] }),
      1,
    );
    const run = sweep(['3', 'e2e/x.spec.ts']);
    assert.equal(run.status, 2);
    assert.equal(summary(), 'the earlier sweep');
    assert.ok(
      existsSync(join(cwd, '.verify.failed/run-1.log')),
      'the failed attempt is kept aside',
    );
    assert.ok(!existsSync(join(cwd, '.verify.previous')));
    assert.ok(!existsSync(join(cwd, '.verify.lock')));
  });

  it('refuses to start while another live sweep holds the lock', () => {
    mkdirSync(verifyDir());
    writeFileSync(join(verifyDir(), 'summary.txt'), 'the other sweep');
    mkdirSync(join(cwd, '.verify.lock'));
    writeFileSync(join(cwd, '.verify.lock/pid'), String(process.pid));
    plan(1, passing());
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, new RegExp(`another sweep \\(pid ${process.pid}\\) is writing`));
    assert.equal(run.invocations, 0);
    assert.equal(summary(), 'the other sweep');
    assert.ok(existsSync(join(cwd, '.verify.lock/pid')), "the other sweep's lock is left alone");
  });

  it('takes over a lock whose sweep is gone, without noise', () => {
    mkdirSync(join(cwd, '.verify.lock'));
    writeFileSync(join(cwd, '.verify.lock/pid'), String(deadPid()));
    plan(1, passing());
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 0, run.stderr);
    assertQuietStderr(run.stderr);
    assert.ok(!existsSync(join(cwd, '.verify.lock')), 'the lock is released');
    assert.ok(!existsSync(join(cwd, '.verify.lock.taking')));
  });

  it('refuses to start while another sweep is taking the lock, and leaves it alone', () => {
    mkdirSync(join(cwd, '.verify.lock.taking'));
    plan(1, passing());
    const run = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /another sweep is taking .*\.verify\.lock; if none is, remove /);
    assert.equal(run.invocations, 0);
    assert.ok(existsSync(join(cwd, '.verify.lock.taking')));
    assert.ok(!existsSync(join(cwd, '.verify.lock')));
  });

  it('lets only one of two sweeps take over the same stale lock', async () => {
    mkdirSync(join(cwd, '.verify.lock'));
    writeFileSync(join(cwd, '.verify.lock/pid'), String(deadPid()));
    // Holds the first sweep between reading the stale pid and replacing the lock, the window in
    // which a second sweep could also judge the lock stale.
    const realCat = spawnSync('sh', ['-c', 'command -v cat'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(
      join(stub, 'bin/cat'),
      [
        '#!/bin/sh',
        'case "$1" in */.verify.lock/pid)',
        `  touch "$STUB/cat-read-lock"; "${realCat}" "$@"; sleep 3; exit 0 ;;`,
        'esac',
        `exec "${realCat}" "$@"`,
        '',
      ].join('\n'),
    );
    chmodSync(join(stub, 'bin/cat'), 0o755);
    plan(1, passing(), 0, { sleepMs: 1000 });
    const first = sweepInBackground(['1', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'cat-read-lock'));
    const second = sweepInBackground(['1', 'e2e/x.spec.ts']);
    const results = [await first.exited, await second.exited];
    const codes = results.map((r) => r.code).sort();
    assert.deepEqual(codes, [0, 2], results.map((r) => r.stderr).join('\n'));
    assert.equal(invocations(), 1, 'only one sweep ran');
    assert.match(results.find((r) => r.code === 2).stderr, /another sweep is taking/);
    assert.match(summary(), /^runs passed {2}1\/1/m);
    assert.ok(!existsSync(join(cwd, '.verify.lock')));
  });

  it('puts back the results a sweep killed before its first run had set aside', () => {
    mkdirSync(join(cwd, '.verify.previous'));
    writeFileSync(join(cwd, '.verify.previous/summary.txt'), 'the earlier sweep');
    mkdirSync(verifyDir());
    writeFileSync(join(verifyDir(), 'run-1.log'), 'the killed attempt');
    mkdirSync(join(cwd, '.verify.lock'));
    writeFileSync(join(cwd, '.verify.lock/pid'), String(deadPid()));
    plan(
      1,
      report([], { errors: [{ message: 'Error: http://localhost:3210 is already used' }] }),
      1,
    );
    const run = sweep(['3', 'e2e/x.spec.ts']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /put back .*\.verify\.previous, left by a sweep killed/);
    assert.equal(summary(), 'the earlier sweep');
    assert.ok(!existsSync(join(cwd, '.verify.previous')));
    assert.ok(existsSync(join(cwd, '.verify.failed/run-1.log')), 'this attempt is kept aside');
  });

  it('lets only one of two concurrent sweeps from one directory write .verify', async () => {
    plan(1, passing(), 0, { sleepMs: 1500 });
    const first = sweepInBackground(['1', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'pid-1'));
    const second = sweep(['1', 'e2e/x.spec.ts']);
    assert.equal(second.status, 2);
    assert.match(second.stderr, /another sweep \(pid \d+\) is writing/);
    const done = await first.exited;
    assert.equal(done.code, 0, done.stderr);
    assert.equal(readJson('run-1.json').verify.run, 1);
    assert.match(summary(), /^runs passed {2}1\/1/m);
  });
});

describe('summary', () => {
  it('reports nearest-rank percentiles, which are always measured values', () => {
    const durations = [700, 100, 1000, 300, 200, 900, 400, 600, 500, 800];
    durations.forEach((ms, i) => plan(i + 1, passing([ms])));
    const run = sweep(['10', 'e2e/x.spec.ts']);
    assert.equal(run.status, 0, run.stderr);
    // Rank ceil(10 * 0.5) = 5 is 500; rank ceil(10 * 0.95) = 10 is the slowest, 1000.
    assert.deepEqual(row('x.spec.ts:10').slice(0, 5), ['10/10', '100.0', '0', '500', '1000']);
  });

  it('rounds the rank up, which only shows from 11 runs', () => {
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
    durations.forEach((ms, i) => plan(i + 1, passing([ms])));
    const run = sweep(['11', 'e2e/x.spec.ts']);
    assert.equal(run.status, 0, run.stderr);
    // ceil(11 * 0.5) = 6 and ceil(11 * 0.95) = 11; rounding would give 6 and 10.
    assert.deepEqual(row('x.spec.ts:10').slice(3, 5), ['600', '1100']);
  });

  it('takes the slowest attempt as a test duration, wherever it came', () => {
    plan(1, report([{ title: 'works', status: 'flaky', durations: [1200, 30000] }]));
    sweep(['1', 'e2e/x.spec.ts']);
    assert.deepEqual(row('x.spec.ts:10').slice(3), [
      '30000',
      '30000',
      'x.spec.ts:10 works [chromium]',
    ]);
  });

  it('gives p50 and p95 of the runs themselves', () => {
    for (let n = 1; n <= 10; n += 1) plan(n, passing(), 0, { sleepMs: n === 10 ? 1500 : 0 });
    const run = sweep(['10', 'e2e/x.spec.ts'], { timeout: 300_000 });
    assert.equal(run.status, 0, run.stderr);
    const [, p50, p95] = /** @type {RegExpMatchArray} */ (
      summary().match(/^run duration p50 (\d+\.\d) s, p95 (\d+\.\d) s \(nearest rank\)$/m)
    );
    assert.ok(Number(p95) >= 1.4, `p95 ${p95} is the slow run`);
    assert.ok(Number(p50) < Number(p95), `p50 ${p50} is below p95 ${p95}`);
  });
});

describe('errors stop the sweep with exit 2', () => {
  /**
   * @param {string} name
   * @param {() => void} prepare
   * @param {RegExp} message
   */
  const stops = (name, prepare, message) =>
    it(name, () => {
      plan(1, passing());
      prepare();
      plan(3, passing());
      const run = sweep(['3', 'e2e/x.spec.ts']);
      assert.equal(run.status, 2, run.stderr);
      assert.match(run.stderr, message);
      assert.equal(run.invocations, 2, 'no run starts after the error');
      assert.match(summary(), /^verify-flake: e2e\/x\.spec\.ts, 1 of 3 runs, dev server$/m);
      assert.match(
        summary(),
        /^stopped early: run 2 /m,
        'the recorded run is summarised as partial',
      );
      assert.ok(!existsSync(join(verifyDir(), 'run-2.playwright.json')), 'no raw report is left');
      assert.doesNotMatch(run.stderr, /line \d+ exited/, 'the error is named, not a line number');
    });

  stops('a run that writes no report', () => plan(2, null, 1), /run 2 wrote no JSON report/);
  stops(
    'a report that is not a Playwright report',
    () => writeFileSync(join(stub, 'run-2.json'), '{"not": "a report"}'),
    /not a Playwright JSON report/,
  );
  stops(
    'a report whose counts are not whole numbers',
    () => {
      const body = passing();
      body.stats.expected = 1.5;
      plan(2, body);
    },
    /not a Playwright JSON report/,
  );
  stops(
    'every error outside any test, such as a server that never started',
    () =>
      plan(
        2,
        report([], {
          errors: [
            { message: 'Error: http://localhost:3210 is already used' },
            { message: 'Error: No tests found' },
          ],
        }),
        1,
      ),
    new RegExp(
      'errors outside any test \\(exit 1\\):\\n' +
        'Error: http://localhost:3210 is already used\\nError: No tests found',
    ),
  );
  stops(
    'a run in which every test was skipped',
    () =>
      plan(2, report([{ title: 'works', status: 'skipped', declared: 'skipped', durations: [] }])),
    /run 2 ran no tests \(1 skipped\)/,
  );
  stops(
    'an exit code that is not a test result',
    () => plan(2, passing(), 3),
    /run 2 exited 3, which is not a test result/,
  );
  stops(
    'exit 0 with unexpected tests in the report',
    () => plan(2, failing(), 0),
    /exited 0 but its report counts 1 unexpected/,
  );
  stops(
    'exit 1 with no unexpected tests in the report',
    () => plan(2, passing(), 1),
    /exited 1 but its report counts 0 unexpected/,
  );
  it('stops on a report for a file whose path merely ends like the spec', () => {
    plan(1, report([{ title: 'desktop', status: 'expected' }], { file: 'x.spec.ts' }));
    const run = sweep(['1', 'e2e/mobile/x.spec.ts']);
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /run 1 ran x\.spec\.ts, not only e2e\/mobile\/x\.spec\.ts/);
  });

  it('stops with 130 when a run was interrupted on its own', () => {
    plan(1, passing());
    plan(2, passing(), 130);
    plan(3, passing());
    const run = sweep(['3', 'e2e/x.spec.ts']);
    assert.equal(run.status, 130, run.stderr);
    assert.equal(run.invocations, 2);
    assert.match(summary(), /^stopped early: run 2 was interrupted$/m);
  });

  stops(
    'a report for another file',
    () => plan(2, report([{ title: 'works', status: 'expected' }], { file: 'mobile/x.spec.ts' })),
    /run 2 ran mobile\/x\.spec\.ts, not only e2e\/x\.spec\.ts/,
  );
});

describe('signals', () => {
  it('stops on Ctrl-C to the group with 130, a partial summary and one SIGINT', async () => {
    plan(1, passing());
    plan(2, passing(), 0, { sleepMs: 5000 });
    plan(3, passing());
    const { child, exited } = sweepInBackground(['3', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'pid-2'));
    await sleep(200);
    process.kill(-(/** @type {number} */ (child.pid)), 'SIGINT');
    const done = await exited;
    assert.equal(done.code, 130, done.stderr);
    const stubPid = Number(readFileSync(join(stub, 'pid-2'), 'utf8'));
    assert.equal(alive(stubPid), false, 'Playwright has exited');
    assert.equal(readFileSync(join(stub, 'sigint-2'), 'utf8'), 'SIGINT\n', 'exactly one SIGINT');
    assert.equal(invocations(), 2, 'no run starts after the interrupt');
    assert.match(
      summary(),
      /^stopped early: interrupted during run 2, which was not recorded; see run-2\.log$/m,
    );
    assert.match(summary(), /^runs passed {2}1\/1/m);
    assert.ok(!existsSync(join(verifyDir(), 'run-2.playwright.json')));
    assert.ok(!existsSync(join(cwd, '.verify.lock')));
  });

  it('stops on SIGTERM to the script with 143, passing Playwright one SIGINT', async () => {
    plan(1, passing());
    plan(2, passing(), 0, { sleepMs: 5000 });
    const { child, exited } = sweepInBackground(['2', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'pid-2'));
    await sleep(200);
    process.kill(/** @type {number} */ (child.pid), 'SIGTERM');
    const done = await exited;
    assert.equal(done.code, 143, done.stderr);
    const stubPid = Number(readFileSync(join(stub, 'pid-2'), 'utf8'));
    assert.equal(alive(stubPid), false, 'Playwright was stopped, not orphaned');
    assert.equal(readFileSync(join(stub, 'sigint-2'), 'utf8'), 'SIGINT\n', 'exactly one SIGINT');
    assert.match(summary(), /^stopped early: terminated during run 2, which was not recorded/m);
  });

  it('stops on SIGHUP to the script with 129, passing Playwright one SIGINT', async () => {
    plan(1, passing());
    plan(2, passing(), 0, { sleepMs: 5000 });
    const { child, exited } = sweepInBackground(['2', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'pid-2'));
    await sleep(200);
    process.kill(/** @type {number} */ (child.pid), 'SIGHUP');
    const done = await exited;
    assert.equal(done.code, 129, `${done.signal} ${done.stderr}`);
    const stubPid = Number(readFileSync(join(stub, 'pid-2'), 'utf8'));
    assert.equal(alive(stubPid), false, 'Playwright was stopped, not orphaned');
    assert.equal(readFileSync(join(stub, 'sigint-2'), 'utf8'), 'SIGINT\n', 'exactly one SIGINT');
    assert.match(summary(), /^stopped early: hung up during run 2, which was not recorded/m);
    assert.ok(!existsSync(join(verifyDir(), 'run-2.playwright.json')));
  });

  it('records the run a SIGINT to the script alone let finish, then stops with 130', async () => {
    plan(1, passing());
    plan(2, failing(), 1, { sleepMs: 3000 });
    plan(3, passing());
    const { child, exited } = sweepInBackground(['3', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'pid-2'));
    await sleep(200);
    process.kill(/** @type {number} */ (child.pid), 'SIGINT');
    const done = await exited;
    assert.equal(done.code, 130, done.stderr);
    assert.ok(!existsSync(join(stub, 'sigint-2')), 'Playwright got no SIGINT');
    assert.equal(invocations(), 2, 'no run starts after the interrupt');
    assert.equal(readJson('run-2.json').verify.exitCode, 1, 'the finished run is recorded');
    assert.match(summary(), /^stopped early: interrupted after run 2$/m);
    assert.match(summary(), /^verify-flake: e2e\/x\.spec\.ts, 2 of 3 runs, dev server$/m);
    assert.match(summary(), /^runs passed {2}1\/2 \(50\.0%\)$/m);
  });

  it('puts the earlier .verify back when interrupted before any run is recorded', async () => {
    mkdirSync(verifyDir());
    writeFileSync(join(verifyDir(), 'summary.txt'), 'the earlier sweep');
    plan(1, passing(), 0, { sleepMs: 5000 });
    const { child, exited } = sweepInBackground(['2', 'e2e/x.spec.ts']);
    await waitFor(join(stub, 'pid-1'));
    await sleep(200);
    process.kill(-(/** @type {number} */ (child.pid)), 'SIGINT');
    const done = await exited;
    assert.equal(done.code, 130, done.stderr);
    assert.equal(summary(), 'the earlier sweep');
    assert.ok(!existsSync(join(cwd, '.verify.lock')));
  });
});

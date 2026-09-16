// Tests for scripts/flake-hunt.sh. Run with `pnpm test:scripts` (node:test).
//
// The script is copied into a temporary tree shaped like this repository. In that tree
// apps/web/node_modules/.bin/playwright is a stub, and a do-nothing `pnpm` is first on PATH
// because the script checks it exists. For each run the stub replays a Playwright JSON report
// prepared by the test, with every `__OUT__` replaced by the `--output` directory it was given and
// the attachment files it names created there, and exits with the prepared code; or it waits, as a
// long run does, until SIGINT, stops a stand-in webServer it started in a process group of its own
// and exits 130 as Playwright does. Like Playwright it has no handler for SIGTERM or SIGHUP, and it
// writes its report to PLAYWRIGHT_JSON_OUTPUT_FILE when that is set. No browser or real server
// starts. What is under test is the contract in the script's header: how runs are classified, how
// specs are ranked, what stops a hunt, and how shards are merged.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'flake-hunt.sh');

// Run N reads $STUB/run-N.json (a report to replay), $STUB/run-N.exit (its exit code, 0 when
// absent) and $STUB/run-N.hang (wait for SIGINT instead, then take the milliseconds the file holds,
// 100 when empty, to stop). It records its arguments in $STUB/args-N, its pid in $STUB/pid-N, its
// webServer's pid in $STUB/webserver-N and every SIGINT it gets in $STUB/signals-N.
const STUB_PLAYWRIGHT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const stub = process.env.STUB;
const at = (name) => stub + '/' + name;
const n = (fs.existsSync(at('count')) ? Number(fs.readFileSync(at('count'), 'utf8')) : 0) + 1;
fs.writeFileSync(at('count'), String(n));
const args = process.argv.slice(2);
fs.writeFileSync(at('args-' + n), [process.cwd(), ...args].join('\\n') + '\\n');
fs.writeFileSync(at('pid-' + n), String(process.pid));
if (fs.existsSync(at('run-' + n + '.hang'))) {
  const stopMs = Number(fs.readFileSync(at('run-' + n + '.hang'), 'utf8') || 100);
  const server = require('node:child_process').spawn(
    process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  fs.writeFileSync(at('webserver-' + n), String(server.pid));
  process.on('SIGINT', () => {
    fs.appendFileSync(at('signals-' + n), 'SIGINT\\n');
    setTimeout(() => {
      server.kill();
      process.exit(130);
    }, stopMs);
  });
  fs.writeFileSync(at('hanging-' + n), '');
  setInterval(() => {}, 1000);
} else {
  if (fs.existsSync(at('run-' + n + '.json'))) {
    const out = args[args.indexOf('--output') + 1];
    const body = fs.readFileSync(at('run-' + n + '.json'), 'utf8').replaceAll('__OUT__', out);
    const env = process.env;
    const report = env.PLAYWRIGHT_JSON_OUTPUT_FILE || env.PLAYWRIGHT_JSON_OUTPUT_NAME;
    fs.writeFileSync(report, body);
    for (const [, file] of body.matchAll(/"path":"([^"]+)"/g)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'artifact');
    }
  }
  const exit = at('run-' + n + '.exit');
  process.exit(fs.existsSync(exit) ? Number(fs.readFileSync(exit, 'utf8')) : 0);
}
`;

const ESC = String.fromCharCode(27);

/**
 * One test in a report: { file, title, status, line?, project?, declared?, describe?, ms?, error?,
 * noError? }. A failed one gets an error and a trace and a screenshot under __OUT__, unless
 * `noError` is set, which is what Playwright writes for a test.fail() that passed.
 */
function test(file, title, status, extra = {}) {
  return { file, title, status, ...extra };
}

/**
 * A Playwright JSON report for the given tests, with stats derived the way Playwright derives them.
 * A test with a `describe` title is nested in a suite of that name inside its file's suite.
 */
function report(tests, { errors = [] } = {}) {
  const count = (status) => tests.filter((t) => t.status === status).length;
  const spec = (t) => ({
    title: t.title,
    file: t.file,
    line: t.line ?? 5,
    tests: [
      {
        projectName: t.project ?? 'chromium',
        expectedStatus: t.declared ?? 'passed',
        status: t.status,
        results: [
          {
            duration: t.ms ?? 1000,
            ...((t.status === 'unexpected' || t.status === 'flaky') && !t.noError
              ? {
                  error: { message: t.error ?? `${ESC}[31mError: boom${ESC}[39m\nat line` },
                  attachments: [
                    { name: 'trace', path: `__OUT__/${slug(t)}/trace.zip` },
                    { name: 'screenshot', path: `__OUT__/${slug(t)}/test-failed-1.png` },
                  ],
                }
              : { attachments: [] }),
          },
        ],
      },
    ],
  });
  const files = [...new Set(tests.map((t) => t.file))];
  return {
    config: {},
    suites: files.map((file) => {
      const inFile = tests.filter((t) => t.file === file);
      const describes = [
        ...new Set(inFile.filter((t) => t.describe !== undefined).map((t) => t.describe)),
      ];
      return {
        title: file,
        file,
        specs: inFile.filter((t) => t.describe === undefined).map(spec),
        suites: describes.map((title) => ({
          title,
          file,
          specs: inFile.filter((t) => t.describe === title).map(spec),
          suites: [],
        })),
      };
    }),
    errors,
    stats: {
      expected: count('expected'),
      unexpected: count('unexpected'),
      flaky: count('flaky'),
      skipped: count('skipped'),
    },
  };
}

const slug = (t) =>
  `${t.file}-${t.describe ?? ''}-${t.title}-${t.project ?? 'chromium'}`.replace(
    /[^a-z0-9]+/gi,
    '-',
  );

let root;
let stub;
let cwd;

beforeEach(() => {
  // Resolved, because bash reports the physical path of a symlinked tmpdir (macOS /var).
  root = realpathSync(mkdtempSync(join(tmpdir(), 'flake-hunt-')));
  mkdirSync(join(root, 'repo/scripts'), { recursive: true });
  mkdirSync(join(root, 'repo/apps/web/e2e/support'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'repo/scripts/flake-hunt.sh'));
  writeFileSync(join(root, 'repo/apps/web/e2e/support/warm-routes.ts'), 'export {};\n');
  writeFileSync(
    join(root, 'repo/apps/web/e2e/a.spec.ts'),
    "import { warmRoutes } from './support/warm-routes';\n",
  );
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  // pnpm only has to exist: Playwright's webServer would call it, and the stub's stand-in does not.
  writeFileSync(join(stub, 'bin/pnpm'), '#!/bin/sh\nexit 99\n');
  chmodSync(join(stub, 'bin/pnpm'), 0o755);
  mkdirSync(join(root, 'repo/apps/web/node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'repo/apps/web/node_modules/.bin/playwright'), STUB_PLAYWRIGHT);
  chmodSync(join(root, 'repo/apps/web/node_modules/.bin/playwright'), 0o755);
  cwd = join(root, 'cwd');
  mkdirSync(cwd);
});

// Process groups a test started, and the processes the stub recorded: a test that fails, or a
// mutant of the script, must not leave a hunt, a stub or a webServer running to hold the runner.
const groups = [];
const kill = (pid) => {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
};

afterEach(() => {
  for (const pid of groups.splice(0)) kill(-pid);
  for (const entry of existsSync(stub) ? readdirSync(stub) : []) {
    if (/^(pid|webserver)-\d+$/.test(entry)) kill(Number(readFileSync(join(stub, entry), 'utf8')));
  }
  rmSync(root, { recursive: true, force: true });
});

function plan(n, body, exit = 0) {
  if (body !== null) writeFileSync(join(stub, `run-${n}.json`), JSON.stringify(body));
  writeFileSync(join(stub, `run-${n}.exit`), String(exit));
}

const passing = (file = 'a.spec.ts') => report([test(file, 'ok', 'expected')]);

// Empty strings stand for "unset" in the script's `${VAR:-default}` expansions. CI in particular is
// set on every GitHub runner and would otherwise choose the script's mode.
function huntEnv(env) {
  return {
    ...process.env,
    CI: '',
    PLAYWRIGHT_PORT: '',
    FLAKE_HUNT_DIR: '',
    FLAKE_HUNT_FIRST_RUN: '',
    FLAKE_HUNT_EXPECTED_RUNS: '',
    FLAKE_THRESHOLD: '',
    ...env,
    STUB: stub,
    PATH: `${join(stub, 'bin')}:${env.PATH ?? process.env.PATH}`,
  };
}

const invocations = () =>
  existsSync(join(stub, 'count')) ? Number(readFileSync(join(stub, 'count'), 'utf8')) : 0;

function hunt(args = [], env = {}, { script = join(root, 'repo/scripts/flake-hunt.sh') } = {}) {
  const result = spawnSync('bash', [script, ...args], {
    cwd: env.CWD ?? cwd,
    encoding: 'utf8',
    env: huntEnv(env),
  });
  return { ...result, invocations: invocations() };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts a hunt as its own process group, as a terminal starts a job, and waits until run n hangs,
 * or until the file `until` exists.
 */
async function huntUntilHanging(args, n, { env = {}, until = join(stub, `hanging-${n}`) } = {}) {
  const child = spawn('bash', [join(root, 'repo/scripts/flake-hunt.sh'), ...args], {
    cwd,
    env: huntEnv(env),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  groups.push(child.pid);
  let stderr = '';
  child.stderr.on('data', (data) => (stderr += data));
  child.stdout.resume();
  const exited = new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve(code ?? signal)),
  );
  const deadline = Date.now() + 20_000;
  while (!existsSync(until)) {
    assert.ok(Date.now() < deadline, `run ${n} never started; stderr: ${stderr}`);
    await sleep(50);
  }
  return { child, exited, stderr: () => stderr };
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const huntDir = () => join(cwd, 'flake-hunt');
const flakeReport = (dir = huntDir()) =>
  JSON.parse(readFileSync(join(dir, 'flake-report.json'), 'utf8'));

describe('preconditions stop the hunt before any run', () => {
  it('requires the warmRoutes helper', () => {
    rmSync(join(root, 'repo/apps/web/e2e/support/warm-routes.ts'));
    const run = hunt(['1']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /warmRoutes helper .* is not in this checkout/);
    assert.equal(run.invocations, 0);
  });

  it('requires a spec that imports the helper, not any other file', () => {
    writeFileSync(join(root, 'repo/apps/web/e2e/a.spec.ts'), 'export {};\n');
    // Imports the helper exactly as a spec would, but is not a spec.
    writeFileSync(
      join(root, 'repo/apps/web/e2e/pages.ts'),
      "import { warmRoutes } from './support/warm-routes';\n",
    );
    const run = hunt(['1']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /no spec imports the warmRoutes helper/);
    assert.equal(run.invocations, 0);
  });

  it('rejects bad run counts, first-run numbers and thresholds', () => {
    for (const [args, env, message] of [
      [['0'], {}, /runs must be a whole number from 1 to 999999, got '0'/],
      [['abc'], {}, /runs must be a whole number from 1 to 999999, got 'abc'/],
      [['007'], {}, /got '007'/],
      [['1000000'], {}, /got '1000000'/],
      [[''], {}, /runs must be a whole number from 1 to 999999, got ''/],
      [['1', '2'], {}, /usage:/],
      [['1'], { FLAKE_HUNT_FIRST_RUN: '-3' }, /FLAKE_HUNT_FIRST_RUN must be .*, got '-3'/],
      [['1'], { FLAKE_HUNT_FIRST_RUN: '9223372036854775807' }, /got '9223372036854775807'/],
      [['1'], { FLAKE_THRESHOLD: '5%' }, /FLAKE_THRESHOLD must be a number from 0 to 1/],
      [['1'], { FLAKE_THRESHOLD: '1.5' }, /FLAKE_THRESHOLD must be a number from 0 to 1/],
    ]) {
      const run = hunt(args, env);
      assert.equal(run.status, 2, `${JSON.stringify(args)} ${JSON.stringify(env)}`);
      assert.match(run.stderr, message);
      assert.equal(run.invocations, 0);
    }
  });

  it('will not empty a directory it did not make', () => {
    mkdirSync(huntDir());
    writeFileSync(join(huntDir(), 'notes.txt'), 'mine');
    const run = hunt(['1']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /is not empty and was not made by flake-hunt/);
    assert.equal(readFileSync(join(huntDir(), 'notes.txt'), 'utf8'), 'mine');
  });

  it('uses an empty directory, and empties one an earlier hunt made', () => {
    mkdirSync(huntDir());
    plan(1, passing());
    plan(2, passing());
    assert.equal(hunt(['1']).status, 0, 'an empty directory is accepted');
    writeFileSync(join(huntDir(), 'stale'), '');
    assert.equal(hunt(['1']).status, 0);
    assert.ok(!existsSync(join(huntDir(), 'stale')));
  });
});

describe('a hunt', () => {
  it('runs the whole suite with the hunt config from apps/web, one output dir per run', () => {
    plan(1, passing());
    const run = hunt(['1']);
    assert.equal(run.status, 0, run.stderr);
    const [dir, ...argv] = readFileSync(join(stub, 'args-1'), 'utf8').trim().split('\n');
    assert.ok(dir.endsWith('/repo/apps/web'), dir);
    assert.deepEqual(argv, [
      'test',
      '--config',
      'playwright.flake-hunt.config.ts',
      '--reporter=json',
      '--output',
      join(huntDir(), 'run-1/test-results'),
    ]);
  });

  it('exits 0, writes nothing to stderr and reports every spec at 0% when nothing fails', () => {
    for (const n of [1, 2]) {
      plan(n, report([test('a.spec.ts', 'ok', 'expected'), test('b.spec.ts', 'ok', 'expected')]));
    }
    const run = hunt(['2']);
    assert.equal(run.status, 0, run.stderr);
    // The temporary tree is not a git checkout, so the commit lookup fails, silently.
    assert.equal(run.stderr, '');
    const body = flakeReport();
    assert.equal(body.commit, 'unknown');
    assert.equal(body.runs, 2);
    assert.equal(body.completedRuns, 2);
    assert.equal(body.mode, 'dev server');
    assert.deepEqual(
      body.specs.map((s) => [s.file, s.failedRuns, s.failureRate]),
      [
        ['a.spec.ts', 0, 0],
        ['b.spec.ts', 0, 0],
      ],
    );
    assert.match(run.stdout, /no spec failed/);
  });

  it('serves the production build when CI is true or 1', () => {
    for (const ci of ['true', '1']) {
      rmSync(join(stub, 'count'), { force: true });
      plan(1, passing());
      assert.equal(hunt(['1'], { CI: ci }).status, 0);
      assert.equal(flakeReport().mode, 'production build (CI)', `CI=${ci}`);
    }
  });

  it('ranks specs by failure rate and flags those above the threshold', () => {
    const b = (status) => test('b.spec.ts', 'sometimes', status, { line: 9 });
    plan(1, report([test('a.spec.ts', 'ok', 'expected'), b('unexpected')]), 1);
    plan(2, report([test('a.spec.ts', 'ok', 'unexpected'), b('unexpected')]), 1);
    plan(3, report([test('a.spec.ts', 'ok', 'expected'), b('expected')]));
    const run = hunt(['3'], { FLAKE_THRESHOLD: '0.5' });
    assert.equal(run.status, 1, run.stderr);
    const body = flakeReport();
    assert.deepEqual(
      body.specs.map((s) => [s.file, s.failedRuns, s.runs, s.flagged]),
      [
        ['b.spec.ts', 2, 3, true],
        ['a.spec.ts', 1, 3, false],
      ],
    );
    const [failure] = body.specs[0].tests[0].failures;
    assert.equal(failure.run, 1);
    assert.equal(failure.error, 'Error: boom\nat line', 'colour codes are stripped');
    assert.deepEqual(
      failure.attachments.map((a) => a.name),
      ['trace', 'screenshot'],
    );
    for (const { path } of failure.attachments) {
      assert.match(path, /^run-1\/test-results\//, 'attachment paths are relative to the hunt');
      assert.ok(existsSync(join(huntDir(), path)), `${path} is on disk`);
    }
    assert.match(run.stdout, /66\.7% 2\/3 FLAGGED b\.spec\.ts/);
    assert.match(run.stdout, / {6}2\/3 :9 sometimes \[chromium\]/);
  });

  it('lists the tests of a spec by how often they failed, not by line', () => {
    const t = (title, line, status) => test('a.spec.ts', title, status, { line });
    plan(1, report([t('steady', 5, 'expected'), t('shaky', 9, 'unexpected')]), 1);
    plan(2, report([t('steady', 5, 'expected'), t('shaky', 9, 'unexpected')]), 1);
    plan(3, report([t('steady', 5, 'unexpected'), t('shaky', 9, 'expected')]), 1);
    assert.equal(hunt(['3']).status, 1);
    assert.deepEqual(
      flakeReport().specs[0].tests.map((x) => [x.line, x.failed]),
      [
        [9, 2],
        [5, 1],
      ],
    );
  });

  it('writes its own report path even when PLAYWRIGHT_JSON_OUTPUT_FILE is set', () => {
    plan(1, passing());
    const elsewhere = join(root, 'elsewhere.json');
    const run = hunt(['1'], { PLAYWRIGHT_JSON_OUTPUT_FILE: elsewhere });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(!existsSync(elsewhere));
  });

  it('flags a spec only above the threshold, not at it', () => {
    plan(1, report([test('a.spec.ts', 'ok', 'unexpected')]), 1);
    plan(2, passing());
    const run = hunt(['2'], { FLAKE_THRESHOLD: '0.5' });
    assert.equal(run.status, 1, run.stderr);
    const [spec] = flakeReport().specs;
    assert.deepEqual([spec.failureRate, spec.flagged], [0.5, false]);
  });

  it('counts a retried test as a failure, a declared failure as a pass, and ignores skips', () => {
    plan(
      1,
      report([
        test('a.spec.ts', 'retried', 'flaky'),
        test('b.spec.ts', 'known bug', 'expected', { declared: 'failed' }),
        test('c.spec.ts', 'elsewhere', 'skipped', { declared: 'skipped' }),
      ]),
    );
    const run = hunt(['1']);
    assert.equal(run.status, 1, run.stderr);
    const body = flakeReport();
    assert.deepEqual(
      body.specs.map((s) => [s.file, s.failedRuns]),
      [
        ['a.spec.ts', 1],
        ['b.spec.ts', 0],
      ],
      'a spec whose tests were all skipped did not run',
    );
    assert.equal(body.specs[0].tests[0].flaky, 1);
  });

  it('records a test.fail() that passed as a failure with an error of its own', () => {
    // Playwright writes status "unexpected" and no error at all for it.
    plan(
      1,
      report([test('a.spec.ts', 'known bug', 'unexpected', { declared: 'failed', noError: true })]),
      1,
    );
    const run = hunt(['1']);
    assert.equal(run.status, 1, run.stderr);
    const [failure] = flakeReport().specs[0].tests[0].failures;
    assert.equal(failure.error, 'Expected to fail, but passed.');
    assert.deepEqual(failure.attachments, []);
  });

  it('keeps tests apart that share a file, line and title under different describes', () => {
    // As a describe declared in a loop over colour schemes would produce.
    const axe = (describe, status) => test('a.spec.ts', 'axe', status, { describe, line: 12 });
    plan(1, report([axe('light', 'expected'), axe('dark', 'unexpected')]), 1);
    const run = hunt(['1']);
    assert.equal(run.status, 1, run.stderr);
    const tests = flakeReport().specs[0].tests;
    assert.deepEqual(
      tests.map((t) => [t.title, t.runs, t.failed]),
      [
        ['dark > axe', 1, 1],
        ['light > axe', 1, 0],
      ],
    );
  });

  it('leaves an anonymous describe out of a test title', () => {
    plan(1, report([test('a.spec.ts', 'clicks', 'expected', { describe: '' })]));
    assert.equal(hunt(['1']).status, 0);
    assert.equal(flakeReport().specs[0].tests[0].title, 'clicks');
  });

  it('writes each run report with the run it came from', () => {
    plan(1, passing());
    hunt(['1'], { FLAKE_HUNT_FIRST_RUN: '7' });
    const body = JSON.parse(readFileSync(join(huntDir(), 'run-7/report.json'), 'utf8'));
    assert.equal(body.hunt.run, 7);
    assert.equal(body.hunt.exitCode, 0);
    assert.equal(body.hunt.infraError, null);
    assert.equal(body.hunt.interrupted, null);
    assert.equal(body.hunt.mode, 'dev server');
    assert.ok(typeof body.hunt.load1 === 'number' || body.hunt.load1 === null);
    assert.ok(Array.isArray(body.suites), 'the Playwright report is kept whole');
    assert.ok(!existsSync(join(huntDir(), 'run-7/playwright.json')));
  });

  it('carries on without a load average where it cannot be read', () => {
    // A sysctl that fails stands in for one missing from PATH. Linux reads /proc/loadavg instead.
    writeFileSync(join(stub, 'bin/sysctl'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(stub, 'bin/sysctl'), 0o755);
    plan(1, passing());
    const run = hunt(['1']);
    assert.equal(run.status, 0, run.stderr);
    if (process.platform === 'darwin') {
      assert.equal(flakeReport().load1.min, null);
      assert.match(run.stdout, /load unknown/);
    }
  });

  it('finds its own tree when started by a relative path with CDPATH set', () => {
    plan(1, passing());
    const run = hunt(['1'], { CDPATH: root, CWD: root }, { script: 'repo/scripts/flake-hunt.sh' });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(existsSync(join(root, 'flake-hunt/flake-report.json')));
  });
});

describe('infrastructure errors', () => {
  it('records one, leaves it out of every rate, carries on and exits 2', () => {
    plan(1, passing());
    plan(
      2,
      report([], { errors: [{ message: 'Error: http://localhost:3210 is already used' }] }),
      1,
    );
    plan(3, report([test('a.spec.ts', 'ok', 'unexpected')]), 1);
    const run = hunt(['3']);
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.invocations, 3);
    const body = flakeReport();
    assert.equal(body.runs, 3);
    assert.equal(body.completedRuns, 2);
    assert.equal(body.infraErrors.length, 1);
    assert.equal(body.infraErrors[0].run, 2);
    assert.match(body.infraErrors[0].error, /errors outside any test \(exit 1\): .*already used/);
    assert.deepEqual(
      [body.specs[0].failedRuns, body.specs[0].runs],
      [1, 2],
      'rates count completed runs only',
    );
    const infraRun = JSON.parse(readFileSync(join(huntDir(), 'run-2/report.json'), 'utf8'));
    assert.deepEqual(Object.keys(infraRun), ['hunt'], 'an infrastructure run holds only "hunt"');
    assert.ok(existsSync(join(huntDir(), 'run-2/playwright.json')), "Playwright's report stays");
  });

  for (const [name, prepare, message] of [
    ['no report', () => plan(1, null, 1), /wrote no JSON report/],
    ['a run of no tests', () => plan(1, report([]), 0), /ran no tests/],
    ['a killed run', () => plan(1, passing(), 137), /exited 137/],
    [
      'exit 1 with nothing unexpected',
      () => plan(1, passing(), 1),
      /exited 1 but its report counts 0 unexpected/,
    ],
    [
      'exit 0 with an unexpected test',
      () => plan(1, report([test('a.spec.ts', 'ok', 'unexpected')]), 0),
      /exited 0 but its report counts 1 unexpected/,
    ],
  ]) {
    it(`classifies ${name} as one`, () => {
      prepare();
      plan(2, passing());
      const run = hunt(['2']);
      assert.equal(run.status, 2, run.stderr);
      assert.match(flakeReport().infraErrors[0].error, message);
    });
  }

  it('stops after two in a row', () => {
    plan(1, null, 1);
    plan(2, null, 1);
    plan(3, passing());
    const run = hunt(['3']);
    assert.equal(run.status, 2);
    assert.equal(run.invocations, 2);
    assert.match(run.stderr, /two runs in a row could not run their tests; stopping/);
    assert.equal(flakeReport().runs, 2);
  });

  it('does not stop for two that are not in a row', () => {
    plan(1, null, 1);
    plan(2, passing());
    plan(3, null, 1);
    plan(4, passing());
    const run = hunt(['4']);
    assert.equal(run.status, 2);
    assert.equal(run.invocations, 4);
    assert.deepEqual(
      flakeReport().infraErrors.map((e) => e.run),
      [1, 3],
    );
  });
});

describe('interruptions', () => {
  it('stops at a run Playwright reports as interrupted, and exits 130', () => {
    plan(1, passing());
    plan(2, null, 130);
    plan(3, passing());
    const run = hunt(['3']);
    assert.equal(run.status, 130, run.stderr);
    assert.equal(run.invocations, 2, 'no run starts after an interrupted one');
    const body = flakeReport();
    assert.deepEqual(body.interruptedRuns, [{ run: 2, signal: 'SIGINT' }]);
    assert.deepEqual(body.infraErrors, [], 'an interruption is not an infrastructure error');
    assert.equal(body.completedRuns, 1);
  });

  const webServerStopped = (n) => {
    const pid = Number(readFileSync(join(stub, `webserver-${n}`), 'utf8'));
    return !isRunning(pid);
  };

  // A terminal's Ctrl-C, a `kill -- -<pgid>`, a process manager and a closed terminal all signal
  // the whole process group. Playwright must hear of it once, from the hunt, and stop its
  // webServer.
  for (const [signal, status] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ]) {
    it(`on ${signal} to the group, stops Playwright and its server, exits ${status}`, async () => {
      plan(1, passing());
      writeFileSync(join(stub, 'run-2.hang'), '');
      const { child, exited, stderr } = await huntUntilHanging(['3'], 2);
      process.kill(-child.pid, signal);
      assert.equal(await exited, status, stderr());
      const pid = Number(readFileSync(join(stub, 'pid-2'), 'utf8'));
      assert.ok(!isRunning(pid), 'Playwright has stopped');
      assert.ok(webServerStopped(2), 'no webServer outlived the hunt');
      assert.equal(readFileSync(join(stub, 'signals-2'), 'utf8'), 'SIGINT\n', 'one SIGINT');
      assert.equal(invocations(), 2);
      const body = flakeReport();
      assert.deepEqual([body.runs, body.completedRuns], [2, 1]);
      assert.deepEqual(body.interruptedRuns, [{ run: 2, signal }]);
      assert.deepEqual(body.infraErrors, []);
    });
  }

  it('on SIGTERM to the hunt alone, waits for Playwright to stop and exits 143', async () => {
    plan(1, passing());
    // Playwright takes a while to stop its webServer; the hunt must not exit before it has.
    writeFileSync(join(stub, 'run-2.hang'), '1500');
    const { child, exited, stderr } = await huntUntilHanging(['3'], 2);
    process.kill(child.pid, 'SIGTERM');
    assert.equal(await exited, 143, stderr());
    const pid = Number(readFileSync(join(stub, 'pid-2'), 'utf8'));
    assert.ok(!isRunning(pid), 'Playwright was not left running');
    assert.ok(webServerStopped(2), 'no webServer outlived the hunt');
    assert.match(readFileSync(join(stub, 'signals-2'), 'utf8'), /^SIGINT\n$/);
    const body = flakeReport();
    assert.deepEqual(body.interruptedRuns, [{ run: 2, signal: 'SIGTERM' }]);
    assert.equal(body.completedRuns, 1);
  });

  it('on Ctrl-C while a helper runs between two runs, still reports and exits 130', async () => {
    // A node that is slow to tell the time once run 1 has finished holds the hunt between runs, in
    // the hunt's own process group, where the group's SIGINT kills it.
    const node = join(stub, 'bin/node');
    writeFileSync(
      node,
      [
        '#!/bin/sh',
        'case "$*" in *Date.now*)',
        '  if [ -e "$SLOW_AFTER" ]; then : >"$STUB/slow-now"; sleep 5; fi ;;',
        'esac',
        'exec "$REAL_NODE" "$@"',
        '',
      ].join('\n'),
    );
    chmodSync(node, 0o755);
    plan(1, passing());
    plan(2, passing());
    const { child, exited, stderr } = await huntUntilHanging(['3'], 2, {
      env: { REAL_NODE: process.execPath, SLOW_AFTER: join(huntDir(), 'run-1/report.json') },
      until: join(stub, 'slow-now'),
    });
    process.kill(-child.pid, 'SIGINT');
    assert.equal(await exited, 130, stderr());
    assert.doesNotMatch(stderr(), /exited/);
    assert.equal(invocations(), 1, 'run 2 never started');
    const body = flakeReport();
    assert.deepEqual([body.runs, body.completedRuns], [2, 1]);
    assert.deepEqual(body.interruptedRuns, [{ run: 2, signal: 'SIGINT' }]);
  });

  it('writes the report of the finished runs whatever characters its directory holds', () => {
    plan(1, passing());
    plan(2, null, 130);
    const dir = join(root, 'hunt[1]');
    const run = hunt(['3'], { FLAKE_HUNT_DIR: dir });
    assert.equal(run.status, 130, run.stderr);
    assert.equal(flakeReport(dir).completedRuns, 1);
  });
});

describe('--report-only', () => {
  // Hunts two shards numbered apart, the way the workflow does, into one merged directory.
  function mergeShards(shards) {
    const merged = join(root, 'merged');
    mkdirSync(merged);
    for (const [first, statuses] of shards) {
      rmSync(join(stub, 'count'), { force: true });
      statuses.forEach((status, i) =>
        plan(i + 1, report([test('a.spec.ts', 'ok', status)]), status === 'unexpected' ? 1 : 0),
      );
      const shard = join(root, `shard-${first}`);
      hunt([String(statuses.length)], { FLAKE_HUNT_DIR: shard, FLAKE_HUNT_FIRST_RUN: first });
      for (const entry of readdirSync(shard).filter((e) => e.startsWith('run-'))) {
        cpSync(join(shard, entry), join(merged, entry), { recursive: true });
      }
      rmSync(shard, { recursive: true });
    }
    return merged;
  }

  it('merges shards whose runs were numbered apart into one report', () => {
    const merged = mergeShards([
      ['1', ['expected', 'unexpected']],
      ['3', ['unexpected', 'expected']],
    ]);
    const run = hunt(['--report-only', merged]);
    assert.equal(run.status, 1, run.stderr);
    const body = flakeReport(merged);
    assert.equal(body.runs, 4);
    assert.deepEqual([body.specs[0].failedRuns, body.specs[0].runs], [2, 4]);
    assert.deepEqual(
      body.specs[0].tests[0].failures.map((f) => f.run),
      [2, 3],
    );
    for (const failure of body.specs[0].tests[0].failures) {
      for (const { path } of failure.attachments) {
        assert.ok(path.startsWith(`run-${failure.run}/`), path);
        assert.ok(existsSync(join(merged, path)), `${path} survived the merge`);
      }
    }
  });

  it('counts a run no shard uploaded as an infra error when told how many to expect', () => {
    const merged = mergeShards([
      ['1', ['expected']],
      ['3', ['expected']],
    ]);
    const run = hunt(['--report-only', merged], { FLAKE_HUNT_EXPECTED_RUNS: '3' });
    assert.equal(run.status, 2, run.stderr);
    const body = flakeReport(merged);
    assert.deepEqual([body.runs, body.completedRuns], [3, 2]);
    assert.deepEqual(
      body.infraErrors.map((e) => e.run),
      [2],
    );
    assert.match(body.infraErrors[0].error, /no report/);
    const bad = hunt(['--report-only', merged], { FLAKE_HUNT_EXPECTED_RUNS: 'thirty' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /FLAKE_HUNT_EXPECTED_RUNS must be a whole number/);
  });

  it('counts the last expected run as missing too', () => {
    const merged = mergeShards([['1', ['expected', 'expected']]]);
    const run = hunt(['--report-only', merged], { FLAKE_HUNT_EXPECTED_RUNS: '3' });
    assert.equal(run.status, 2, run.stderr);
    assert.deepEqual(
      flakeReport(merged).infraErrors.map((e) => e.run),
      [3],
    );
  });

  it('names the commit the runs tested, not the one that rebuilt the report', () => {
    const repo = join(root, 'repo');
    const git = (...args) =>
      spawnSync('git', ['-C', repo, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: devNull,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@example.com',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@example.com',
        },
      }).stdout.trim();
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'hunted');
    const hunted = git('rev-parse', 'HEAD');
    plan(1, passing());
    assert.equal(hunt(['1']).status, 0);
    const runReport = JSON.parse(readFileSync(join(huntDir(), 'run-1/report.json'), 'utf8'));
    assert.deepEqual([runReport.hunt.commit, runReport.hunt.dirty], [hunted, false]);

    git('commit', '-q', '--allow-empty', '-m', 'later');
    assert.notEqual(git('rev-parse', 'HEAD'), hunted);
    assert.equal(hunt(['--report-only', huntDir()]).status, 0);
    assert.equal(flakeReport().commit, hunted);

    const other = JSON.parse(readFileSync(join(huntDir(), 'run-1/report.json'), 'utf8'));
    other.hunt = { ...other.hunt, run: 2, commit: 'f'.repeat(40) };
    mkdirSync(join(huntDir(), 'run-2'));
    writeFileSync(join(huntDir(), 'run-2/report.json'), JSON.stringify(other));
    const mixed = hunt(['--report-only', huntDir()]);
    assert.equal(mixed.status, 2);
    assert.match(mixed.stderr, /come from different commits/);
  });

  it('reads a directory through a symlink and ignores anything that is not run-<number>', () => {
    const merged = mergeShards([['1', ['expected']]]);
    mkdirSync(join(merged, 'run-x'));
    writeFileSync(join(merged, 'run-x/report.json'), 'not json');
    mkdirSync(join(merged, 'notes'));
    writeFileSync(join(merged, 'notes/report.json'), 'not json');
    symlinkSync(merged, join(root, 'link'));
    const run = hunt(['--report-only', join(root, 'link')]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(flakeReport(merged).runs, 1);
  });

  it('refuses a report filed under another run number', () => {
    const merged = mergeShards([['1', ['expected']]]);
    cpSync(join(merged, 'run-1'), join(merged, 'run-5'), { recursive: true });
    const run = hunt(['--report-only', merged]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /run-5\/report\.json is not the report of run 5/);
  });

  it('fails on a directory with no runs', () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);
    const run = hunt(['--report-only', empty]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /no run-N\/report\.json under/);
  });
});

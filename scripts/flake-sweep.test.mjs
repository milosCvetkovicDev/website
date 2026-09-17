// Tests for scripts/flake-sweep.sh. Run with `pnpm test:scripts` (node:test).
//
// The script is copied into a temporary tree shaped like this repository, with a stub Playwright
// binary at apps/web/node_modules/.bin/playwright. For each run the stub records its arguments and
// environment, optionally runs a prepared hook or waits in Node (so a test can signal it), leaves a
// failure in its --output directory, copies a report prepared by the test to
// PLAYWRIGHT_JSON_OUTPUT_NAME and exits with a prepared code. No browser or server starts. What is
// under test is the contract in the script's header.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'flake-sweep.sh');

const STUB_PLAYWRIGHT = `#!/usr/bin/env bash
set -eu
if [ "\${1:-}" = --version ]; then echo 'Version 9.9.9'; exit 0; fi
n=$(( $(cat "$STUB/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" >"$STUB/count"
printf '%s\\n' "$PWD" "$@" >"$STUB/args-$n"
env | grep -E '^(PLAYWRIGHT_[A-Z_]+|CI)=' | sort >"$STUB/env-$n" || true
if [ -d .next-e2e ]; then echo warm >"$STUB/cache-$n"; else echo cold >"$STUB/cache-$n"; fi
mkdir -p .next-e2e
out=
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then out=$2; fi
  shift
done
mkdir -p "$out/x-failed"
echo context >"$out/x-failed/error-context.md"
if [ -e "$STUB/run-$n.sh" ]; then . "$STUB/run-$n.sh"; fi
if [ -e "$STUB/run-$n.sleep" ]; then
  # Node, as Playwright is: it restores the default handling of the SIGINT that a background job of
  # a non-interactive shell starts out ignoring. It records the first signal and exits 130 on it.
  # It writes signal-N.ready once its handlers are in place, and the tests signal only after that:
  # a signal that lands while Node is still starting ends it with no record.
  exec node -e '
    const [file, seconds] = process.argv.slice(1);
    const stop = (name) => {
      require("fs").writeFileSync(file, name);
      process.exit(130);
    };
    process.on("SIGINT", () => stop("SIGINT"));
    process.on("SIGTERM", () => stop("SIGTERM"));
    require("fs").writeFileSync(file + ".ready", "");
    setTimeout(() => {}, seconds * 1000);
  ' "$STUB/signal-$n" "$(cat "$STUB/run-$n.sleep")"
fi
if [ -e "$STUB/run-$n.json" ]; then cp "$STUB/run-$n.json" "$PLAYWRIGHT_JSON_OUTPUT_NAME"; fi
exit "$(cat "$STUB/run-$n.exit" 2>/dev/null || echo 0)"
`;

/**
 * @typedef {{
 *   title: string,
 *   status: string,
 *   file?: string,
 *   line?: number,
 *   project?: string,
 *   declared?: string,
 *   describe?: string,
 *   ms?: number,
 * }} Test
 */

/**
 * A Playwright JSON report for the given tests, with stats derived the way Playwright derives them.
 * Each test is { title, status, file?, line?, project?, declared?, describe?, ms? }; `file` is
 * relative to the test directory, as Playwright reports it, and defaults to the spec under sweep.
 *
 * @param {Test[]} tests
 * @param {{ errors?: { message: string }[], rootDir?: string }} [options]
 */
function report(tests, { errors = [], rootDir = join(root, 'repo/apps/web/e2e') } = {}) {
  /** @param {string} status */
  const count = (status) => tests.filter((t) => t.status === status).length;
  /** @param {Test} t */
  const spec = (t) => ({
    title: t.title,
    file: t.file ?? 'x.spec.ts',
    line: t.line ?? 5,
    tests: [
      {
        projectName: t.project ?? 'chromium',
        expectedStatus: t.declared ?? 'passed',
        status: t.status,
        results: t.status === 'skipped' ? [] : [{ duration: t.ms ?? 100 }],
      },
    ],
  });
  const files = [...new Set(tests.map((t) => t.file ?? 'x.spec.ts'))];
  return {
    config: { rootDir },
    suites: files.map((file) => {
      const inFile = tests.filter((t) => (t.file ?? 'x.spec.ts') === file);
      const describes = [...new Set(inFile.filter((t) => t.describe).map((t) => t.describe))];
      return {
        title: file,
        file,
        specs: inFile.filter((t) => !t.describe).map(spec),
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

const passing = (ms = 100) => report([{ title: 'works', status: 'expected', ms }]);

/** @type {string} */
let root;
/** @type {string} */
let stub;
/** @type {string} */
let cwd;

beforeEach(() => {
  // Resolved, because bash reports the physical path of a symlinked tmpdir (macOS /var).
  root = realpathSync(mkdtempSync(join(tmpdir(), 'flake-sweep-')));
  mkdirSync(join(root, 'repo/scripts'), { recursive: true });
  mkdirSync(join(root, 'repo/apps/web/e2e/mobile'), { recursive: true });
  mkdirSync(join(root, 'repo/apps/web/node_modules/.bin'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'repo/scripts/flake-sweep.sh'));
  writeFileSync(join(root, 'repo/apps/web/e2e/x.spec.ts'), '');
  writeFileSync(join(root, 'repo/apps/web/node_modules/.bin/playwright'), STUB_PLAYWRIGHT);
  chmodSync(join(root, 'repo/apps/web/node_modules/.bin/playwright'), 0o755);
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  // pnpm only has to exist: Playwright's webServer would call it, and the stub starts no server.
  writeFileSync(join(stub, 'bin/pnpm'), `#!/bin/sh\ntouch '${stub}/pnpm-called'\nexit 99\n`);
  chmodSync(join(stub, 'bin/pnpm'), 0o755);
  cwd = join(root, 'cwd');
  mkdirSync(cwd);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * @param {number} n
 * @param {object | string | null} body
 * @param {number} [exit]
 * @param {{ sleep?: number, hook?: string }} [options]
 */
function plan(n, body, exit = 0, { sleep, hook } = {}) {
  if (body !== null) {
    writeFileSync(
      join(stub, `run-${n}.json`),
      typeof body === 'string' ? body : JSON.stringify(body),
    );
  }
  writeFileSync(join(stub, `run-${n}.exit`), String(exit));
  if (sleep) writeFileSync(join(stub, `run-${n}.sleep`), String(sleep));
  if (hook) writeFileSync(join(stub, `run-${n}.sh`), hook);
}

// The variables the script reads, cleared so that the environment running the tests cannot leak in:
// `pnpm test:scripts` itself sets INIT_CWD and npm_lifecycle_event, and CI sets CI.
const CLEAN_ENV = {
  CI: '',
  COLD: '',
  INIT_CWD: '',
  npm_lifecycle_event: '',
  PLAYWRIGHT_PORT: '',
  PLAYWRIGHT_JSON_OUTPUT_FILE: '',
  PLAYWRIGHT_JSON_OUTPUT_DIR: '',
};

/** @param {Record<string, string>} [extra] */
function env(extra = {}) {
  /** @type {Record<string, string | undefined>} */
  const merged = { ...process.env, ...CLEAN_ENV, TMPDIR: join(root, 'tmp'), ...extra, STUB: stub };
  merged.PATH = `${join(stub, 'bin')}:${extra.PATH ?? process.env.PATH}`;
  for (const [key, value] of Object.entries(merged)) if (value === '') delete merged[key];
  return merged;
}

/**
 * @param {string[]} args
 * @param {Record<string, string>} [extra]
 * @param {{ bash?: string, cwd?: string }} [options]
 */
function sweep(args, extra = {}, options = {}) {
  mkdirSync(join(root, 'tmp'), { recursive: true });
  const result = spawnSync(
    options.bash ?? 'bash',
    [join(root, 'repo/scripts/flake-sweep.sh'), ...args],
    {
      cwd: options.cwd ?? cwd,
      encoding: 'utf8',
      env: env(extra),
    },
  );
  return { ...result, invocations: invocations(), out: outDir(result.stdout + result.stderr) };
}

const invocations = () =>
  existsSync(join(stub, 'count')) ? Number(readFileSync(join(stub, 'count'), 'utf8')) : 0;
/**
 * The out-dir the sweep reported. Typed as a string: a test reads it only from a sweep that got as
 * far as reporting one, and a missing one fails that test where it is used.
 *
 * @param {string} text
 * @returns {string}
 */
const outDir = (text) => /** @type {string} */ (text.match(/flake-sweep: report in (.+)/)?.[1]);
/**
 * @param {string} dir
 * @param {string} name
 */
const read = (dir, name) => readFileSync(join(dir, name), 'utf8');
/** @param {number} n */
const stubArgs = (n) =>
  readFileSync(join(stub, `args-${n}`), 'utf8')
    .trim()
    .split('\n');
/** @param {number} n */
const stubEnv = (n) => readFileSync(join(stub, `env-${n}`), 'utf8');

/**
 * The summary's lines for one test, found by the text after its counts.
 *
 * @param {string} summary
 * @param {string} test
 */
function block(summary, test) {
  const lines = summary.split('\n');
  const start = lines.findIndex((line) => line.includes(`  ${test}`));
  assert.ok(start >= 0, `no summary line for ${test} in:\n${summary}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith('    '));
  return [lines[start], ...rest.slice(0, end < 0 ? rest.length : end)];
}

describe('arguments and environment', () => {
  it('rejects a bad invocation before any run', () => {
    for (const [
      args,
      extra,
      message,
    ] of /** @type {[string[], Record<string, string>, RegExp][]} */ ([
      [[], {}, /usage: pnpm test:e2e:sweep <spec/],
      [['e2e/x.spec.ts', '1', 'a', 'b'], {}, /usage:/],
      [['e2e/x.spec.ts', '0'], {}, /runs must be a positive integer, got '0'/],
      [['e2e/x.spec.ts', '010'], {}, /runs must be a positive integer, got '010'/],
      [['e2e/x.spec.ts', 'ten'], {}, /runs must be a positive integer, got 'ten'/],
      [['e2e/x.spec.ts', '1000000'], {}, /runs must be at most 999999, got '1000000'/],
      // Past 2^63 bash arithmetic would wrap, to 1 or to a negative count.
      [['e2e/x.spec.ts', '18446744073709551617'], {}, /runs must be at most 999999/],
      [['e2e/missing.spec.ts'], {}, /no e2e\/missing\.spec\.ts in /],
      // The file exists as x.spec.ts: a case-insensitive filesystem would find it anyway.
      [['e2e/X.spec.ts'], {}, /no e2e\/X\.spec\.ts in /],
      [['E2E/x.spec.ts'], {}, /no E2E\/x\.spec\.ts in /],
    ])) {
      const run = sweep(args, extra);
      assert.equal(run.status, 1, `${args}: ${run.stderr}`);
      assert.match(run.stderr, message);
      assert.equal(run.invocations, 0);
    }
  });

  it('accepts COLD only as unset, 0 or 1, and never with CI=true', () => {
    for (const [extra, message] of /** @type {[Record<string, string>, RegExp][]} */ ([
      [{ COLD: 'yes' }, /COLD must be unset, 0 or 1, got 'yes'/],
      [{ COLD: 'true' }, /COLD must be unset, 0 or 1, got 'true'/],
      [{ COLD: '1', CI: 'true' }, /COLD=1 deletes the dev server's \.next-e2e/],
    ])) {
      const run = sweep(['e2e/x.spec.ts', '1'], extra);
      assert.equal(run.status, 1, JSON.stringify(extra));
      assert.match(run.stderr, message);
      assert.equal(run.invocations, 0);
    }
  });

  it('refuses a jq older than 1.6', () => {
    const jq = execFileSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).trim();
    const bin = join(root, 'old-jq');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'jq'),
      `#!/bin/sh\nif [ "$1" = --version ]; then echo jq-1.5; exit 0; fi\nexec ${jq} "$@"\n`,
    );
    chmodSync(join(bin, 'jq'), 0o755);
    const run = sweep(['e2e/x.spec.ts', '1'], { PATH: `${bin}:${process.env.PATH}` });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /needs jq 1\.6 or a later 1\.x, found 'jq-1\.5'/);
  });

  it('calls the Playwright binary directly, never through pnpm, from apps/web', () => {
    plan(1, passing());
    const run = sweep(['e2e/x.spec.ts', '1']);
    assert.equal(run.status, 0, run.stderr);
    const [dir, command, pattern, reporter, output, outputDir] = stubArgs(1);
    assert.equal(dir, join(root, 'repo/apps/web'));
    assert.deepEqual([command, reporter, output], ['test', '--reporter=json', '--output']);
    assert.equal(outputDir, join(run.out, 'run-1-results'));
    assert.ok(pattern.startsWith('^'), pattern);
    assert.ok(!existsSync(join(stub, 'pnpm-called')), 'pnpm was never called');
    assert.equal(run.stderr, '', 'a clean sweep outside a git checkout prints no error');
  });

  it('passes the spec as an anchored, escaped expression that matches nothing else', () => {
    // Every character a regular expression treats specially, in one file name.
    const name = 'a+b(1){2}|?$^*[slug]\\.spec.ts';
    writeFileSync(join(root, 'repo/apps/web/e2e', name), '');
    plan(1, report([{ title: 'works', status: 'expected', file: name }]));
    const run = sweep([`e2e/${name}`, '1']);
    assert.equal(run.status, 0, run.stderr);
    // Playwright builds `new RegExp(argument, 'gi')` and tests it against absolute paths.
    const pattern = new RegExp(stubArgs(1)[2], 'i');
    const e2e = join(root, 'repo/apps/web/e2e');
    assert.ok(pattern.test(`${e2e}/${name}`), 'the expression matches its own file');
    for (const other of [
      'ab(1){2}|?$^*[slug]\\.spec.ts',
      `mobile/${name}`,
      `${name}x`,
      'x.spec.ts',
    ]) {
      assert.ok(!pattern.test(`${e2e}/${other}`), other);
    }
  });

  it('passes a spec whose name starts with a dash to basename and dirname as a name', () => {
    writeFileSync(join(root, 'repo/apps/web/-x.spec.ts'), '');
    const web = join(root, 'repo/apps/web');
    plan(1, report([{ title: 'works', status: 'expected', file: '-x.spec.ts' }], { rootDir: web }));
    const run = sweep(['-x.spec.ts', '1']);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, '');
  });

  it('stops when a run reports a file other than the spec', () => {
    plan(1, report([{ title: 'works', status: 'expected', file: 'other.spec.ts' }]));
    const run = sweep(['e2e/x.spec.ts', '1']);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /run 1 ran other\.spec\.ts, not only e2e\/x\.spec\.ts/);
  });

  it('compares whole paths: a file of the same name in another directory stops the sweep', () => {
    writeFileSync(join(root, 'repo/apps/web/e2e/mobile/x.spec.ts'), '');
    plan(1, report([{ title: 'works', status: 'expected', file: 'mobile/x.spec.ts' }]));
    assert.equal(sweep(['e2e/mobile/x.spec.ts', '1']).status, 0);
    // e2e/x.spec.ts, reported relative to the test directory, ends like the swept path.
    plan(2, report([{ title: 'works', status: 'expected', file: 'x.spec.ts' }]));
    const run = sweep(['e2e/mobile/x.spec.ts', '1']);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /run 1 ran x\.spec\.ts, not only e2e\/mobile\/x\.spec\.ts/);
    plan(3, report([{ title: 'works', status: 'expected' }], { rootDir: join(root, 'nowhere') }));
    const lost = sweep(['e2e/x.spec.ts', '1']);
    assert.equal(lost.status, 1);
    assert.match(lost.stderr, /run 1 wrote a report with no test directory \(config\.rootDir\)/);
  });

  it('defaults the port to 3229, keeps a given one, and drops ambient report settings', () => {
    plan(1, passing());
    plan(2, passing());
    sweep(['e2e/x.spec.ts', '1'], {
      PLAYWRIGHT_JSON_OUTPUT_FILE: join(root, 'ambient.json'),
      PLAYWRIGHT_JSON_OUTPUT_DIR: join(root, 'ambient'),
    });
    assert.match(stubEnv(1), /^PLAYWRIGHT_PORT=3229$/m);
    assert.doesNotMatch(stubEnv(1), /PLAYWRIGHT_JSON_OUTPUT_FILE/);
    assert.doesNotMatch(stubEnv(1), /PLAYWRIGHT_JSON_OUTPUT_DIR/);
    sweep(['e2e/x.spec.ts', '1'], { PLAYWRIGHT_PORT: '4555' });
    assert.match(stubEnv(2), /^PLAYWRIGHT_PORT=4555$/m);
  });

  it('records CI=true and CI=1 as the production build, anything else as the dev server', () => {
    for (const n of [1, 2, 3]) plan(n, passing());
    const modes = ['true', '1', 'false'].map((CI) => {
      const run = sweep(['e2e/x.spec.ts', '1'], { CI });
      assert.equal(run.status, 0, run.stderr);
      return /** @type {RegExpMatchArray} */ (read(run.out, 'sweep.txt').match(/^mode\t(.*)$/m))[1];
    });
    assert.deepEqual(modes, ['production build (CI)', 'production build (CI)', 'dev server']);
  });

  it('with COLD=1 deletes .next-e2e before every run, and otherwise keeps it', () => {
    for (const n of [1, 2, 3, 4]) plan(n, passing());
    sweep(['e2e/x.spec.ts', '2'], { COLD: '1' });
    sweep(['e2e/x.spec.ts', '2']);
    const cache = [1, 2, 3, 4].map((n) => read(stub, `cache-${n}`).trim());
    assert.deepEqual(cache, ['cold', 'cold', 'warm', 'warm']);
  });
});

describe('the out-dir', () => {
  it('defaults to a new directory under TMPDIR for every sweep', () => {
    plan(1, passing());
    plan(2, passing());
    const first = sweep(['e2e/x.spec.ts', '1'], { TMPDIR: `${join(root, 'tmp')}/` }).out;
    const second = sweep(['e2e/x.spec.ts', '1']).out;
    assert.match(first, new RegExp(`^${join(root, 'tmp')}/flake-sweep\\.\\w{6}$`));
    assert.notEqual(first, second);
  });

  it('makes a default out-dir absolute when TMPDIR is relative', () => {
    mkdirSync(join(cwd, 'reltmp'));
    plan(1, passing());
    const run = sweep(['e2e/x.spec.ts', '1'], { TMPDIR: 'reltmp' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.out, new RegExp(`^${cwd}/reltmp/flake-sweep\\.\\w{6}$`));
    assert.ok(existsSync(join(run.out, 'summary.txt')));
  });

  it('takes a relative out-dir from INIT_CWD under a pnpm script and from PWD otherwise', () => {
    const typed = join(root, 'typed');
    mkdirSync(typed);
    plan(1, passing());
    plan(2, passing());
    const script = { npm_lifecycle_event: 'test:e2e:sweep', INIT_CWD: typed };
    assert.equal(sweep(['e2e/x.spec.ts', '1', 'rel'], script).out, join(typed, 'rel'));
    // An INIT_CWD inherited by a direct call says nothing about where the command was typed.
    assert.equal(sweep(['e2e/x.spec.ts', '1', 'rel'], { INIT_CWD: typed }).out, join(cwd, 'rel'));
  });

  it('will not empty a directory that is not an earlier sweep', () => {
    const mine = join(root, 'mine');
    mkdirSync(mine);
    writeFileSync(join(mine, 'notes.txt'), 'keep');
    const run = sweep(['e2e/x.spec.ts', '1', mine]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /is not empty and was not made by flake-sweep/);
    assert.equal(read(mine, 'notes.txt'), 'keep');
    assert.equal(run.invocations, 0);
  });

  it('will not empty an unreadable directory, or one holding where the command was typed', () => {
    const locked = join(root, 'locked');
    mkdirSync(locked);
    writeFileSync(join(locked, 'notes.txt'), 'keep');
    chmodSync(locked, 0o300);
    try {
      const run = sweep(['e2e/x.spec.ts', '1', locked]);
      assert.equal(run.status, 1);
      assert.match(run.stderr, /^flake-sweep: cannot read .*locked; choose another out-dir$/m);
      assert.doesNotMatch(run.stderr, /exited/);
    } finally {
      chmodSync(locked, 0o700);
    }
    assert.equal(read(locked, 'notes.txt'), 'keep');
    plan(1, passing());
    const earlier = sweep(['e2e/x.spec.ts', '1', join(root, 'earlier')]).out;
    const run = sweep(['e2e/x.spec.ts', '1', '.'], {}, { cwd: earlier });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /holds .*earlier, so it cannot be emptied; choose another out-dir/);
    assert.ok(existsSync(join(earlier, 'summary.txt')), 'the earlier sweep is intact');
    assert.equal(run.invocations, 1);
  });

  it('empties an earlier sweep, so a run with no report is not scored from leftovers', () => {
    const dir = join(root, 'again');
    for (const n of [1, 2]) plan(n, passing(), 0, {});
    assert.equal(sweep(['e2e/x.spec.ts', '2', dir]).status, 0);
    rmSync(join(stub, 'count'));
    rmSync(join(stub, 'run-2.json'));
    writeFileSync(join(stub, 'run-2.exit'), '1');
    const run = sweep(['e2e/x.spec.ts', '2', dir]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /run 2 wrote no report \(exit 1\)/);
  });

  it('records what was swept in sweep.txt', () => {
    /** @param {string[]} args */
    const git = (...args) =>
      execFileSync('git', ['-C', join(root, 'repo'), ...args], { encoding: 'utf8' });
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      't',
    );
    writeFileSync(join(root, 'repo/untracked.txt'), '');
    plan(1, passing());
    const run = sweep(['e2e/x.spec.ts', '1'], { PLAYWRIGHT_PORT: '4555' });
    const lines = Object.fromEntries(
      read(run.out, 'sweep.txt')
        .trim()
        .split('\n')
        .map((line) => line.split('\t')),
    );
    assert.equal(lines.spec, 'e2e/x.spec.ts');
    assert.equal(lines.runs, '1');
    assert.equal(lines.commit, git('rev-parse', 'HEAD').trim());
    assert.equal(lines.dirty, 'yes, 1 paths');
    assert.equal(lines.mode, 'dev server');
    assert.equal(lines.COLD, '0');
    assert.equal(lines.PLAYWRIGHT_PORT, '4555');
    assert.equal(lines.playwright, 'Version 9.9.9');
    assert.match(lines.started, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });
});

describe('recording runs', () => {
  it('treats failing tests as data: exits 0 and writes a row per run', () => {
    plan(1, passing());
    plan(2, report([{ title: 'works', status: 'unexpected' }]), 1);
    const run = sweep(['e2e/x.spec.ts', '2']);
    assert.equal(run.status, 0, run.stderr);
    const rows = read(run.out, 'runs.tsv').trim().split('\n');
    assert.equal(rows[0], 'run\texit\tseconds\tload1\texpected\tunexpected\tflaky\tskipped');
    assert.deepEqual(
      rows.slice(1).map((row) => row.split('\t').filter((_, i) => i !== 2 && i !== 3)),
      [
        ['1', '0', '1', '0', '0', '0'],
        ['2', '1', '0', '1', '0', '0'],
      ],
    );
    assert.doesNotMatch(read(run.out, 'summary.txt'), /^run /m, 'failed tests explain exit 1');
  });

  it('names a run whose exit or report errors its tests do not explain', () => {
    const teardown = { errors: [{ message: 'Error in globalTeardown: db not cleaned\n  at x' }] };
    plan(1, report([{ title: 'works', status: 'expected' }], teardown), 1);
    plan(2, passing(), 1);
    plan(3, passing());
    const run = sweep(['e2e/x.spec.ts', '3']);
    assert.equal(run.status, 0, run.stderr);
    const summary = read(run.out, 'summary.txt');
    assert.deepEqual(
      summary.split('\n').filter((line) => line.startsWith('run ')),
      [
        'run 1: exit 1 with no unexpected test; ' +
          'report errors: Error in globalTeardown: db not cleaned',
        'run 2: exit 1 with no unexpected test',
      ],
    );
  });

  it('keeps the output of a run with a failed or flaky test, a flaky-only run included', () => {
    plan(1, passing());
    // A test that failed once and passed on retry: Playwright exits 0.
    plan(2, report([{ title: 'works', status: 'flaky' }]), 0);
    plan(3, report([{ title: 'works', status: 'unexpected' }]), 1);
    const run = sweep(['e2e/x.spec.ts', '3']);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(!existsSync(join(run.out, 'run-1-results')), 'a clean run keeps nothing');
    assert.ok(existsSync(join(run.out, 'run-2-results/x-failed/error-context.md')));
    assert.ok(existsSync(join(run.out, 'run-3-results/x-failed/error-context.md')));
  });

  for (const [name, prepare, message] of /** @type {[string, () => void, RegExp][]} */ ([
    ['writes no report', () => plan(2, null, 1), /run 2 wrote no report \(exit 1\)/],
    [
      'writes an unreadable report',
      () => plan(2, '{"stats": {', 1),
      /run 2 wrote an unreadable report/,
    ],
    [
      'runs no tests, printing the errors that say why',
      () =>
        plan(2, report([], { errors: [{ message: 'Error: localhost:3229 is already used' }] }), 1),
      /already used[\s\S]*run 2 ran no tests \(exit 1\)/,
    ],
    ['is killed by a signal', () => plan(2, passing(), 129), /run 2 was killed \(exit 129\)/],
    [
      'reports counts that are not whole numbers',
      () =>
        plan(2, {
          ...passing(),
          stats: { expected: `i[$(touch${'${IFS}'}${join(root, 'pwned')})]`, unexpected: 0 },
        }),
      /run 2 wrote an unreadable report/,
    ],
    [
      'reports no counts',
      () => plan(2, { ...passing(), stats: { expected: 1 } }),
      /run 2 wrote an unreadable report/,
    ],
    [
      'reports suites that are not objects',
      () => plan(2, { ...passing(), suites: [1] }),
      /run 2 wrote an unreadable report/,
    ],
    [
      'fails to record its row',
      () => plan(2, passing(), 0, { hook: 'chmod 444 "$(dirname "$out")/runs.tsv"\n' }),
      /line \d+ exited 1/,
    ],
  ])) {
    it(`stops with exit 1 and a partial summary when a run ${name}`, () => {
      plan(1, report([{ title: 'works', status: 'unexpected' }]), 1);
      prepare();
      plan(3, passing());
      const run = sweep(['e2e/x.spec.ts', '3']);
      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, message);
      assert.equal(run.invocations, 2, 'no run starts after the stop');
      const dir = outDir(run.stderr);
      const summary = read(dir, 'summary.txt');
      assert.match(summary, /^flake-sweep: e2e\/x\.spec\.ts, 1 of 3 runs, dev server$/m);
      assert.match(summary, /^stopped early: (run 2 |line \d+ exited 1$)/m);
      assert.match(summary, /^1\/1 unexpected {2}x\.spec\.ts:5 works \[chromium\]$/m);
      assert.ok(!existsSync(join(root, 'pwned')), 'nothing in a report runs as a command');
    });
  }

  for (const [code, word] of /** @type {[number, string][]} */ ([
    [130, 'interrupted'],
    [143, 'terminated'],
  ])) {
    it(`stops with ${code} when Playwright ends a run with ${code}`, () => {
      // As when the sweep was started in the background by a script, which leaves it ignoring
      // SIGINT, while Playwright handles the SIGINT that reached them both.
      plan(1, passing());
      plan(2, null, code);
      const run = sweep(['e2e/x.spec.ts', '3']);
      assert.equal(run.status, code, run.stderr);
      assert.match(
        read(run.out ?? outDir(run.stderr), 'summary.txt'),
        new RegExp(`^stopped early: ${word} during run 2$`, 'm'),
      );
      assert.equal(run.invocations, 2);
    });
  }

  it('writes every row and the summary when its stdout is closed early', () => {
    const dir = join(root, 'piped');
    plan(1, passing());
    plan(2, passing(), 0, { hook: 'sleep 1\n' });
    plan(3, passing());
    const script = join(root, 'repo/scripts/flake-sweep.sh');
    const run = spawnSync(
      'bash',
      [
        '-c',
        'bash "$0" e2e/x.spec.ts 3 "$1" | head -n 1 >/dev/null; echo "${PIPESTATUS[0]}"',
        script,
        dir,
      ],
      { cwd, encoding: 'utf8', env: env() },
    );
    assert.equal(run.stdout.trim(), '0', run.stderr);
    assert.equal(invocations(), 3);
    assert.equal(read(dir, 'runs.tsv').trim().split('\n').length, 4);
    assert.match(
      read(dir, 'summary.txt'),
      /^flake-sweep: e2e\/x\.spec\.ts, 3 of 3 runs, dev server$/m,
    );
  });

  it('on Ctrl-C lets Playwright finish, summarises finished runs and exits 130', async () => {
    mkdirSync(join(root, 'tmp'), { recursive: true });
    plan(1, passing(250));
    plan(2, null, 0, { sleep: 30 });
    plan(3, passing());
    // Detached, so the sweep leads its own process group and the signal reaches every process in
    // it, the way a terminal's Ctrl-C does.
    const child = spawn('bash', [join(root, 'repo/scripts/flake-sweep.sh'), 'e2e/x.spec.ts', '3'], {
      cwd,
      env: env(),
      detached: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.resume();
    const deadline = Date.now() + 20_000;
    while (!existsSync(join(stub, 'signal-2.ready'))) {
      assert.ok(Date.now() < deadline, 'run 2 never started');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    process.kill(-(/** @type {number} */ (child.pid)), 'SIGINT');
    const code = await new Promise((resolve) => child.on('close', (status) => resolve(status)));
    assert.equal(code, 130, stderr);
    assert.match(stderr, /interrupted during run 2/);
    assert.equal(invocations(), 2);
    assert.equal(read(stub, 'signal-2'), 'SIGINT');
    const summary = read(outDir(stderr), 'summary.txt');
    assert.match(summary, /^flake-sweep: e2e\/x\.spec\.ts, 1 of 3 runs, dev server$/m);
    assert.match(summary, /^stopped early: interrupted during run 2$/m);
    assert.match(summary, /^ {4}ms: 250$/m);
  });

  it('on a SIGTERM to the sweep alone stops Playwright with SIGINT and exits 143', async () => {
    mkdirSync(join(root, 'tmp'), { recursive: true });
    plan(1, passing());
    plan(2, null, 0, { sleep: 30 });
    plan(3, passing());
    const child = spawn('bash', [join(root, 'repo/scripts/flake-sweep.sh'), 'e2e/x.spec.ts', '3'], {
      cwd,
      env: env(),
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.resume();
    const deadline = Date.now() + 20_000;
    while (!existsSync(join(stub, 'signal-2.ready'))) {
      assert.ok(Date.now() < deadline, 'run 2 never started');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const sent = Date.now();
    child.kill('SIGTERM');
    const code = await new Promise((resolve) => child.on('close', (status) => resolve(status)));
    // Without the signal passed on, the sweep would wait out run 2's 30 seconds.
    assert.ok(Date.now() - sent < 10_000, `stopped after ${Date.now() - sent} ms`);
    assert.equal(code, 143, stderr);
    assert.equal(read(stub, 'signal-2'), 'SIGINT');
    const summary = read(outDir(stderr), 'summary.txt');
    assert.match(summary, /^flake-sweep: e2e\/x\.spec\.ts, 1 of 3 runs, dev server$/m);
    assert.match(summary, /^stopped early: terminated during run 2$/m);
  });
});

describe('summary.txt', () => {
  it('keeps tests apart that share a file, line and title under different describes', () => {
    /**
     * @param {string} describe
     * @param {string} status
     */
    const axe = (describe, status) => ({ title: 'axe', status, describe, line: 12 });
    plan(1, report([axe('light', 'expected'), axe('dark', 'unexpected')]), 1);
    const run = sweep(['e2e/x.spec.ts', '1']);
    const summary = read(run.out, 'summary.txt');
    assert.deepEqual(block(summary, 'x.spec.ts:12 dark > axe'), [
      '1/1 unexpected  x.spec.ts:12 dark > axe [chromium]',
      '    failed in runs: 1',
      '    ms: 100',
    ]);
    assert.deepEqual(block(summary, 'x.spec.ts:12 light > axe'), [
      '0/1 unexpected  x.spec.ts:12 light > axe [chromium]',
      '    ms: 100',
    ]);
  });

  it('gives each run a column, - where the test did not run, and lists failing runs', () => {
    const other = { title: 'other', status: 'expected', line: 9 };
    plan(1, report([{ title: 'works', status: 'unexpected', ms: 111 }, other]), 1);
    plan(2, report([other]));
    plan(3, report([{ title: 'works', status: 'flaky', ms: 333 }, other]));
    const run = sweep(['e2e/x.spec.ts', '3']);
    assert.deepEqual(block(read(run.out, 'summary.txt'), 'x.spec.ts:5 works'), [
      '1/2 unexpected, 1 flaky  x.spec.ts:5 works [chromium]',
      '    failed in runs: 1 3',
      '    ms: 111 - 333',
    ]);
  });

  it('leaves skipped or not-run tests out of the count, and names every declared status', () => {
    plan(1, report([{ title: 'works', status: 'unexpected' }]), 1);
    // As a test after a failed beforeAll: skipped, though declared to pass.
    plan(2, report([{ title: 'works', status: 'skipped' }]));
    plan(3, report([{ title: 'works', status: 'expected', declared: 'failed' }]));
    const run = sweep(['e2e/x.spec.ts', '3']);
    assert.deepEqual(block(read(run.out, 'summary.txt'), 'x.spec.ts:5 works'), [
      '1/2 unexpected, 1 skipped or not run  x.spec.ts:5 works [chromium]' +
        ' (declared failed, passed)',
      '    failed in runs: 1',
      '    ms: 100 - 100',
    ]);
  });

  it('orders tests by file, then line as a number, then title and project', () => {
    plan(
      1,
      report([
        { title: 'b', status: 'expected', line: 10, project: 'mobile-safari' },
        { title: 'a', status: 'expected', line: 9 },
        { title: 'b', status: 'expected', line: 10, project: 'mobile-chrome' },
      ]),
    );
    const run = sweep(['e2e/x.spec.ts', '1']);
    const heads = read(run.out, 'summary.txt')
      .split('\n')
      .filter((line) => / {2}x\.spec\.ts:/.test(line))
      .map((line) => line.split('  ')[1]);
    assert.deepEqual(heads, [
      'x.spec.ts:9 a [chromium]',
      'x.spec.ts:10 b [mobile-chrome]',
      'x.spec.ts:10 b [mobile-safari]',
    ]);
    assert.match(run.stdout, /x\.spec\.ts:9 a \[chromium\]/, 'the summary is printed too');
    assert.deepEqual(readdirSync(run.out).sort(), [
      '.flake-sweep',
      'run-1.json',
      'run-1.log',
      'runs.tsv',
      'summary.txt',
      'sweep.txt',
    ]);
  });
});

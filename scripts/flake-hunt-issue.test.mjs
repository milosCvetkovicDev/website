// Tests for scripts/flake-hunt-issue.sh. Run with `pnpm test:scripts` (node:test).
//
// A stub `gh` first on PATH records every call and answers `gh issue list` with the open issues a
// test prepares, so nothing reaches GitHub. Under test: which tests count as new flakes, that a
// tracked flake is never reported twice (not even after its line moved), what the issue says, and
// that a gh failure is loud.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'flake-hunt-issue.sh');

// Appends each call's arguments, one JSON array per line, to $STUB/calls. Like gh, `issue list`
// returns at most --limit issues, 30 when the option is absent.
const STUB_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const stub = process.env.STUB;
const args = process.argv.slice(2);
fs.appendFileSync(stub + '/calls', JSON.stringify(args) + '\\n');
if (fs.existsSync(stub + '/fail-' + args[0] + '-' + args[1])) process.exit(1);
if (args[0] === 'issue' && args[1] === 'list') {
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 30;
  const open = JSON.parse(fs.readFileSync(stub + '/open-issues.json', 'utf8'));
  process.stdout.write(JSON.stringify(open.slice(0, limit)));
} else if (args[0] === 'issue' && args[1] === 'create') {
  process.stdout.write('https://github.com/o/r/issues/7\\n');
}
`;

/** @type {string} */
let root;
/** @type {string} */
let stub;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'flake-hunt-issue-')));
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  writeFileSync(join(stub, 'bin/gh'), STUB_GH);
  chmodSync(join(stub, 'bin/gh'), 0o755);
  writeFileSync(join(stub, 'open-issues.json'), '[]');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * @typedef {{
 *   title: string,
 *   failed: number,
 *   line?: number,
 *   project?: string,
 *   error?: string | null,
 * }} IssueTest
 * @typedef {{
 *   file: string,
 *   flagged: boolean,
 *   tests: IssueTest[],
 *   failed?: number,
 *   rate?: number,
 * }} IssueSpec
 */

/**
 * A flake-report.json with one spec per entry: { file, flagged, rate, tests: [...] }.
 *
 * @param {IssueSpec[]} specs
 */
function flakeReport(specs) {
  return {
    commit: 'abc1234def',
    mode: 'production build (CI)',
    threshold: 0.05,
    completedRuns: 30,
    runs: 30,
    specs: specs.map((s) => ({
      file: s.file,
      runs: 30,
      failedRuns: s.failed ?? 3,
      failureRate: s.rate ?? 0.1,
      flagged: s.flagged,
      tests: s.tests.map((t) => ({
        line: t.line ?? 10,
        title: t.title,
        project: t.project ?? 'chromium',
        runs: 30,
        failed: t.failed,
        failures:
          t.failed > 0
            ? [
                {
                  run: 4,
                  status: 'unexpected',
                  error: t.error === undefined ? 'Error: timed out\nat x' : t.error,
                },
              ]
            : [],
      })),
    })),
  };
}

/** @param {object} body */
function file(body) {
  const path = join(root, 'flake-report.json');
  writeFileSync(path, JSON.stringify(body));
  return path;
}

/** @param {string[]} args */
function run(...args) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, STUB: stub, PATH: `${join(stub, 'bin')}:${process.env.PATH}` },
  });
  const callsFile = join(stub, 'calls');
  const calls = existsSync(callsFile)
    ? readFileSync(callsFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => /** @type {string[]} */ (JSON.parse(line)))
    : [];
  return { ...result, calls };
}

/** The hidden marker the issue body carries for a test key. */
/** @param {string} key */
const marker = (key) => `<!-- flake-key: ${Buffer.from(key).toString('base64')} -->`;
/** @param {string[]} bodies */
const openIssues = (...bodies) =>
  writeFileSync(join(stub, 'open-issues.json'), JSON.stringify(bodies.map((body) => ({ body }))));

/** @param {string[][]} calls */
const created = (calls) => calls.find((c) => c[0] === 'issue' && c[1] === 'create');
/**
 * @param {string[] | undefined} call A call the test expects to have been made.
 * @param {string} name
 */
const option = (call, name) => {
  const args = /** @type {string[]} */ (call);
  return args[args.indexOf(name) + 1];
};

/**
 * @param {IssueTest[]} tests
 * @param {Partial<IssueSpec>} [extra]
 * @returns {IssueSpec}
 */
const workCards = (tests, extra = {}) => ({
  file: 'work-cards.spec.ts',
  flagged: true,
  tests,
  ...extra,
});

describe('which flakes are reported', () => {
  it('opens one issue for the failing tests of flagged specs, with a marker per test', () => {
    const report = file(
      flakeReport([
        workCards([
          { title: 'by pointer', line: 78, failed: 3 },
          { title: 'by keyboard', line: 93, failed: 2, error: 'Error: a | b\nstack' },
          { title: 'named for its title', line: 107, failed: 0 },
        ]),
        {
          file: 'hero.spec.ts',
          flagged: false,
          rate: 0.033,
          tests: [{ title: 'boots', failed: 1 }],
        },
      ]),
    );
    const result = run(report, 'https://github.com/o/r/actions/runs/1');
    assert.equal(result.status, 0, result.stderr);
    const issue = created(result.calls);
    assert.ok(issue, 'an issue was created');
    assert.equal(option(issue, '--label'), 'flake-hunt');
    assert.equal(option(issue, '--title'), 'Flaky e2e tests: 2 new from the flake hunt');
    const body = option(issue, '--body');
    assert.match(
      body,
      /ran the e2e suite 30 times on commit abc1234def \(production build \(CI\)\)/,
    );
    assert.match(body, /^The flake hunt ran/, 'a manual dispatch is not nightly');
    assert.match(body, /failed in more than 5% of the completed runs it ran in/);
    assert.doesNotMatch(body, /not listed/);
    assert.match(
      body,
      /\| `work-cards\.spec\.ts:78 by pointer \[chromium\]` \| 3 of 30 \| Error: timed out \|/,
    );
    assert.match(body, /\| Error: a \\\| b \|/, 'a pipe in an error cannot break the table');
    assert.match(
      body,
      /shard artifacts of https:\/\/github\.com\/o\/r\/actions\/runs\/1, kept for 14 days/,
    );
    assert.match(body, /`flake-report` artifact, kept for 30/);
    assert.ok(body.includes(marker('work-cards.spec.ts by pointer [chromium]')), body);
    assert.ok(body.includes(marker('work-cards.spec.ts by keyboard [chromium]')), body);
    assert.doesNotMatch(body, /named for its title|hero\.spec\.ts/);
    assert.ok(
      result.calls.some((c) => c[0] === 'label' && c[1] === 'create' && c.includes('--force')),
      'the label is created or updated first',
    );
  });

  it('opens nothing when no spec is flagged', () => {
    const report = file(flakeReport([workCards([{ title: 'x', failed: 1 }], { flagged: false })]));
    const result = run(report);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, [], 'gh is not even asked');
    assert.match(result.stdout, /no flagged spec/);
  });

  it('leaves out tests an open flake-hunt issue tracks, and opens nothing if all are', () => {
    openIssues(`old\n${marker('work-cards.spec.ts by pointer [chromium]')}`);
    const both = file(
      flakeReport([
        workCards([
          { title: 'by pointer', line: 78, failed: 3 },
          { title: 'by keyboard', line: 93, failed: 2 },
        ]),
      ]),
    );
    const partly = run(both);
    assert.equal(partly.status, 0, partly.stderr);
    const body = option(created(partly.calls), '--body');
    assert.doesNotMatch(body, /by pointer/);
    assert.match(body, /by keyboard/);

    rmSync(join(stub, 'calls'));
    const tracked = file(flakeReport([workCards([{ title: 'by pointer', line: 78, failed: 3 }])]));
    const none = run(tracked);
    assert.equal(none.status, 0, none.stderr);
    assert.equal(created(none.calls), undefined);
    assert.match(none.stdout, /already tracked/);
  });

  it('still knows a tracked test after lines above it moved', () => {
    openIssues(marker('work-cards.spec.ts by pointer [chromium]'));
    const moved = file(flakeReport([workCards([{ title: 'by pointer', line: 81, failed: 3 }])]));
    const result = run(moved);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(created(result.calls), undefined);
  });

  it('keeps a key intact whatever its title holds, and ignores a marker that is not base64', () => {
    const title = 'closes the menu --> and <!-- reopens it';
    openIssues(
      `<!-- flake-key: not base64! -->\n${marker(`work-cards.spec.ts ${title} [chromium]`)}`,
    );
    const tracked = file(flakeReport([workCards([{ title, failed: 2 }])]));
    const none = run(tracked);
    assert.equal(none.status, 0, none.stderr);
    assert.equal(created(none.calls), undefined, 'the marker round-trips the key');

    openIssues('');
    rmSync(join(stub, 'calls'));
    const body = option(created(run(tracked).calls), '--body');
    const markers = body.match(/<!-- flake-key: [^ ]* -->/g);
    assert.equal(
      /** @type {RegExpMatchArray} */ (markers).length,
      1,
      'the title cannot end the marker early',
    );
  });

  it('finds a tracked test in an older issue, past the 30 gh lists by default', () => {
    const others = Array.from({ length: 40 }, (_, i) =>
      marker(`other.spec.ts test ${i} [chromium]`),
    );
    openIssues(...others, marker('work-cards.spec.ts by pointer [chromium]'));
    const result = run(file(flakeReport([workCards([{ title: 'by pointer', failed: 3 }])])));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(created(result.calls), undefined, 'no duplicate issue');
  });

  it('ignores a marker that looks like base64 but does not decode', () => {
    openIssues('<!-- flake-key: a=b -->');
    const result = run(file(flakeReport([workCards([{ title: 'x', failed: 1 }])])));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(created(result.calls));
  });

  it('lists at most 50 tests, those that failed most, with cells cut short', () => {
    const tests = Array.from({ length: 60 }, (_, i) => ({
      title: `${'a long title '.repeat(40)}${i}`,
      line: i + 1,
      failed: i === 59 ? 30 : 1 + (i % 3),
      error: `Error: ${'x'.repeat(5000)}`,
    }));
    const result = run(file(flakeReport([workCards(tests)])));
    assert.equal(result.status, 0, result.stderr);
    const issue = created(result.calls);
    assert.equal(option(issue, '--title'), 'Flaky e2e tests: 50 new from the flake hunt');
    const body = option(issue, '--body');
    assert.equal(/** @type {RegExpMatchArray} */ (body.match(/<!-- flake-key: /g)).length, 50);
    assert.match(body, /\n10 more new flaky tests are not listed/);
    assert.ok(body.includes(marker(`work-cards.spec.ts ${tests[59].title} [chromium]`)));
    const rows = body.split('\n').filter((line) => line.startsWith('| `'));
    assert.equal(rows.length, 50);
    assert.match(rows[0], / 30 of 30 /, 'the test that failed most comes first');
    assert.ok(
      rows.every((row) => row.length < 600),
      'every cell is cut short',
    );
    assert.ok(body.length < 65536, `body is ${body.length} characters`);
  });

  it('reports a failure with no error message, such as a test.fail() that passed', () => {
    const report = file(flakeReport([workCards([{ title: 'known bug', failed: 1, error: null }])]));
    const result = run(report);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      option(created(result.calls), '--body'),
      /\| `work-cards\.spec\.ts:10 known bug \[chromium\]` \| 1 of 30 \|  \|/,
    );
  });

  it('asks only for open issues with the flake-hunt label', () => {
    const result = run(file(flakeReport([workCards([{ title: 'x', failed: 1 }])])));
    const list = result.calls.find((c) => c[0] === 'issue' && c[1] === 'list');
    assert.equal(option(list, '--label'), 'flake-hunt');
    assert.equal(option(list, '--state'), 'open');
  });
});

describe('failures are loud', () => {
  it('exits 2 when gh cannot list issues, and opens nothing', () => {
    writeFileSync(join(stub, 'fail-issue-list'), '');
    const result = run(file(flakeReport([workCards([{ title: 'x', failed: 1 }])])));
    assert.equal(result.status, 2);
    assert.equal(created(result.calls), undefined);
  });

  it('exits 2 when the issue cannot be created', () => {
    writeFileSync(join(stub, 'fail-issue-create'), '');
    const result = run(file(flakeReport([workCards([{ title: 'x', failed: 1 }])])));
    assert.equal(result.status, 2);
  });

  it('rejects a file that is not a flake-hunt report and a wrong argument count', () => {
    const notReport = join(root, 'other.json');
    writeFileSync(notReport, '{"suites": []}');
    const wrong = run(notReport);
    assert.equal(wrong.status, 2);
    assert.match(wrong.stderr, /is not a flake-hunt report/);
    const none = run();
    assert.equal(none.status, 2);
    assert.match(none.stderr, /usage:/);
  });
});

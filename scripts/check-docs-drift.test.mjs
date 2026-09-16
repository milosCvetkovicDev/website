// Tests for scripts/check-docs-drift.ts. Run with `pnpm test:scripts` (node:test).
//
// Each case builds a throwaway git repository holding a doc, the files it describes and a manifest,
// puts a stub `gh` first on PATH that replays prepared API responses, and runs the checker as a
// process, the way CI does. What is under test is the contract in the checker's header: which
// outcomes are drift (exit 1), which could not be checked (exit 2, never counted as holding), and
// what the historical and coverage rules mean.
//
// The checker is TypeScript run directly by Node, so this suite also proves, on whichever Node
// `pnpm test:scripts` runs under in CI, that type stripping needs no flag there.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKER = join(HERE, 'check-docs-drift.ts');
const REAL_MANIFEST = join(HERE, '..', 'docs', 'drift-manifest.json');

// Replays $STUB/gh-<n>.json in order: {"status": exit code, "stdout": "...", "stderr": "..."}.
// Past the last prepared response it repeats the last one. Every call is logged to $STUB/calls.
const STUB_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const dir = process.env.STUB;
const seen = fs.existsSync(dir + '/count') ? Number(fs.readFileSync(dir + '/count', 'utf8')) : 0;
const count = seen + 1;
fs.writeFileSync(dir + '/count', String(count));
fs.appendFileSync(dir + '/calls', JSON.stringify(process.argv.slice(2)) + '\\n');
let n = count;
while (n > 1 && !fs.existsSync(dir + '/gh-' + n + '.json')) n -= 1;
const reply = JSON.parse(fs.readFileSync(dir + '/gh-' + n + '.json', 'utf8'));
process.stdout.write(reply.stdout ?? '');
process.stderr.write(reply.stderr ?? '');
process.exit(reply.status ?? 0);
`;

let root;
let repo;
let stub;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'docs-drift-'));
  repo = join(root, 'repo');
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  writeFileSync(
    join(stub, 'bin', 'gh'),
    STUB_GH.replace('#!/usr/bin/env node', `#!${process.execPath}`),
  );
  chmodSync(join(stub, 'bin', 'gh'), 0o755);
  mkdirSync(repo);
  git('init', '-q', '-b', 'main');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function git(...args) {
  const run = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

function write(path, content) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function commit(message = 'change') {
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

function manifest(assertions, { roots = ['docs'] } = {}) {
  return {
    schemaVersion: 1,
    repository: 'owner/name',
    rules: { coverage: { roots, pnpmBuiltins: ['install', 'exec'] } },
    assertions,
  };
}

function entry(overrides) {
  return {
    id: 'a',
    doc: 'docs/doc.md',
    anchor: 'ANCHOR',
    claim: 'a claim',
    method: 'file-line',
    evaluation: 'live',
    check: { path: 'src/app.ts', contains: 'hello' },
    ...overrides,
  };
}

function gh(...replies) {
  replies.forEach((reply, i) =>
    writeFileSync(join(stub, `gh-${i + 1}.json`), JSON.stringify(reply)),
  );
}

function check(assertions, { args = [], options } = {}) {
  write('docs/drift-manifest.json', JSON.stringify(manifest(assertions, options)));
  const run = spawnSync(process.execPath, [CHECKER, '--root', repo, '--json', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      STUB: stub,
      PATH: `${join(stub, 'bin')}:${process.env.PATH}`,
      DOCS_DRIFT_GH_BACKOFF_MS: '1',
    },
  });
  let report = null;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    // Invalid-manifest runs print to stderr only.
  }
  return { status: run.status, stderr: run.stderr, report };
}

const statuses = (report) => Object.fromEntries(report.findings.map((f) => [f.id, f.status]));

describe('file-line', () => {
  beforeEach(() => {
    write('docs/doc.md', 'ANCHOR here\n');
    write('src/app.ts', 'one\nhello world\nthree\n');
  });

  it('holds when the cited line contains the text, and drifts when another line does', () => {
    const ok = check([entry({ check: { path: 'src/app.ts', line: 2, contains: 'hello' } })]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(ok.report.summary, {
      assertions: 1,
      pass: 1,
      drift: 0,
      stale: 0,
      uncatalogued: 0,
      skipped: 0,
      unrunnable: 0,
    });
    const moved = check([entry({ check: { path: 'src/app.ts', line: 3, contains: 'hello' } })]);
    assert.equal(moved.status, 1);
    assert.deepEqual(moved.report.findings[0].actual, 'three');
    assert.equal(moved.report.findings[0].claimed, 'hello');
  });

  it('checks a line range, a regex, an absent text and a path that must be gone', () => {
    const run = check([
      entry({ id: 'range', check: { path: 'src/app.ts', line: 1, lineEnd: 2, contains: 'hello' } }),
      entry({ id: 'regex', check: { path: 'src/app.ts', matches: '^hello \\w+$' } }),
      entry({ id: 'absent', check: { path: 'src/app.ts', absent: 'goodbye' } }),
      entry({ id: 'gone', check: { path: 'src/deleted.ts', exists: false } }),
      entry({ id: 'missing', check: { path: 'src/missing.ts' } }),
    ]);
    assert.equal(run.status, 1);
    assert.deepEqual(statuses(run.report), { missing: 'drift' });
  });

  it('reads a historical claim at its asOf commit, so later edits are not drift', () => {
    const then = commit('then');
    write('src/app.ts', 'rewritten\n');
    commit('now');
    const run = check([
      entry({
        evaluation: 'historical',
        asOf: then,
        check: { path: 'src/app.ts', line: 2, contains: 'hello' },
      }),
    ]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
  });

  it('still reports a historical citation that was wrong when it was written', () => {
    const then = commit('then');
    const run = check([
      entry({
        evaluation: 'historical',
        asOf: then,
        check: { path: 'src/app.ts', line: 1, contains: 'hello' },
      }),
    ]);
    assert.equal(run.status, 1);
    assert.match(run.report.findings[0].detail, new RegExp(`at ${then}`));
  });

  it('cannot run, rather than passing, when the asOf commit is not in the clone', () => {
    commit();
    const run = check([
      entry({
        evaluation: 'historical',
        asOf: 'deadbeefdeadbeef',
        check: { path: 'src/app.ts', contains: 'hello' },
      }),
    ]);
    assert.equal(run.status, 2);
    assert.equal(run.report.findings[0].status, 'unrunnable');
    assert.match(run.report.findings[0].detail, /not in this clone/);
  });
});

describe('config-value', () => {
  beforeEach(() => {
    write('docs/doc.md', 'ANCHOR\n');
    write(
      'package.json',
      JSON.stringify({
        packageManager: 'pnpm@10.34.5',
        scripts: { 'format:check': 'prettier --check .' },
      }),
    );
    write(
      '.vscode/settings.json',
      JSON.stringify({ 'eslint.workingDirectories': [{ mode: 'auto' }] }),
    );
    write(
      '.github/workflows/ci.yml',
      'jobs:\n  a:\n    timeout-minutes: 15\n  b:\n    timeout-minutes: 20\n',
    );
    write('.nvmrc', '22\n');
  });

  it('compares JSON paths, dotted keys, regex captures and whole files', () => {
    const run = check([
      entry({
        id: 'json',
        method: 'config-value',
        check: { file: 'package.json', json: 'packageManager', equals: 'pnpm@10.34.5' },
      }),
      entry({
        id: 'colon-key',
        method: 'config-value',
        check: { file: 'package.json', json: 'scripts.format:check', equals: 'prettier --check .' },
      }),
      entry({
        id: 'dotted-key',
        method: 'config-value',
        check: {
          file: '.vscode/settings.json',
          json: '["eslint.workingDirectories"]',
          equals: [{ mode: 'auto' }],
        },
      }),
      entry({
        id: 'all',
        method: 'config-value',
        check: {
          file: '.github/workflows/ci.yml',
          regex: '^    timeout-minutes: (\\d+)$',
          equalsAll: ['15', '20'],
        },
      }),
      entry({
        id: 'text',
        method: 'config-value',
        check: { file: '.nvmrc', text: true, equals: '22' },
      }),
    ]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
  });

  it('drifts on a changed value and on a regex that no longer matches', () => {
    const run = check([
      entry({
        id: 'pin',
        method: 'config-value',
        check: { file: 'package.json', json: 'packageManager', equals: 'pnpm@10.33.0' },
      }),
      entry({
        id: 'gone',
        method: 'config-value',
        check: { file: '.github/workflows/ci.yml', regex: 'retention-days: (\\d+)', equals: '7' },
      }),
    ]);
    assert.equal(run.status, 1);
    assert.deepEqual(statuses(run.report), { pin: 'drift', gone: 'drift' });
    assert.equal(run.report.findings.find((f) => f.id === 'pin').actual, 'pnpm@10.34.5');
  });

  it('compares objects regardless of key order', () => {
    write('x.json', '{"b": 1, "a": 2}');
    const run = check([
      entry({
        method: 'config-value',
        check: { file: 'x.json', json: '', equals: { a: 2, b: 1 } },
      }),
    ]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
  });
});

describe('command', () => {
  beforeEach(() => {
    write('docs/doc.md', 'ANCHOR\n');
    write('package.json', JSON.stringify({ scripts: { lint: 'turbo lint' } }));
    write('apps/web/package.json', JSON.stringify({ scripts: { start: 'next start' } }));
  });

  it('holds for a script in the named package and drifts for a missing one', () => {
    const run = check([
      entry({
        id: 'root',
        method: 'command',
        check: { package: '.', script: 'lint', runs: 'turbo' },
      }),
      entry({ id: 'web', method: 'command', check: { package: 'apps/web', script: 'start' } }),
      entry({ id: 'missing', method: 'command', check: { package: '.', script: 'start' } }),
      entry({
        id: 'runs',
        method: 'command',
        check: { package: '.', script: 'lint', runs: 'eslint' },
      }),
    ]);
    assert.equal(run.status, 1);
    assert.deepEqual(statuses(run.report), { missing: 'drift', runs: 'drift' });
  });
});

describe('gh-api', () => {
  beforeEach(() => {
    write('docs/doc.md', 'ANCHOR\n');
  });

  const setting = (overrides = {}) =>
    entry({
      method: 'gh-api',
      check: { endpoint: 'repos/{repo}', jq: '.allow_rebase_merge', equals: false },
      ...overrides,
    });

  it('holds when the API returns the claimed value, and asks gh for JSON of the jq result', () => {
    gh({ status: 0, stdout: 'false\n' });
    const run = check([setting()]);
    assert.equal(run.status, 0, run.stderr);
    const call = JSON.parse(readFileSync(join(stub, 'calls'), 'utf8').trim());
    assert.deepEqual(call, ['api', 'repos/owner/name', '--jq', '(.allow_rebase_merge) | tojson']);
  });

  it('drifts when the setting changed', () => {
    gh({ status: 0, stdout: 'true\n' });
    const run = check([setting()]);
    assert.equal(run.status, 1);
    assert.deepEqual(
      [run.report.findings[0].claimed, run.report.findings[0].actual],
      [false, true],
    );
  });

  it('retries a server error and passes once GitHub answers', () => {
    gh(
      { status: 1, stderr: 'HTTP 502: Bad Gateway' },
      { status: 1, stderr: 'HTTP 503' },
      { status: 0, stdout: 'false' },
    );
    const run = check([setting()]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
    assert.equal(readFileSync(join(stub, 'calls'), 'utf8').trim().split('\n').length, 3);
  });

  it('cannot run after three server errors, and says so instead of passing', () => {
    gh({ status: 1, stderr: 'HTTP 502: Bad Gateway' });
    const run = check([setting()]);
    assert.equal(run.status, 2);
    assert.equal(run.report.findings[0].status, 'unrunnable');
    assert.equal(readFileSync(join(stub, 'calls'), 'utf8').trim().split('\n').length, 3);
  });

  it('does not retry an authentication failure, and cannot run', () => {
    gh({ status: 4, stderr: 'To get started with GitHub CLI, please run:  gh auth login' });
    const run = check([setting()]);
    assert.equal(run.status, 2);
    assert.equal(readFileSync(join(stub, 'calls'), 'utf8').trim().split('\n').length, 1);
  });

  it('lists an admin-only claim as skipped under --skip-requires, never as holding', () => {
    const run = check([setting({ requires: 'admin' })], { args: ['--skip-requires', 'admin'] });
    assert.equal(run.status, 0);
    assert.equal(run.report.summary.pass, 0);
    assert.equal(run.report.summary.skipped, 1);
    assert.equal(run.report.findings[0].status, 'skipped');
  });

  it('checks a historical setting through the record chain, not the API', () => {
    write('docs/doc.md', '# 0001. Old\n\n## Status\n\nSuperseded by ADR-0002\n\nANCHOR\n');
    write('docs/adr/0002-new.md', '# 0002. New\n');
    const historical = setting({ evaluation: 'historical', supersededBy: '0002', check: {} });
    assert.equal(check([historical]).status, 0);
    assert.equal(check([{ ...historical, supersededBy: '0003' }]).status, 1);
    assert.equal(readFileSync(join(stub, 'calls'), { encoding: 'utf8', flag: 'a+' }), '');
  });

  it('reports drift and exits 2 when another check in the same run could not run', () => {
    gh({ status: 1, stderr: 'HTTP 500' });
    write('src/app.ts', 'hi\n');
    const run = check([
      setting({ id: 'api' }),
      entry({ id: 'file', check: { path: 'src/app.ts', contains: 'hello' } }),
    ]);
    assert.equal(run.status, 2);
    assert.deepEqual(statuses(run.report), { api: 'unrunnable', file: 'drift' });
  });
});

describe('anchors and coverage', () => {
  it('reports an entry whose anchor has gone from the doc as stale', () => {
    write('docs/doc.md', 'nothing to see\n');
    write('src/app.ts', 'hello\n');
    const run = check([entry()]);
    assert.equal(run.status, 1);
    assert.equal(run.report.findings[0].status, 'stale');
  });

  it('resolves the line from the anchor, so an edit above it breaks nothing', () => {
    write('docs/doc.md', 'new intro\n\nmore\n\nANCHOR\n');
    write('src/app.ts', 'hello\n');
    const run = check([entry({ check: { path: 'src/app.ts', contains: 'nope' } })]);
    assert.equal(run.report.findings[0].line, 5);
  });

  it('matches an anchor across re-padded whitespace, but not across a changed word', () => {
    write('docs/doc.md', '| 0004 |   Accepted     | 2026-09-08 |\n');
    write('src/app.ts', 'hello\n');
    const padded = check([entry({ anchor: '| 0004 | Accepted | 2026-09-08 |' })]);
    assert.equal(padded.status, 0, JSON.stringify(padded.report));
    const changed = check([entry({ anchor: '| 0004 | Superseded | 2026-09-08 |' })]);
    assert.equal(changed.status, 1);
    assert.equal(changed.report.findings[0].status, 'stale');
  });

  it('reports every link, pnpm script and citation that no entry covers', () => {
    write(
      'docs/doc.md',
      [
        'See [the other doc](other.md) and [a site](https://example.com) and [a heading](#top).',
        'Run `pnpm check:thing`, `pnpm --filter web test:e2e`, `pnpm install`, `pnpm exec eslint`.',
        'Evidence: `apps/web/next.config.ts:42` and `loop-phase.tsx:175-200`.',
        '```',
        '$ `pnpm fenced-command` is output, not a claim',
        '```',
      ].join('\n'),
    );
    const run = check([]);
    assert.equal(run.status, 1);
    assert.deepEqual(
      run.report.uncatalogued.map((t) => `${t.line} ${t.kind} ${t.token}`),
      [
        '1 link other.md',
        '2 script check:thing',
        '2 script web test:e2e',
        '3 citation apps/web/next.config.ts:42',
        '3 citation loop-phase.tsx:175-200',
      ],
    );
  });

  it('is satisfied by entries whose covers name those tokens', () => {
    write('docs/doc.md', 'See [the other doc](other.md). Run `pnpm check:thing`.\n');
    write('docs/other.md', 'x\n');
    write('package.json', JSON.stringify({ scripts: { 'check:thing': 'node x' } }));
    const run = check([
      entry({
        id: 'link',
        anchor: '](other.md)',
        covers: [{ kind: 'link', token: 'other.md' }],
        check: { path: 'docs/other.md' },
      }),
      entry({
        id: 'script',
        anchor: '`pnpm check:thing`',
        method: 'command',
        covers: [{ kind: 'script', token: 'check:thing' }],
        check: { package: '.', script: 'check:thing' },
      }),
    ]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
  });
});

describe('the manifest', () => {
  it('is rejected with every problem listed, before any check runs', () => {
    write('docs/doc.md', 'ANCHOR\n');
    const run = check([
      entry({ id: 'Bad Id' }),
      entry({ id: 'no-asof', evaluation: 'historical' }),
      entry({ id: 'no-chain', method: 'gh-api', evaluation: 'historical' }),
      entry({ id: 'method', method: 'dns' }),
      entry({ id: 'method' }),
    ]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /\(Bad Id\): id/);
    assert.match(run.stderr, /\(no-asof\): a historical file-line assertion needs asOf/);
    assert.match(run.stderr, /\(no-chain\): a historical gh-api assertion needs supersededBy/);
    assert.match(run.stderr, /method must be one of/);
    assert.match(run.stderr, /duplicate id/);
  });

  it('committed in docs/ is valid', () => {
    const run = spawnSync(
      process.execPath,
      [CHECKER, '--manifest', REAL_MANIFEST, '--only', 'no-such-assertion', '--json'],
      { encoding: 'utf8', cwd: join(HERE, '..') },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).summary.assertions, 0);
  });
});

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
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { retryable } from './check-docs-drift.ts';

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

  it('drifts on a cited line past the end of the file, whatever the expectation', () => {
    const run = check([
      entry({ id: 'past', check: { path: 'src/app.ts', line: 99, absent: 'hello' } }),
      entry({ id: 'last', check: { path: 'src/app.ts', line: 3, contains: 'three' } }),
      entry({ id: 'range', check: { path: 'src/app.ts', line: 2, lineEnd: 4, absent: 'nope' } }),
    ]);
    assert.equal(run.status, 1);
    assert.deepEqual(statuses(run.report), { past: 'drift', range: 'drift' });
    assert.equal(run.report.findings[0].actual, 'src/app.ts has 3 lines');
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

  it('fetches an asOf commit that is on no branch of the clone from origin by its SHA', () => {
    // As with a commit of a squash-merged, deleted branch: the remote has it, no ref points at it.
    const origin = join(root, 'origin');
    mkdirSync(join(origin, 'src'), { recursive: true });
    const inOrigin = (...args) => {
      const run = spawnSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
        { cwd: origin, encoding: 'utf8' },
      );
      assert.equal(run.status, 0, run.stderr);
      return run.stdout.trim();
    };
    inOrigin('init', '-q', '-b', 'main');
    inOrigin('config', 'uploadpack.allowAnySHA1InWant', 'true');
    writeFileSync(join(origin, 'base.txt'), 'base\n');
    inOrigin('add', '-A');
    inOrigin('commit', '-q', '-m', 'base');
    inOrigin('checkout', '-q', '-b', 'feature');
    writeFileSync(join(origin, 'src', 'app.ts'), 'one\nhello from the branch\n');
    inOrigin('add', '-A');
    inOrigin('commit', '-q', '-m', 'branch work');
    const branchCommit = inOrigin('rev-parse', 'HEAD');
    inOrigin('checkout', '-q', 'main');
    inOrigin('branch', '-q', '-D', 'feature');
    git('remote', 'add', 'origin', origin);
    git('fetch', '-q', 'origin');
    write('docs/doc.md', 'ANCHOR here\n');
    const run = check([
      entry({
        evaluation: 'historical',
        asOf: branchCommit,
        check: { path: 'src/app.ts', line: 2, contains: 'hello from the branch' },
      }),
    ]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
  });

  it('tries to fetch a missing commit once, however many entries read at it', () => {
    commit();
    const bin = join(root, 'logging-git');
    mkdirSync(bin);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(root, 'git-calls')}"\nexec "${realGit}" "$@"\n`,
    );
    chmodSync(join(bin, 'git'), 0o755);
    const missing = 'deadbeef'.repeat(5);
    const historical = (id) =>
      entry({ id, evaluation: 'historical', asOf: missing, check: { path: 'src/app.ts' } });
    write('docs/drift-manifest.json', JSON.stringify(manifest([historical('a'), historical('b')])));
    const run = spawnSync(process.execPath, [CHECKER, '--root', repo, '--json', '--no-coverage'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(run.status, 2, run.stderr);
    const fetches = readFileSync(join(root, 'git-calls'), 'utf8')
      .split('\n')
      .filter((line) => / fetch /.test(line));
    assert.equal(fetches.length, 1, fetches.join('\n'));
  });

  it('cannot run, rather than passing, when the asOf commit is not in the clone', () => {
    commit();
    const run = check([
      entry({
        evaluation: 'historical',
        asOf: 'deadbeef'.repeat(5),
        check: { path: 'src/app.ts', contains: 'hello' },
      }),
    ]);
    assert.equal(run.status, 2);
    assert.equal(run.report.findings[0].status, 'unrunnable');
    assert.match(
      run.report.findings[0].detail,
      /not in this clone, and fetching it from origin failed/,
    );
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

  it('reads a historical value at asOf, and cannot run on a file that is not JSON', () => {
    const then = commit('then');
    write('package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }));
    write('broken.json', '{ not json');
    commit('now');
    const run = check([
      entry({
        id: 'then',
        method: 'config-value',
        evaluation: 'historical',
        asOf: then,
        check: { file: 'package.json', json: 'packageManager', equals: 'pnpm@10.34.5' },
      }),
      entry({
        id: 'script-then',
        method: 'command',
        evaluation: 'historical',
        asOf: then,
        check: { package: '.', script: 'format:check' },
      }),
    ]);
    assert.equal(run.status, 0, JSON.stringify(run.report));
    const broken = check([
      entry({ method: 'config-value', check: { file: 'broken.json', json: 'a', equals: 1 } }),
    ]);
    assert.equal(broken.status, 2);
    assert.equal(broken.report.findings[0].status, 'unrunnable');
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

  it('never runs a jq filter that reads the environment, where the gh token lives', () => {
    gh({ status: 0, stdout: '"leaked"\n' });
    const run = check([
      setting({
        id: 'dollar-env',
        check: { endpoint: 'repos/{repo}', jq: '$ENV.GH_TOKEN', equals: 1 },
      }),
      setting({ id: 'env', check: { endpoint: 'repos/{repo}', jq: 'env.GH_TOKEN', equals: 1 } }),
      setting({ id: 'string', check: { endpoint: 'repos/{repo}', jq: '"\\(env)"', equals: 1 } }),
    ]);
    assert.equal(run.status, 2);
    for (const id of ['dollar-env', 'env', 'string']) {
      assert.ok(run.stderr.includes(`(${id}): check.jq must not read the environment`), run.stderr);
    }
    assert.equal(existsSync(join(stub, 'calls')), false, 'gh was called');
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

  it('retries rate limiting and network failures, but not another HTTP status', () => {
    const calls = () => readFileSync(join(stub, 'calls'), 'utf8').trim().split('\n').length;
    gh({ status: 1, stderr: 'gh: API rate limit exceeded (HTTP 429)' });
    assert.equal(check([setting()]).status, 2);
    assert.equal(calls(), 3);
    rmSync(join(stub, 'calls'));
    rmSync(join(stub, 'count'));
    gh({ status: 1, stderr: 'Post "https://api.github.com/": read: connection reset by peer' });
    assert.equal(check([setting()]).status, 2);
    assert.equal(calls(), 3);
    rmSync(join(stub, 'calls'));
    rmSync(join(stub, 'count'));
    gh({ status: 1, stderr: 'Validation Failed: unexpected EOF in body (HTTP 422)' });
    assert.equal(check([setting()]).status, 2);
    assert.equal(calls(), 1);
  });

  it('treats a gh call that timed out as retryable', () => {
    assert.equal(retryable('', 'ETIMEDOUT'), true);
    assert.equal(retryable('gh: Not Found (HTTP 404)'), false);
    assert.equal(retryable('HTTP 503: Service Unavailable'), true);
  });

  it('cannot run an admin-only claim whose field came back null, rather than drift', () => {
    gh({ status: 0, stdout: 'null\n' });
    const run = check([setting({ requires: 'admin' })]);
    assert.equal(run.status, 2);
    assert.equal(run.report.findings[0].status, 'unrunnable');
    assert.match(run.report.findings[0].detail, /no admin access/);
  });

  it('prints the actual value of a drift even when it is null', () => {
    gh({ status: 0, stdout: 'null\n' });
    write('docs/drift-manifest.json', JSON.stringify(manifest([setting()])));
    const run = spawnSync(process.execPath, [CHECKER, '--root', repo, '--no-coverage'], {
      encoding: 'utf8',
      env: { ...process.env, STUB: stub, PATH: `${join(stub, 'bin')}:${process.env.PATH}` },
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /claimed: false\n {2}actual: {2}null\n/);
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
    // The status names the successor, but the successor record does not exist.
    unlinkSync(join(repo, 'docs/adr/0002-new.md'));
    const orphan = check([historical]);
    assert.equal(orphan.status, 1);
    assert.match(orphan.report.findings[0].actual, /no docs\/adr\/0002-\*\.md/);
    assert.equal(readFileSync(join(stub, 'calls'), { encoding: 'utf8', flag: 'a+' }), '');
  });

  it('still checks a historical admin-only setting under --skip-requires', () => {
    write('docs/doc.md', '## Status\n\nSuperseded by ADR-0002\n\nANCHOR\n');
    write('docs/adr/0001-old.md', '# 0001. Old\n');
    const historical = setting({
      evaluation: 'historical',
      requires: 'admin',
      supersededBy: '0002',
      check: {},
    });
    const run = check([historical], { args: ['--skip-requires', 'admin'] });
    assert.equal(run.status, 1);
    assert.equal(run.report.findings[0].status, 'drift');
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

  it('reports an entry whose doc has been deleted as stale', () => {
    write('src/app.ts', 'hello\n');
    const run = check([entry({ doc: 'docs/gone.md' })]);
    assert.equal(run.status, 1);
    assert.equal(run.report.findings[0].status, 'stale');
    assert.equal(run.report.findings[0].actual, 'docs/gone.md does not exist');
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

  it('finds tokens in nested docs and in every recognised form', () => {
    write(
      'docs/adr/sub/doc.md',
      [
        '`pnpm --filter=web one` `pnpm -F web two` `pnpm -r run three` `pnpm run four`',
        '`CI=true PORT=1 pnpm --filter web five` `pnpm exec six` `pnpm install`',
        '[t](titled.md "Title") [a](<with space.md>) `.github/workflows/ci.yml:40`',
        '[ref]: reference.md',
        '````md',
        '```',
        '`pnpm in-nested-fence`',
        '```',
        '````',
        '~~~',
        '`pnpm in-tilde-fence`',
        '~~~',
        '`pnpm after-fences` and `.husky/pre-commit:3` and localhost:3000',
      ].join('\n'),
    );
    const run = check([]);
    assert.equal(run.status, 1);
    assert.deepEqual(
      run.report.uncatalogued.map((t) => `${t.doc}:${t.line} ${t.kind} ${t.token}`),
      [
        'docs/adr/sub/doc.md:1 script web one',
        'docs/adr/sub/doc.md:1 script web two',
        'docs/adr/sub/doc.md:1 script -r three',
        'docs/adr/sub/doc.md:1 script four',
        'docs/adr/sub/doc.md:2 script web five',
        'docs/adr/sub/doc.md:3 link titled.md',
        'docs/adr/sub/doc.md:3 link with space.md',
        'docs/adr/sub/doc.md:3 citation .github/workflows/ci.yml:40',
        'docs/adr/sub/doc.md:4 link reference.md',
        'docs/adr/sub/doc.md:13 script after-fences',
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
      [CHECKER, '--manifest', REAL_MANIFEST, '--validate-only'],
      { encoding: 'utf8', cwd: join(HERE, '..') },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /\d+ assertions, manifest valid/);
  });

  it('rejects checks that could never be false or never run as written', () => {
    write('docs/doc.md', 'ANCHOR\n');
    write('src/app.ts', 'hello\n');
    write('conf.json', '{"a": 1}');
    const run = check([
      entry({
        id: 'typo',
        method: 'config-value',
        check: { file: 'conf.json', json: 'a', equal: 1 },
      }),
      entry({ id: 'empty', check: { path: 'src/app.ts', contains: '' } }),
      entry({ id: 'line-zero', check: { path: 'src/app.ts', line: 0, absent: 'x' } }),
      entry({ id: 'backwards', check: { path: 'src/app.ts', line: 3, lineEnd: 2, absent: 'x' } }),
      entry({ id: 'blank-anchor', anchor: '   ' }),
      entry({ id: 'bad-regex', check: { path: 'src/app.ts', matches: '(unclosed' } }),
      entry({ id: 'two', check: { path: 'src/app.ts', contains: 'a', absent: 'b' } }),
      entry({ id: 'escape', check: { path: '../../etc/passwd', contains: 'root' } }),
      entry({
        id: 'absolute',
        method: 'config-value',
        check: { file: '/etc/x', text: true, equals: '' },
      }),
      entry({ id: 'doc-escape', doc: '../outside.md' }),
      entry({
        id: 'flag-endpoint',
        method: 'gh-api',
        check: { endpoint: '--method=PUT', jq: '.', equals: 1 },
      }),
      entry({ id: 'requires', requires: 'owner' }),
    ]);
    assert.equal(run.status, 2);
    for (const [id, problem] of [
      ['typo', 'check needs exactly one of equals, equalsAll'],
      ['empty', 'check.contains must be a non-empty string'],
      ['line-zero', 'check.line must be a positive integer'],
      ['backwards', 'check.lineEnd must be an integer no smaller than check.line'],
      ['blank-anchor', 'anchor missing'],
      ['bad-regex', 'check.matches is not a valid regular expression'],
      ['two', 'check takes one of contains, matches, absent'],
      ['escape', 'check.path must be a path inside the repository'],
      ['absolute', 'check.file must be a path inside the repository'],
      ['doc-escape', 'doc must be a path inside the repository'],
      ['flag-endpoint', 'check.endpoint must not start with "-"'],
      ['requires', 'requires can only be "admin"'],
    ]) {
      assert.ok(run.stderr.includes(`(${id}): ${problem}`), `${id}: ${run.stderr}`);
    }
  });

  it('rejects an asOf that is not a full commit SHA', () => {
    write('docs/doc.md', 'ANCHOR\n');
    const run = check([entry({ evaluation: 'historical', asOf: 'a8b4a91' })]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /needs asOf, a full 40-character commit SHA/);
  });
});

describe('exit codes', () => {
  const plain = (args, env = {}) =>
    spawnSync(process.execPath, [CHECKER, ...args], {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, STUB: stub, DOCS_DRIFT_GH_BACKOFF_MS: '1', ...env },
      timeout: 20_000,
    });

  beforeEach(() => {
    write('docs/doc.md', 'ANCHOR\n');
    write('src/app.ts', 'hello\n');
  });

  it('exits 2, never 1, for an unknown flag or a misspelt --skip-requires', () => {
    write('docs/drift-manifest.json', JSON.stringify(manifest([entry()])));
    const flag = plain(['--root', repo, '--skip-require', 'admin']);
    assert.equal(flag.status, 2, flag.stderr);
    assert.match(flag.stderr, /usage/);
    const value = plain(['--root', repo, '--skip-requires', 'adminn']);
    assert.equal(value.status, 2, value.stderr);
    assert.match(value.stderr, /--skip-requires takes admin, not "adminn"/);
  });

  it('exits 2 when --only names an id that no assertion has', () => {
    const run = check([entry()], { args: ['--only', 'a', '--only', 'no-such-id'] });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /--only names no assertion with the id no-such-id/);
  });

  it('exits 2 outside a git repository when no --root is given', () => {
    const run = plain([], { GIT_CEILING_DIRECTORIES: root });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /could not run/);
  });

  it('exits 2 when a coverage root is a file, not a directory', () => {
    const run = check([entry()], { options: { roots: ['src/app.ts'] } });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /cannot list the coverage root src\/app\.ts/);
  });

  it('cannot run a historical setting when docs/adr cannot be listed', () => {
    write('docs/doc.md', '## Status\n\nSuperseded by ADR-0002\n\nANCHOR\n');
    const run = check([
      entry({ method: 'gh-api', evaluation: 'historical', supersededBy: '0002', check: {} }),
    ]);
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.report.findings[0].status, 'unrunnable');
  });

  const asRoot = process.getuid?.() === 0;
  it('cannot run, rather than drift, when a cited file cannot be read', { skip: asRoot }, () => {
    chmodSync(join(repo, 'src/app.ts'), 0o000);
    const run = check([entry()]);
    chmodSync(join(repo, 'src/app.ts'), 0o644);
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.report.findings[0].status, 'unrunnable');
  });

  it('cannot run when gh is not installed', () => {
    const api = entry({
      method: 'gh-api',
      check: { endpoint: 'repos/{repo}', jq: '.x', equals: 1 },
    });
    write('docs/drift-manifest.json', JSON.stringify(manifest([api])));
    // A PATH holding git and nothing else.
    const bin = join(root, 'git-only');
    mkdirSync(bin);
    symlinkSync(
      spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout.trim() + '/git',
      join(bin, 'git'),
    );
    const run = spawnSync(process.execPath, [CHECKER, '--root', repo, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: bin },
    });
    assert.equal(run.status, 2, run.stderr);
    assert.equal(JSON.parse(run.stdout).findings[0].status, 'unrunnable');
  });

  it('does not hang on a backoff setting that is not a number', () => {
    gh({ status: 1, stderr: 'HTTP 502' }, { status: 0, stdout: '1' });
    const api = entry({
      method: 'gh-api',
      check: { endpoint: 'repos/{repo}', jq: '.x', equals: 1 },
    });
    write('docs/drift-manifest.json', JSON.stringify(manifest([api])));
    const run = spawnSync(process.execPath, [CHECKER, '--root', repo, '--json', '--no-coverage'], {
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        STUB: stub,
        PATH: `${join(stub, 'bin')}:${process.env.PATH}`,
        DOCS_DRIFT_GH_BACKOFF_MS: 'abc',
      },
    });
    assert.equal(run.error, undefined, 'the checker hung');
    assert.equal(run.status, 0, run.stderr);
  });
});

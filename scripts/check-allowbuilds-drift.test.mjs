// Tests for the allowBuilds drift gate. Run with `pnpm test:scripts` (node:test, no dependency).
//
// The gate's whole value is that it fires when nobody is looking, so the cases that matter most
// here are the ones where a naive parser exits 0 in silence: a line it cannot read, a comment in an
// unexpected column, a second block, a value that is not a boolean. Each of those was an observed
// false negative before it was a test.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectProblems,
  readAllowBuilds,
  readLifecycleHooks,
  readResolvedVersions,
} from './check-allowbuilds-drift.mjs';

const workspace = (block) => `packages:\n  - 'apps/*'\n\n${block}`;
const lock = (...keys) => `packages:\n${keys.map((key) => `  ${key}:\n`).join('')}\nsnapshots:\n`;

const denied = (name, version) => ({ name, scalar: 'false', reviewed: version, lineNumber: 1 });
const hasHook = () => ({ hooks: ['postinstall'] });
const messages = (entries, resolved, inspect = hasHook) =>
  collectProblems(entries, resolved, inspect).problems;

describe('readAllowBuilds', () => {
  it('pairs each entry with the note above it', () => {
    const entries = readAllowBuilds(
      workspace('allowBuilds:\n  # Reviewed at 0.27.2.\n  esbuild: false\n'),
    );
    assert.deepEqual(entries, [
      { name: 'esbuild', scalar: 'false', reviewed: '0.27.2', lineNumber: 6 },
    ]);
  });

  it('takes the last note when a comment records more than one review', () => {
    const entries = readAllowBuilds(
      workspace(
        'allowBuilds:\n  # Reviewed at 0.1.0, re-read since. Reviewed at 0.27.2.\n  a: false\n',
      ),
    );
    assert.equal(entries[0].reviewed, '0.27.2');
  });

  it('reads a note followed directly by a comma', () => {
    const entries = readAllowBuilds(
      workspace('allowBuilds:\n  # Reviewed at 0.27.2, and unchanged since.\n  a: false\n'),
    );
    assert.equal(entries[0].reviewed, '0.27.2');
  });

  it('strips a trailing inline comment from the value', () => {
    const entries = readAllowBuilds(
      workspace('allowBuilds:\n  # Reviewed at 0.27.2.\n  esbuild: false # prebuilt\n'),
    );
    assert.equal(entries[0].scalar, 'false');
    assert.equal(entries[0].reviewed, '0.27.2');
  });

  it('does not end the block at a flush-left comment', () => {
    const entries = readAllowBuilds(
      workspace('allowBuilds:\n# a flush-left note\n  # Reviewed at 0.27.2.\n  esbuild: false\n'),
    );
    assert.equal(entries.length, 1, 'the entry below a flush-left comment must still be read');
  });

  it('ends the block at the next top-level key', () => {
    const entries = readAllowBuilds(
      workspace('allowBuilds:\n  # Reviewed at 1.0.0.\n  a: false\n\nother:\n  b: false\n'),
    );
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['a'],
    );
  });

  it('does not carry a note across a blank line', () => {
    const entries = readAllowBuilds(
      workspace('allowBuilds:\n  # Reviewed at 1.0.0.\n\n  a: false\n'),
    );
    assert.equal(entries[0].reviewed, null);
  });

  it('tolerates CRLF line endings', () => {
    const source = workspace(
      'allowBuilds:\n  # Reviewed at 0.27.2.\n  esbuild: false\n',
    ).replaceAll('\n', '\r\n');
    assert.equal(readAllowBuilds(source)[0].reviewed, '0.27.2');
  });

  for (const [label, block] of [
    ['a line it cannot read', 'allowBuilds:\n  ? esbuild\n  : false\n'],
    ['a sequence instead of a mapping', 'allowBuilds:\n  - esbuild\n'],
    ['a nested mapping', 'allowBuilds:\n  esbuild:\n    allowed: false\n'],
  ]) {
    it(`refuses to guess at ${label}`, () => {
      assert.throws(() => readAllowBuilds(workspace(block)), /cannot read/);
    });
  }

  it('refuses a second allowBuilds block, since YAML keeps the last', () => {
    assert.throws(
      () => readAllowBuilds(workspace('allowBuilds:\n  a: false\n\nallowBuilds:\n  b: false\n')),
      /2 `allowBuilds:` blocks/,
    );
  });

  it('refuses the inline form rather than reading nothing', () => {
    assert.throws(
      () => readAllowBuilds(workspace('allowBuilds: { a: false }\n')),
      /written inline/,
    );
  });

  it('refuses a file with no block at all', () => {
    assert.throws(() => readAllowBuilds(workspace('')), /no `allowBuilds:` block/);
  });
});

describe('readResolvedVersions', () => {
  it('reads plain and scoped keys', () => {
    const resolved = readResolvedVersions(lock('esbuild@0.27.2', "'@esbuild/darwin-arm64@0.27.2'"));
    assert.deepEqual([...resolved.get('esbuild')], ['0.27.2']);
    assert.deepEqual([...resolved.get('@esbuild/darwin-arm64')], ['0.27.2']);
  });

  it('collects every version of a package that resolves more than once', () => {
    const resolved = readResolvedVersions(lock('a@1.0.0', 'a@2.0.0'));
    assert.deepEqual([...resolved.get('a')].sort(), ['1.0.0', '2.0.0']);
  });

  it('does not invent a name from a git specifier', () => {
    const resolved = readResolvedVersions(lock('a@1.0.0', "'b@git+ssh://git@host/x.git#sha'"));
    assert.equal(resolved.has('b@git+ssh://git'), false);
  });

  it('refuses a lockfile it parsed nothing out of, rather than calling every entry absent', () => {
    assert.throws(() => readResolvedVersions('packages:\n    a@1.0.0:\n'), /parsed no packages/);
  });

  it('refuses a lockfile with no packages section', () => {
    assert.throws(() => readResolvedVersions('lockfileVersion: 9\n'), /no `packages:` section/);
  });
});

describe('collectProblems', () => {
  const resolved = new Map([['a', new Set(['1.2.3'])]]);

  it('passes an entry reviewed at the version the lockfile resolves', () => {
    assert.deepEqual(messages([denied('a', '1.2.3')], resolved), []);
  });

  it('reports a reviewed version that has drifted', () => {
    assert.match(
      messages([denied('a', '1.0.0')], resolved)[0],
      /reviewed at 1\.0\.0.*resolves 1\.2\.3/,
    );
  });

  it('reports a missing note', () => {
    assert.match(messages([denied('a', null)], resolved)[0], /no "Reviewed at <version>" note/);
  });

  it('reports an entry the lockfile no longer resolves', () => {
    assert.match(messages([denied('gone', '1.0.0')], resolved)[0], /no such package/);
  });

  it('reports a package resolving to several versions', () => {
    const many = new Map([['a', new Set(['1.0.0', '2.0.0'])]]);
    assert.match(messages([denied('a', '1.0.0')], many)[0], /resolves 2 versions/);
  });

  it('reports a value that is not a boolean, rather than reading it as a denial', () => {
    const entry = { name: 'a', scalar: 'True', reviewed: '1.2.3', lineNumber: 6 };
    assert.match(messages([entry], resolved)[0], /value is `True`/);
  });

  it('reports an entry whose package declares no lifecycle script', () => {
    const problems = messages([denied('a', '1.2.3')], resolved, () => ({ hooks: [] }));
    assert.match(problems[0], /declares no preinstall\/install\/postinstall script/);
  });

  it('reports, rather than skips, a package it could not inspect', () => {
    const problems = messages([denied('a', '1.2.3')], resolved, () => ({ unverifiable: 'no dir' }));
    assert.match(problems[0], /cannot confirm/);
  });

  it('records an uninstalled tree as a visible skip, not a pass in silence', () => {
    const { problems, skips } = collectProblems([denied('a', '1.2.3')], resolved, () => ({
      skipped: 'node_modules is not installed',
    }));
    assert.deepEqual(problems, []);
    assert.equal(skips.length, 1);
  });
});

describe('readLifecycleHooks', () => {
  const manifest = (scripts) => () => ({ scripts });

  it('finds a declared hook', () => {
    const result = readLifecycleHooks('a', '1.0.0', ['a@1.0.0'], manifest({ postinstall: 'x' }));
    assert.deepEqual(result.hooks, ['postinstall']);
  });

  it('matches a directory carrying a peer hash', () => {
    const result = readLifecycleHooks(
      'a',
      '1.0.0',
      ['a@1.0.0_b@2.0.0'],
      manifest({ install: 'x' }),
    );
    assert.deepEqual(result.hooks, ['install']);
  });

  it('flattens a scoped name the way pnpm does', () => {
    const result = readLifecycleHooks('@s/a', '1.0.0', ['@s+a@1.0.0'], manifest({ install: 'x' }));
    assert.deepEqual(result.hooks, ['install']);
  });

  it('treats a blanked hook as no hook', () => {
    const result = readLifecycleHooks('a', '1.0.0', ['a@1.0.0'], manifest({ install: '  ' }));
    assert.deepEqual(result.hooks, []);
  });

  it('treats a package with no scripts at all as no hook', () => {
    const result = readLifecycleHooks('a', '1.0.0', ['a@1.0.0'], () => ({}));
    assert.deepEqual(result.hooks, []);
  });

  it('skips, and says so, when nothing is installed', () => {
    assert.match(readLifecycleHooks('a', '1.0.0', null, manifest({})).skipped, /not installed/);
  });

  for (const [label, dirs, read] of [
    ['the package is not in the store', [], manifest({})],
    [
      'the manifest cannot be read',
      ['a@1.0.0'],
      () => {
        throw new Error('ENOENT');
      },
    ],
    ['the manifest is null', ['a@1.0.0'], () => null],
    ['scripts is null', ['a@1.0.0'], () => ({ scripts: null })],
  ]) {
    it(`does not quietly pass when ${label}`, () => {
      const result = readLifecycleHooks('a', '1.0.0', dirs, read);
      assert.ok(result.unverifiable || result.hooks?.length === 0, 'must not report a live hook');
    });
  }

  it('refuses a name that would escape the store directory', () => {
    const result = readLifecycleHooks('../../etc', '1.0.0', ['x'], manifest({}));
    assert.match(result.unverifiable, /not a usable package name/);
  });
});

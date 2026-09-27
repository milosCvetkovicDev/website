// Holds apps/web's `@vitest/*` packages to the exact vitest version the lockfile installs. Run with
// `pnpm test:scripts` (node:test), which CI's `quality` job runs.
//
// `@vitest/coverage-v8` peers on one exact vitest version, and vitest does not support running with
// a provider from another release. pnpm only warns about a peer mismatch, and CI never runs
// `pnpm --filter web test:coverage`, so without this test a pull request that moves vitest alone
// (a manual `pnpm update vitest`, or a Dependabot major, which the `minor-and-patch` group does not
// batch) would pass every check and leave the coverage command broken for whoever runs it next.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Read at module level, not in a `describe` body: node:test reports a throw there as a failed
// suite but still exits 0, so a missing or unparsable lockfile would skip these tests with the run green.
const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

/**
 * The versions pnpm-lock.yaml resolves for one importer's direct dependencies, without the
 * peer-dependency suffix: `5.0.1(vitest@5.0.1)` reads as `5.0.1`.
 *
 * @param {string} source the text of pnpm-lock.yaml
 * @param {string} importer the importer key, such as `apps/web`
 * @returns {Map<string, string>} package name to version
 */
function importerVersions(source, importer) {
  const lines = source.split('\n');
  const importersAt = lines.indexOf('importers:');
  const start = lines.indexOf(`  ${importer}:`, importersAt);
  if (importersAt === -1 || start === -1) {
    throw new Error(`pnpm-lock.yaml has no \`${importer}\` importer`);
  }
  /** @type {Map<string, string>} */
  const versions = new Map();
  /** @type {string | null} */
  let name = null;
  for (const line of lines.slice(start + 1)) {
    // The next importer, or the next top-level section, ends this one.
    if (/^ {0,2}\S/.test(line)) break;
    const dependency = line.match(/^ {6}'?([^'\s:]+)'?:\s*$/);
    if (dependency) {
      name = dependency[1];
      continue;
    }
    const version = line.match(/^ {8}version: ([^(\s]+)/);
    if (version && name !== null) {
      versions.set(name, version[1]);
      name = null;
    }
  }
  return versions;
}

/**
 * The `@vitest/*` packages whose version differs from vitest's.
 *
 * @param {Map<string, string>} versions
 * @returns {string[]} one line per mismatch
 */
function mismatches(versions) {
  const vitest = versions.get('vitest');
  if (vitest === undefined) throw new Error('the importer has no vitest dependency');
  return [...versions]
    .filter(([name, version]) => name.startsWith('@vitest/') && version !== vitest)
    .map(([name, version]) => `${name} ${version} is not vitest ${vitest}`);
}

// Parsed at module level for the same reason: a parse that throws fails the file.
const webVersions = importerVersions(lockfile, 'apps/web');

/**
 * A lockfile with two importers, apps/web's pair at the given versions.
 *
 * @param {string} vitest
 * @param {string} coverage
 */
const fixture = (vitest, coverage) => `lockfileVersion: '9.0'

importers:

  apps/web:
    devDependencies:
      '@vitest/coverage-v8':
        specifier: ${coverage}
        version: ${coverage}(vitest@${vitest})
      vitest:
        specifier: ^${vitest}
        version: ${vitest}(@types/node@22.20.2)(@vitest/coverage-v8@${coverage})

  packages/other:
    devDependencies:
      '@vitest/ui':
        specifier: 1.0.0
        version: 1.0.0

packages:

  vitest@${vitest}:
    resolution: {integrity: sha512-x}
`;

describe('the vitest version pair check', () => {
  it('reads versions without their peer suffix, and only from the named importer', () => {
    const versions = importerVersions(fixture('5.0.1', '5.0.1'), 'apps/web');
    assert.deepEqual(
      [...versions],
      [
        ['@vitest/coverage-v8', '5.0.1'],
        ['vitest', '5.0.1'],
      ],
    );
  });

  it('reports a provider on another version than vitest', () => {
    assert.deepEqual(mismatches(importerVersions(fixture('5.0.2', '5.0.1'), 'apps/web')), [
      '@vitest/coverage-v8 5.0.1 is not vitest 5.0.2',
    ]);
  });

  it('throws rather than passing when the importer or vitest is missing', () => {
    assert.throws(
      () => importerVersions(fixture('5.0.1', '5.0.1'), 'apps/none'),
      /no `apps\/none`/,
    );
    assert.throws(() => mismatches(new Map([['@vitest/coverage-v8', '5.0.1']])), /no vitest/);
  });
});

describe('apps/web in pnpm-lock.yaml', () => {
  it('installs @vitest/coverage-v8, so the pair check below has something to compare', () => {
    assert.ok(webVersions.has('@vitest/coverage-v8'), [...webVersions.keys()].join(', '));
  });

  it('installs every @vitest/* package at the exact vitest version', () => {
    assert.deepEqual(mismatches(webVersions), []);
  });
});

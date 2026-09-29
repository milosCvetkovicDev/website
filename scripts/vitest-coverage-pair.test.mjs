// Holds apps/web's `@vitest/*` packages to the exact vitest version the lockfile installs, and its
// vite to the vite peer range of the `@vitejs/plugin-react` it installs. Run with
// `pnpm test:scripts` (node:test), which CI's `quality` job runs.
//
// `@vitest/coverage-v8` peers on one exact vitest version, and vitest does not support running with
// a provider from another release. pnpm only warns about a peer mismatch, and CI never runs
// `pnpm --filter web test:coverage`, so without this test a pull request that moves vitest alone
// would pass every check and leave the coverage command broken for whoever runs it next.
// Dependabot's version updates put vitest and every `@vitest/*` package in its `vite` group, majors
// included, so those move together; a manual `pnpm update vitest`, or a security update, which
// targets the package with the advisory, can still move one without the other.
//
// The same holds for vite and plugin-react: plugin-react 6 peers `vite: ^8.0.0`, and #9 failed
// because it arrived alone against vite 7. The group moves them together, but a manual update or a
// security update can split them, and pnpm again only warns. ADR 0027 decides that `apps/web`
// declares both; the pair check below is what keeps their majors in step.

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

/**
 * The range one `packages:` entry of pnpm-lock.yaml declares for one of its peers.
 *
 * @param {string} source the text of pnpm-lock.yaml
 * @param {string} key the package key, such as `@vitejs/plugin-react@6.1.1`
 * @param {string} peer the peer's name, such as `vite`
 * @returns {string} the range, such as `^8.0.0`
 */
function peerRange(source, key, peer) {
  const lines = source.split('\n');
  const packagesAt = lines.indexOf('packages:');
  const start = lines.findIndex(
    (line, index) => index > packagesAt && (line === `  ${key}:` || line === `  '${key}':`),
  );
  if (packagesAt === -1 || start === -1) {
    throw new Error(`pnpm-lock.yaml has no \`${key}\` package entry`);
  }
  let inPeers = false;
  for (const line of lines.slice(start + 1)) {
    // The next package, or the next top-level section, ends this entry.
    if (/^ {0,2}\S/.test(line)) break;
    if (/^ {4}\S/.test(line)) {
      inPeers = line === '    peerDependencies:';
      continue;
    }
    const entry = inPeers && line.match(/^ {6}'?([^'\s:]+)'?: (.+)$/);
    if (entry && entry[1] === peer) return entry[2].replace(/^'(.*)'$/, '$1');
  }
  throw new Error(`\`${key}\` declares no \`${peer}\` peer`);
}

/**
 * Whether a peer range admits a major version. It reads the forms plugin-react's peer ranges use,
 * `^8.0.0`, `~8.1.0`, `8.x`, `>=8` (optionally `<10`) and `||` between them, and throws on
 * anything else rather than guessing.
 *
 * @param {string} range
 * @param {number} major
 * @returns {boolean}
 */
function admitsMajor(range, major) {
  return range.split('||').some((alternative) => {
    const text = alternative.trim();
    const pinned = text.match(/^[\^~]?(\d+)(?:\.(?:\d+|x|\*)){0,2}$/);
    if (pinned) return Number(pinned[1]) === major;
    const bounded = text.match(/^>=\s*(\d+)(?:\.\d+){0,2}(?:\s+<\s*(\d+)(?:\.\d+){0,2})?$/);
    if (bounded) {
      return (
        major >= Number(bounded[1]) && (bounded[2] === undefined || major < Number(bounded[2]))
      );
    }
    throw new Error(`cannot read the range \`${text}\``);
  });
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

describe('the vite and plugin-react pair check', () => {
  const packages = `lockfileVersion: '9.0'

packages:

  '@vitejs/plugin-react@6.1.1':
    resolution: {integrity: sha512-x}
    peerDependencies:
      '@rolldown/plugin-babel': ^0.1.7 || ^0.2.0
      vite: ^8.0.0
    peerDependenciesMeta:
      '@rolldown/plugin-babel':
        optional: true

  vite@8.3.1:
    resolution: {integrity: sha512-y}
    peerDependencies:
      esbuild: ^0.27.0
`;

  it('reads one peer range out of one package entry', () => {
    assert.equal(peerRange(packages, '@vitejs/plugin-react@6.1.1', 'vite'), '^8.0.0');
    assert.equal(
      peerRange(packages, '@vitejs/plugin-react@6.1.1', '@rolldown/plugin-babel'),
      '^0.1.7 || ^0.2.0',
    );
  });

  it('throws rather than passing when the entry or the peer is missing', () => {
    assert.throws(() => peerRange(packages, '@vitejs/plugin-react@5.2.0', 'vite'), /no `@vitejs/);
    assert.throws(() => peerRange(packages, 'vite@8.3.1', 'vite'), /declares no `vite` peer/);
  });

  it('admits only the majors a range names', () => {
    assert.equal(admitsMajor('^8.0.0', 8), true);
    assert.equal(admitsMajor('^8.0.0', 9), false);
    assert.equal(admitsMajor('^8.0.0', 7), false);
    assert.equal(admitsMajor('^7.0.0 || ^8.0.0', 7), true);
    assert.equal(admitsMajor('8.x', 8), true);
    assert.equal(admitsMajor('>=8', 9), true);
    assert.equal(admitsMajor('>=8.0.0 <10', 10), false);
  });

  it('throws on a range it cannot read', () => {
    assert.throws(() => admitsMajor('latest', 8), /cannot read the range `latest`/);
  });
});

describe('apps/web vite in pnpm-lock.yaml', () => {
  it("installs a vite whose major @vitejs/plugin-react's vite peer range admits", () => {
    const vite = webVersions.get('vite');
    const pluginReact = webVersions.get('@vitejs/plugin-react');
    assert.ok(vite && pluginReact, [...webVersions.keys()].join(', '));
    const range = peerRange(lockfile, `@vitejs/plugin-react@${pluginReact}`, 'vite');
    assert.ok(
      admitsMajor(range, Number(vite.split('.')[0])),
      `vite ${vite} is outside @vitejs/plugin-react ${pluginReact}'s vite peer range ${range}`,
    );
  });
});

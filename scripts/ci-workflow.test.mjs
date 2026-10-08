// Tests for .github/workflows/ci.yml. Run with `pnpm test:scripts` (node:test).
//
// Two kinds of property are pinned here, so that a later edit cannot quietly undo one:
//   - the shape main's branch protection relies on (ADR 0021): exactly two jobs, under their
//     required-check names, each reporting on every run, within the budgets ADR 0004 decided;
//   - the e2e job's apt archive cache (#210). `playwright install --with-deps` fetches about
//     125 MB of system packages through apt, and a slow mirror spent 11 minutes of the job's 20 on
//     them. The job restores those archives before the install, seeds only the ones the signed
//     index lists, and saves what apt kept before the build, so that a run cancelled during the
//     tests still leaves the next run a hit.
//
// The repository has no YAML parser at the root, and the workflow is plain enough to split by
// indentation, as docs-drift-workflow.test.mjs does: jobs at two spaces under `jobs:`, their keys
// at four, steps at `      - name:` with their keys at eight and their inputs at ten.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

/**
 * The value, failing the test that asked for it when it is missing.
 *
 * @template T
 * @param {T | null | undefined} value
 * @param {string} what
 * @returns {NonNullable<T>}
 */
function found(value, what) {
  assert.ok(value !== null && value !== undefined, `${what} not found`);
  return /** @type {NonNullable<T>} */ (value);
}

/**
 * The workflow's jobs as { name: text }.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  /** @type {Record<string, string>} */
  const result = {};
  /** @type {string | null} */
  let current = null;
  for (const line of body.split('\n')) {
    const job = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (job) {
      current = job[1];
      result[current] = '';
    } else if (current) {
      result[current] += `${line}\n`;
    }
  }
  return result;
}

/**
 * A job's steps as [{ name, text }].
 *
 * @param {string} jobText
 * @returns {{ name: string, text: string }[]}
 */
function steps(jobText) {
  return jobText
    .split(/\n(?= {6}- name: )/)
    .slice(1)
    .map((text) => ({ name: found(/- name: (.*)/.exec(text), 'a step name')[1], text }));
}

/**
 * The value of a key at the given indentation, read as one line or as the dedented lines of a `|`
 * block, or null. A job's keys sit at 4, a step's at 8 and a step's inputs at 10.
 *
 * @param {string} text
 * @param {4 | 8 | 10} indent
 * @param {string} name
 * @returns {string | null}
 */
function value(text, indent, name) {
  const inner = indent + 2;
  const block = new RegExp(`^ {${indent}}${name}: \\|\\n((?: {${inner}}.*\\n|\\n)*)`, 'm');
  const lines = block.exec(text);
  if (lines) return lines[1].replace(new RegExp(`^ {${inner}}`, 'gm'), '').trimEnd();
  const line = new RegExp(`^ {${indent}}${name}: (.*)$`, 'm').exec(text);
  return line ? line[1] : null;
}

const JOBS = jobs(WORKFLOW);
const E2E = steps(JOBS.e2e ?? '');
const CACHE_DIR = '~/.cache/playwright-apt-archives';
const APT_ARCHIVES = '/var/cache/apt/archives/';
const COPY_TO_APT = /\bcp\b.*\/var\/cache\/apt\/archives\/$/m;

/** @param {number} index */
const step = (index) => found(E2E[index], `e2e step ${index}`);

/** @param {string} name */
const at = (name) => {
  const index = E2E.findIndex((s) => s.name === name);
  assert.notEqual(index, -1, `no e2e step named "${name}"`);
  return index;
};

/**
 * @param {number} index
 * @param {string} name
 */
const stepKey = (index, name) => value(step(index).text, 8, name);

/**
 * @param {number} index
 * @param {string} name
 */
const stepInput = (index, name) => value(step(index).text, 10, name);

/** @param {number} index */
const run = (index) => found(stepKey(index, 'run'), `the run script of "${step(index).name}"`);

/**
 * The index of the e2e step that uses actions/cache/<part>, pinned to a commit.
 *
 * @param {'restore' | 'save'} part
 */
const cacheStep = (part) => {
  const pinned = new RegExp(`^actions/cache/${part}@[0-9a-f]{40} # v\\d+\\.\\d+\\.\\d+$`);
  const index = E2E.findIndex((_, i) => pinned.test(stepKey(i, 'uses') ?? ''));
  assert.notEqual(index, -1, `no e2e step uses actions/cache/${part} pinned to a commit`);
  return index;
};

describe('the jobs main requires (ADR 0021)', () => {
  it('are exactly quality and e2e, under their required-check names, on every run', () => {
    assert.deepEqual(Object.keys(JOBS), ['quality', 'e2e']);
    assert.equal(value(JOBS.quality, 4, 'name'), 'Format, lint, typecheck, unit tests, build');
    assert.equal(
      value(JOBS.e2e, 4, 'name'),
      'End-to-end (Playwright against the production build)',
    );
    // A job that waits on another, fans out, calls a reusable workflow or carries a condition can
    // report as skipped, under another name or not at all, and a skipped required check passes.
    for (const [name, text] of Object.entries(JOBS)) {
      assert.doesNotMatch(text, /^ {4}(?:needs|strategy|uses|if):/m, name);
    }
  });

  it('keep the budgets ADR 0004 decided: 15 minutes for quality, 20 for e2e', () => {
    assert.equal(value(JOBS.quality, 4, 'timeout-minutes'), '15');
    assert.equal(value(JOBS.e2e, 4, 'timeout-minutes'), '20');
  });
});

describe("the e2e job's apt archive cache (#210)", () => {
  it('installs the browsers with the documented command', () => {
    assert.equal(
      run(at('Install Playwright browsers')),
      'pnpm --filter web exec playwright install --with-deps chromium webkit',
    );
  });

  it('restores the archives and seeds them where apt reads them, before the install', () => {
    const install = at('Install Playwright browsers');
    const restore = cacheStep('restore');
    assert.ok(restore < install, 'the restore comes after the install');
    assert.equal(stepInput(restore, 'path'), CACHE_DIR);
    const seed = E2E.findIndex((_, i) => {
      const script = stepKey(i, 'run') ?? '';
      return i > restore && i < install && script.includes(CACHE_DIR) && COPY_TO_APT.test(script);
    });
    assert.notEqual(seed, -1, `no step between the two copies ${CACHE_DIR} into ${APT_ARCHIVES}`);
  });

  it('seeds an archive only when the refreshed index lists its SHA-256', () => {
    // apt reuses a file in /var/cache/apt/archives whose size matches the index without hashing
    // it, so the seed step is what keeps a stale or tampered archive from being installed.
    const install = at('Install Playwright browsers');
    const seed = E2E.findIndex((_, i) => i < install && COPY_TO_APT.test(stepKey(i, 'run') ?? ''));
    assert.notEqual(seed, -1, `no step copies archives into ${APT_ARCHIVES} before the install`);
    const script = run(seed);
    const update = script.indexOf('sudo apt-get update');
    const hash = script.indexOf('sha256sum');
    const lookup = script.indexOf('apt-cache show');
    const copy = script.search(COPY_TO_APT);
    assert.ok(update !== -1 && update < lookup, 'the index is not refreshed before the lookup');
    assert.ok(hash !== -1 && hash < copy, 'no archive is hashed before the copy');
    assert.ok(lookup !== -1 && lookup < copy, 'the index is not read before the copy');
    assert.match(
      script,
      /^ *if .*SHA256: .*; then\n *sudo cp .*\/var\/cache\/apt\/archives\/$/m,
      'the copy does not depend on the hash the index lists',
    );
  });

  it('saves what apt kept after the install and before the build, unless the key hit', () => {
    const install = at('Install Playwright browsers');
    const build = at('Build web');
    const restore = cacheStep('restore');
    const save = cacheStep('save');
    assert.ok(install < save, 'the save comes before the install');
    // The combined actions/cache saves only when the whole job succeeds, so a run cancelled in
    // the tests, the case #210 is about, would never save what it downloaded.
    assert.ok(save < build, 'the save comes after the build');
    /** @param {number} index */
    const pin = (index) => /@([0-9a-f]{40} # v\S+)$/.exec(stepKey(index, 'uses') ?? '')?.[1];
    assert.equal(pin(save), pin(restore), 'restore and save are pinned to different commits');
    assert.equal(stepInput(save, 'path'), CACHE_DIR);
    const restoreId = found(stepKey(restore, 'id'), 'the restore step id');
    assert.ok(
      [`\${{ steps.${restoreId}.outputs.cache-primary-key }}`, stepInput(restore, 'key')].includes(
        stepInput(save, 'key'),
      ),
      'the save is not keyed with the restore step key',
    );
    const notHit = `steps.${restoreId}.outputs.cache-hit != 'true'`;
    assert.ok(stepKey(save, 'if')?.includes(notHit), 'the save runs on an exact hit');

    const collect = E2E.findIndex(
      (_, i) => i > install && i < save && (stepKey(i, 'run') ?? '').includes(APT_ARCHIVES),
    );
    assert.notEqual(collect, -1, `no step collects ${APT_ARCHIVES} between the install and save`);
    assert.ok(stepKey(collect, 'if')?.includes(notHit), 'the collect step runs on an exact hit');
    const script = run(collect);
    const gather = script.indexOf(`${APT_ARCHIVES}*.deb`);
    const clean = script.indexOf('sudo apt-get autoclean');
    assert.ok(clean !== -1 && clean < gather, 'apt-get autoclean does not run first');
    // What is saved is only what apt kept: the restored archives the seed step left out stay out.
    const empty = script.search(/^rm -rf "?(?:\$cache|~\/\.cache\/playwright-apt-archives)"?$/m);
    assert.ok(empty !== -1 && empty < gather, 'the cache directory is not emptied first');
    assert.doesNotMatch(script, /archives\/(?:partial|lock)/);
    const collectId = found(stepKey(collect, 'id'), 'the collect step id');
    assert.ok(
      stepKey(save, 'if')?.includes(`steps.${collectId}.outputs.found == 'true'`),
      'the save does not wait for the collect step to find archives',
    );

    // A step timeout up to the save would end a slow download before it was saved, and the rerun
    // would miss on the same mirror.
    for (const s of E2E.slice(0, save + 1)) {
      assert.doesNotMatch(s.text, /^ {8}timeout-minutes:/m, s.name);
    }
  });

  it('keys the cache on OS release, architecture, Playwright version and month', () => {
    const restore = cacheStep('restore');
    const keyRef = /^\$\{\{ steps\.([\w-]+)\.outputs\.key \}\}$/.exec(
      stepInput(restore, 'key') ?? '',
    );
    assert.ok(keyRef, 'the restore key is not a step output');
    const id = keyRef[1];
    const keyStep = E2E.findIndex((_, i) => stepKey(i, 'id') === id);
    assert.ok(keyStep !== -1 && keyStep < restore, `no step "${id}" before the restore`);
    // Runner facts only: an expression in the step could interpolate event data.
    assert.doesNotMatch(step(keyStep).text, /\$\{\{/);
    const script = run(keyStep);

    const prefix = found(/^prefix="(playwright-apt-.+-)"$/m.exec(script), 'the prefix')[1];
    if (/\$\{?ImageOS\b/.test(prefix) === false) {
      assert.match(prefix, /\$\{?ID\b.*\$\{?VERSION_ID\b/, `${prefix} has no OS release`);
      assert.match(script, /^\. \/etc\/os-release$/m);
    }
    assert.match(prefix, /dpkg --print-architecture|RUNNER_ARCH/, `${prefix} has no architecture`);
    assert.match(script, /^version="\$\(pnpm --filter web exec playwright --version \| /m);
    assert.match(script, /^if \[ -z "\$version" \]; then\n\s+echo "::error::.*"\n\s+exit 1\nfi$/m);
    assert.match(script, /^ *echo "prefix=\$prefix"$/m);
    assert.match(script, /^ *echo "version=\$version"$/m);
    assert.match(script, /^ *echo "key=\$prefix\$version-\$\(date -u \+%Y-%m\)"$/m);
    assert.match(script, /^\} >> "\$GITHUB_OUTPUT"$/m);
    assert.doesNotMatch(JOBS.e2e, /hashFiles\(/, 'a lockfile key misses on every dependency bump');

    assert.equal(
      stepInput(restore, 'restore-keys'),
      [
        `\${{ steps.${id}.outputs.prefix }}\${{ steps.${id}.outputs.version }}-`,
        `\${{ steps.${id}.outputs.prefix }}`,
      ].join('\n'),
    );
  });
});

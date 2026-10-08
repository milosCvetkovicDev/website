// Tests for .github/workflows/ci.yml. Run with `pnpm test:scripts` (node:test).
//
// Two kinds of property are pinned here, so that a later edit cannot quietly undo one:
//   - the shape main's branch protection relies on (ADR 0021): exactly two jobs, under their
//     required-check names, each reporting on every run, within the budgets ADR 0004 decided;
//   - the e2e job's apt archive cache (#210). `playwright install --with-deps` fetches about
//     125 MB of system packages through apt, and a slow mirror spent 11 minutes of the job's 20 on
//     them. The job restores those archives before the install, seeds only the ones the signed
//     index lists, and saves the ones the install used before the build, so that a run cancelled
//     during the tests still leaves the next run a hit. The cache only saves time, so none of its
//     steps can fail the required check.
//
// The step order, pins, keys and conditions are read from the YAML. The three scripts the cache
// adds (key, seed, collect) are also run: each is taken from the workflow as written and executed
// with bash, as `shell: bash` runs it, against stubs of pnpm, dpkg, dpkg-query, sudo, apt-get and
// apt-cache on PATH, with /etc/os-release and /var/cache/apt/archives redirected into a scratch
// directory.
//
// The repository has no YAML parser at the root, and the workflow is plain enough to split by
// indentation, as docs-drift-workflow.test.mjs does: jobs at two spaces under `jobs:`, their keys
// at four, steps at `      - ` with their keys at eight and their inputs at ten.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

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
 * The workflow's jobs as { id: text }. Every line at two spaces under `jobs:` must be a job key.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function jobs(text) {
  const start = text.search(/^jobs:[ \t]*(?:#.*)?$/m);
  assert.notEqual(start, -1, 'no jobs: section');
  const body = text.slice(start).split('\n').slice(1);
  /** @type {Record<string, string>} */
  const result = {};
  /** @type {string | null} */
  let current = null;
  for (const line of body) {
    if (/^\S/.test(line)) break;
    if (/^ {2}\S/.test(line) && !/^ {2}#/.test(line)) {
      const job = found(
        /^ {2}([A-Za-z_][\w-]*):[ \t]*(?:#.*)?$/.exec(line),
        `a job key in "${line}"`,
      );
      current = job[1];
      result[current] = '';
    } else if (current) {
      result[current] += `${line}\n`;
    }
  }
  return result;
}

/**
 * A job's steps as [{ name, text }]. Every step starts with `      - ` and needs a name.
 *
 * @param {string} jobText
 * @returns {{ name: string, text: string }[]}
 */
function steps(jobText) {
  return jobText
    .split(/\n(?= {6}- )/)
    .slice(1)
    .map((text) => {
      const name = /^ {6}- name: (.*)$/m.exec(text)?.[1] ?? /^ {8}name: (.*)$/m.exec(text)?.[1];
      return { name: found(name, `the name of the step "${text.split('\n')[0]}"`), text };
    });
}

/** @param {string} text */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The value of a key at the given indentation, read as one line or as the dedented lines of a
 * literal block (`|`, `|-` or `|+`), or null. A job's keys sit at 4, a step's at 8 and a step's
 * inputs at 10.
 *
 * @param {string} text
 * @param {4 | 8 | 10} indent
 * @param {string} name
 * @returns {string | null}
 */
function value(text, indent, name) {
  const inner = indent + 2;
  const key = escape(name);
  const block = new RegExp(`^ {${indent}}${key}: \\|[-+]?\\n((?: {${inner}}.*\\n|\\n)*)`, 'm');
  const lines = block.exec(text);
  if (lines) return lines[1].replace(new RegExp(`^ {${inner}}`, 'gm'), '').trimEnd();
  const line = new RegExp(`^ {${indent}}${key}: (.*)$`, 'm').exec(text);
  return line ? line[1] : null;
}

const JOBS = jobs(WORKFLOW);
const E2E = steps(found(JOBS.e2e, 'the e2e job'));
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

/** The step that builds the key: the one whose id the restore step's key reads. */
const keyStep = () => {
  const restore = cacheStep('restore');
  const ref = /^\$\{\{ steps\.([\w-]+)\.outputs\.key \}\}$/.exec(stepInput(restore, 'key') ?? '');
  const id = found(ref, 'a step output as the restore key')[1];
  const index = E2E.findIndex((_, i) => stepKey(i, 'id') === id);
  assert.ok(index !== -1 && index < restore, `no step "${id}" before the restore`);
  return { index, id };
};

/** The step that copies restored archives into apt's directory before the install. */
const seedStep = () => {
  const install = at('Install Playwright browsers');
  const index = E2E.findIndex((_, i) => i < install && COPY_TO_APT.test(stepKey(i, 'run') ?? ''));
  assert.notEqual(index, -1, `no step copies archives into ${APT_ARCHIVES} before the install`);
  return index;
};

/** The step that gathers apt's archives between the install and the save. */
const collectStep = () => {
  const install = at('Install Playwright browsers');
  const save = cacheStep('save');
  const index = E2E.findIndex(
    (_, i) => i > install && i < save && (stepKey(i, 'run') ?? '').includes(APT_ARCHIVES),
  );
  assert.notEqual(index, -1, `no step collects ${APT_ARCHIVES} between the install and save`);
  return index;
};

/** @param {string} text */
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * A scratch runner: a home directory, a stand-in for /var/cache/apt/archives and /etc/os-release,
 * and stubs on PATH that log their calls in order.
 */
class Runner {
  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'ci-workflow-')));
    this.home = join(this.root, 'home');
    this.cache = join(this.home, '.cache/playwright-apt-archives');
    this.archives = join(this.root, 'apt-archives');
    this.osRelease = join(this.root, 'os-release');
    this.bin = join(this.root, 'bin');
    this.records = join(this.root, 'records');
    this.calls = join(this.root, 'calls');
    this.output = join(this.root, 'github-output');
    for (const dir of [this.home, this.archives, this.bin, this.records]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.calls, '');
    writeFileSync(this.output, '');
    writeFileSync(this.osRelease, 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n');
    this.pnpm('Version 1.63.0');
    this.packages([]);
    this.stub('dpkg', '#!/bin/bash\n[ "$1" = --print-architecture ] && echo amd64\n');
    this.stub('sudo', '#!/bin/bash\nprintf "sudo %s\\n" "$*" >> "$CALLS"\nexec "$@"\n');
    this.stub(
      'apt-get',
      '#!/bin/bash\nprintf "apt-get %s\\n" "$*" >> "$CALLS"\nexit "${APT_GET_STATUS:-0}"\n',
    );
    this.stub(
      'apt-cache',
      [
        '#!/bin/bash',
        'printf "apt-cache %s\\n" "$*" >> "$CALLS"',
        '[ "$1" = show ] && [ -f "$RECORDS/$2" ] || exit 100',
        'cat "$RECORDS/$2"',
        '',
      ].join('\n'),
    );
    // dpkg-query reads its format the way dpkg does: `${field}` per package, `\n` as a newline.
    this.stub(
      'dpkg-query',
      [
        `#!${process.execPath}`,
        "const fs = require('node:fs');",
        'const args = process.argv.slice(2);',
        "const f = args.findIndex((a) => a === '-f' || a.startsWith('-f=') || a.startsWith('--showformat='));",
        "if (!args.includes('-W') || f === -1) process.exit(2);",
        "const fmt = args[f] === '-f' ? args[f + 1] : args[f].replace(/^(-f=|--showformat=)/, '');",
        "for (const p of JSON.parse(fs.readFileSync(process.env.DPKG_PACKAGES, 'utf8'))) {",
        "  const fields = { 'db:Status-Status': p.status, Package: p.name, Version: p.version, Architecture: p.arch };",
        "  process.stdout.write(fmt.replace(/\\$\\{([^}]+)\\}/g, (_, k) => fields[k] ?? '').replace(/\\\\n/g, '\\n'));",
        '}',
        '',
      ].join('\n'),
    );
  }

  /**
   * @param {string} name
   * @param {string} body
   */
  stub(name, body) {
    writeFileSync(join(this.bin, name), body);
    chmodSync(join(this.bin, name), 0o755);
  }

  /**
   * What `pnpm --filter web exec playwright --version` prints, and how it exits.
   *
   * @param {string} stdout
   * @param {number} [status]
   */
  pnpm(stdout, status = 0) {
    writeFileSync(join(this.root, 'pnpm.out'), stdout ? `${stdout}\n` : '');
    this.stub('pnpm', `#!/bin/bash\ncat "${join(this.root, 'pnpm.out')}"\nexit ${status}\n`);
  }

  /** @param {{ status: string, name: string, version: string, arch: string }[]} list */
  packages(list) {
    writeFileSync(join(this.root, 'packages.json'), JSON.stringify(list));
  }

  /**
   * The records `apt-cache show <name>=<version>` prints.
   *
   * @param {string} query
   * @param {{ arch: string, sum: string }[]} records
   */
  index(query, records) {
    const [name, version] = query.split('=');
    const text = records.map(
      (r) => `Package: ${name}\nArchitecture: ${r.arch}\nVersion: ${version}\nSHA256: ${r.sum}\n`,
    );
    writeFileSync(join(this.records, query), text.join('\n'));
  }

  /**
   * @param {string} dir
   * @param {string} file
   * @param {string} content
   */
  file(dir, file, content) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), content);
  }

  /** @param {string} dir */
  list(dir) {
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  /**
   * Runs a step's script as `shell: bash` does, with the runner's paths redirected here.
   *
   * @param {number} index
   * @param {Record<string, string>} [env]
   */
  run(index, env = {}) {
    const script = run(index)
      .replaceAll('/etc/os-release', this.osRelease)
      .replaceAll('/var/cache/apt/archives', this.archives);
    const path = join(this.root, 'step.sh');
    writeFileSync(path, `${script}\n`);
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', path], {
      encoding: 'utf8',
      env: {
        PATH: `${this.bin}:${process.env.PATH}`,
        HOME: this.home,
        TMPDIR: this.root,
        GITHUB_OUTPUT: this.output,
        CALLS: this.calls,
        RECORDS: this.records,
        DPKG_PACKAGES: join(this.root, 'packages.json'),
        ...env,
      },
    });
    const outputs = readFileSync(this.output, 'utf8').split('\n').filter(Boolean);
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs,
      calls: readFileSync(this.calls, 'utf8').split('\n').filter(Boolean),
    };
  }

  remove() {
    rmSync(this.root, { recursive: true, force: true });
  }
}

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
    const seed = seedStep();
    assert.ok(restore < seed, 'the seed comes before the restore');
    assert.ok(run(seed).includes(CACHE_DIR), `the seed step does not read ${CACHE_DIR}`);
  });

  it('saves the archives after the install and before the build, unless the key hit', () => {
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
    const saveIf = found(stepKey(save, 'if'), 'the save condition');
    assert.ok(saveIf.includes(notHit), 'the save runs on an exact hit');

    const collect = collectStep();
    assert.ok(stepKey(collect, 'if')?.includes(notHit), 'the collect step runs on an exact hit');
    const collectId = found(stepKey(collect, 'id'), 'the collect step id');
    assert.ok(
      saveIf.includes(`steps.${collectId}.outputs.found == 'true'`),
      'the save does not wait for the collect step to find archives',
    );

    // A step timeout up to the save would end a slow download before it was saved, and the rerun
    // would miss on the same mirror.
    for (const s of E2E.slice(0, save + 1)) {
      assert.doesNotMatch(s.text, /^ {8}timeout-minutes:/m, s.name);
    }
  });

  it('saves on a pull request only when nothing was restored', () => {
    // An entry saved on refs/pull/N/merge is visible to that pull request alone, and the
    // repository's 10 GB of cache is shared with the pnpm store. main saves every miss; a pull
    // request saves only the first entry for its OS and architecture, which proves the save path.
    const restoreId = found(stepKey(cacheStep('restore'), 'id'), 'the restore step id');
    assert.ok(
      found(stepKey(cacheStep('save'), 'if'), 'the save condition').includes(
        `(github.ref == 'refs/heads/main' || steps.${restoreId}.outputs.cache-matched-key == '')`,
      ),
      'the save is not limited to main and to runs that restored nothing',
    );
  });

  it('cannot fail the required check: the key degrades, seed and collect continue on error', () => {
    const { id } = keyStep();
    const ran = `steps.${id}.outputs.key != ''`;
    assert.ok(stepKey(cacheStep('restore'), 'if')?.includes(ran), 'the restore runs without a key');
    assert.ok(stepKey(collectStep(), 'if')?.includes(ran), 'the collect runs without a key');
    for (const index of [seedStep(), collectStep()]) {
      assert.equal(stepKey(index, 'continue-on-error'), 'true', step(index).name);
    }
  });

  it('keys the cache on OS release, architecture, Playwright version and ISO week', () => {
    const { index, id } = keyStep();
    const restore = cacheStep('restore');
    // Runner facts only: an expression in the step could interpolate event data.
    assert.doesNotMatch(step(index).text, /\$\{\{/);
    // A lockfile key would miss on every dependency bump.
    for (const text of [
      run(index),
      stepInput(restore, 'key'),
      stepInput(restore, 'restore-keys'),
    ]) {
      assert.doesNotMatch(text ?? '', /hashFiles\(/);
    }
    // `_` cannot occur in a version, so the version restore key cannot match a pre-release.
    assert.equal(
      stepInput(restore, 'restore-keys'),
      [
        `\${{ steps.${id}.outputs.prefix }}\${{ steps.${id}.outputs.version }}_`,
        `\${{ steps.${id}.outputs.prefix }}`,
      ].join('\n'),
    );
  });
});

describe('the apt archive cache scripts, run against stubs (#210)', () => {
  /** @type {Runner} */
  let runner;
  beforeEach(() => {
    runner = new Runner();
  });
  afterEach(() => runner.remove());

  describe('the key step', () => {
    it('writes the prefix, the version and a key ending in the ISO week', () => {
      runner.pnpm(' WARN  Unsupported engine: wanted: {"node":"^22.22.2"}\nVersion 1.63.0');
      const result = runner.run(keyStep().index);
      assert.equal(result.status, 0, result.stderr);
      const week = spawnSync('date', ['-u', '+%G-W%V'], { encoding: 'utf8' }).stdout.trim();
      assert.deepEqual(result.outputs, [
        'prefix=playwright-apt-ubuntu24.04-amd64-',
        'version=1.63.0',
        `key=playwright-apt-ubuntu24.04-amd64-1.63.0_${week}`,
      ]);
    });

    it('keeps the first version when the output has two', () => {
      runner.pnpm('Version 1.63.0\nVersion 1.64.0');
      const result = runner.run(keyStep().index);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.outputs.slice(0, 2), [
        'prefix=playwright-apt-ubuntu24.04-amd64-',
        'version=1.63.0',
      ]);
      assert.equal(result.outputs.length, 3, result.outputs.join('\n'));
    });

    /** @type {[string, (r: Runner) => void][]} */
    const unkeyable = [
      ['Playwright prints no version', (r) => r.pnpm('Unknown command')],
      ['pnpm fails', (r) => r.pnpm('', 1)],
      ['the OS release has no VERSION_ID', (r) => writeFileSync(r.osRelease, 'ID=ubuntu\n')],
      ['there is no OS release', (r) => rmSync(r.osRelease)],
      ['dpkg cannot name the architecture', (r) => r.stub('dpkg', '#!/bin/bash\nexit 2\n')],
    ];
    for (const [when, arrange] of unkeyable) {
      it(`warns and writes no key, exit 0, when ${when}`, () => {
        arrange(runner);
        const result = runner.run(keyStep().index);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^::warning::/m);
        assert.deepEqual(result.outputs, []);
      });
    }
  });

  describe('the seed step', () => {
    it('does nothing without restored archives', () => {
      const result = runner.run(seedStep());
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.calls, []);
      assert.deepEqual(runner.list(runner.archives), []);
    });

    it('copies only the archives whose SHA-256 and architecture the refreshed index lists', () => {
      const debs = {
        'libgood_1.0-1_amd64.deb': 'good',
        'libepoch_1%3a2.0-1_amd64.deb': 'epoch',
        'libdata_1.0+dfsg~1_all.deb': 'data',
        'libtampered_1.0-1_amd64.deb': 'tampered',
        'libgone_0.9-1_amd64.deb': 'superseded',
        'libarch_1.0-1_amd64.deb': 'the i386 build',
      };
      for (const [file, content] of Object.entries(debs)) runner.file(runner.cache, file, content);
      runner.index('libgood=1.0-1', [{ arch: 'amd64', sum: sha256('good') }]);
      runner.index('libepoch=1:2.0-1', [{ arch: 'amd64', sum: sha256('epoch') }]);
      runner.index('libdata=1.0+dfsg~1', [{ arch: 'all', sum: sha256('data') }]);
      runner.index('libtampered=1.0-1', [{ arch: 'amd64', sum: sha256('genuine') }]);
      runner.index('libarch=1.0-1', [
        { arch: 'amd64', sum: sha256('the amd64 build') },
        { arch: 'i386', sum: sha256('the i386 build') },
      ]);

      const result = runner.run(seedStep());
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(runner.list(runner.archives), [
        'libdata_1.0+dfsg~1_all.deb',
        'libepoch_1%3a2.0-1_amd64.deb',
        'libgood_1.0-1_amd64.deb',
      ]);
      const update = result.calls.indexOf('apt-get update');
      const lookup = result.calls.findIndex((c) => c.startsWith('apt-cache show'));
      assert.ok(update !== -1 && update < lookup, result.calls.join('\n'));
      assert.match(result.stdout, /Seeded 3 of 6 /);
      // A partial seed on an exact hit is downloaded on every run until the week's key changes.
      assert.match(result.stdout, /^::notice::/m);
    });

    it('raises no notice when every archive is seeded', () => {
      runner.file(runner.cache, 'libgood_1.0-1_amd64.deb', 'good');
      runner.index('libgood=1.0-1', [{ arch: 'amd64', sum: sha256('good') }]);
      const result = runner.run(seedStep());
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(runner.list(runner.archives), ['libgood_1.0-1_amd64.deb']);
      assert.doesNotMatch(result.stdout, /::notice::/);
    });
  });

  describe('the collect step', () => {
    it('saves only the archives of installed package versions, emptying the cache first', () => {
      runner.file(runner.cache, 'stale_0.1_amd64.deb', 'rejected by the seed step');
      for (const file of [
        'libnew_2.0-1_amd64.deb',
        'libepoch_1%3a2.0-1_amd64.deb',
        'libnew_1.0-1_amd64.deb',
        'libold-playwright_1.0_amd64.deb',
        'libremoved_1.0_amd64.deb',
      ]) {
        runner.file(runner.archives, file, file);
      }
      runner.file(join(runner.archives, 'partial'), 'libhalf_1.0_amd64.deb', 'half');
      runner.file(runner.archives, 'lock', '');
      runner.packages([
        { status: 'installed', name: 'libnew', version: '2.0-1', arch: 'amd64' },
        { status: 'installed', name: 'libepoch', version: '1:2.0-1', arch: 'amd64' },
        { status: 'config-files', name: 'libremoved', version: '1.0', arch: 'amd64' },
        { status: 'installed', name: 'bash', version: '5.2', arch: 'amd64' },
      ]);

      const result = runner.run(collectStep());
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(runner.list(runner.cache), [
        'libepoch_1%3a2.0-1_amd64.deb',
        'libnew_2.0-1_amd64.deb',
      ]);
      assert.deepEqual(result.outputs, ['found=true']);
    });

    it('warns and reports found=false when the install used no archive', () => {
      runner.file(runner.archives, 'libold-playwright_1.0_amd64.deb', 'unused');
      const result = runner.run(collectStep());
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^::warning::/m);
      assert.deepEqual(result.outputs, ['found=false']);
      assert.deepEqual(runner.list(runner.cache), []);
    });
  });
});

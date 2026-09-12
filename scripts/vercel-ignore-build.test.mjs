// Tests for the Vercel Ignored Build Step gate. Run with `pnpm test:scripts` (node:test).
//
// The exit code is inverted relative to every other gate in this repository — 0 skips the build, 1
// builds it — so a bug here is silent in the direction that matters: a merge that quietly never
// reaches production. Every case below is therefore written from the deployment's point of view,
// and the ones that assert `build: true` are the load-bearing half.
//
// See docs/adr/0016-vercel-deployment-budget.md for the policy these cases encode.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUILD_EXIT_CODE,
  buildInputsIn,
  decide,
  isBuildInput,
  readDiff,
  SKIP_EXIT_CODE,
} from './vercel-ignore-build.mjs';

/** @typedef {import('./vercel-ignore-build.mjs').Diff} Diff */

/**
 * @param {Diff} diff
 * @param {Partial<Parameters<typeof decide>[0]>} [extra]
 */
const preview = (diff, extra = {}) => decide({ vercelEnv: 'preview', diff, ...extra });
/** @param {...string} list */
const paths = (...list) => ({ paths: list });

describe('isBuildInput', () => {
  it('accepts every path the site is built from', () => {
    for (const path of [
      'apps/web/src/app/page.tsx',
      'apps/web/package.json',
      'packages/prettier-config/index.mjs',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'turbo.json',
      '.npmrc',
      '.nvmrc',
    ]) {
      assert.equal(isBuildInput(path), true, `${path} should be a build input`);
    }
  });

  it('rejects the paths the site is not built from', () => {
    for (const path of [
      'docs/runbooks/deploy.md',
      'README.md',
      'CLAUDE.md',
      '.claude/epics/e/1.md',
      '.github/workflows/ci.yml',
      '.vercelignore',
      'scripts/vercel-ignore-build.mjs',
      'apps/playground/vite.config.ts',
    ]) {
      assert.equal(isBuildInput(path), false, `${path} should not be a build input`);
    }
  });

  it('matches a directory prefix only at a path boundary', () => {
    // `apps/web` as a bare prefix would also claim a future `apps/website`, and `packages` would
    // claim a `packages.md`. Both would build when nothing relevant changed, which is the harmless
    // direction, but it would also make the list mean something other than what it says.
    assert.equal(isBuildInput('apps/website/src/page.tsx'), false);
    assert.equal(isBuildInput('apps/web-legacy/package.json'), false);
    assert.equal(isBuildInput('packages.md'), false);
    assert.equal(isBuildInput('apps/web'), false);
  });

  it('does not mistake a suffix for one of the root manifests', () => {
    assert.equal(isBuildInput('docs/package.json'), false);
    assert.equal(isBuildInput('apps/playground/turbo.json'), false);
  });

  it('reports which of the changed paths are build inputs', () => {
    assert.deepEqual(buildInputsIn(['docs/a.md', 'turbo.json', 'README.md']), ['turbo.json']);
    assert.deepEqual(buildInputsIn(['docs/a.md', 'README.md']), []);
  });
});

describe('decide: skipping', () => {
  it('skips a dependabot preview ref whatever it changed', () => {
    const verdict = preview(paths('pnpm-lock.yaml', 'apps/web/package.json'), {
      commitRef: 'dependabot/npm_and_yarn/eslint-10.10.0',
    });
    assert.equal(verdict.build, false);
    assert.match(verdict.reason, /dependabot/);
  });

  it('skips a preview whose diff is documentation only', () => {
    const verdict = preview(paths('docs/runbooks/deploy.md', 'docs/adr/README.md'));
    assert.equal(verdict.build, false);
  });

  it('skips a preview whose diff is markdown only', () => {
    assert.equal(preview(paths('README.md', 'CLAUDE.md')).build, false);
  });

  it('skips a preview that changed only agent and CI metadata', () => {
    const verdict = preview(paths('.claude/epics/audit/44.md', '.github/pull_request_template.md'));
    assert.equal(verdict.build, false);
  });
});

describe('decide: building', () => {
  for (const path of [
    'apps/web/src/app/page.tsx',
    'packages/prettier-config/index.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
  ]) {
    it(`builds a preview that changed ${path}`, () => {
      const verdict = preview(paths('docs/a.md', path));
      assert.equal(verdict.build, true);
      assert.match(verdict.reason, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }

  it('builds when the base SHA is unavailable', () => {
    const verdict = preview({ unavailable: 'VERCEL_GIT_PREVIOUS_SHA is not set' });
    assert.equal(verdict.build, true);
    assert.match(verdict.reason, /VERCEL_GIT_PREVIOUS_SHA/);
  });

  it('builds when the base SHA is not in the shallow clone', () => {
    const verdict = preview({ unavailable: 'base 1234567 is not in this clone' });
    assert.equal(verdict.build, true);
  });

  it('builds when the diff is empty', () => {
    // An empty diff from a correct base and an empty diff from a base that happens to equal HEAD
    // are indistinguishable here, and the second one has seen nothing. Build.
    const verdict = preview(paths());
    assert.equal(verdict.build, true);
    assert.match(verdict.reason, /empty/);
  });
});

describe('decide: production is never skipped by accident', () => {
  it('builds a production commit whose diff is documentation only', () => {
    const verdict = decide({ vercelEnv: 'production', diff: paths('docs/a.md') });
    assert.equal(verdict.build, true);
    assert.match(verdict.reason, /production/);
  });

  it('builds a production dependabot ref, opt-in absent', () => {
    const verdict = decide({
      vercelEnv: 'production',
      commitRef: 'dependabot/npm_and_yarn/eslint-10.10.0',
      diff: paths('docs/a.md'),
    });
    assert.equal(verdict.build, true);
  });

  it('skips a documentation-only production commit once the owner opts in', () => {
    const verdict = decide({
      vercelEnv: 'production',
      diff: paths('docs/a.md'),
      allowProductionSkip: true,
    });
    assert.equal(verdict.build, false);
  });

  it('still builds an opted-in production commit that touched a build input', () => {
    const verdict = decide({
      vercelEnv: 'production',
      diff: paths('apps/web/src/app/page.tsx'),
      allowProductionSkip: true,
    });
    assert.equal(verdict.build, true);
  });

  it('builds when VERCEL_ENV is missing, unknown or development', () => {
    // Fail closed on the environment too: only an explicit `preview` (or an opted-in `production`)
    // may skip. An unset variable must not be read as "not production".
    for (const vercelEnv of [undefined, '', 'development', 'staging']) {
      const verdict = decide({ vercelEnv, diff: paths('docs/a.md') });
      assert.equal(verdict.build, true, `VERCEL_ENV=${JSON.stringify(vercelEnv)} should build`);
    }
  });

  it('builds when VERCEL_ENV is missing even on a dependabot ref', () => {
    const verdict = decide({
      vercelEnv: undefined,
      commitRef: 'dependabot/npm_and_yarn/eslint-10.10.0',
      diff: paths('docs/a.md'),
    });
    assert.equal(verdict.build, true);
  });
});

describe('decide: refs that only look like dependabot', () => {
  it('does not skip a branch that merely mentions dependabot', () => {
    for (const commitRef of [
      'fix/dependabot-config',
      'dependabot',
      'chore/deps-dependabot/eslint',
      '',
      undefined,
    ]) {
      const verdict = preview(paths('apps/web/src/app/page.tsx'), { commitRef });
      assert.equal(verdict.build, true, `${JSON.stringify(commitRef)} should not skip on the ref`);
    }
  });

  it('skips any branch under the dependabot namespace', () => {
    for (const commitRef of [
      'dependabot/npm_and_yarn/eslint-10.10.0',
      'dependabot/npm_and_yarn/vitejs/plugin-react-6.1.1',
      'dependabot/github_actions/actions/checkout-5',
    ]) {
      assert.equal(preview(paths('pnpm-lock.yaml'), { commitRef }).build, false, commitRef);
    }
  });
});

describe('readDiff', () => {
  // A fake `run` standing in for git. `calls` records the argv so the test can assert which
  // arguments were asked for, not only what came back.
  /** @param {Record<string, string | null>} replies */
  const fakeGit = (replies) => {
    /** @type {string[][]} */
    const calls = [];
    /**
     * @param {string[]} args
     * @returns {string | null}
     */
    const run = (args) => {
      calls.push(args);
      const key = args[0];
      if (!(key in replies)) throw new Error(`unexpected git ${args.join(' ')}`);
      return replies[key];
    };
    return { run, calls };
  };
  const base = '1111111111111111111111111111111111111111';
  const head = '2222222222222222222222222222222222222222';
  const env = { VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_GIT_COMMIT_SHA: head };

  it('asks git for NUL-separated names and splits on NUL, not on newline', () => {
    // Without -z, git renders a path containing a non-ASCII byte or a newline as a C-quoted string:
    // "apps/web/src/caf\303\251.tsx", with the leading double quote. That string does not start with
    // `apps/web/`, so the path would not be recognised as a build input and the build would be
    // SKIPPED — the one direction this gate must never fail in. -z removes the quoting entirely.
    const { run, calls } = fakeGit({
      'rev-parse': '/repo\n',
      'cat-file': '',
      diff: 'apps/web/src/café.tsx\0docs/a.md\0',
    });

    const diff = readDiff(env, run);

    assert.deepEqual(diff.paths, ['apps/web/src/café.tsx', 'docs/a.md']);
    assert.ok(
      calls.some((args) => args[0] === 'diff' && args.includes('-z')),
      'git diff must be asked for -z',
    );
    assert.equal(decide({ vercelEnv: 'preview', diff }).build, true);
  });

  it('would miss a C-quoted path, which is why -z is not optional', () => {
    assert.equal(isBuildInput('"apps/web/src/caf\\303\\251.tsx"'), false);
  });

  it('splits a name containing a newline correctly', () => {
    const { run } = fakeGit({
      'rev-parse': '/repo\n',
      'cat-file': '',
      diff: 'docs/two\nlines.md\0apps/web/page.tsx\0',
    });
    assert.deepEqual(readDiff(env, run).paths, ['docs/two\nlines.md', 'apps/web/page.tsx']);
  });

  it('reports an unavailable diff when git cannot find the repository root', () => {
    const { run } = fakeGit({ 'rev-parse': null });
    assert.match(readDiff(env, run).unavailable ?? '', /rev-parse/);
  });

  it('reports an unavailable diff when the base is absent from the clone', () => {
    const { run } = fakeGit({ 'rev-parse': '/repo\n', 'cat-file': null });
    assert.match(readDiff(env, run).unavailable ?? '', /not in this clone/);
  });

  it('reports an unavailable diff when the diff command itself fails', () => {
    const { run } = fakeGit({ 'rev-parse': '/repo\n', 'cat-file': '', diff: null });
    assert.match(readDiff(env, run).unavailable ?? '', /failed/);
  });

  it('rejects a base that is not an object name rather than passing it to git', () => {
    const { run, calls } = fakeGit({ 'rev-parse': '/repo\n' });
    const diff = readDiff({ VERCEL_GIT_PREVIOUS_SHA: '--upload-pack=evil' }, run);
    assert.match(diff.unavailable ?? '', /not an object name/);
    assert.equal(
      calls.filter((args) => args[0] !== 'rev-parse').length,
      0,
      'nothing but rev-parse should have reached git',
    );
  });

  it('falls back to HEAD when the head SHA is missing or malformed', () => {
    const { run, calls } = fakeGit({ 'rev-parse': '/repo\n', 'cat-file': '', diff: '' });
    readDiff({ VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_GIT_COMMIT_SHA: 'not-a-sha' }, run);
    const diffCall = calls.find((args) => args[0] === 'diff');
    assert.equal(diffCall?.at(-1), 'HEAD');
  });
});

describe('the exit-code contract', () => {
  it('skips with 0 and builds with 1, because Vercel reads 0 as "ignore this build"', () => {
    // Inverted on purpose, and the one fact in this file that is not ours to choose:
    // https://vercel.com/docs/project-configuration/vercel-json#ignorecommand
    assert.equal(SKIP_EXIT_CODE, 0);
    assert.equal(BUILD_EXIT_CODE, 1);
  });
});

describe('the command, run as a process the way Vercel runs it', () => {
  // The constants above say what each code means; only a real process says which one main() picks.
  // Swap the ternary in main(), swap the two constants, or let main() not run at all, and every case
  // above stays green while these go red. So these assert the literal statuses 0 and 1, never the
  // exported constants.
  //
  // The fixture is a throwaway repository: a base commit, a commit under apps/web/, then a docs-only
  // commit on top. The script runs with apps/web as its working directory, where Vercel's Root
  // Directory puts it.
  const script = fileURLToPath(new URL('./vercel-ignore-build.mjs', import.meta.url));
  /** @type {Record<string, string>} */
  const sha = {};
  let scratch = '';
  let repo = '';

  // Hermetic: no inherited VERCEL_* variable, no user or system git config (signing, hooks,
  // templates), and git may not walk up out of the scratch directory into a real repository.
  const baseEnv = () => ({
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: scratch,
  });

  /** @param {...string} args */
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.invalid',
        '-c',
        'commit.gpgsign=false',
      ].concat(['-c', 'init.defaultBranch=main'], args),
      { cwd: repo, env: baseEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();

  /**
   * @param {Record<string, string>} files
   * @param {string} message
   */
  const commit = (files, message) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  before(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'vercel-ignore-build-')));
    repo = join(scratch, 'repo');
    mkdirSync(repo);
    git('init', '-q');
    sha.base = commit({ 'apps/web/page.tsx': 'export default 1;\n', 'docs/a.md': '# a\n' }, 'base');
    sha.code = commit({ 'apps/web/page.tsx': 'export default 2;\n' }, 'code');
    sha.docs = commit({ 'docs/b.md': '# b\n' }, 'docs only');
  });

  after(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  /**
   * @param {Record<string, string | undefined>} env
   * @param {{ cwd?: string, entry?: string }} [options]
   */
  const run = (env, { cwd = join(repo, 'apps', 'web'), entry = script } = {}) =>
    spawnSync(process.execPath, [entry], { cwd, env: { ...baseEnv(), ...env }, encoding: 'utf8' });

  /**
   * @param {string} from
   * @param {string} to
   */
  const push = (from, to) => ({
    VERCEL_GIT_PREVIOUS_SHA: sha[from],
    VERCEL_GIT_COMMIT_SHA: sha[to],
  });

  it('exits 0, which cancels the build, for a documentation-only preview push', () => {
    const result = run({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'docs/x',
      ...push('code', 'docs'),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^SKIP: /);
  });

  it('exits 1 for a preview push whose tip is docs-only but whose range touched apps/web', () => {
    // Vercel's own example diffs HEAD^ against HEAD, which would skip this push.
    const result = run({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'fix/x',
      ...push('base', 'docs'),
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^BUILD: build inputs changed: apps\/web\/page\.tsx/);
  });

  it('exits 1 for a documentation-only production push without the opt-in', () => {
    const result = run({
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
      ...push('code', 'docs'),
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^BUILD: a production deployment always builds/);
  });

  it("exits 1 on a branch's first push, which has no previous deployment to diff against", () => {
    // VERCEL_GIT_PREVIOUS_SHA is the SHA of the branch's last successful deployment, so a branch
    // that has never deployed has none. A docs-only pull request therefore builds once.
    const result = run({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'docs/x',
      VERCEL_GIT_COMMIT_SHA: sha.docs,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /VERCEL_GIT_PREVIOUS_SHA is not set/);
  });

  it('exits 0 for a dependabot preview before it ever needs a repository', () => {
    const outside = join(scratch, 'not-a-repository');
    mkdirSync(outside, { recursive: true });
    const result = run(
      { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'dependabot/npm_and_yarn/eslint-10.10.0' },
      { cwd: outside },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^SKIP: dependabot\//);
  });

  it('still runs, and still builds, when invoked through a symlinked path', () => {
    // Node resolves symlinks in import.meta.url but not in process.argv[1]. A plain comparison of the
    // two decides the script is merely being imported, main() never runs, and the process exits 0:
    // Vercel would cancel every build, production included, with nothing in the log.
    const linked = join(scratch, 'linked-scripts');
    symlinkSync(dirname(script), linked, 'dir');
    const result = run(
      { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', ...push('code', 'docs') },
      { entry: join(linked, 'vercel-ignore-build.mjs') },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^BUILD: /);
  });
});

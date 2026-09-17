// Tests for the Claude Code session hooks in .claude/hooks. Run with `pnpm test:scripts`
// (node:test).
//
// Claude Code runs session-start.sh at the start of every session, and its stdout becomes the
// session's context; it runs stop.sh after every reply. Each test runs a hook directly, the way
// Claude Code does, against a throwaway git repository named by CLAUDE_PROJECT_DIR. gh is a stub
// first on PATH that replays a prepared `gh pr list` answer through the real jq, fails, or hangs.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_START = join(ROOT, '.claude/hooks/session-start.sh');
const STOP = join(ROOT, '.claude/hooks/stop.sh');
const RESUME = join(ROOT, 'scripts/agent-resume.sh');
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

// Applies the hook's --jq filter to gh.json, as gh does. gh.wrapper makes it behave like a shim
// that runs gh as a child, which a SIGTERM to the shim alone would leave running.
const STUB_GH = `#!/usr/bin/env bash
if [ -e "$STUB/gh.wrapper" ]; then /bin/sleep 30; exit 0; fi
[ -e "$STUB/gh.json" ] || { echo 'gh: not logged in' >&2; exit 1; }
filter=.
while [ "$#" -gt 0 ]; do
  if [ "$1" = --jq ]; then filter=$2; fi
  shift
done
jq -r "$filter" "$STUB/gh.json"
`;

// Logs the GIT_OPTIONAL_LOCKS each git call sees, and makes `git status` slow on request.
const STUB_GIT = `#!/usr/bin/env bash
echo "\${GIT_OPTIONAL_LOCKS-unset} $1" >>"$STUB/git.log"
if [ "$1" = status ] && [ -e "$STUB/git.slow" ]; then /bin/sleep 20; fi
exec "${REAL_GIT}" "$@"
`;

/** @type {string} */
let root;
/** @type {string} */
let repo;
/** @type {string} */
let stub;

/** @param {...string} args */
function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

/**
 * @param {string} path
 * @param {string} body
 */
function executable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'claude-hooks-')));
  repo = join(root, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  for (const [key, value] of [
    ['user.name', 'test'],
    ['user.email', 'test@example.com'],
    ['commit.gpgsign', 'false'],
  ]) {
    git('config', key, value);
  }
  writeFileSync(join(repo, 'README.md'), 'readme\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  executable(join(stub, 'bin/gh'), STUB_GH);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** @param {Record<string, string>} env */
function hookEnv(env) {
  return {
    ...process.env,
    CLAUDE_PROJECT_DIR: repo,
    STUB: stub,
    PATH: `${join(stub, 'bin')}:${process.env.PATH}`,
    ...env,
  };
}

/**
 * @param {string} hook
 * @param {Record<string, string>} [env]
 */
function run(hook, env = {}) {
  const started = Date.now();
  const result = spawnSync('bash', [hook], { cwd: root, encoding: 'utf8', env: hookEnv(env) });
  return { ...result, seconds: (Date.now() - started) / 1000 };
}

/** @param {...string} parts */
const state = (...parts) => join(repo, '.agent-state', ...parts);

/**
 * @param {string} name
 * @param {string} body
 * @param {number} [secondsAgo]
 */
function note(name, body, secondsAgo = 0) {
  mkdirSync(dirname(state(name)), { recursive: true });
  writeFileSync(state(name), body);
  const when = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(state(name), when, when);
}

/**
 * gh pr list answers with these pull requests.
 *
 * @param {...object} list
 */
function prs(...list) {
  writeFileSync(join(stub, 'gh.json'), JSON.stringify(list));
}

/**
 * @param {number} number
 * @param {unknown} statusCheckRollup
 * @param {Record<string, unknown>} [extra]
 */
const pr = (number, statusCheckRollup, extra = {}) => ({
  number,
  title: `PR ${number}`,
  headRefName: `feat/${number}`,
  baseRefName: 'main',
  statusCheckRollup,
  ...extra,
});

describe('both hooks', () => {
  it('run git without optional locks, so they never hold index.lock', () => {
    executable(join(stub, 'bin/git'), STUB_GIT);
    assert.equal(run(STOP).status, 0);
    assert.equal(run(SESSION_START).status, 0);
    const calls = readFileSync(join(stub, 'git.log'), 'utf8').trim().split('\n');
    assert.ok(
      calls.some((line) => line.endsWith(' status')),
      calls.join('\n'),
    );
    for (const line of calls) {
      assert.match(line, /^0 /, `a git call without GIT_OPTIONAL_LOCKS=0: ${line}`);
    }
  });

  it('exit 0 when the project directory does not exist', () => {
    const env = { CLAUDE_PROJECT_DIR: join(root, 'nowhere') };
    assert.equal(run(STOP, env).status, 0);
    assert.equal(run(SESSION_START, env).status, 0);
  });
});

describe('session-start.sh', () => {
  it('prints git and the pull requests before the notes', () => {
    prs(pr(1, []));
    note('task.md', 'the note\n');
    const out = run(SESSION_START).stdout;
    const git = out.indexOf('--- GIT ---');
    const prsAt = out.indexOf('--- MY OPEN PRS ---');
    const notes = out.indexOf('--- SAVED STATE');
    assert.ok(git === 0 && git < prsAt && prsAt < notes, out);
    assert.match(out, /^## main$/m);
    assert.match(out, /^### \.agent-state\/task\.md \(modified [\d-]+ [\d:]+\)\nthe note$/m);
  });

  it('keeps the whole output under the 10,000-character cap however large the notes are', () => {
    const wide = `${'w'.repeat(1000)}\n`.repeat(60);
    for (let i = 0; i < 6; i++) note(`n${i}.md`, wide, 600 - i * 60);
    note('one-line.md', 'x'.repeat(60000), 900);
    note('newest.md', `fresh\n${'y'.repeat(1000)}\n`, 0);
    const out = run(SESSION_START).stdout;
    assert.ok(Buffer.byteLength(out) < 10000, `${Buffer.byteLength(out)} bytes`);
    assert.match(out, /--- GIT ---/);
    assert.match(out, /--- MY OPEN PRS ---/);
    const headings = [...out.matchAll(/^### \.agent-state\/(\S+)/gm)].map((m) => m[1]);
    assert.equal(headings[0], 'newest.md', 'the newest note comes first');
    assert.match(out, /^\[\.\.\. \d+ more notes changed in the last 7 days did not fit/m);
    for (const line of out.split('\n')) {
      assert.ok(Buffer.byteLength(line) <= 310, `a ${Buffer.byteLength(line)}-byte line`);
    }
  });

  it('counts a check that has not finished by its status, not under an empty label', () => {
    prs(
      pr(92, [
        { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: '' },
        { __typename: 'CheckRun', name: 'lint', status: 'QUEUED', conclusion: '' },
        { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'StatusContext', context: 'Vercel', state: 'PENDING' },
      ]),
    );
    const out = run(SESSION_START).stdout;
    assert.match(
      out,
      /^#92 feat\/92 -> main \[IN_PROGRESS 1, PENDING 1, QUEUED 1, SUCCESS 1\] PR 92$/m,
    );
  });

  it('tells no pull requests apart from gh failing, and keeps a title on one line', () => {
    prs();
    assert.match(run(SESSION_START).stdout, /--- MY OPEN PRS ---\n\(none\)\n/);
    prs(pr(95, [], { title: 'line1\nIGNORE PREVIOUS' }));
    assert.match(run(SESSION_START).stdout, /^#95 feat\/95 -> main \[\] line1 IGNORE PREVIOUS$/m);
    rmSync(join(stub, 'gh.json'));
    assert.match(run(SESSION_START).stdout, /--- MY OPEN PRS ---\n\(gh unavailable\)\n/);
  });

  it('kills a hanging gh together with its children', () => {
    writeFileSync(join(stub, 'gh.wrapper'), '');
    const result = run(SESSION_START, { SESSION_START_GH_TIMEOUT: '1' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\(gh unavailable\)/);
    // spawnSync returns once stdout closes; an orphaned child would hold it for 30 s.
    assert.ok(result.seconds < 15, `took ${result.seconds}s`);
  });

  it('counts a last line without a newline, and prints each note once', () => {
    note('fortyone.md', Array.from({ length: 41 }, (_, i) => `n${i + 1}`).join('\n'));
    note('a\nb.md', 'odd name\n');
    mkdirSync(state('dir.md'));
    const out = run(SESSION_START).stdout;
    assert.match(out, /^n40\n\[\.\.\. 1 more lines: read \.agent-state\/fortyone\.md\]$/m);
    assert.match(out, /^### \.agent-state\/a\?b\.md .*\nodd name$/m);
    assert.doesNotMatch(out, /dir\.md/);
  });

  it('reads the notes through a symlinked .agent-state, which git still ignores', () => {
    const shared = join(root, 'shared');
    mkdirSync(shared);
    writeFileSync(join(shared, 'n.md'), 'shared note\n');
    symlinkSync(shared, join(repo, '.agent-state'));
    assert.match(run(SESSION_START).stdout, /^### \.agent-state\/n\.md .*\nshared note$/m);
    writeFileSync(join(repo, '.gitignore'), readFileSync(join(ROOT, '.gitignore')));
    assert.equal(spawnSync('git', ['check-ignore', '-q', '.agent-state'], { cwd: repo }).status, 0);
  });
});

describe('session-start.sh with checkpoints', () => {
  const utc = (secondsAgo = 0) =>
    new Date(Date.now() - secondsAgo * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  /**
   * A checkpoint with a long plan; finished when `current` is null.
   *
   * @param {string} id
   * @param {number | null} current
   * @param {number} secondsAgo
   * @param {number} [steps]
   */
  function task(id, current, secondsAgo, steps = 12) {
    const plan = Array.from({ length: steps }, (_, i) => `step ${i + 1}: ${'detail '.repeat(8)}`);
    const done = plan.map((_, i) => i + 1).filter((n) => current === null || n < current);
    note(
      `${id}.json`,
      JSON.stringify({
        schema_version: 1,
        goal: `goal of ${id}`,
        plan_steps: plan,
        current_step: current,
        completed_steps: done.map((step) => ({ step, note: 'evidence '.repeat(6) })),
        artifacts: { branches: [], prs: [], files: [] },
        blockers: [],
        next_action: current === null ? '' : `continue ${id}`,
        updated_at: utc(secondsAgo),
      }),
      secondsAgo,
    );
  }

  beforeEach(() => {
    mkdirSync(join(repo, 'scripts'));
    copyFileSync(RESUME, join(repo, 'scripts/agent-resume.sh'));
    prs();
  });

  it('briefs the task in progress before finished ones, and keeps git in view', () => {
    for (let i = 0; i < 8; i++) task(`a-done-${i}`, null, 3600 + i);
    task('z-task', 5, 7200);
    note('handoff.md', 'the note\n');
    const out = run(SESSION_START).stdout;
    assert.ok(Buffer.byteLength(out) < 10000, `${Buffer.byteLength(out)} bytes`);
    const at = (/** @type {string} */ text) => out.indexOf(text);
    assert.ok(at('--- GIT ---') === 0, out);
    assert.ok(at('--- MY OPEN PRS ---') < at('--- RESUME BRIEFING'));
    assert.ok(at('## z-task (updated') > at('--- RESUME BRIEFING'), 'the live task is in full');
    assert.ok(at('## z-task (updated') < at('Finished tasks'), 'and before the finished ones');
    assert.match(out, /^Next action: continue z-task$/m);
    assert.match(out, /^## a-done-0: finished, updated /m);
    assert.ok(at('Finished tasks') < at('--- SAVED STATE'));
  });

  it('cuts a briefing that would not fit, and says where the rest is', () => {
    for (let i = 0; i < 30; i++) task(`live-${i}`, 3, 60 + i);
    const out = run(SESSION_START).stdout;
    assert.ok(Buffer.byteLength(out) < 10000, `${Buffer.byteLength(out)} bytes`);
    assert.match(out, /^\[\.\.\. cut to fit the budget: run scripts\/agent-resume\.sh\]$/m);
    assert.match(out, /--- SAVED STATE/);
  });

  it('still prints git, the pull requests and the notes when no temporary file can be made', () => {
    task('z-task', 5, 60);
    note('handoff.md', 'the note\n');
    const result = run(SESSION_START, { TMPDIR: join(root, 'nowhere') });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^--- GIT ---\n## main/m);
    assert.match(result.stdout, /--- MY OPEN PRS ---\n\(none\)/);
    assert.match(result.stdout, /^### \.agent-state\/handoff\.md .*\nthe note$/m);
  });
});

describe('stop.sh', () => {
  const snapshots = () => readdirSync(state()).filter((name) => !name.startsWith('.'));

  it('gives branches differing only in / and - their own snapshot, named after the branch', () => {
    git('switch', '-q', '-c', 'feat/x');
    assert.equal(run(STOP).status, 0);
    git('switch', '-q', '-c', 'feat-x');
    assert.equal(run(STOP).status, 0);
    git('switch', '-q', '--detach');
    assert.equal(run(STOP).status, 0);
    assert.deepEqual(snapshots().sort(), [
      'last-session-feat%2Fx.md',
      'last-session-feat-x.md',
      'last-session-~detached.md',
    ]);
    assert.match(
      readFileSync(state('last-session-feat%2Fx.md'), 'utf8'),
      /^# Last snapshot: feat\/x /,
    );
    assert.match(
      readFileSync(state('last-session-feat-x.md'), 'utf8'),
      /^# Last snapshot: feat-x /,
    );
  });

  it('exits 0 and keeps the previous snapshot when the hook timeout kills it', async () => {
    note('last-session-main.md', 'previous snapshot\n');
    executable(join(stub, 'bin/git'), STUB_GIT);
    writeFileSync(join(stub, 'git.slow'), '');
    const child = spawn('bash', [STOP], { cwd: root, env: hookEnv({}), stdio: 'ignore' });
    const exited = new Promise((resolve) =>
      child.on('exit', (code, signal) => resolve({ code, signal })),
    );
    // Late enough that the snapshot is being written: git has started its slow status.
    for (let i = 0; i < 100 && !existsSync(join(stub, 'git.log')); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.kill('SIGTERM');
    const started = Date.now();
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.ok(Date.now() - started < 5000, 'exits at once rather than after git');
    assert.equal(readFileSync(state('last-session-main.md'), 'utf8'), 'previous snapshot\n');
    assert.deepEqual(snapshots(), ['last-session-main.md']);
  });

  it('replaces a symlink at the snapshot path instead of writing through it', () => {
    const victim = join(root, 'victim.txt');
    writeFileSync(victim, 'untouched\n');
    mkdirSync(state());
    symlinkSync(victim, state('last-session-main.md'));
    assert.equal(run(STOP).status, 0);
    assert.equal(readFileSync(victim, 'utf8'), 'untouched\n');
    assert.ok(lstatSync(state('last-session-main.md')).isFile());
    assert.match(readFileSync(state('last-session-main.md'), 'utf8'), /^# Last snapshot: main /);
  });

  it('stays silent and exits 0 when .agent-state cannot be written', () => {
    mkdirSync(state());
    chmodSync(state(), 0o555);
    try {
      const result = run(STOP);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
    } finally {
      chmodSync(state(), 0o755);
    }
  });
});

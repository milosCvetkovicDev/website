// Tests for scripts/agent-resume.sh. Run with `pnpm test:scripts` (node:test).
//
// Each test builds a real git repository with a bare repository as its origin, so branches,
// commits and `git ls-remote` behave as they do in a checkout without touching the network. gh is a
// stub first on PATH that replays a prepared `gh pr list` answer, fails, or hangs. The required and
// allowed properties are read from the real scripts/agent-state.schema.json, and every rejection a
// schema pattern covers is checked against that pattern too; the script's own extra rules (a real
// timestamp, a finished task with every step done) are pinned here on their own.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'agent-resume.sh');
const SCHEMA = JSON.parse(readFileSync(join(HERE, 'agent-state.schema.json'), 'utf8'));
const REAL_JQ = execFileSync('sh', ['-c', 'command -v jq'], { encoding: 'utf8' }).trim();

const STUB_GH = `#!/usr/bin/env bash
if [ -e "$STUB/gh.sleep" ]; then sleep "$(cat "$STUB/gh.sleep")"; fi
if [ -e "$STUB/gh.json" ]; then cat "$STUB/gh.json"; exit 0; fi
echo 'gh: not logged in' >&2
exit 1
`;

let root;
let repo;
let stub;

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

beforeEach(() => {
  // Resolved, because git reports the physical path of a symlinked tmpdir (macOS /var).
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agent-resume-')));
  execFileSync('git', ['init', '-q', '--bare', join(root, 'origin.git')]);
  repo = join(root, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  for (const [key, value] of [
    ['user.name', 'test'],
    ['user.email', 'test@example.com'],
    ['commit.gpgsign', 'false'],
  ]) {
    git('config', key, value);
  }
  mkdirSync(join(repo, 'scripts'));
  copyFileSync(SCRIPT, join(repo, 'scripts/agent-resume.sh'));
  writeFileSync(join(repo, 'README.md'), 'readme\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  git('remote', 'add', 'origin', join(root, 'origin.git'));
  git('push', '-q', 'origin', 'main');
  mkdirSync(join(repo, '.agent-state'), { recursive: true });
  stub = join(root, 'stub');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  writeFileSync(join(stub, 'bin/gh'), STUB_GH);
  chmodSync(join(stub, 'bin/gh'), 0o755);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const utc = (date = new Date()) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const ago = (seconds) => utc(new Date(Date.now() - seconds * 1000));

/** A valid checkpoint, written now, with the given fields replaced. */
function checkpoint(overrides = {}) {
  return {
    schema_version: 1,
    goal: 'Ship the widget',
    plan_steps: ['write it', 'test it', 'open the PR', 'watch CI'],
    current_step: 3,
    completed_steps: [
      { step: 1, note: 'commit abc1234' },
      { step: 2, at: utc() },
    ],
    artifacts: { branches: [], prs: [], files: [] },
    blockers: [],
    next_action: 'gh pr create --base main',
    updated_at: utc(),
    ...overrides,
  };
}

/** A finished checkpoint: every step done, no step in progress. */
const finished = (overrides = {}) =>
  checkpoint({
    current_step: null,
    completed_steps: [1, 2, 3, 4].map((step) => ({ step })),
    next_action: '',
    ...overrides,
  });

const artifacts = (fields) => ({ branches: [], prs: [], files: [], ...fields });

function save(id, body) {
  writeFileSync(
    join(repo, '.agent-state', `${id}.json`),
    typeof body === 'string' ? body : JSON.stringify(body),
  );
}

/** gh pr list answers with these pull requests. */
function prs(...list) {
  writeFileSync(join(stub, 'gh.json'), JSON.stringify(list));
}

const pr = (number, headRefName, extra = {}) => ({
  number,
  title: `PR ${number}`,
  state: 'OPEN',
  headRefName,
  statusCheckRollup: [{ __typename: 'CheckRun', name: 'build', conclusion: 'SUCCESS' }],
  ...extra,
});

function resume(args = [], env = {}) {
  const started = Date.now();
  const result = spawnSync('bash', [join(repo, 'scripts/agent-resume.sh'), ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      STUB: stub,
      PATH: `${join(stub, 'bin')}:${process.env.PATH}`,
      // Generous, so a loaded machine cannot turn a stub that answers at once into a timeout; the
      // hang tests set their own.
      AGENT_RESUME_GH_TIMEOUT: '20',
      AGENT_RESUME_GIT_TIMEOUT: '20',
      ...env,
    },
  });
  return { ...result, seconds: (Date.now() - started) / 1000 };
}

/** The marked lines after the heading that starts with `heading`, without their marker. */
function listed(stdout, heading, marker) {
  const lines = stdout.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(marker)) break;
    out.push(line.slice(marker.length));
  }
  return out;
}

function contradictions(stdout) {
  assert.match(stdout, /^Contradictions/m, `no Contradictions line in:\n${stdout}`);
  return listed(stdout, 'Contradictions', '  ! ');
}

const attention = (stdout) => listed(stdout, 'Needs attention:', '  * ');

/** Runs one invalid checkpoint on its own and returns the rules reported for it. */
function rejected(body, id = 'rule') {
  rmSync(join(repo, '.agent-state'), { recursive: true, force: true });
  mkdirSync(join(repo, '.agent-state'));
  save(id, body);
  const run = resume();
  assert.equal(run.status, 1, `expected exit 1:\n${run.stdout}${run.stderr}`);
  assert.match(run.stdout, new RegExp(`!! ${id}\\.json is invalid, so it was not briefed:`));
  return listed(run.stdout, `!! ${id}.json is invalid`, '   - ');
}

describe('briefing', () => {
  it('says so when there are no checkpoints', () => {
    const run = resume();
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No JSON checkpoints/);
  });

  it('briefs a valid checkpoint step by step, with nothing to contradict', () => {
    git('switch', '-q', '-c', 'feat/widget');
    git('push', '-q', 'origin', 'feat/widget');
    prs(pr(5, 'feat/widget'));
    save(
      'widget',
      checkpoint({
        artifacts: artifacts({
          branches: [{ name: 'feat/widget', pushed: true }],
          prs: [5],
          files: ['README.md'],
        }),
        blockers: ['waiting for review'],
        updated_at: utc(new Date(Date.now() + 5000)),
      }),
    );
    const run = resume();
    assert.equal(run.status, 0, run.stderr);
    for (const line of [
      /^## widget \(updated \S+Z, just now\)$/m,
      /^Goal: Ship the widget$/m,
      /^Steps \(2 of 4 done\):$/m,
      /^ {2}\[x\] 1\. write it -- commit abc1234$/m,
      /^ {2}\[x\] 2\. test it$/m,
      /^ {2}\[>\] 3\. open the PR {3}<- in progress$/m,
      /^ {2}\[ \] 4\. watch CI$/m,
      /^Next action: gh pr create --base main$/m,
      /^Blockers:\n {2}- waiting for review$/m,
      /^ {2}branch feat\/widget: local yes, origin yes$/m,
      /^ {2}PR #5 OPEN feat\/widget \[SUCCESS 1\] PR 5$/m,
      /^ {2}file README\.md: no uncommitted change$/m,
      /^Contradictions: none$/m,
    ]) {
      assert.match(run.stdout, line);
    }
  });

  it('briefs only the task ids it is given, once each, and refuses a bad or missing one', () => {
    save('one', checkpoint({ goal: 'first' }));
    save('two', checkpoint({ goal: 'second' }));
    const run = resume(['two', 'two']);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Goal: second/);
    assert.doesNotMatch(run.stdout, /Goal: first/);
    assert.equal(run.stdout.match(/^## two /gm).length, 1, 'a repeated id is briefed once');
    const missing = resume(['three']);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /no checkpoint three/);
    mkdirSync(join(root, 'outside'));
    writeFileSync(join(root, 'outside/stranger.json'), JSON.stringify(checkpoint()));
    for (const id of ['../../outside/stranger', 'two\nthree']) {
      const bad = resume([id]);
      assert.equal(bad.status, 2, id);
      assert.match(bad.stderr, /not a task id/, id);
      assert.doesNotMatch(bad.stdout, /## /, id);
    }
  });

  it('gives a finished task one line, and briefs it in full when asked for by id', () => {
    save('done', finished());
    const run = resume();
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^Finished tasks .*\n## done: finished, updated \S+Z \(just now\)$/m);
    assert.doesNotMatch(run.stdout, /Goal:/);
    const full = resume(['done']);
    assert.match(full.stdout, /Every step is done\.\nNext action: \(none\)/);
  });

  it('puts invalid checkpoints first, then live tasks newest first, then finished ones', () => {
    save('a-done', finished());
    save('b-old', checkpoint({ updated_at: ago(7200) }));
    save('c-new', checkpoint({ updated_at: ago(60) }));
    save('d-bad', '{');
    const run = resume();
    const order = [...run.stdout.matchAll(/^(?:!! |## )([a-z-]+)/gm)].map((m) => m[1]);
    assert.deepEqual(order, ['d-bad', 'c-new', 'b-old', 'a-done']);
  });
});

describe('validation', () => {
  it('reports the broken rules, still briefs the valid checkpoints, and exits 1', () => {
    save('good', checkpoint());
    save('bad', {
      ...checkpoint(),
      goal: '',
      current_step: 9,
      next_action: 5,
      updated_at: '2026-09-16 10:00',
      extra: true,
    });
    save('Bad_Name', checkpoint());
    const run = resume();
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /^## good /m, 'the valid checkpoint is still briefed');
    assert.deepEqual(listed(run.stdout, '!! bad.json is invalid', '   - '), [
      'unknown property extra',
      'goal must be a non-empty string',
      'current_step must be null or a step number from 1 to 4',
      'next_action must be a string',
      'updated_at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ',
    ]);
    assert.match(run.stdout, /!! Bad_Name\.json is invalid[^]*file name must be <task-id>\.json/);
  });

  it('reports every rule a completed step or a branch breaks, not just the first', () => {
    const body = checkpoint({
      completed_steps: [{ step: 1, note: 5, at: 'x', extra: 1 }],
      artifacts: artifacts({ branches: [{ name: 'b', pushed: 'yes', junk: 1 }] }),
    });
    assert.deepEqual(rejected(body), [
      'completed step 1: note must be a string',
      'completed step 1: at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ',
      'completed step 1: unknown property extra',
      'branch "b": pushed must be true or false',
      'branch "b": unknown property junk',
    ]);
  });

  it('exits 1 for a file that is not exactly one JSON document, each on its own', () => {
    for (const [name, body, message] of [
      ['broken JSON', '{ not json', /!! rule\.json is not valid JSON/],
      ['an empty file', '', /exactly one JSON document, but holds 0/],
      ['whitespace only', '  \n', /exactly one JSON document, but holds 0/],
      ['two documents', JSON.stringify(checkpoint()).repeat(2), /but holds 2/],
    ]) {
      rmSync(join(repo, '.agent-state'), { recursive: true, force: true });
      mkdirSync(join(repo, '.agent-state'));
      save('rule', body);
      const run = resume();
      assert.equal(run.status, 1, `${name}:\n${run.stdout}`);
      assert.match(run.stdout, message, name);
      assert.doesNotMatch(run.stdout, /^## /m, name);
    }
  });

  it('reports a checkpoint entry that is not a readable file', () => {
    symlinkSync(join(root, 'nowhere.json'), join(repo, '.agent-state/dangling.json'));
    mkdirSync(join(repo, '.agent-state/dir.json'));
    save('.hidden', checkpoint());
    const run = resume();
    assert.equal(run.status, 1, run.stdout);
    assert.match(run.stdout, /!! dangling\.json is not a readable file/);
    assert.match(run.stdout, /!! dir\.json is not a readable file/);
    assert.match(run.stdout, /!! \.hidden\.json is invalid[^]*file name must be <task-id>\.json/);
  });

  it('enforces every property the schema requires', () => {
    for (const property of SCHEMA.required) {
      const body = checkpoint();
      delete body[property];
      assert.ok(rejected(body).length > 0, `without ${property}`);
    }
    for (const property of SCHEMA.properties.artifacts.required) {
      const body = checkpoint();
      delete body.artifacts[property];
      assert.ok(rejected(body).length > 0, `without artifacts.${property}`);
    }
  });

  it('accepts every property the schema allows, and only those', () => {
    const props = (schema) => Object.keys(schema.properties).sort();
    const body = checkpoint({
      completed_steps: [
        { step: 1, note: 'n', at: utc() },
        { step: 2, at: utc() },
      ],
      artifacts: artifacts({
        branches: [{ name: 'feat/all', pushed: false }],
        files: ['README.md'],
      }),
    });
    git('branch', 'feat/all');
    assert.deepEqual(Object.keys(body).sort(), props(SCHEMA));
    assert.deepEqual(Object.keys(body.artifacts).sort(), props(SCHEMA.properties.artifacts));
    assert.deepEqual(
      Object.keys(body.completed_steps[0]).sort(),
      props(SCHEMA.properties.completed_steps.items),
    );
    assert.deepEqual(
      Object.keys(body.artifacts.branches[0]).sort(),
      props(SCHEMA.properties.artifacts.properties.branches.items),
    );
    save('all', body);
    const run = resume();
    assert.equal(run.status, 0, run.stdout);
    for (const [where, extra] of [
      ['top level', { ...body, notes: 'x' }],
      ['artifacts', { ...body, artifacts: { ...body.artifacts, logs: [] } }],
      ['a completed step', { ...body, completed_steps: [{ step: 1, by: 'x' }, { step: 2 }] }],
      [
        'a branch',
        { ...body, artifacts: { ...body.artifacts, branches: [{ name: 'feat/all', sha: 'x' }] } },
      ],
    ]) {
      assert.ok(
        rejected(extra).some((rule) => rule.includes('unknown property')),
        where,
      );
    }
  });

  it('rejects what the schema rejects, each case in its own run', () => {
    assert.equal(SCHEMA.additionalProperties, false);
    assert.equal(SCHEMA.properties.schema_version.const, 1);
    const stamp = new RegExp(SCHEMA.properties.updated_at.pattern);
    const stepStamp = new RegExp(SCHEMA.properties.completed_steps.items.properties.at.pattern);
    for (const [name, body, rule] of [
      ['a second schema version', checkpoint({ schema_version: 2 }), 'schema_version must be 1'],
      [
        'an empty plan',
        checkpoint({ plan_steps: [], current_step: null, completed_steps: [] }),
        'plan_steps must be',
      ],
      ['a step number of 0', checkpoint({ current_step: 0 }), 'current_step must be'],
      ['a fractional step', checkpoint({ current_step: 1.5 }), 'current_step must be'],
      [
        'a completed step out of range',
        checkpoint({ completed_steps: [{ step: 7 }] }),
        'completed step 7 is not a step number from 1 to 4',
      ],
      [
        'a step listed twice',
        checkpoint({ completed_steps: [{ step: 1 }, { step: 1 }] }),
        'completed_steps lists a step twice',
      ],
      [
        'the current step among the done',
        checkpoint({ completed_steps: [{ step: 3 }] }),
        'current_step 3 is also in completed_steps',
      ],
      [
        'a completed step as a bare number',
        checkpoint({ completed_steps: [1] }),
        'each completed step must be an object',
      ],
      [
        'a completed step with a note that is not text',
        checkpoint({ completed_steps: [{ step: 1, note: 5 }] }),
        'completed step 1: note must be a string',
      ],
      [
        'a completed step time with an offset',
        checkpoint({ completed_steps: [{ step: 1, at: '2026-09-16T10:00:00+02:00' }] }),
        'completed step 1: at must be',
      ],
      [
        'a timestamp with an offset',
        checkpoint({ updated_at: '2026-09-16T10:00:00+02:00' }),
        'updated_at must be',
      ],
      [
        'a branch without a name',
        checkpoint({ artifacts: artifacts({ branches: [{}] }) }),
        'branch null: name must be',
      ],
      [
        'a pushed flag that is not a boolean',
        checkpoint({ artifacts: artifacts({ branches: [{ name: 'x', pushed: 'yes' }] }) }),
        'branch "x": pushed must be true or false',
      ],
      [
        'a branch with an unknown property',
        checkpoint({ artifacts: artifacts({ branches: [{ name: 'x', sha: 'abc' }] }) }),
        'branch "x": unknown property sha',
      ],
      [
        'a PR number of 0',
        checkpoint({ artifacts: artifacts({ prs: [0] }) }),
        'artifacts.prs must be',
      ],
      [
        'an unknown artifact list',
        checkpoint({ artifacts: artifacts({ logs: [] }) }),
        'unknown property logs',
      ],
      [
        'an empty file path',
        checkpoint({ artifacts: artifacts({ files: [''] }) }),
        'artifacts.files must be',
      ],
      [
        'a file path that is not text',
        checkpoint({ artifacts: artifacts({ files: [7] }) }),
        'artifacts.files must be',
      ],
      ['an empty blocker', checkpoint({ blockers: [''] }), 'blockers must be'],
      [
        'an empty next action with a step open',
        checkpoint({ next_action: '' }),
        'next_action may be empty only when current_step is null',
      ],
    ]) {
      const rules = rejected(body);
      assert.ok(
        rules.some((r) => r.startsWith(rule)),
        `${name}: expected "${rule}" in ${JSON.stringify(rules)}`,
      );
    }
    for (const value of ['2026-09-16T10:00:00+02:00', `${utc()}\n`]) {
      assert.equal(stamp.test(value), false, `the schema rejects ${JSON.stringify(value)}`);
      assert.equal(stepStamp.test(value), false, `the schema rejects ${JSON.stringify(value)}`);
    }
  });

  it('rejects a timestamp with a trailing newline, as the schema pattern does', () => {
    const late = `${utc()}\n`;
    assert.equal(new RegExp(SCHEMA.properties.updated_at.pattern).test(late), false);
    assert.ok(
      rejected(checkpoint({ updated_at: late })).includes(
        'updated_at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ',
      ),
    );
    assert.ok(
      rejected(checkpoint({ completed_steps: [{ step: 1, at: late }] })).includes(
        'completed step 1: at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ',
      ),
    );
  });

  it('rejects a timestamp that matches the pattern but is not a real time', () => {
    for (const value of ['2026-13-45T25:61:61Z', '2026-02-31T10:00:00Z']) {
      // The schema pattern cannot tell; the script checks that the time parses back to itself.
      assert.equal(new RegExp(SCHEMA.properties.updated_at.pattern).test(value), true);
      assert.ok(
        rejected(checkpoint({ updated_at: value })).includes(
          'updated_at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ',
        ),
        value,
      );
    }
  });

  it('rejects a finished task whose steps are not all completed', () => {
    assert.deepEqual(
      rejected(checkpoint({ current_step: null, completed_steps: [{ step: 1 }], next_action: '' })),
      ['current_step is null, but steps 2, 3, 4 not in completed_steps'],
    );
    assert.deepEqual(
      rejected(
        checkpoint({
          current_step: null,
          completed_steps: [{ step: 1 }, { step: 2 }, { step: 3 }],
        }),
      ),
      ['current_step is null, but step 4 not in completed_steps'],
    );
  });

  it('rejects branch names git would not accept, and a branch listed twice', () => {
    for (const [branches, rule] of [
      [[{ name: 'main\nfeat/ghost', pushed: true }], /name must be a non-empty string without/],
      [[{ name: 'main^{tree}' }], /is not a valid git branch name/],
      [[{ name: 'feat/x' }, { name: 'feat/x' }], /artifacts\.branches lists a branch twice/],
    ]) {
      const rules = rejected(checkpoint({ artifacts: artifacts({ branches }) }));
      assert.ok(
        rules.some((r) => rule.test(r)),
        `${JSON.stringify(branches)}: ${rules}`,
      );
    }
  });
});

describe('contradictions', () => {
  it('flags a branch whose pushed state is wrong, or that exists nowhere', () => {
    git('branch', 'feat/pushed');
    git('push', '-q', 'origin', 'feat/pushed');
    git('branch', 'feat/local-only');
    save(
      'branches',
      checkpoint({
        artifacts: artifacts({
          branches: [
            { name: 'feat/pushed', pushed: false },
            { name: 'feat/local-only', pushed: true },
            { name: 'feat/gone' },
          ],
        }),
        updated_at: utc(new Date(Date.now() + 5000)),
      }),
    );
    const run = resume();
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(contradictions(run.stdout), [
      'branch feat/pushed is on origin, but the checkpoint says it is not pushed',
      'branch feat/local-only is not on origin, but the checkpoint says it was pushed',
      'branch feat/gone exists neither locally nor on origin',
    ]);
  });

  it('flags a branch that moved more than a minute after the checkpoint was written', () => {
    git('switch', '-q', '-c', 'feat/moved');
    writeFileSync(join(repo, 'README.md'), 'changed\n');
    git('commit', '-q', '-am', 'later work');
    const branch = artifacts({ branches: [{ name: 'feat/moved' }] });
    const moved = /^branch feat\/moved has a commit from \S+Z, after the checkpoint was written$/m;
    save('moved', checkpoint({ artifacts: branch, updated_at: ago(3600) }));
    let run = resume();
    assert.match(contradictions(run.stdout).join('\n'), moved);
    assert.match(run.stdout, /^## moved \(updated \S+Z, 60 min ago\)$/m);
    save('moved', checkpoint({ artifacts: branch, updated_at: ago(300) }));
    assert.match(contradictions(resume().stdout).join('\n'), moved, 'five minutes is too late');
    save('moved', checkpoint({ artifacts: branch, updated_at: ago(20) }));
    assert.deepEqual(contradictions(resume().stdout), [], 'within the minute of grace');
  });

  it('flags a pull request that merged or closed while a step is still in progress', () => {
    prs(pr(7, 'feat/a', { state: 'MERGED' }), pr(8, 'feat/b', { state: 'CLOSED' }));
    save('merged', checkpoint({ artifacts: artifacts({ prs: [7, 8] }) }));
    assert.deepEqual(contradictions(resume().stdout), [
      'PR #7 is MERGED, but step 3 is still in progress',
      'PR #8 is CLOSED, but step 3 is still in progress',
    ]);
  });

  it('does not call a finished task stale because its merge deleted the branch', () => {
    // What a squash merge leaves here: the repository deletes the head branch on merge.
    prs(pr(7, 'feat/merged', { state: 'MERGED' }));
    const body = finished({
      artifacts: artifacts({ branches: [{ name: 'feat/merged', pushed: true }], prs: [7] }),
    });
    save('merged', body);
    const run = resume(['merged']);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(contradictions(run.stdout), []);
    assert.match(resume().stdout, /^## merged: finished, updated \S+ \(just now\)$/m);
    // A task still in progress whose PR merged is flagged for that, not for the deleted branch.
    save('merged', { ...checkpoint(), artifacts: body.artifacts });
    assert.deepEqual(contradictions(resume().stdout), [
      'PR #7 is MERGED, but step 3 is still in progress',
    ]);
  });

  it('lists failing checks on an open PR as needing attention, not as a contradiction', () => {
    prs(
      pr(9, 'feat/c', {
        statusCheckRollup: [
          { __typename: 'CheckRun', name: 'build', conclusion: 'SUCCESS' },
          { __typename: 'CheckRun', name: 'e2e', conclusion: 'FAILURE' },
          { __typename: 'CheckRun', name: 'lint', conclusion: 'CANCELLED' },
          { __typename: 'StatusContext', context: 'Vercel', state: 'ERROR' },
          { __typename: 'CheckRun', name: 'unit', status: 'IN_PROGRESS', conclusion: '' },
        ],
      }),
      pr(41, 'feat/d', {
        state: 'MERGED',
        statusCheckRollup: [{ __typename: 'StatusContext', context: 'Vercel', state: 'FAILURE' }],
      }),
    );
    save('checks', checkpoint({ artifacts: artifacts({ prs: [9, 41] }) }));
    const run = resume();
    assert.deepEqual(attention(run.stdout), ['PR #9 has failing checks: e2e, lint, Vercel']);
    assert.deepEqual(contradictions(run.stdout), [
      'PR #41 is MERGED, but step 3 is still in progress',
    ]);
    assert.match(
      run.stdout,
      new RegExp(
        '^ {2}PR #9 OPEN feat/c ' +
          '\\[CANCELLED 1, ERROR 1, FAILURE 1, IN_PROGRESS 1, SUCCESS 1\\] PR 9$',
        'm',
      ),
    );
  });

  it('flags a PR from a branch the checkpoint does not list, or one gh cannot find', () => {
    git('branch', 'feat/listed');
    prs(pr(10, 'feat/other'));
    save(
      'mismatch',
      checkpoint({ artifacts: artifacts({ branches: [{ name: 'feat/listed' }], prs: [10, 11] }) }),
    );
    assert.deepEqual(contradictions(resume().stdout), [
      'PR #10 is from branch feat/other, which the checkpoint does not list',
      'PR #11 is not among the last 200 pull requests gh lists',
    ]);
    save('mismatch', checkpoint({ artifacts: artifacts({ prs: [10] }) }));
    assert.deepEqual(contradictions(resume().stdout), [], 'no branches listed, nothing to match');
  });

  it('reports the files it lists as missing, untracked or changed, taking paths literally', () => {
    writeFileSync(join(repo, 'new.txt'), 'x\n');
    writeFileSync(join(repo, 'README.md'), 'edited\n');
    writeFileSync(join(repo, '[ab].txt'), 'literal\n');
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    git('add', '[ab].txt', 'a.txt');
    git('commit', '-q', '-m', 'files');
    writeFileSync(join(repo, 'a.txt'), 'changed\n');
    save(
      'files',
      checkpoint({
        artifacts: artifacts({ files: ['README.md', 'new.txt', 'gone.txt', '[ab].txt'] }),
      }),
    );
    const run = resume();
    assert.match(run.stdout, /^ {2}file README\.md: changed \(M\)$/m);
    assert.match(run.stdout, /^ {2}file new\.txt: untracked$/m);
    assert.match(run.stdout, /^ {2}file gone\.txt: missing$/m);
    assert.match(run.stdout, /^ {2}file \[ab\]\.txt: no uncommitted change$/m);
    assert.deepEqual(contradictions(run.stdout), ['file gone.txt does not exist']);
  });
});

describe('when gh or origin cannot answer', () => {
  it('reports pull requests as unknown rather than contradicted when gh fails', () => {
    save('offline', checkpoint({ artifacts: artifacts({ prs: [12] }) }));
    const run = resume();
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^ {2}PR #12: unknown \(gh unavailable\)$/m);
    assert.deepEqual(contradictions(run.stdout), []);
  });

  it('treats a gh answer that is not a list as unavailable', () => {
    writeFileSync(join(stub, 'gh.json'), '{"message":"Bad credentials"}');
    save('odd', checkpoint({ artifacts: artifacts({ prs: [12] }) }));
    const run = resume();
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /^ {2}PR #12: unknown \(gh unavailable\)$/m);
  });

  it('still briefs a PR whose check rollup is not a list', () => {
    prs(pr(14, 'feat/e', { statusCheckRollup: { conclusion: 'FAILURE' } }));
    save('rollup', checkpoint({ artifacts: artifacts({ prs: [14] }) }));
    const run = resume();
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /^ {2}PR #14 OPEN feat\/e \[no checks\] PR 14$/m);
  });

  it('exits 1 and says so when a valid checkpoint cannot be briefed', () => {
    // A jq that fails only on the briefing call, the one that reads the pull requests.
    writeFileSync(
      join(stub, 'bin/jq'),
      [
        '#!/usr/bin/env bash',
        'for a in "$@"; do',
        '  [ "$a" = --slurpfile ] && { echo \'jq: boom\' >&2; exit 5; }',
        'done',
        `exec "${REAL_JQ}" "$@"`,
        '',
      ].join('\n'),
    );
    chmodSync(join(stub, 'bin/jq'), 0o755);
    save('good', checkpoint());
    const run = resume();
    assert.equal(run.status, 1, run.stdout);
    assert.match(run.stdout, /^!! good\.json could not be briefed: jq: boom$/m);
  });

  it('gives up on a gh that hangs within its timeout', () => {
    writeFileSync(join(stub, 'gh.sleep'), '30');
    prs(pr(13, 'feat/d'));
    save('hang', checkpoint({ artifacts: artifacts({ prs: [13] }) }));
    const run = resume([], { AGENT_RESUME_GH_TIMEOUT: '1' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /PR #13: unknown \(gh unavailable\)/);
    assert.ok(run.seconds < 10, `took ${run.seconds}s`);
  });

  it('falls back to the default timeout for one that would not bound the call', () => {
    writeFileSync(join(stub, 'gh.sleep'), '30');
    prs(pr(13, 'feat/d'));
    save('hang', checkpoint({ artifacts: artifacts({ prs: [13] }) }));
    const run = resume([], { AGENT_RESUME_GH_TIMEOUT: '0' });
    assert.match(run.stdout, /PR #13: unknown \(gh unavailable\)/);
    assert.ok(run.seconds < 20, `took ${run.seconds}s; the default is 6 s`);
  });

  it('reports branches as unknown on origin when git ls-remote fails', () => {
    git('remote', 'set-url', 'origin', join(root, 'nowhere.git'));
    git('branch', 'feat/e');
    save(
      'no-origin',
      checkpoint({ artifacts: artifacts({ branches: [{ name: 'feat/e', pushed: true }] }) }),
    );
    const run = resume();
    assert.match(run.stdout, /branch feat\/e: local yes, origin unknown \(git ls-remote failed\)/);
    assert.deepEqual(contradictions(run.stdout), []);
  });

  it('bounds a hanging origin and kills what git started, while gh waits alongside', () => {
    // An ssh origin whose "ssh" never answers, like a host that drops packets.
    const marker = `${37 + Math.floor(Math.random() * 1000) / 1000}`;
    git('remote', 'set-url', 'origin', 'ssh://git@example.invalid/x.git');
    git('branch', 'feat/f');
    writeFileSync(join(stub, 'gh.sleep'), '30');
    prs(pr(15, 'feat/f'));
    save(
      'hang-origin',
      checkpoint({ artifacts: artifacts({ branches: [{ name: 'feat/f' }], prs: [15] }) }),
    );
    const run = resume([], {
      GIT_SSH_COMMAND: `sleep ${marker} #`,
      AGENT_RESUME_GIT_TIMEOUT: '4',
      AGENT_RESUME_GH_TIMEOUT: '4',
    });
    assert.match(run.stdout, /branch feat\/f: local yes, origin unknown \(git ls-remote failed\)/);
    assert.match(run.stdout, /PR #15: unknown \(gh unavailable\)/);
    // Side by side, the two 4 s limits end together; one after the other would take 8 s.
    assert.ok(run.seconds < 7.5, `took ${run.seconds}s`);
    const left = spawnSync('pgrep', ['-f', `sleep ${marker}`], { encoding: 'utf8' });
    assert.equal(left.stdout.trim(), '', 'the ssh command git started is still running');
  });
});

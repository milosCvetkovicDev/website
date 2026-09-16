// Tests for .github/workflows/docs-drift.yml and .github/prompts/docs-drift.md. Run with
// `pnpm test:scripts` (node:test).
//
// The workflow runs an agent that reads repository text, and holds a token that can write to the
// repository. These tests pin the properties that keep the two apart, so that a later edit cannot
// quietly undo one:
//   - the job the agent runs in has no GitHub token and no write permission, and its checkout does
//     not persist one;
//   - the agent has no shell, no web access and no MCP servers, and may edit only docs/** and its
//     pull request body file;
//   - the write token reaches exactly one step, which runs no agent, no package code and no hook;
//   - nothing merges, and every job that can reach a secret runs only on main;
//   - the open-pull-request guards ignore pull requests from forks.
// Nothing here runs Claude Code: the flags are checked as written against the documented meaning
// of Claude Code 2.1.273, the pinned version.
//
// The repository has no YAML parser at the root, and the workflow is plain enough to split by
// indentation: jobs at two spaces under `jobs:`, steps at `      - name:`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/docs-drift.yml'), 'utf8');
const PROMPT = readFileSync(join(ROOT, '.github/prompts/docs-drift.md'), 'utf8');

/** The workflow's jobs as { name: text }. */
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const result = {};
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

/** A job's steps as [{ name, text }]. */
function steps(jobText) {
  return jobText
    .split(/\n(?= {6}- name: )/)
    .slice(1)
    .map((text) => ({ name: /- name: (.*)/.exec(text)[1], text }));
}

/** The names of the variables a step's `env:` block sets. */
function envNames(stepText) {
  const block = /\n {8}env:\n((?: {10}.*\n| *#.*\n)*)/.exec(stepText);
  if (!block) return [];
  return [...block[1].matchAll(/^ {10}([A-Z_][A-Z0-9_]*):/gm)].map((m) => m[1]);
}

/** The arguments of the `claude -p` call, joined across its continuation lines. */
function claudeArgs(stepText) {
  const start = stepText.indexOf('claude -p ');
  assert.notEqual(start, -1, 'no claude -p call');
  const lines = [];
  for (const line of stepText.slice(start).split('\n')) {
    lines.push(line.replace(/\\$/, '').trim());
    if (!line.trimEnd().endsWith('\\')) break;
  }
  const args = [];
  for (const match of lines.join(' ').matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }
  return args;
}

/** Every value given to a repeatable flag, split on commas outside parentheses. */
function flagValues(args, flag) {
  const values = [];
  args.forEach((arg, index) => {
    if (arg !== flag) return;
    let depth = 0;
    let item = '';
    for (const char of args[index + 1]) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        values.push(item);
        item = '';
      } else {
        item += char;
      }
    }
    values.push(item);
  });
  return values;
}

// The validator runs from the commit, not the working tree a patch or the agent could change.
const COMMITTED_VALIDATOR =
  /git show HEAD:scripts\/docs-drift-patch\.mjs > "\$RUNNER_TEMP\/docs-drift-patch\.mjs"/;

const JOBS = jobs(WORKFLOW);
const AGENT_JOB = Object.keys(JOBS).find((name) => JOBS[name].includes('claude -p '));
const agentStep = () => steps(JOBS[AGENT_JOB]).find((step) => step.text.includes('claude -p '));

describe('the docs drift workflow', () => {
  it('has the jobs these tests describe, and runs claude in exactly one step', () => {
    assert.deepEqual(Object.keys(JOBS), ['check', 'gate', 'propose', 'publish']);
    assert.equal(AGENT_JOB, 'propose');
    const calls = Object.values(JOBS).join('').split('claude -p ').length - 1;
    assert.equal(calls, 1);
  });

  it('never triggers on pull request events', () => {
    const on = WORKFLOW.slice(WORKFLOW.indexOf('\non:\n'), WORKFLOW.indexOf('\nconcurrency:'));
    assert.doesNotMatch(on, /pull_request|workflow_run|issue|discussion/);
    assert.match(WORKFLOW, /\npermissions:\n {2}contents: read\n\n/);
  });

  it('keeps every job that can reach a secret to runs on main', () => {
    for (const name of ['gate', 'propose', 'publish']) {
      const condition = /^ {4}if: (?:>-\n)?([\s\S]*?)\n {4}runs-on:/m.exec(JOBS[name]);
      assert.ok(condition, `${name} has no if`);
      assert.match(condition[1], /github\.ref == 'refs\/heads\/main'/, name);
    }
  });

  it('never persists the checkout token', () => {
    const checkouts = WORKFLOW.split('uses: actions/checkout@').slice(1);
    assert.equal(checkouts.length, 3);
    for (const checkout of checkouts) {
      assert.match(checkout.split('\n\n')[0], /persist-credentials: false/);
    }
  });
});

describe('the job the agent runs in', () => {
  it('can only read, and no step puts a GitHub token in the environment', () => {
    const job = JOBS[AGENT_JOB];
    assert.match(job, /\n {4}permissions:\n {6}contents: read\n {4}[a-z]/);
    assert.doesNotMatch(job, /GH_TOKEN|GITHUB_TOKEN|github\.token|DOCS_DRIFT_TOKEN/);
  });

  it('gives the agent the API key and nothing else secret', () => {
    const step = agentStep();
    assert.deepEqual(envNames(step.text).sort(), ['ADR_NUMBERS', 'ANTHROPIC_API_KEY']);
    assert.deepEqual(step.text.match(/secrets\.[A-Z_]+/g), ['secrets.ANTHROPIC_API_KEY']);
  });

  it('runs claude without a shell, web access, MCP servers or project settings', () => {
    const args = claudeArgs(agentStep().text);
    for (const flag of ['--restricted', '--strict-mcp-config', '--disable-slash-commands']) {
      assert.ok(args.includes(flag), `missing ${flag}`);
    }
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), { disableAllHooks: true });
    assert.deepEqual(flagValues(args, '--tools').sort(), ['Edit', 'Glob', 'Grep', 'Read', 'Write']);
    const denied = flagValues(args, '--disallowedTools');
    for (const tool of ['Bash', 'WebFetch', 'WebSearch', 'Read(//proc/**)']) {
      assert.ok(denied.includes(tool), `${tool} is not denied`);
    }
    assert.ok(!args.includes('--dangerously-skip-permissions'));
    assert.ok(!args.includes('--add-dir'));
  });

  it('allows edits only to docs/** and the pull request body file', () => {
    const allowed = flagValues(claudeArgs(agentStep().text), '--allowedTools');
    assert.deepEqual(allowed, ['Edit(/docs/**)', 'Edit(/.docs-drift/pr-body.md)']);
  });

  it('checks the change and searches it for the key before it leaves the job', () => {
    const names = steps(JOBS[AGENT_JOB]).map((step) => step.name);
    const at = (name) => names.indexOf(name);
    assert.ok(at('Correct the drift') < at('Check what the agent changed'));
    assert.ok(at('Check what the agent changed') < at('Refuse a change that contains the API key'));
    assert.ok(at('Refuse a change that contains the API key') < at('Upload the change'));
    const change = steps(JOBS[AGENT_JOB]).find((s) => s.name === 'Check what the agent changed');
    assert.match(change.text, COMMITTED_VALIDATOR);
    assert.doesNotMatch(change.text, /node scripts\/docs-drift-patch/);
  });
});

describe('the job that holds the write token', () => {
  const publish = () => steps(JOBS.publish);

  it('exposes the token to one step only, after the change is checked and committed', () => {
    const holders = Object.entries(JOBS).flatMap(([job, text]) =>
      steps(text)
        .filter((step) => /secrets\.DOCS_DRIFT_TOKEN }}/.test(step.text))
        .map((step) => `${job}/${step.name}`),
    );
    assert.deepEqual(holders, ['publish/Push and open the pull request']);
    const names = publish().map((step) => step.name);
    assert.ok(names.indexOf('Apply, check and format the change') < names.indexOf('Commit'));
    assert.ok(names.indexOf('Commit') < names.indexOf('Push and open the pull request'));
    assert.doesNotMatch(JOBS.publish, /\n {4}permissions:\n(?: {6}.*\n)* {6}contents: write/);
  });

  it('runs no agent, package code or hook while the token is in the environment', () => {
    const step = publish().find((s) => s.name === 'Push and open the pull request');
    const run = step.text.slice(step.text.indexOf('run: |'));
    assert.doesNotMatch(run, /claude|pnpm|npm|npx|node |git commit/);
    assert.match(run, /git -c core\.hooksPath=\/dev\/null \\/);
    assert.deepEqual(envNames(step.text).sort(), ['BRANCH', 'GH_TOKEN']);
  });

  it('checks the patch again in the job that pushes it', () => {
    const apply = publish().find((s) => s.name === 'Apply, check and format the change');
    assert.match(apply.text, COMMITTED_VALIDATOR);
    assert.doesNotMatch(apply.text, /node scripts\/docs-drift-patch/);
    const text = apply.text;
    assert.ok(text.indexOf('git show HEAD:') < text.indexOf('git apply --index'));
    assert.match(text, /git apply --index[^\n]*\n\s+node "\$check"/);
  });

  it('never merges and never calls a write endpoint through gh api', () => {
    assert.doesNotMatch(WORKFLOW, /gh pr merge|\/merge\b|gh api/);
    assert.doesNotMatch(WORKFLOW, /--auto\b|git push[^\n]*(--force|--delete|:refs\/heads\/main)/);
  });
});

describe('the open pull request guards', () => {
  it('count only pull requests from branches in this repository', () => {
    const guards = WORKFLOW.split('startswith("docs-drift/")').length - 1;
    assert.equal(guards, 2);
    const crossRepository = WORKFLOW.split('select(.isCrossRepository == false)').length - 1;
    assert.equal(crossRepository, 4);
  });

  it('require the pull request for the branch this run pushed, not any drift branch', () => {
    const require = steps(JOBS.publish).find((s) => s.name === 'Require the pull request');
    assert.match(require.text, /--head "\$BRANCH"/);
  });
});

describe('the prompt', () => {
  it('asks for no command the agent cannot run and no text it should not read', () => {
    assert.doesNotMatch(PROMPT, /`(?:git|gh|pnpm|node|jq) [^`]*`/);
    assert.doesNotMatch(PROMPT, /--json number,files|gh api/);
  });

  it('names the same tools the workflow gives the agent', () => {
    const tools = flagValues(claudeArgs(agentStep().text), '--tools');
    const sentence = /You have ([A-Za-z, ]+) and ([A-Za-z]+), and nothing else/.exec(PROMPT);
    assert.ok(sentence, 'the prompt no longer lists its tools');
    const named = [...sentence[1].split(', '), sentence[2]];
    assert.deepEqual(named.sort(), [...tools].sort());
  });
});

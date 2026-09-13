// Tests for the two commitlint configurations. Run with `pnpm test:scripts` (node:test).
//
// commitlint skips any message that matches one of its default ignore patterns and exits 0, so a
// pull request titled `revert everything I dislike` passed the `Commit messages` check and would
// have landed on `main` as that subject. `commitlint.squash.config.mjs` turns those patterns off
// for what lands on `main` (the pull request title and the push lint). `commitlint.config.mjs`
// keeps them for the local hook and the branch commits, which a squash merge discards.
//
// The tables run in-process through commitlint's own `load` and `lint`, with the options the CLI
// builds from a loaded config, because one CLI process costs about two seconds. A few real CLI
// runs, on stdin as the title step feeds it and over a git range as the push lint reads it, prove
// the CLI behaves the same way. The last two blocks pin the config the hook and each step use.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_CONFIG = 'commitlint.config.mjs';
const SQUASH_CONFIG = 'commitlint.squash.config.mjs';

// Neither package is a direct dependency, so they are imported from where the CLI imports them:
// pnpm links a package's dependencies next to it in the store.
const sibling = async (from, name, file) => {
  const dir = join(realpathSync(from), '..', name);
  return { dir, module: await import(pathToFileURL(join(dir, file)).href) };
};
const cli = join(root, 'node_modules', '@commitlint', 'cli');
const { module: loadModule } = await sibling(cli, 'load', 'lib/load.js');
const { dir: lintDir, module: lintModule } = await sibling(cli, 'lint', 'lib/lint.js');
const { module: isIgnoredDefaults } = await sibling(lintDir, 'is-ignored', 'lib/defaults.js');
// A commitlint release that reshapes these fails here, by name, not as a TypeError further down.
assert.equal(typeof loadModule.default, 'function', '@commitlint/load has no default export');
assert.equal(typeof lintModule.default, 'function', '@commitlint/lint has no default export');
assert.ok(Array.isArray(isIgnoredDefaults.wildcards), '@commitlint/is-ignored has no wildcards');

// Mirrors the options @commitlint/cli 21 builds in lib/cli.js before it calls `lint`.
const loadConfig = async (file) => {
  const loaded = await loadModule.default({}, { cwd: root, file });
  const parserOpts = loaded.parserPreset?.parserOpts;
  const opts = {
    parserOpts: typeof parserOpts === 'object' ? parserOpts : {},
    plugins: loaded.plugins ?? {},
    ignores: loaded.ignores ?? [],
    defaultIgnores: loaded.defaultIgnores !== false,
  };
  // stdin reaches the CLI with its trailing newline.
  return { loaded, lint: (message) => lintModule.default(`${message}\n`, loaded.rules, opts) };
};

// The title step lints a title as written and with the ` (#NN)` GitHub appends to the subject, so
// each shape is checked in both forms.
const withSuffix = (message) => message.replace(/^[^\r\n]*/, (header) => `${header} (#81)`);
const bothForms = (messages) => messages.flatMap((message) => [message, withSuffix(message)]);

const expectValid = async (config, messages, expected) => {
  const results = await Promise.all(messages.map(config.lint));
  const wrong = results
    .map((result, i) => ({ ...result, message: messages[i] }))
    .filter(({ valid }) => valid !== expected)
    .map(({ message, errors }) => `${JSON.stringify(message)}: ${errors.map((e) => e.name)}`);
  assert.deepEqual(wrong, [], `expected ${expected ? 'valid' : 'invalid'}`);
};

// At least one message per pattern in @commitlint/is-ignored's defaults, none of them conventional.
const DEFAULT_IGNORED = [
  'revert everything I dislike',
  'Revert stuff',
  'reapply stuff',
  'Reapply "stuff"',
  'fixup! whatever',
  'amend! whatever',
  'squash! whatever',
  "Merge branch 'x' into y",
  'Merge anything into anything',
  'Merge pull request #1 from someone/branch',
  "Merge remote-tracking branch 'origin/main'",
  'Merge tag v1.0.0',
  'Merged PR 5: whatever',
  'Merged x into y',
  'Automatic merge from x',
  'Auto-merged x into y',
  'v1.2.3',
  // The merge pattern is multiline, so a merge-shaped line anywhere in the body hides the subject.
  'update stuff\n\nMerge branch x',
  'update stuff\n\nMerge pull request',
];

const SHA = '0123456789abcdef0123456789abcdef01234567';

let base;
let squash;
before(async () => {
  [base, squash] = await Promise.all([loadConfig(BASE_CONFIG), loadConfig(SQUASH_CONFIG)]);
});

describe('the default-ignored shapes', () => {
  it('cover every pattern in the installed @commitlint/is-ignored defaults', () => {
    // A commitlint upgrade that adds a pattern fails here until the table has a message for it. The
    // patterns are bound functions with no readable source, so a miss is reported by its index.
    const { wildcards } = isIgnoredDefaults;
    assert.ok(wildcards.length > 0, 'no default ignore patterns found');
    const uncovered = wildcards
      .map((matches, index) => ({ index, covered: DEFAULT_IGNORED.some((m) => matches(m)) }))
      .filter(({ covered }) => !covered)
      .map(({ index }) => `wildcards[${index}] in @commitlint/is-ignored/lib/defaults.js`);
    assert.deepEqual(uncovered, []);
  });

  it('are skipped by commitlint.config.mjs, which is the hole being closed', async () => {
    await expectValid(base, DEFAULT_IGNORED, true);
  });
});

describe('commitlint.squash.config.mjs (the title and the push lint on main)', () => {
  it('keeps the rules and any ignores of commitlint.config.mjs', () => {
    assert.deepEqual(squash.loaded.rules, base.loaded.rules);
    assert.equal(squash.loaded.ignores.length, (base.loaded.ignores ?? []).length + 1);
  });

  it('fails every shape commitlint ignores by default, in both forms', async () => {
    await expectValid(squash, bothForms(DEFAULT_IGNORED), false);
  });

  it('passes a revert of a conventional header, as GitHub and git write it', async () => {
    await expectValid(
      squash,
      [
        ...bothForms([
          'Revert "feat: add thing"',
          'Revert "feat(web)!: add thing (#80)"',
          `Revert "feat: ${'a'.repeat(94)}"`,
          'Revert "Revert "feat: add thing (#80)" (#81)"',
          'Revert "Revert "feat: add thing""',
          'Reapply "feat: add thing"',
          'Revert "Reapply "feat: add thing""',
        ]),
        `Revert "feat: add thing"\n\nThis reverts commit ${SHA}.`,
        `Revert "feat: add thing" (#81)\r\n\r\nThis reverts commit ${SHA}.\r`,
      ],
      true,
    );
  });

  it('fails a revert of anything the rules would not pass', async () => {
    await expectValid(
      squash,
      bothForms([
        'Revert "update stuff"',
        'Revert ""',
        'Revert feat: x',
        'revert "feat: x"',
        'Revert "Revert "update stuff""',
        'Reapply "update stuff"',
        'Revert "wip: x"',
        'Revert "Feat: x"',
        'Revert "123: x"',
        'Revert "feat: x."',
        `Revert "feat: ${'a'.repeat(95)}"`,
        'Revert "feat: x" and more',
        'Revert "feat: x" and "y"',
        'Revert "feat: x" anything I like "',
      ]),
      false,
    );
  });

  it('lints a revert that carries any other body, so the body rules still apply', async () => {
    await expectValid(
      squash,
      [
        'Revert "feat: add thing" (#81)\n\nanything typed in the merge dialog',
        `Revert "feat: add thing" (#81)\n\n${'x'.repeat(101)}`,
        `Revert "feat: add thing"\n\nThis reverts commit ${SHA}.\n\nand more`,
      ],
      false,
    );
  });

  it('refuses a pathologically nested revert without overflowing the stack', async () => {
    // The ignore is called directly: commitlint's own parser needs minutes for a header this long,
    // which is commitlint's cost and not this exception's.
    const { default: config } = await import(pathToFileURL(join(root, SQUASH_CONFIG)).href);
    const ignoresRevert = config.ignores.at(-1);
    const depth = 20_000;
    assert.equal(ignoresRevert(`${'Revert "'.repeat(depth)}feat: x${'"'.repeat(depth)}\n`), false);
  });

  it('still passes a conventional subject and still fails a plain one', async () => {
    await expectValid(squash, bothForms(['feat: add thing', 'docs(adr): correct a record']), true);
    await expectValid(squash, bothForms(['update stuff']), false);
  });

  it('still applies the body rules to a commit pushed to main', async () => {
    await expectValid(squash, [`feat: add thing (#81)\n\n${'x'.repeat(101)}`], false);
  });
});

describe('commitlint.config.mjs (the local hook and the branch commits)', () => {
  it('keeps passing the branch-only shapes a squash merge discards', async () => {
    // `git commit --fixup` and friends, a merge commit from `git merge`, `git pull` or GitHub's
    // "Update branch", and `git revert`. Each runs the commit-msg hook locally or arrives in the
    // branch range, and none of them reaches `main`.
    await expectValid(
      base,
      [
        'fixup! feat: add thing',
        'amend! feat: add thing',
        'squash! feat: add thing',
        "Merge branch 'main' into ci/x",
        "Merge remote-tracking branch 'origin/main' into ci/x",
        `Revert "update stuff"\n\nThis reverts commit ${SHA}.`,
      ],
      true,
    );
  });

  it('still fails a plain subject', async () => {
    await expectValid(base, ['update stuff'], false);
  });
});

describe('the commitlint CLI', () => {
  const bin = join(root, 'node_modules', '.bin', 'commitlint');
  const run = (args, { input = '', cwd = root, env = process.env } = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd, env, timeout: 60_000 });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal, output }));
      // A child that exits before reading stdin fails the write with EPIPE; the exit code decides.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });

  // A missing or broken config exits 1 too, so a failure has to be a rule failure.
  const assertRuleFailure = ({ code, output }) => {
    assert.equal(code, 1, output);
    assert.match(output, /found [1-9]\d* problems?/);
  };
  const assertPass = ({ code, output }) => assert.equal(code, 0, output);

  it('reads the ignore settings from --config on stdin, as the title step runs it', async () => {
    const stdin = (config, title) => run(['--config', config], { input: `${title}\n` });
    const [strict, lax, revert] = await Promise.all([
      stdin(SQUASH_CONFIG, 'revert everything I dislike (#81)'),
      stdin(BASE_CONFIG, 'revert everything I dislike (#81)'),
      stdin(SQUASH_CONFIG, 'Revert "feat: add thing" (#81)'),
    ]);
    assertRuleFailure(strict);
    assertPass(lax);
    assertPass(revert);
  });

  describe('over a --from/--to range, as the push lint on main runs it', () => {
    let scratch;
    const sha = {};
    // Hermetic: no user or system git config (signing, hooks, templates), and git may not walk up
    // out of the scratch directory into a real repository.
    const env = () => ({
      ...process.env,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CEILING_DIRECTORIES: scratch,
    });
    const git = (...args) =>
      execFileSync(
        'git',
        ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid'].concat(
          ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'],
          args,
        ),
        { cwd: scratch, env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim();
    const commit = (message) => {
      git('commit', '-q', '--allow-empty', '--cleanup=verbatim', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    const range = (config, from, to) =>
      run(['--cwd', scratch, '--config', join(root, config), '--from', from, '--to', to], {
        env: env(),
      });

    before(() => {
      scratch = realpathSync(mkdtempSync(join(tmpdir(), 'commitlint-config-')));
      git('init', '-q');
      sha.base = commit('feat: base');
      sha.revert = commit('Revert "feat: base" (#81)');
      sha.fixup = commit('fixup! feat: base (#82)');
      sha.typedBody = commit('Revert "feat: base" (#83)\n\nanything typed in the merge dialog');
    });

    after(() => {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    });

    it('passes a revert and fails a default-ignored shape or a revert with a body', async () => {
      const [revert, fixup, fixupLax, typedBody] = await Promise.all([
        range(SQUASH_CONFIG, sha.base, sha.revert),
        range(SQUASH_CONFIG, sha.revert, sha.fixup),
        range(BASE_CONFIG, sha.revert, sha.fixup),
        range(SQUASH_CONFIG, sha.fixup, sha.typedBody),
      ]);
      assertPass(revert);
      assertRuleFailure(fixup);
      assertPass(fixupLax);
      assertRuleFailure(typedBody);
    });
  });
});

// Every line that runs commitlint, found as a command word (so `commitlint.squash.config.mjs` is
// not one), with comment lines dropped and backslash continuations joined first.
const COMMITLINT = /(?:^|[\s|;&(`/])commitlint(?=\s|$)/;
const shellLines = (text) =>
  text
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line));
const invocations = (lines) => lines.filter((line) => COMMITLINT.test(line));

describe('.husky/commit-msg', () => {
  it('lints with commitlint.config.mjs', () => {
    const lines = invocations(shellLines(readFileSync(join(root, '.husky', 'commit-msg'), 'utf8')));
    assert.ok(lines.length > 0, 'no commitlint invocation in the hook');
    for (const line of lines) assert.ok(!line.includes('--config'), line.trim());
  });
});

describe('.github/workflows/commitlint.yml', () => {
  const lines = shellLines(
    readFileSync(join(root, '.github', 'workflows', 'commitlint.yml'), 'utf8'),
  );
  // A step starts at a six-space `- `, named or not, and runs to the next one.
  const steps = [];
  for (const line of lines) {
    if (/^ {6}- /.test(line))
      steps.push({ name: line.match(/^ {6}- name: (.+)$/)?.[1], lines: [] });
    steps.at(-1)?.lines.push(line);
  }
  const step = (name) => {
    const found = steps.filter((s) => s.name === name);
    assert.equal(found.length, 1, `expected exactly one step named "${name}"`);
    return found[0];
  };
  const TITLE = 'Lint the pull request title';
  const BRANCH = 'Lint every commit on the branch';
  const PUSH = 'Lint every commit pushed to main';

  it('lints what lands on main with the squash config, in every invocation', () => {
    for (const name of [TITLE, PUSH]) {
      const found = invocations(step(name).lines);
      assert.ok(found.length > 0, `no commitlint invocation in "${name}"`);
      for (const line of found) {
        assert.match(line, /--config commitlint\.squash\.config\.mjs\s/, `${name}: ${line.trim()}`);
      }
    }
  });

  it('lints the branch commits with the default config', () => {
    const found = invocations(step(BRANCH).lines);
    assert.ok(found.length > 0, `no commitlint invocation in "${BRANCH}"`);
    for (const line of found) assert.ok(!line.includes('--config'), line.trim());
  });

  it('runs commitlint in no other step', () => {
    const elsewhere = steps
      .filter((s) => ![TITLE, BRANCH, PUSH].includes(s.name))
      .flatMap((s) =>
        invocations(s.lines).map((line) => `${s.name ?? '(unnamed)'}: ${line.trim()}`),
      );
    assert.deepEqual(elsewhere, []);
  });

  it('lets no lint failure through and runs the title and push lints on their events', () => {
    const text = lines.join('\n');
    assert.doesNotMatch(text, /continue-on-error/);
    assert.doesNotMatch(text, /\|\|\s*true\b/);
    assert.doesNotMatch(text, /\bexit 0\b/);
    assert.ok(step(TITLE).lines.some((line) => line.trim() === 'exit "$status"'));
    assert.ok(step(TITLE).lines.includes("        if: github.event_name == 'pull_request'"));
    assert.ok(step(PUSH).lines.includes("        if: github.event_name == 'push'"));
  });
});

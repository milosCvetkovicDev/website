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
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_CONFIG = 'commitlint.config.mjs';
const SQUASH_CONFIG = 'commitlint.squash.config.mjs';

// Neither package is a direct dependency, so they are imported from where the CLI imports them:
// pnpm links a package's dependencies next to it in the store. A file that moves fails its import
// with the path; an export that changes shape fails the assertions below by name.
const sibling = async (from, name, file) => {
  const dir = join(realpathSync(from), '..', name);
  return { dir, module: await import(pathToFileURL(join(dir, file)).href) };
};
const cli = join(root, 'node_modules', '@commitlint', 'cli');
const { module: loadModule } = await sibling(cli, 'load', 'lib/load.js');
const { dir: lintDir, module: lintModule } = await sibling(cli, 'lint', 'lib/lint.js');
const { module: isIgnoredDefaults } = await sibling(lintDir, 'is-ignored', 'lib/defaults.js');
assert.equal(typeof loadModule.default, 'function', '@commitlint/load has no default export');
assert.equal(typeof lintModule.default, 'function', '@commitlint/lint has no default export');
assert.ok(Array.isArray(isIgnoredDefaults.wildcards), '@commitlint/is-ignored has no wildcards');

// `loadConfig` mirrors the options @commitlint/cli 21 builds in lib/cli.js. A new major has to be
// checked against that file before this number moves.
const cliVersion = JSON.parse(
  readFileSync(join(realpathSync(cli), 'package.json'), 'utf8'),
).version;
assert.equal(cliVersion.split('.')[0], '21', `@commitlint/cli ${cliVersion}: re-check loadConfig`);

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

// The revert exception itself, for inputs too long to put through commitlint's parser, which
// needs minutes for a header of a hundred kilobytes.
const { default: squashModule } = await import(pathToFileURL(join(root, SQUASH_CONFIG)).href);
const ignoresRevert = squashModule.ignores.at(-1);

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
        'Revert "feat: add thing" (#81)\n\nCo-authored-by: Someone Else <someone@example.invalid>',
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
        'Revert "feat: x. (#80)"',
        'Revert "feat:  "',
        'Revert "feat: x "',
        'Revert "feat: x. "',
        'Revert "feat: x "',
        'Revert "feat: Add thing"',
        `Revert "feat: ${'a'.repeat(95)}"`,
        `Revert "feat: ${'a'.repeat(94)} (#80)"`,
        'Revert "feat: x" and more',
        'Revert "feat: x" and "y"',
        'Revert "feat: x" anything I like "',
      ]),
      false,
    );
  });

  it('agrees with the rules on every wrapped header in its table', async () => {
    // The rules are the oracle: a header passes when it lints as a title in both forms.
    const headers = [
      'feat: add thing',
      'fix(web)!: add thing',
      'fix: a',
      `feat: ${'a'.repeat(88)}`,
      `feat: ${'a'.repeat(95)}`,
      'feat: x.',
      'feat: ',
      'feat:  ',
      'feat: x ',
      'feat: x ',
      'wip: x',
      'Feat: x',
      'feat: Add thing',
      'feat: ADD THING',
      'feat: API change',
      'feat: iOS support',
      'feat: 2FA login',
      'feat: _private field',
    ];
    const disagreements = [];
    for (const header of headers) {
      const rules =
        (await squash.lint(header)).valid && (await squash.lint(withSuffix(header))).valid;
      const exception = ignoresRevert(`Revert "${header}"\n`);
      if (rules !== exception) {
        disagreements.push(`${JSON.stringify(header)}: rules ${rules}, exception ${exception}`);
      }
    }
    assert.deepEqual(disagreements, []);
  });

  it('reads type-enum and header-max-length as commitlint loads them', () => {
    const types = squash.loaded.rules['type-enum'][2];
    const max = squash.loaded.rules['header-max-length'][2];
    assert.ok(types.length > 0, 'no types loaded');
    for (const type of types) assert.equal(ignoresRevert(`Revert "${type}: x"\n`), true, type);
    assert.equal(ignoresRevert('Revert "notatype: x"\n'), false);
    const header = (length) => `feat: ${'a'.repeat(length - 'feat: '.length)}`;
    assert.equal(ignoresRevert(`Revert "${header(max)}"\n`), true);
    assert.equal(ignoresRevert(`Revert "${header(max + 1)}"\n`), false);
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

  it('unwraps nesting up to 1000 characters and refuses anything longer at once', () => {
    // `Revert "` and `"` add nine characters a level: 110 levels around a 10-character header come
    // to exactly 1000.
    const nest = (depth, core) => `${'Revert "'.repeat(depth)}${core}${'"'.repeat(depth)}`;
    assert.equal(nest(110, 'feat: abcd').length, 1000);
    assert.equal(ignoresRevert(`${nest(110, 'feat: abcd')}\n`), true);
    assert.equal(ignoresRevert(`${nest(110, 'feat: abcde')}\n`), false);
    assert.equal(ignoresRevert(`${nest(20_000, 'feat: x')}\n`), false);
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
  // An empty range exits 0 having read nothing, so a pass has to report each message it linted.
  const assertLinted = ({ code, output }, messages) => {
    assert.equal(code, 0, output);
    assert.equal(output.match(/found 0 problems/g)?.length ?? 0, messages, output);
  };

  it('reads the ignore settings from --config on stdin, as the title step runs it', async () => {
    const stdin = (config, title) =>
      run(['--config', config, '--verbose'], { input: `${title}\n` });
    const [strict, lax, revert] = await Promise.all([
      stdin(SQUASH_CONFIG, 'revert everything I dislike (#81)'),
      stdin(BASE_CONFIG, 'revert everything I dislike (#81)'),
      stdin(SQUASH_CONFIG, 'Revert "feat: add thing" (#81)'),
    ]);
    assertRuleFailure(strict);
    assertLinted(lax, 1);
    assertLinted(revert, 1);
  });

  describe('in a git repository, as the push lint on main runs it', () => {
    let scratch;
    const sha = {};
    // Hermetic: no inherited GIT_* variable (git exports GIT_DIR to hooks, and it would point these
    // commits at the real repository), no user or system git config (signing, hooks, templates),
    // and no walking up out of the scratch directory.
    const env = () => ({
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
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
      );
    const commit = (message) => {
      git('commit', '-q', '--allow-empty', '--cleanup=verbatim', '-m', message);
      return git('rev-parse', 'HEAD').trim();
    };
    // As the workflow runs it: from the repository root, with the config path relative to it.
    const lintHere = (config, args, input) =>
      run(['--config', config, '--verbose', ...args], { cwd: scratch, env: env(), input });

    before(() => {
      scratch = realpathSync(mkdtempSync(join(tmpdir(), 'commitlint-config-')));
      for (const file of [BASE_CONFIG, SQUASH_CONFIG]) {
        copyFileSync(join(root, file), join(scratch, file));
      }
      symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'));
      git('init', '-q');
      sha.base = commit('feat: base');
      sha.revert = commit('Revert "feat: base" (#81)');
      sha.fixup = commit('fixup! feat: base (#82)');
      sha.typedBody = commit('Revert "feat: base" (#83)\n\nanything typed in the merge dialog');
    });

    after(() => {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    });

    it('lints every commit of a --from/--to range', async () => {
      const range = (config, from, to) => lintHere(config, ['--from', from, '--to', to]);
      const [revert, fixup, fixupLax, typedBody, both] = await Promise.all([
        range(SQUASH_CONFIG, sha.base, sha.revert),
        range(SQUASH_CONFIG, sha.revert, sha.fixup),
        range(BASE_CONFIG, sha.revert, sha.fixup),
        range(SQUASH_CONFIG, sha.fixup, sha.typedBody),
        range(SQUASH_CONFIG, sha.base, sha.fixup),
      ]);
      assertLinted(revert, 1);
      assertRuleFailure(fixup);
      assertLinted(fixupLax, 1);
      assertRuleFailure(typedBody);
      assertRuleFailure(both);
    });

    it('lints the tip read with git log, as it does when the push created the branch', async () => {
      const tip = (ref) => lintHere(SQUASH_CONFIG, [], git('log', '-1', '--format=%B', ref));
      const [revert, typedBody] = await Promise.all([tip(sha.revert), tip(sha.typedBody)]);
      assertLinted(revert, 1);
      assertRuleFailure(typedBody);
    });
  });
});

// Every line that runs commitlint, found as a command word (so `commitlint.squash.config.mjs` is
// not one and `@commitlint/cli` is), with comment lines dropped before backslash continuations are
// joined: a comment ends at its newline, whatever it ends with.
const COMMITLINT = /(?:^|[\s|;&(`/@])commitlint(?=[\s/]|$)/;
const shellLines = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .replace(/\\\n\s*/g, ' ')
    .split('\n');
const invocations = (lines) => lines.filter((line) => COMMITLINT.test(line));
// Every config a line passes, through `--config` or its alias `-g`, with a space or `=`.
const configsOf = (line) =>
  [...line.matchAll(/(?:^|\s)(?:--config|-g)(?:=|\s+)(\S+)/g)].map((match) => match[1]);

describe('.husky/commit-msg', () => {
  it('lints with commitlint.config.mjs', () => {
    const lines = invocations(shellLines(readFileSync(join(root, '.husky', 'commit-msg'), 'utf8')));
    assert.ok(lines.length > 0, 'no commitlint invocation in the hook');
    for (const line of lines) assert.deepEqual(configsOf(line), [], line.trim());
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
  const found = (name) => {
    const lines = invocations(step(name).lines);
    assert.ok(lines.length > 0, `no commitlint invocation in "${name}"`);
    return lines;
  };

  it('lints what lands on main with the squash config, in every invocation', () => {
    for (const name of [TITLE, PUSH]) {
      for (const line of found(name)) {
        assert.deepEqual(configsOf(line), [SQUASH_CONFIG], `${name}: ${line.trim()}`);
      }
    }
  });

  it('lints the branch commits with the default config', () => {
    for (const line of found(BRANCH)) assert.deepEqual(configsOf(line), [], line.trim());
  });

  it('runs commitlint in no other step', () => {
    const elsewhere = steps
      .filter((s) => ![TITLE, BRANCH, PUSH].includes(s.name))
      .flatMap((s) =>
        invocations(s.lines).map((line) => `${s.name ?? '(unnamed)'}: ${line.trim()}`),
      );
    assert.deepEqual(elsewhere, []);
    assert.doesNotMatch(lines.join('\n'), /uses:.*commitlint/i);
  });

  it('lets no lint failure through', () => {
    const text = lines.join('\n');
    assert.doesNotMatch(text, /continue-on-error/);
    assert.doesNotMatch(text, /\bexit 0\b/);
    // The title step collects both results and exits with them; nothing else may follow a lint.
    for (const line of found(TITLE))
      assert.match(line, /\| pnpm exec commitlint [^|;]*\|\| status=1$/);
    assert.ok(step(TITLE).lines.some((line) => line.trim() === 'exit "$status"'));
    for (const line of [...found(BRANCH), ...found(PUSH)]) {
      assert.doesNotMatch(line, /\|\||;|&&/, line.trim());
    }
    assert.ok(step(PUSH).lines.some((line) => line.trim() === 'set -o pipefail'));
  });

  it('runs on a retitle and on a push to main, and each lint on its own event', () => {
    assert.ok(lines.includes('    types: [opened, edited, synchronize, reopened]'));
    assert.ok(lines.includes('    branches: [main]'));
    assert.ok(step(TITLE).lines.includes("        if: github.event_name == 'pull_request'"));
    assert.ok(step(PUSH).lines.includes("        if: github.event_name == 'push'"));
  });
});

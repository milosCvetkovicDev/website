// Tests for the two commitlint configurations. Run with `pnpm test:scripts` (node:test).
//
// commitlint skips any message that matches one of its default ignore patterns and exits 0, so a
// pull request titled `revert everything I dislike` passed the `Commit messages` check and would
// have landed on `main` as that subject. `commitlint.squash.config.mjs` turns those patterns off for
// what lands on `main` (the pull request title and the push lint). `commitlint.config.mjs` keeps
// them for the local hook and the branch commits, which a squash merge discards.
//
// The tables run in-process through commitlint's own `load` and `lint`, with the options the CLI
// builds from a loaded config, because one CLI process costs about two seconds. Two real CLI runs at
// the end prove the CLI reads the config the same way.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';
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

// Mirrors the options @commitlint/cli 21 builds in lib/cli.js before it calls `lint`.
const linterFor = async (file) => {
  const loaded = await loadModule.default({}, { cwd: root, file });
  const parserOpts = loaded.parserPreset?.parserOpts;
  const opts = {
    parserOpts: typeof parserOpts === 'object' ? parserOpts : {},
    plugins: loaded.plugins ?? {},
    ignores: loaded.ignores ?? [],
    defaultIgnores: loaded.defaultIgnores !== false,
  };
  // stdin reaches the CLI with its trailing newline.
  return (message) => lintModule.default(`${message}\n`, loaded.rules, opts);
};

// The title step lints a title as written and with the ` (#NN)` GitHub appends, so each shape is
// checked in both forms.
const bothForms = (messages) => messages.flatMap((message) => [message, `${message} (#81)`]);

const expectValid = async (linter, messages, expected) => {
  const results = await Promise.all(messages.map(linter));
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
  'update stuff (#81)\n\nMerge branch x',
  'update stuff (#81)\n\nMerge pull request',
];

let base;
let squash;
before(async () => {
  [base, squash] = await Promise.all([linterFor(BASE_CONFIG), linterFor(SQUASH_CONFIG)]);
});

describe('the default-ignored shapes', () => {
  it('cover every pattern in the installed @commitlint/is-ignored defaults', () => {
    // A commitlint upgrade that adds a pattern fails here until the table has a message for it.
    const { wildcards } = isIgnoredDefaults;
    assert.ok(wildcards.length > 0, 'no default ignore patterns found');
    const uncovered = wildcards.filter((matches) => !DEFAULT_IGNORED.some((m) => matches(m)));
    assert.deepEqual(uncovered.map(String), []);
  });

  it('are skipped by commitlint.config.mjs, which is the hole being closed', async () => {
    await expectValid(base, DEFAULT_IGNORED, true);
  });
});

describe('commitlint.squash.config.mjs (the title and the push lint on main)', () => {
  it('fails every shape commitlint ignores by default, in both forms', async () => {
    await expectValid(squash, bothForms(DEFAULT_IGNORED), false);
  });

  it('fails a GitHub-shaped revert of something that was not conventional', async () => {
    await expectValid(
      squash,
      bothForms([
        'Revert "update stuff"',
        'Revert ""',
        'Revert "feat: x" and more',
        'Revert feat: x',
        'revert "feat: x"',
        'Revert "Revert "update stuff""',
      ]),
      false,
    );
  });

  it("passes GitHub's own revert title, as the pull request title and as the squash subject", async () => {
    await expectValid(
      squash,
      bothForms([
        'Revert "feat: add thing"',
        'Revert "feat(web)!: add thing (#80)"',
        'Revert "Revert "feat: add thing (#80)" (#81)"',
        'Revert "Revert "feat: add thing""',
      ]),
      true,
    );
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
        'Revert "feat: add thing"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567.',
      ],
      true,
    );
  });

  it('still fails a plain subject', async () => {
    await expectValid(base, ['update stuff'], false);
  });
});

describe('the commitlint CLI', () => {
  const run = (config, message) =>
    new Promise((resolve, reject) => {
      const child = spawn(join(root, 'node_modules', '.bin', 'commitlint'), ['--config', config], {
        cwd: root,
      });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
      child.stdin.end(`${message}\n`);
    });

  it('reads the ignore settings from --config as the tables above assume', async () => {
    const title = 'revert everything I dislike (#81)';
    const [strict, lax] = await Promise.all([run(SQUASH_CONFIG, title), run(BASE_CONFIG, title)]);
    // A missing or broken config exits 1 too, so the failure has to be a rule failure.
    assert.equal(strict.code, 1, strict.output);
    assert.match(strict.output, /found [1-9]\d* problems?/);
    assert.equal(lax.code, 0, lax.output);
  });
});

describe('.github/workflows/commitlint.yml', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'commitlint.yml'), 'utf8');
  const invocations = (name) => {
    const start = workflow.indexOf(`- name: ${name}\n`);
    assert.notEqual(start, -1, `step "${name}" not found`);
    const next = workflow.indexOf('\n      - name: ', start + 1);
    const lines = workflow
      .slice(start, next === -1 ? undefined : next)
      .split('\n')
      .filter((line) => line.includes('pnpm exec commitlint'));
    assert.ok(lines.length > 0, `no commitlint invocation in "${name}"`);
    return lines;
  };

  it('lints what lands on main with the squash config, in every invocation', () => {
    for (const name of ['Lint the pull request title', 'Lint every commit pushed to main']) {
      for (const line of invocations(name)) {
        assert.ok(line.includes(`--config ${SQUASH_CONFIG} `), `${name}: ${line.trim()}`);
      }
    }
  });

  it('lints the branch commits with the default config', () => {
    for (const line of invocations('Lint every commit on the branch')) {
      assert.ok(!line.includes('--config'), line.trim());
    }
  });
});

// Tests for the two PreToolUse guards in .claude/settings.json. Run with `pnpm test:scripts`.
//
// The guards are shell one-liners inside a JSON file, so nothing type-checks them and nothing runs
// them until an agent trips one. This is a table of what they do today, row by row, gaps and false
// positives included, and the hooks bullet in .claude/rules/claude-code-config.md describes exactly
// these rows. A guard change that alters any row's result fails that row. A change that only reaches
// inputs no row sends, such as a new protected path or command word, passes until a row is added for
// it, so a PR that changes a guard adds its rows and updates that bullet in the same change.
//
// Task 50 is .claude/epics/audit-remediation-2026-09/50.md: its finding tooling-11 and its
// acceptance criterion AC 22 ask for this table. The owner's decision D4 (2026-09-17) kept both
// guards as they are, false positives included, instead of making the narrowing that 50.md's
// Technical Details prescribe; 50.md does not record D4 yet. Every row pins today's result, and a
// row whose status differs from what AC 22 asks for says so beside it.
//
// What Claude Code does with a hook, per https://code.claude.com/docs/en/hooks: a command hook runs
// through `sh -c` on macOS and Linux with CLAUDE_PROJECT_DIR exported; a PreToolUse hook that exits
// 2 blocks the tool call; stdout that starts with `{` and ends with `}` is read as JSON, which can
// carry a permission decision; a matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|`
// is a list of exact tool names, and any other matcher is an unanchored regular expression; and the
// hooks of user, project and local settings all run. Only the committed project settings are
// visible here.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The `sh` the hooks reference names. /bin/sh is dash on GitHub's ubuntu runners and bash in POSIX
// mode on macOS, which is what Claude Code gets on each.
const sh = '/bin/sh';

/** @typedef {{ matcher?: string, hooks?: { type?: string, command?: string }[] }} HookEntry */
/**
 * `unread` is true when writing the payload failed with EPIPE, because the guard exited first.
 *
 * @typedef {{ status: number | null, stdout: string, stderr: string, unread: boolean }} GuardResult
 */

/**
 * The PreToolUse entries of .claude/settings.json. Read inside a hook rather than at load time, so
 * a broken settings file fails each suite with this message instead of aborting the whole file.
 *
 * @returns {HookEntry[]}
 */
function preToolUseEntries() {
  /** @type {{ hooks?: { PreToolUse?: unknown } } | null} */
  const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
  const entries = settings?.hooks?.PreToolUse;
  assert.ok(Array.isArray(entries), '.claude/settings.json has no hooks.PreToolUse array');
  return entries;
}

/**
 * Whether a PreToolUse matcher reaches a tool, by the hooks reference's rules.
 *
 * @param {string | undefined} matcher
 * @param {string} toolName
 */
function matcherReaches(matcher, toolName) {
  if (matcher === undefined || matcher === '' || matcher === '*') return true;
  if (/^[A-Za-z0-9_ ,|-]+$/.test(matcher)) {
    return matcher.split(/[|,]/).some((name) => name.trim() === toolName);
  }
  return new RegExp(matcher).test(toolName);
}

/**
 * The single command the PreToolUse entry registered for exactly this matcher runs.
 *
 * @param {string} matcher
 * @returns {string}
 */
function guardCommand(matcher) {
  const entries = preToolUseEntries().filter((entry) => entry.matcher === matcher);
  assert.equal(entries.length, 1, `expected exactly one PreToolUse entry for ${matcher}`);
  const hooks = entries[0].hooks ?? [];
  assert.equal(hooks.length, 1, `expected exactly one hook for ${matcher}`);
  assert.equal(hooks[0].type, 'command', `expected a command hook for ${matcher}`);
  const { command } = hooks[0];
  assert.ok(typeof command === 'string', `expected a command string for ${matcher}`);
  return command;
}

/** @param {string} path */
function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first executable file called `name` on this process's PATH, as an absolute path.
 *
 * @param {string} name
 * @returns {string | null}
 */
function which(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue;
    const candidate = resolve(dir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Splits a guard into the directories its leading `PATH="...:$PATH";` assignment puts in front of
 * the inherited PATH, and the rest of the command.
 *
 * @param {string} command
 * @returns {{ dirs: string[], body: string }}
 */
function splitPathAssignment(command) {
  const match = /^PATH="((?:[^":$]+:)*)\$PATH";\s*/.exec(command);
  assert.ok(
    match,
    `expected the guard to start with PATH="<dirs>:$PATH"; (${command.slice(0, 60)})`,
  );
  return { dirs: match[1].split(':').filter(Boolean), body: command.slice(match[0].length) };
}

/**
 * Fails the suite unless the guard can find jq. Without it the Bash guard allows everything and the
 * Edit|Write guard blocks everything, so no row would say anything about the patterns.
 *
 * @param {string} command
 */
function assertFindsJq(command) {
  const { dirs } = splitPathAssignment(command);
  assert.ok(
    which('jq') !== null || dirs.some((dir) => isExecutableFile(join(dir, 'jq'))),
    'jq is not on PATH: install it, or these rows mean nothing',
  );
}

/**
 * The environment a guard runs in. Only PATH and HOME are inherited, so a developer's GREP_OPTIONS
 * or other variables cannot change a row. PATH still decides which jq, grep and sed the guard runs
 * (after the guard's own PATH assignment), so the rows are pinned against whatever this machine has:
 * BSD grep and sed on macOS, GNU on GitHub's ubuntu runner. Claude Code passes on the user's own
 * locale, so every row of the two tables runs twice, under the C locale and under a UTF-8 one.
 *
 * @param {string | undefined} path
 * @param {string} [locale]
 * @returns {NodeJS.ProcessEnv}
 */
const guardEnv = (path, locale = 'C') => ({
  PATH: path,
  HOME: process.env.HOME,
  LC_ALL: locale,
  CLAUDE_PROJECT_DIR: repoRoot,
});

/** @type {string | undefined} */
let utf8LocaleName;

/**
 * The name this machine gives the UTF-8 locale the rows run under a second time: `C.UTF-8` where it
 * exists (`C.utf8` on Linux), else `en_US.UTF-8`. Fails the suite when neither is installed, since
 * a missing locale would silently fall back to C and the second run would repeat the first.
 */
function utf8Locale() {
  if (utf8LocaleName !== undefined) return utf8LocaleName;
  const listed = spawnSync('locale', ['-a'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(listed.status, 0, `locale -a failed: ${listed.stderr}`);
  const installed = listed.stdout.split('\n').map((name) => name.trim());
  /** @param {string} name */
  const normalise = (name) => name.toLowerCase().replace('-', '');
  for (const wanted of ['c.utf8', 'en_us.utf8']) {
    const found = installed.find((name) => normalise(name) === wanted);
    if (found !== undefined) return (utf8LocaleName = found);
  }
  assert.fail('neither C.UTF-8 nor en_US.UTF-8 is installed (locale -a)');
}

/**
 * Runs a guard the way Claude Code runs a command hook: through `sh -c`, with `stdin` as the hook's
 * payload and CLAUDE_PROJECT_DIR set to the repository root.
 *
 * @param {string} command
 * @param {string} stdin
 * @param {string | undefined} [path] the PATH to run with, in place of this process's
 * @param {string} [locale]
 * @param {boolean} [mayExitUnread] whether the guard may exit before it reads its payload
 * @returns {GuardResult}
 */
function runGuardOnStdin(
  command,
  stdin,
  path = process.env.PATH,
  locale = 'C',
  mayExitUnread = false,
) {
  const result = spawnSync(sh, ['-c', command], {
    input: stdin,
    encoding: 'utf8',
    cwd: repoRoot,
    env: guardEnv(path, locale),
    timeout: 30_000,
  });
  // A guard that exits before it reads its payload, as both do without jq, makes the write fail
  // with EPIPE whenever it wins the race; its status and stderr are still its own. Anywhere else an
  // unread payload is a guard deciding without its input, so it fails.
  const unread = /** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === 'EPIPE';
  if (!(unread && mayExitUnread)) {
    assert.equal(result.error, undefined, String(result.error));
  }
  assert.equal(result.signal, null, `the guard was killed by ${result.signal}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr.trim(), unread };
}

/**
 * Runs a guard on the JSON payload Claude Code sends for one tool call.
 *
 * @param {string} command
 * @param {'Bash' | 'Edit' | 'Write'} toolName
 * @param {Record<string, unknown>} toolInput
 * @param {string | undefined} [path] the PATH to run with, in place of this process's
 * @param {string} [locale]
 * @param {boolean} [mayExitUnread] whether the guard may exit before it reads its payload
 * @returns {GuardResult}
 */
function runGuard(
  command,
  toolName,
  toolInput,
  path = process.env.PATH,
  locale = 'C',
  mayExitUnread = false,
) {
  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    cwd: repoRoot,
  };
  return runGuardOnStdin(command, JSON.stringify(payload), path, locale, mayExitUnread);
}

/**
 * Claude Code sends absolute paths. A row spelled `$CLAUDE_PROJECT_DIR/...` is sent as one, and
 * keeps that spelling in its test name so the output carries no machine's own paths.
 *
 * @param {string} spelled
 */
const expandProjectDir = (spelled) =>
  spelled.replace(/^\$CLAUDE_PROJECT_DIR(?=\/)/, () => repoRoot);

const blockedByBash =
  'BLOCK: this command would modify a protected file (.env*, pnpm-lock.yaml); use pnpm install or ask';

/**
 * Asserts one row: its exit status, nothing on stdout, and a block message only when it blocks.
 *
 * @param {GuardResult} result
 * @param {0 | 2} expected
 * @param {string} blockMessage
 * @param {string} [label] the conditions the row ran under, for the failure message
 */
function assertRow({ status, stdout, stderr }, expected, blockMessage, label = '') {
  const where = label === '' ? '' : ` under ${label}`;
  assert.equal(
    status,
    expected,
    `expected exit ${expected}, got ${status}${where} (stderr: ${stderr})`,
  );
  // Output shaped like JSON can allow or deny the call whatever an exit 0 says; neither guard
  // prints any.
  assert.equal(
    stdout,
    '',
    `the guard printed to stdout${where}, which Claude Code may read as a decision`,
  );
  assert.equal(stderr, expected === 2 ? blockMessage : '', `stderr${where}`);
}

/**
 * Asserts one row under the C locale and again under a UTF-8 one.
 *
 * @param {(locale: string) => GuardResult} run
 * @param {0 | 2} expected
 * @param {string} blockMessage
 */
function assertRowInBothLocales(run, expected, blockMessage) {
  for (const locale of ['C', utf8Locale()]) {
    assertRow(run(locale), expected, blockMessage, `LC_ALL=${locale}`);
  }
}

describe('the PreToolUse entries in .claude/settings.json', () => {
  // Every entry whose matcher reaches a tool runs on its calls, so a second entry reaching Bash, Edit
  // or Write would change what the rows below describe without failing any of them.
  /** @type {[toolName: string, matchers: string[]][]} */
  const reach = [
    ['Bash', ['Bash']],
    ['Edit', ['Edit|Write']],
    ['Write', ['Edit|Write']],
    // Tools that also write files, which no entry reaches. The tools reference lists no MultiEdit.
    ['NotebookEdit', []],
    ['PowerShell', []],
  ];

  for (const [toolName, expected] of reach) {
    it(`reach ${toolName} through ${expected.length === 0 ? 'no entry' : expected.join(', ')}`, () => {
      const matchers = preToolUseEntries()
        .filter((entry) => matcherReaches(entry.matcher, toolName))
        .map((entry) => String(entry.matcher));
      assert.deepEqual(matchers, expected);
    });
  }
});

describe('the Bash PreToolUse guard', () => {
  let guard = '';

  before(() => {
    guard = guardCommand('Bash');
    assertFindsJq(guard);
    utf8Locale();
  });

  /** @type {[command: string, status: 0 | 2][]} */
  const rows = [
    // AC 22's five payloads, spelled as it spells them
    // (.claude/epics/audit-remediation-2026-09/50.md).
    //
    // Known false positive, accepted under D4: AC 22 expects 0 here. The `.*` between the command
    // word and the protected name runs across `;`, so removing an unrelated file first turns a read
    // of `.env.local` into a blocked command.
    ['rm -f build.log; grep NEXT_PUBLIC apps/web/.env.local', 2],
    ['git restore pnpm-lock.yaml', 0],
    ['rm .env', 2],
    ['echo x > apps/web/.env.local', 2],
    ["sed -i '' s/a/b/ pnpm-lock.yaml", 2],

    // The same known false positive, also accepted under D4. The `.*` runs across `&&`, `|` and
    // quotes, and the command word counts wherever it stands on the line, as an argument or inside
    // a commit message too.
    ['rm -f build.log && cat apps/web/.env.local', 2],
    ['rm -rf .next | grep pnpm-lock.yaml', 2],
    ['mv a b; grep X apps/web/.env.local', 2],
    ['grep -e rm apps/web/.env.local', 2],
    ['git commit -m "chore: rm stale dep, refresh pnpm-lock.yaml"', 2],
    // A command word inside a longer word does not count, at either end, but any other character
    // before or after it does: a path, a backslash, a `-`.
    ['grep confirm apps/web/.env.local', 0],
    ['rmdir .envdir', 0],
    ['mvn -f .env', 0],
    ['/bin/rm .env', 2],
    ['\\rm .env', 2],
    ['rm-x .env', 2],
    // The name is matched as text, not as a file name, so `process.env` and `import.meta.env` count
    // too, and so does a line inside a heredoc.
    ["sed -i '' s/process.env.FOO/BAR/ apps/web/src/lib/site.ts", 2],
    ['rm -rf .next && grep -rn process.env apps/web/src', 2],
    ['cp a b && grep -rn import.meta.env apps/web/src', 2],
    ["cat <<'EOF' > notes.txt\nthen sed -i the pnpm-lock.yaml\nEOF", 2],

    // grep matches line by line: a write on a line of its own is caught, and the false positive
    // stops at a newline.
    ['true\nrm .env', 2],
    ['rm -f build.log\ncat apps/web/.env.local', 0],

    // The other writes the pattern names: mv, cp, tee, truncate, sed whose first argument starts
    // with `-i`, perl whose first argument is a flag cluster containing `i`, and a `>` whose target
    // word contains the name.
    ['mv /tmp/x .env', 2],
    ['cp /tmp/x pnpm-lock.yaml', 2],
    ['tee .env.local < /tmp/x', 2],
    ['truncate -s 0 .env', 2],
    ['sed -i s/a/b/ .env', 2],
    ['sed -i.bak s/a/b/ .env', 2],
    ['perl -pi -e s/a/b/ .env', 2],
    ['perl -i -pe s/a/b/ .env', 2],
    ['echo x >> .env', 2],
    ['echo x>.env', 2],
    ['echo x 2> .env', 2],
    ['echo x &> .env', 2],
    ['echo x >|.env', 2],
    ['cat /tmp/x > pnpm-lock.yaml', 2],
    ['git rm .env', 2],
    // Blunter than the Edit|Write guard: any name that contains `.env` counts, `.envrc` included.
    ['rm .envrc', 2],
    // `.env.example` is deleted from the command before the match, which then sees
    // `cp  apps/web/.env.local`: the copy deploy-and-next-config.md leaves to the owner.
    ['cp .env.example apps/web/.env.local', 2],

    // Allowed: reads, sed without `-i` among them, a redirect into an unprotected file,
    // `.env.example` itself, and git's own ways to undo a lockfile change, which do write it.
    ['sed s/a/b/ .env', 0],
    ['cat apps/web/.env.local', 0],
    ['cat .env > /dev/null', 0],
    ['git diff origin/main -- pnpm-lock.yaml > lock.diff', 0],
    ['cp .env.example apps/web/.env.example', 0],
    ['git checkout -- pnpm-lock.yaml', 0],
    ['git checkout origin/main -- pnpm-lock.yaml', 0],

    // Writes the pattern cannot see. These are examples, not a complete list.
    ["node -e \"require('fs').writeFileSync('.env','x')\"", 0],
    ['ln -sf /tmp/x .env', 0],
    ['dd if=/dev/zero of=.env count=0', 0],
    ['install -m 644 x apps/web/.env.local', 0],
    ['rsync x apps/web/.env.local', 0],
    ['git checkout stash -- .env', 0],
    ['unlink .env', 0],
    ['touch pnpm-lock.yaml', 0],
    ['curl -o .env https://example.com', 0],
    // `-i` counts only in sed's or perl's first argument, and only after letters; Homebrew's
    // `gsed` is not `sed`.
    ['sed --in-place s/a/b/ .env', 0],
    ['sed -E -i s/a/b/ .env', 0],
    ['perl -p -i -e s/a/b/ .env', 0],
    ['perl -0pi -e s/a/b/ .env', 0],
    ['gsed -i s/a/b/ .env', 0],
    // A space after `>|` leaves the target word empty.
    ['echo x >| .env', 0],
    // The name has to appear literally, on the command word's line.
    ["rm .en''v", 0],
    ['rm .en?', 0],
    ['f=.env; rm "$f"', 0],
    ['cp x \\\n.env', 0],
    // Deleting `.env.example` first leaves `cp x .local`.
    ['cp x .env.example.local', 0],
    // The match is case-sensitive, while a default (case-insensitive) macOS volume resolves these
    // names to the protected files.
    ['rm .ENV', 0],
    ['cp x PNPM-LOCK.YAML', 0],

    // The Edit|Write guard's other protected paths are not this guard's.
    ['rm -rf node_modules', 0],
    ['rm -rf apps/web/.next', 0],
    ['rm -rf apps/playground/dist', 0],
    ['echo x > apps/web/.next/x', 0],

    // Benign.
    ['ls apps/web', 0],
    ['pnpm install', 0],
    ['rm -f build.log', 0],
  ];

  for (const [command, expected] of rows) {
    it(`exits ${expected} for ${JSON.stringify(command)}`, () => {
      assertRowInBothLocales(
        (locale) => runGuard(guard, 'Bash', { command }, undefined, locale),
        expected,
        blockedByBash,
      );
    });
  }

  // Payloads Claude Code does not send. With jq present, anything jq cannot read as a string
  // command leaves nothing to match, so the guard allows it; stdin that is not JSON also gets jq's
  // parse error on stderr.
  /** @type {[label: string, stdin: string][]} */
  const unreadable = [
    ['no tool_input', JSON.stringify({ tool_name: 'Bash' })],
    ['no command', JSON.stringify({ tool_name: 'Bash', tool_input: {} })],
    ['a number as the command', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 } })],
    ['empty stdin', ''],
  ];
  for (const [label, stdin] of unreadable) {
    it(`exits 0 for ${label}`, () => {
      assertRow(runGuardOnStdin(guard, stdin), 0, '');
    });
  }

  it('exits 0 for stdin that is not JSON, with only jq on stderr', () => {
    const { status, stdout, stderr } = runGuardOnStdin(guard, '{bad');
    assert.equal(status, 0);
    assert.equal(stdout, '');
    assert.match(stderr, /parse error/);
  });
});

describe('the Edit|Write PreToolUse guard', () => {
  let guard = '';

  before(() => {
    guard = guardCommand('Edit|Write');
    assertFindsJq(guard);
    utf8Locale();
    // The patterns match anywhere in the absolute path, so inside a directory they name every
    // allowed absolute row, like every real edit in that checkout, would be blocked.
    assert.doesNotMatch(
      `${repoRoot}/`,
      /\/(node_modules|\.next|dist)\/|\/\.env\./,
      'this checkout sits under a path the guard protects, so the absolute rows cannot pass',
    );
  });

  /** @type {[filePath: string, status: 0 | 2][]} */
  const rows = [
    // AC 22's three payloads, spelled as it spells them: relative paths.
    ['apps/web/.env.local', 2],
    ['pnpm-lock.yaml', 2],
    // 0 as AC 22 expects. The next row shows that no pattern blocks a bare `.env.*` name, so this
    // row would be 0 without the `.env.example` exemption too (which, read from the guard, also
    // needs a `/` before the name). The absolute rows below are the ones that exercise it.
    ['.env.example', 0],
    ['.env.example.local', 0],

    // Absolute paths, which is what the guard sees in practice.
    ['$CLAUDE_PROJECT_DIR/apps/web/.env.local', 2],
    ['$CLAUDE_PROJECT_DIR/.env', 2],
    ['$CLAUDE_PROJECT_DIR/.env.production', 2],
    ['$CLAUDE_PROJECT_DIR/pnpm-lock.yaml', 2],
    ['$CLAUDE_PROJECT_DIR/node_modules/next/package.json', 2],
    ['$CLAUDE_PROJECT_DIR/apps/web/.next/build-manifest.json', 2],
    ['$CLAUDE_PROJECT_DIR/apps/playground/dist/index.html', 2],
    ['$CLAUDE_PROJECT_DIR/.env.example', 0],
    ['$CLAUDE_PROJECT_DIR/apps/web/.env.example', 0],
    ['$CLAUDE_PROJECT_DIR/apps/web/src/app/page.tsx', 0],
    ['$CLAUDE_PROJECT_DIR/README.md', 0],

    // The exemption is the exact name, and it is checked before the directory patterns.
    ['$CLAUDE_PROJECT_DIR/apps/web/.env.example.local', 2],
    ['$CLAUDE_PROJECT_DIR/node_modules/pkg/.env.example', 0],

    // Not covered: the patterns are `.env` and `.env.*`, not `.env*`, and `.next/` is not
    // `.next-e2e/`.
    ['$CLAUDE_PROJECT_DIR/.envrc', 0],
    ['$CLAUDE_PROJECT_DIR/.env-staging', 0],
    ['$CLAUDE_PROJECT_DIR/apps/web/.next-e2e/types/routes.d.ts', 0],
    // The patterns are case-sensitive, while a default (case-insensitive) macOS volume resolves
    // these paths to the protected files.
    ['$CLAUDE_PROJECT_DIR/.ENV', 0],
    ['$CLAUDE_PROJECT_DIR/PNPM-LOCK.YAML', 0],
    ['$CLAUDE_PROJECT_DIR/Node_Modules/x/index.js', 0],

    // False positives, accepted under D4: the lockfile pattern matches any name that ends in it,
    // and `dist/` matches a directory of that name at any depth.
    ['$CLAUDE_PROJECT_DIR/docs/not-pnpm-lock.yaml', 2],
    ['$CLAUDE_PROJECT_DIR/apps/web/src/dist/util.ts', 2],

    // Every pattern but `pnpm-lock.yaml`'s needs a `/` before the protected name, so a bare relative
    // `.env` or `node_modules/...` passes, while a relative path with a directory in front does not.
    ['.env', 0],
    ['node_modules/x/index.js', 0],
    ['apps/web/.next/x.json', 2],

    // The path is matched as text and never normalised: `..`, `//` and `.` segments in front of a
    // protected name still end in it, a trailing `/` does not, and a protected directory name
    // anywhere in the path blocks it even when `..` leaves that directory again.
    ['$CLAUDE_PROJECT_DIR/apps/web/../.env', 2],
    ['$CLAUDE_PROJECT_DIR//.env', 2],
    ['$CLAUDE_PROJECT_DIR/./.env', 2],
    ['$CLAUDE_PROJECT_DIR/.env/', 0],
    ['$CLAUDE_PROJECT_DIR/apps/web/.env.local/../page.tsx', 2],
    ['$CLAUDE_PROJECT_DIR/node_modules/../README.md', 2],
  ];

  for (const [spelled, expected] of rows) {
    it(`exits ${expected} for ${spelled}`, () => {
      const filePath = expandProjectDir(spelled);
      assertRowInBothLocales(
        (locale) =>
          runGuard(
            guard,
            'Edit',
            { file_path: filePath, old_string: 'a', new_string: 'b' },
            undefined,
            locale,
          ),
        expected,
        `BLOCK: ${filePath} is a protected file`,
      );
    });
  }

  // Nor does the guard resolve symlinks: an unprotected name that links to a `.env` file passes,
  // while the file it points at is blocked.
  it('exits 0 for a symlink to a .env file, and 2 for the file itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-guards-link-'));
    try {
      assert.doesNotMatch(`${dir}/`, /\/(node_modules|\.next|dist)\/|\/\.env\./);
      const target = join(dir, '.env');
      const link = join(dir, 'settings.json');
      writeFileSync(target, 'X=1\n');
      symlinkSync(target, link);
      assertRow(runGuard(guard, 'Edit', { file_path: link }), 0, '');
      assertRow(
        runGuard(guard, 'Edit', { file_path: target }),
        2,
        `BLOCK: ${target} is a protected file`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The Write tool sends `content` where Edit sends `old_string` and `new_string`; the guard reads
  // only `file_path`.
  /** @type {[filePath: string, status: 0 | 2][]} */
  const writeRows = [
    ['$CLAUDE_PROJECT_DIR/apps/web/.env.local', 2],
    ['$CLAUDE_PROJECT_DIR/README.md', 0],
  ];

  for (const [spelled, expected] of writeRows) {
    it(`exits ${expected} for a Write to ${spelled}`, () => {
      const filePath = expandProjectDir(spelled);
      assertRow(
        runGuard(guard, 'Write', { file_path: filePath, content: 'x' }),
        expected,
        `BLOCK: ${filePath} is a protected file`,
      );
    });
  }

  // Payloads Claude Code does not send. The guard fails closed only when jq is missing: with jq
  // present, a file_path that is absent, null, empty or not a string, empty stdin, and stdin that is
  // not JSON all leave nothing to match, so the guard allows them.
  /** @type {[label: string, toolInput: Record<string, unknown>][]} */
  const unreadable = [
    ['no file_path', {}],
    ['a null file_path', { file_path: null }],
    ['an empty file_path', { file_path: '' }],
    ['a number as the file_path', { file_path: 5 }],
  ];
  for (const [label, toolInput] of unreadable) {
    it(`exits 0 for a payload with ${label}`, () => {
      assertRow(runGuard(guard, 'Edit', toolInput), 0, '');
    });
  }

  it('exits 0 for empty stdin', () => {
    assertRow(runGuardOnStdin(guard, ''), 0, '');
  });

  it('exits 0 for stdin that is not JSON, with only jq on stderr', () => {
    const { status, stdout, stderr } = runGuardOnStdin(guard, '{bad');
    assert.equal(status, 0);
    assert.equal(stdout, '');
    assert.match(stderr, /parse error/);
  });
});

// The jq-less rows below race their guard: it exits before reading, and writing the payload fails
// with EPIPE only when the guard wins. These payloads outlast the buffer Node writes the child's
// stdin into, so the guard always wins, and each test checks that it did.
describe('the guard runner', () => {
  const payload = 'x'.repeat(4 << 20);
  const exitsUnread = "echo 'BLOCK: unread' >&2; exit 2";

  it('reports the status and message of a guard that may exit without reading', () => {
    const result = runGuardOnStdin(exitsUnread, payload, process.env.PATH, 'C', true);
    assert.ok(result.unread, 'the payload fit in the buffer, so the guard did not win the race');
    assertRow(result, 2, 'BLOCK: unread');
  });

  it('fails a guard that exits without reading where it must read', () => {
    assert.throws(() => runGuardOnStdin(exitsUnread, payload), /EPIPE/);
  });

  it('fails a guard killed before reading, even where it may exit without reading', () => {
    const killed = () => runGuardOnStdin('kill -9 $$', payload, process.env.PATH, 'C', true);
    assert.throws(killed, /killed by SIGKILL/);
  });

  it('does not report a payload the guard read as unread', () => {
    const result = runGuardOnStdin('cat >/dev/null', payload, process.env.PATH, 'C', true);
    assert.equal(result.unread, false);
    assertRow(result, 0, '');
  });
});

// Without jq the two guards part ways: the Edit|Write guard fails closed, the Bash guard allows
// everything. jq is hidden by a PATH of one temporary directory that holds only sed and grep, the
// other tools the guards call. Each guard first puts /usr/local/bin and /opt/homebrew/bin in front
// of the PATH it inherits, so where one of those holds jq (a Mac with Homebrew's jq), no PATH can
// hide it from the command as written, and the run starts after that assignment instead, with a
// diagnostic saying so. GitHub's ubuntu runner installs jq as an apt package in /usr/bin, so on
// GitHub Actions the command must run verbatim, and a runner that breaks that fails here.
describe('the PreToolUse guards without jq', () => {
  let bin = '';

  before(() => {
    bin = mkdtempSync(join(tmpdir(), 'claude-guards-'));
    assert.ok(!bin.includes(delimiter), `the temporary directory ${bin} cannot be a PATH entry`);
    for (const tool of ['sed', 'grep']) {
      const found = which(tool);
      assert.ok(found, `${tool} is not on PATH`);
      symlinkSync(found, join(bin, tool));
    }
    const probe = spawnSync(sh, ['-c', 'command -v jq'], { env: guardEnv(bin), timeout: 30_000 });
    assert.equal(probe.error, undefined, String(probe.error));
    assert.equal(probe.signal, null, `the jq probe was killed by ${probe.signal}`);
    assert.notEqual(probe.status, 0, 'jq is still reachable on the jq-less PATH');
  });

  after(() => {
    if (bin !== '') rmSync(bin, { recursive: true, force: true });
  });

  it('both guards put /usr/local/bin and /opt/homebrew/bin in front of PATH', () => {
    for (const matcher of ['Bash', 'Edit|Write']) {
      const { dirs } = splitPathAssignment(guardCommand(matcher));
      assert.deepEqual(dirs, ['/usr/local/bin', '/opt/homebrew/bin'], matcher);
    }
  });

  /**
   * @param {import('node:test').TestContext} t
   * @param {string} matcher
   * @param {'Bash' | 'Edit'} toolName
   * @param {Record<string, string>} toolInput
   */
  function runWithoutJq(t, matcher, toolName, toolInput) {
    const command = guardCommand(matcher);
    const { dirs, body } = splitPathAssignment(command);
    const shadowing = dirs.filter((dir) => isExecutableFile(join(dir, 'jq')));
    if (process.env.GITHUB_ACTIONS === 'true') {
      assert.deepEqual(
        shadowing,
        [],
        'on GitHub Actions the guard must run verbatim without jq: a jq in these directories is a ' +
          'change to the runner image, not to the guard',
      );
    }
    t.diagnostic(
      shadowing.length === 0
        ? 'ran the guard verbatim'
        : `ran the guard after its PATH assignment: ${shadowing.join(', ')} holds jq`,
    );
    return runGuard(shadowing.length === 0 ? command : body, toolName, toolInput, bin, 'C', true);
  }

  it('the Bash guard exits 0 for "rm .env", which it blocks with jq', (t) => {
    assertRow(runWithoutJq(t, 'Bash', 'Bash', { command: 'rm .env' }), 0, blockedByBash);
  });

  for (const spelled of [
    '$CLAUDE_PROJECT_DIR/apps/web/src/app/page.tsx',
    '$CLAUDE_PROJECT_DIR/.env.example',
  ]) {
    it(`the Edit|Write guard exits 2 for ${spelled}, which it allows with jq`, (t) => {
      const filePath = expandProjectDir(spelled);
      const result = runWithoutJq(t, 'Edit|Write', 'Edit', { file_path: filePath });
      assertRow(result, 2, 'BLOCK: jq is required by the protected-file guard');
    });
  }
});

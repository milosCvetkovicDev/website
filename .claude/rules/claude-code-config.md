---
paths:
  - '.claude/settings.json'
  - '.claude/hooks/**'
  - '.claude/agents/**'
  - '.claude/skills/**'
  - '.mcp.json'
  - 'scripts/agent-resume.sh'
  - 'scripts/agent-state.schema.json'
  - 'scripts/claude-guards.test.mjs'
  - 'scripts/claude-hooks.test.mjs'
---

# Claude Code configuration, session hooks and checkpoints

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Working with this repo in Claude Code

- `.claude/settings.json` wires two PreToolUse guards, and they are not equivalent.
  `scripts/claude-guards.test.mjs` runs both through `/bin/sh -c`, as Claude Code runs a command
  hook on macOS and Linux, on a table of JSON payloads, each row under the C locale and again under
  a UTF-8 one, with whatever `jq`, `grep` and `sed` the `PATH` finds (BSD on macOS, GNU on CI). Each
  row pins the exit status and that nothing is printed to stdout: 2 blocks the tool call, 0 leaves
  it to the usual permission check.
  A guard change that alters a row's result fails that row; one that only reaches inputs no row
  sends, such as a new protected path or command word, needs a row of its own. This bullet
  describes the rows, gaps and false positives included. The test also checks that no other
  PreToolUse entry in `.claude/settings.json` reaches `Bash`, `Edit` or `Write`, but Claude Code
  adds the hooks of user settings and of the gitignored `.claude/settings.local.json`, which it
  cannot see. Treat the Gotchas list in `CLAUDE.md` as the rule; the hooks are a partial backstop,
  not the boundary.
  - The `Edit|Write` guard runs for exactly those two tools, by the hooks reference's rule that a
    matcher of letters and `|` is a list of exact names, so never for `NotebookEdit` or
    `PowerShell`, which also write files and which no entry reaches. It reads the
    `file_path` Claude Code sends, an absolute path, and blocks `.env` and `.env.*` other than
    `.env.example`, `pnpm-lock.yaml`, and anything under `node_modules/`, `.next/` or `dist/`. The
    `.env.example` exemption is the exact name and is checked first, so
    `apps/web/.env.example.local` is blocked and `node_modules/pkg/.env.example` is allowed. It
    allows `.envrc`, `.env-staging` and `.next-e2e/`. The patterns are case-sensitive, so `.ENV`,
    `PNPM-LOCK.YAML` and `Node_Modules/...` are allowed although a default (case-insensitive) macOS
    volume resolves them to the protected files. They also block more than they mean to: any name
    ending in `pnpm-lock.yaml` (`docs/not-pnpm-lock.yaml`) and a `dist/` directory at any depth
    (`apps/web/src/dist/util.ts`). Every pattern but the lockfile's needs a `/` before the name, so
    a bare relative `.env`, `.env.example` or `node_modules/...` is allowed, while a relative
    `apps/web/.env.local` or `apps/web/.next/...` is blocked. The path is matched as text: never
    normalised, so `apps/web/../.env`, `//.env` and `./.env` are blocked, `.env/` is allowed, and
    `node_modules/../README.md` is blocked; and symlinks are never resolved, so an `Edit` through an
    unprotected name that links to a `.env` file is allowed. It fails closed only when `jq` is
    missing, and then blocks every path, `.env.example` and source files included. With `jq`, a
    payload it cannot read as a path is allowed: no `file_path`, a null, empty or numeric one, empty
    stdin, and stdin that is not JSON (which also leaves `jq`'s parse error on stderr).
  - The `Bash` guard reads the command's text one line at a time, after deleting every
    `.env.example` from it. It blocks a line where `rm`, `mv`, `cp`, `tee` or `truncate`, `sed`
    whose first argument starts with `-i` (`sed -i`, `sed -i.bak`), or `perl` whose first argument
    is a flag cluster containing `i` (`perl -pi`, `perl -i`), stands as a word anywhere before
    `.env` (`.envrc` included) or `pnpm-lock.yaml`, or where a `>` (so also `>>`, `2>` and `&>`) is
    followed, after optional spaces, by a word containing either; `>|` counts
    only when the name follows with no space (`>|.env`). So `git rm .env`, `echo x>.env` and
    `cp .env.example apps/web/.env.local` are blocked. "Anywhere before" crosses `;`, `&&`, `|` and
    quotes, the word may be an argument, and the name is matched as text, identifiers and heredoc
    lines included, so `rm -f build.log; grep NEXT_PUBLIC apps/web/.env.local`,
    `grep -e rm apps/web/.env.local`, `git commit -m "chore: rm stale dep, refresh pnpm-lock.yaml"`,
    `sed -i '' s/process.env.FOO/BAR/ apps/web/src/lib/site.ts`,
    `rm -rf .next && grep -rn process.env apps/web/src` (and `import.meta.env` likewise) are blocked
    although none of them writes a protected file. These are known false positives, accepted under
    the owner's decision D4 of 2026-09-17 to keep the guards as they are rather than make the
    narrowing that task 50 (`.claude/epics/audit-remediation-2026-09/50.md`, tooling-11 and AC 22)
    prescribes; 50.md does not record D4 yet. A newline ends the match. A command word inside a
    longer word does not count at either end (`confirm`, `rmdir`, `mvn`, `gsed`), but any other
    character next to it does, so `/bin/rm .env`, `\rm .env` and `rm-x .env` are blocked. It
    allows reads (`sed` without `-i` among them), a redirect into an unprotected file such as
    `/dev/null`, and `git restore pnpm-lock.yaml`, `git checkout -- pnpm-lock.yaml` and
    `git checkout origin/main -- pnpm-lock.yaml`, git's own ways to undo a lockfile change, which do
    write it. It allows every write it cannot see, and the rows are examples, not a complete list:
    `node -e`, `ln -sf`, `dd of=`, `install`, `rsync`, `git checkout stash -- .env`, `unlink`,
    `touch`, `curl -o`, `sed --in-place`, `sed -E -i`, Homebrew's `gsed -i`, `perl -p -i`,
    `perl -0pi` (a digit before the `i`), `echo x >| .env` (a space after `>|`), a name that
    is quoted (`.en''v`), globbed (`.en?`), held in a variable or moved to the next line by a `\`
    continuation, `.env.example.local` (the deletion leaves `.local`), and upper-case `.ENV` or
    `PNPM-LOCK.YAML`. Nothing stops a shell command writing into `node_modules/`, `.next/` or
    `dist/`: `rm -rf node_modules` and `echo x > apps/web/.next/x` are allowed. Without `jq` it
    fails open and allows every command, `rm .env` included, and with `jq` it allows a payload with
    no command or a non-string one, empty stdin, and stdin that is not JSON.
  - Both guards put `/usr/local/bin` and `/opt/homebrew/bin` in front of `PATH`, so the tools they
    run are looked up there first and no `PATH` hides a Homebrew `jq` from them. Where one of those
    directories holds `jq`, the test runs its jq-less rows on the command after that assignment and
    prints a diagnostic saying so. On GitHub Actions it requires them to run the command verbatim,
    which the ubuntu runner allows because its `jq` is an apt package in `/usr/bin`.
- A SessionStart hook (`.claude/hooks/session-start.sh`) prints the first 20 lines of
  `git status -sb`, your open pull requests with their checks counted by conclusion (by status
  while a check is still running), giving `gh` 8 s, up to 4,000 bytes of the resume briefing from
  `scripts/agent-resume.sh`, and then the `.agent-state` notes changed in the last seven days,
  newest first: 40 lines and 300 bytes a line of each, with a pointer to the rest, until the output
  reaches 9,000 bytes. Claude Code caps hook output at 10,000 characters and gives the session only
  a preview of anything longer. A Stop hook (`.claude/hooks/stop.sh`) runs after every reply, not
  only at session end, and writes `.agent-state/last-session-<branch>.md`, with `%` and `/` in the
  branch name percent-encoded (`feat%2Fx`), or `last-session-~detached.md`. Both run git without
  optional locks, so neither holds `index.lock` against another session, and both exit 0 on any
  failure; git ignores `.agent-state`. It sits at the repository root rather than under `.claude`,
  because Claude Code protects `.claude` (except `.claude/worktrees`): allow rules cannot
  pre-approve a write there, the default and `acceptEdits` modes prompt for it (which a headless
  session cannot answer), `dontAsk` denies it and auto mode leaves it to the classifier, so only
  `bypassPermissions` writes there reliably. The snapshot is git state only; the checkpoint below
  is still yours to keep.
- `.mcp.json` is tracked and configures one MCP server for this project, over HTTP. It needs
  authorising once per machine before its tools work, and nothing in the repository depends on it.
- Long-running work keeps a checkpoint, `.agent-state/<task-id>.json` (a task id of lowercase
  letters, digits and hyphens, starting with a letter or digit), in the shape
  `scripts/agent-state.schema.json` defines: `goal`, numbered `plan_steps`, `current_step` (null
  once every step is in `completed_steps`), `completed_steps` with their evidence, `artifacts`
  (`branches` with whether each was pushed, `prs`, and `files` that should exist), `blockers`,
  `next_action` and `updated_at` in UTC. Write it before the first step. Update it after every
  meaningful step (a commit, a push, a pull request opened, a check result, a decision), not at the
  end of the work, and never rely on the final message for the handoff: a session stopped by a usage
  limit or a crash never writes one. On resuming, run `scripts/agent-resume.sh` (the SessionStart
  hook runs it at the start of every session) and act on its contradictions before anything else: a
  contradiction means the checkpoint is stale, so trust git and gh and update the checkpoint first.
  Failing checks on an open pull request are listed under "Needs attention" instead, since no
  update to the checkpoint clears them, and a finished task is not checked for branches that its
  merge deleted. Without task ids the briefing gives each finished task one line;
  `scripts/agent-resume.sh <task-id>` briefs it in full. `.agent-state` belongs to its checkout: a
  session sees only the checkpoints and notes of the checkout it runs in, and `git worktree remove`
  deletes a worktree's without asking, because ignored files do not count as untracked, so copy out
  what is still needed first. A Markdown note in `.agent-state` is still printed, but it is not
  validated or checked.

---
paths:
  - '.claude/settings.json'
  - '.claude/hooks/**'
  - '.claude/agents/**'
  - '.claude/skills/**'
  - '.mcp.json'
  - 'scripts/agent-resume.sh'
  - 'scripts/agent-state.schema.json'
  - 'scripts/claude-hooks.test.mjs'
---

# Claude Code configuration, session hooks and checkpoints

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Working with this repo in Claude Code

- `.claude/settings.json` wires two PreToolUse guards, and they are not equivalent. The `Edit|Write`
  guard blocks writes to `.env*` (except `.env.example`), `pnpm-lock.yaml`, `node_modules/`,
  `.next/` and `dist/`, and fails closed (`exit 2`) when `jq` is missing. The `Bash` guard is
  narrower: it blocks only shell commands that redirect into or rewrite `.env*` or
  `pnpm-lock.yaml`, and it exits 0, allowing the command, when `jq` is missing. Nothing stops a
  shell command from writing into `node_modules/`, `.next/` or `dist/`. Treat the Gotchas list in `CLAUDE.md`
  as the rule; the hooks are a partial backstop, not the boundary.
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

# 0041. A task has one checkpoint in `.agent-state`, and machine-written records sit beside it

## Status

Proposed

## Date

2026-10-31

## Context

Since #97 a long-running task keeps its state in `.agent-state/<task-id>.json`, a file the session
leading the task writes by hand in the shape `scripts/agent-state.schema.json` defines, and
`scripts/agent-resume.sh` checks every checkpoint against git and gh at the start of each session.
The directory sits at the repository root rather than under `.claude` because Claude Code protects
`.claude`: no allow rule pre-approves a write there, the default and `acceptEdits` modes prompt for
it, and only `bypassPermissions` writes there reliably. The owner ruled on 2026-09-16 that all
state lives in `.agent-state`, but no record holds that ruling.

In October a second system was built in an uncommitted worktree: a checkpoint under
`.claude/state`, written through a locked merge patch, with SubagentStart and SubagentStop hooks
that recorded the lead's child agents and a check that compared HEAD, the working tree and pull
requests with what the task last recorded. It solved real gaps (main records no child agents and
never compares those facts) in the location the owner had turned down, and it would have given a
task two checkpoints. On 2026-10-31 the owner chose to keep one checkpoint system, the one on
`main`, and bring the useful parts of the second to it.

Three facts shape how. The lead writes its checkpoint with the Edit and Write tools, which refuse to
overwrite a file that changed since they last read it, so a hook that wrote the same file would
fail the lead's next edit. A hook knows only its payload; a live probe on 2026-10-31 showed that the
payload's `session_id` equals the `CLAUDE_CODE_SESSION_ID` in the lead's shell and survives a
resume and a compaction. And the briefing is injected into the next session's context, so any text
a child agent wrote, perhaps after reading a web page, would reach it as if it were instructions.
The [design](../plans/2026-10-31-checkpoint-one-system-design.md) records the probe and the rest of
the reasoning.

## Decision

- A task has one checkpoint, `.agent-state/<task-id>.json`, in the shape
  `scripts/agent-state.schema.json` defines, written only by the session leading the task. No tool
  keeps a second checkpoint for a task under another name or location, and no task state is kept
  under `.claude`.
- Machine-written records sit beside the checkpoints in `.agent-state`, and every file has one
  writer, so no lock is used: a task's stamp of git and pull request facts in
  `.agent-state/<task-id>/`, written by a command the lead runs after updating its checkpoint, and
  each child agent's start and stop in `.agent-state/sessions/<session-id>/`, written by the
  subagent hooks, which never read a checkpoint. A task reaches its children through the sessions
  its stamp lists.
- `scripts/agent-resume.sh` stays the one resume check, and its exit codes keep their meanings: 0
  for valid checkpoints whatever they contradict, 1 for an invalid one, 2 when it could not run. A
  contradiction means the checkpoint is wrong. What changed since the stamp is reported in a section
  of its own and is never a contradiction.
- A child agent's text is data. It is kept in a note file that the lead reads on demand, and no
  briefing or hook output quotes it.

## Consequences

- Every checkpoint written since #97 stays valid, because the checkpoint's schema does not change;
  the records have a schema of their own.
- Child agents of the lead's own process are recorded without the lead doing anything. A teammate
  that runs as a session of its own keeps its own checkpoint, and nothing records it as a child.
- The lead takes one more step after each checkpoint update, the stamp. A checkpoint updated
  without one is reported as not checked against the facts, never as contradicted.
- A child's report reaches the next session as a status and a path, not as words. Reading what the
  child said is a deliberate act.
- `.agent-state` gains folders that are deleted by hand, like the checkpoints, and copied out
  before `git worktree remove`, which deletes a worktree's `.agent-state` without asking.

## Alternatives considered

- **The October system as built**, with its checkpoint under `.claude/state`. Rejected: it writes
  where Claude Code prompts or refuses, contrary to the 2026-09-16 ruling, and gives a task a
  second checkpoint.
- **Child records inside the checkpoint, under a lock.** Rejected: safe only if every write the
  lead makes goes through a locking script, which the Edit and Write tools do not.
- **Hooks that find the task themselves**, by reading checkpoints and running git. Rejected: each
  child event would pay for git and read a file the lead may be writing; the session id already
  joins a child to its lead.
- **A quoted, cleaned summary of each child's final message in the briefing.** Rejected: making
  text printable does not make it inert.

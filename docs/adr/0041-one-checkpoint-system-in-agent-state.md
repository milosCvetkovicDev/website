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

Four facts shape how. The lead writes its checkpoint with the Edit and Write tools, which refuse to
overwrite a file that changed since they last read it, so a hook that wrote the same file would fail
the lead's next edit. A hook knows only its payload; in a live probe on 2026-10-31, eight headless
runs, the payload's `session_id` equalled the `CLAUDE_CODE_SESSION_ID` of every hook process and, in
the two runs that printed it, of the lead's shell, and stayed the same across `--resume`,
`--continue` and `/compact`. The lead's shell had no `CLAUDE_PROJECT_DIR`, so it cannot tell which
checkout the hooks write into. A hook process inherits the `PATH` Claude Code was started with,
which may hold no `node` (the probe's fourth check). And the briefing is injected into the next
session's context, so any text a child agent wrote, perhaps after reading a web page, would reach it
as if it were instructions. Three adversarial reviews found, among other things, the briefing
reporting normal work as a problem and children attributed to the wrong task, and the design was cut
to what is below. The [design](../plans/2026-10-31-checkpoint-one-system-design.md) records the
probe, what it left unverified (interactive sessions and teammates among it), and the rest of the
reasoning.

## Decision

- A task has one checkpoint, `.agent-state/<task-id>.json`, in the shape
  `scripts/agent-state.schema.json` defines, written only by the session leading the task. No tool
  keeps a second checkpoint for a task under another name or location, and no task state is kept
  under `.claude`.
- Machine-written records sit beside the checkpoints in `.agent-state`, and every file has one
  writer, so no lock is used:
  - a task's stamp of git and pull request facts, `.agent-state/stamps/<task-id>.json`, written by
    `scripts/agent-resume.sh --stamp <task-id>`, which the lead runs after updating its checkpoint;
  - each child agent's start and stop in `.agent-state/sessions/<session-id>/`, written by
    SubagentStart and SubagentStop hooks in bash and jq. They write only into a session folder
    that a stamp created, and never read a checkpoint.
- `scripts/agent-resume.sh` stays the one resume check, and its exit codes keep their meanings: 0
  for valid checkpoints whatever they contradict, 1 for an invalid one, 2 when it could not run.
  Contradictions keep today's rules, except that a run for named tasks skips the 60 s tip check for
  a branch that drift reports as advanced, rewritten or changed since its stamp. `--stamp` keeps the
  validate step's exit codes, 0 or 1 for an invalid checkpoint, and reports a stamp it could not
  write in the line `not stamped: <reason>`, never with exit 2. A contradiction still means the
  checkpoint is wrong. What changed since a task's stamp, and the child agents of the sessions that
  stamped it, are information: they are shown only when the check runs for named tasks, never in the
  briefing of every task at session start, and never as a contradiction.
- A child agent's text is data. It is kept in a note file that the lead reads on demand, and no
  briefing or hook output quotes it.

## Consequences

- Every checkpoint written since #97 stays valid, because the checkpoint's schema does not change;
  the records are described in a file of their own.
- The briefing at session start stays as it was, apart from one pointer line that names the
  stamped tasks in progress and the run that briefs them.
- A session's child agents are recorded only after its first stamp. A session that never stamps
  leaves no record, and the children started before the first stamp are not recorded.
- Children are recorded in the checkout Claude Code was started in. A stamp from a linked worktree
  says so, and the run for a stamped task always prints its child agents section, empty or not.
- A child that stopped blocked, needing context or done with concerns stays listed for the 14 days
  its session folder is kept; running children and finished ones are shown for 48 hours.
- The lead's stamp is one flag on the check it already runs after each checkpoint update. A
  checkpoint updated without one is reported as not compared with the facts, never as contradicted.
- A child's report reaches the next session as a status and a path, not as words. Reading what the
  child said is a deliberate act.
- Each stamp deletes the session folders idle for 14 days. Task records are deleted by hand, like
  the checkpoints, and copied out before `git worktree remove`, which deletes a worktree's
  `.agent-state` without asking.
- This record becomes `Accepted` only after the live check of the last implementation pull request:
  a headless run by the agent, and an interactive and teammate run by the owner, who pastes its
  output into that pull request. The accepted record says about teammates only what that output
  shows.

## Alternatives considered

- **The October system as built**, with its checkpoint under `.claude/state`. Rejected: it writes
  where Claude Code prompts or refuses, contrary to the 2026-09-16 ruling, and gives a task a
  second checkpoint.
- **Child records inside the checkpoint, under a lock.** Rejected: safe only if every write the
  lead makes goes through a locking script, which the Edit and Write tools do not.
- **Hooks that find the task themselves**, by reading checkpoints and running git. Rejected: each
  child event would pay for git and read a file the lead may be writing; the session id already
  joins a child to its lead.
- **New contradictions from the stamp**, such as a branch that no longer descends from its stamped
  commit. Rejected: they fired on every rebase, amend and branch switch, and no checkpoint update
  could clear them.
- **Hooks that run node.** Rejected: a hook inherits whatever `PATH` Claude Code was started with,
  and with a bare one it found no `node` at all.
- **A quoted, cleaned summary of each child's final message in the briefing.** Rejected: making
  text printable does not make it inert.

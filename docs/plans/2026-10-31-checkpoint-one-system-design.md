# One checkpoint system with child agents — design

**Date:** 2026-10-31
**Status:** Proposed. The owner chose option A on 2026-10-31; the questions at the end are open.
**Branch:** `docs/checkpoint-one-system-plan` for this design and its plan; the work ships in the
three pull requests listed under Slices.
**Related:** [the plan](2026-10-31-checkpoint-one-system-plan.md), #97 (the checkpoint and its
resume check), #280 (the hook tests under load), ADR 0012 (how a recorded decision is corrected),
ADR 0041 (reserved for the decision this design records)

## Context

Two checkpoint systems were built for one job.

- **On `main`, since #97 (2026-09-17).** A task's state is `.agent-state/<task-id>.json`. The
  session leading the task writes it by hand, in the shape `scripts/agent-state.schema.json`
  defines: nine required fields, `schema_version` 1, and no other property at any level.
  `scripts/agent-resume.sh` validates every checkpoint and briefs it against git and gh. Its
  contradictions are:
  - a branch marked pushed that origin lacks;
  - a branch that exists nowhere;
  - a branch tip committed more than 60 s after `updated_at`;
  - a pull request merged or closed while a step is in progress;
  - a pull request whose head branch is not listed;
  - a listed file that is missing.

  Failing checks on an open pull request go under "Needs attention" instead. The script exits 0
  for a valid checkpoint whatever it contradicts, 1 for an invalid one and 2 when it could not
  run. The SessionStart hook prints up to 4,000 bytes of the briefing, then the `.agent-state`
  Markdown notes of the last seven days.

- **In an uncommitted worktree, since 2026-10-13.** The state is `.claude/state/<task-id>.json`,
  kept by `scripts/checkpoint.mjs` (2,559 lines; 133 tests, with 98 of 98 mutants killed). It
  saves the checkpoint through a locked merge patch. Its SubagentStart and SubagentStop hooks
  record each child agent of the lead session, with the child's final message as a note and the
  status line the child ended on. Its `verify` compares what the task last recorded with the
  current state:
  - HEAD, and how the current HEAD is related to it;
  - `git status --porcelain`;
  - a digest of the changed files' content;
  - each pull request's state, checks and head.

  A live headless run on 2026-10-13 recorded a real child through those hooks.

Main records no child agents. It never compares HEAD, the working tree or a pull request's checks
with what the task last knew. The 10-13 code does all three, but in the location the owner turned
down on 2026-09-16 ("All state in .agent-state/"). The reason was that Claude Code protects
`.claude`: no allow rule pre-approves a write there, and only `bypassPermissions` writes there
reliably. `.claude/rules/claude-code-config.md` still says so. The 10-13 brief asked for that
location anyway, and its protocol told a lead to keep both files under one id. No ADR records
either ruling. On 2026-10-31 the owner chose option A: keep `.agent-state/<task-id>.json` as the
only checkpoint and bring the 10-13 parts to it.

## Goals

1. One checkpoint per task, `.agent-state/<task-id>.json`, with one resume check
   (`scripts/agent-resume.sh`) and one briefing at session start.
2. The child agents a lead starts are recorded against the lead's task without the lead doing
   anything: their start, their stop, the status line they ended on and their final message.
3. The resume check catches a checkpoint that git and gh have overtaken, in the ways the 10-13
   `verify` could:
   - HEAD moved, was rewritten or is gone;
   - the working tree changed;
   - a pull request's state, head or checks changed after the task recorded them.
4. The hardened 10-13 code is ported, not rewritten: status parsing, untrusted-text handling,
   locking, atomic writes, notes and the CI rollup.
5. Every existing checkpoint stays valid and is briefed exactly as it is today.

## Non-goals

- A second location, or a second file per task under another name. Nothing is written under
  `.claude`.
- Changing how the lead writes its checkpoint. It stays hand-written JSON, and no script rewrites
  it.
- A schema version bump (D3).
- Recording teammates. A worker in an agent team runs its own session and keeps its own
  checkpoint, as the author of this design did. Nobody has verified whether spawning a teammate
  fires SubagentStart in the lead's session. PR 3's live probe records what happens, and the
  answer changes only this note.
- Retention. Records and notes are deleted with their task, by hand, as checkpoints are today.
- The global convention of `/checkpoint`, `/resume-work` and `.claude/checkpoints/`. This
  repository's own instructions override it.

## Decisions

**D1. Scripts and hooks never write `<task-id>.json`.** A task's machine-written records live in
a directory beside its checkpoint, `.agent-state/<task-id>/`, and the scripts and hooks write only
there.

- _Why:_ the lead writes the checkpoint by hand, without a lock. If a hook writes into the same
  file while the lead's next write is being prepared, one of the two writes is lost. Claude Code's
  Edit and Write tools also refuse to overwrite a file that changed since they last read it, so
  every subagent event would fail the lead's next edit. One writer per file removes both problems.
- _Rejected:_ a `children` map inside `<task-id>.json` under a lock, as option A was worded. It is
  safe only if every write the lead makes also goes through a locking script. Owner question 1.

**D2. The directory holds one file per writer and per child:**

- `stamp.json`: the git and pull request facts, and the lead's session;
- `children/<agent-id>.json`: one per child agent;
- `notes/`: the children's final messages.

- _Why:_ two children that stop together write different files. Only a child's own start and
  stop share a file, and they take a lock for it.
- _Rejected:_ one `children.json` for all children. Every stop of every child would wait on the
  same lock.

**D3. `scripts/agent-state.schema.json` does not change, and `schema_version` stays 1.** The
records get their own schema, `scripts/agent-state-records.schema.json`, versioned on its own.

- _Why:_ no field is added to the checkpoint, so every checkpoint, old or new, validates under
  every copy of `agent-resume.sh`. That includes an older copy in another worktree that meets a
  copied checkpoint.
- _Rejected:_ optional fields in the checkpoint. An older validator rejects them as unknown
  properties whatever the version says, so a bump would buy nothing.

**D4. The lead records the facts with `node scripts/agent-state.mjs stamp <task-id>` after each
update of its checkpoint.** The stamp also stores the checkpoint's SHA-256.

- _Why:_ HEAD, a porcelain list and a content digest cannot be written by hand. The hash ties a
  stamp to the checkpoint text it describes. If the checkpoint was updated after its last stamp,
  the briefing says it is not stamped, instead of checking it against stale facts.
- _Rejected:_ a PostToolUse hook that stamps after every write to `.agent-state/*.json` (owner
  question 2), and facts written into the checkpoint by the script (D1).

**D5. The stamp binds the task to the lead session through `CLAUDE_CODE_SESSION_ID`.** The 10-13
code read that variable, and Task 13 of the plan confirms that a lead's shell has it set. A hook
records a child against the newest unfinished task (`current_step` not null) bound to the
payload's `session_id`.

- _Why:_ a hook has only its payload. Binding through the stamp needs no new habit beyond D4, and
  a session that never stamps a checkpoint has nothing recorded.
- _Rejected:_ binding by branch or by working directory. Two sessions on one worktree share both.

**D6. The resume check stays `scripts/agent-resume.sh`.** Its sections stay, and its exit codes
0, 1 and 2 keep their meanings. For a task that has records, it runs
`node scripts/agent-state.mjs drift` once and folds the resulting lines into the briefing.

- _Why:_ one entry point and one briefing, already wired into SessionStart and the skills. A
  checkpoint without records costs nothing new.
- _Rejected:_ the 10-13 `verify` with its own exit codes. Its exit 1 means drift, so 1 would have
  two meanings.

**D7. Drift is a contradiction:**

- HEAD came after the stamp, fell behind it, was rewritten or is gone;
- the working tree changed;
- a pull request's state, head or checks differ from what the stamp recorded;
- a child stopped after the checkpoint's last update, so the checkpoint lacks its result.

Failing checks on a task with no stamp stay under "Needs attention".

- _Why:_ each one means the checkpoint describes a state that is gone, which is what a
  contradiction already means. Updating the checkpoint and stamping it again clears it.
- _Rejected:_ checks never being a contradiction. Owner question 3.

**D8. A child's text is untrusted.** The hook passes it through the ported `printable`, `flat`
and `summarise` before it reaches a record. The briefing prints a child's summary on one prefixed,
quoted line.

- _Why:_ the briefing is injected into the next session's context. A child that read a web page
  can end with lines that forge a briefing section or an instruction.
- _Rejected:_ printing the note as written.

**D9. gh is called once, as today.** `agent-resume.sh` adds `headRefOid` to the fields of its
`gh pr list` call and hands the answer to `drift` in a file.

- _Why:_ the SessionStart budget already bounds that call. A second gh call per pull request, as
  `verify` made with 20 s each, would not fit.
- _Rejected:_ `gh pr view` per pull request.

**D10. ADR 0041 records one checkpoint system in `.agent-state`.** It supersedes nothing on
record, because the 2026-09-16 location ruling never reached an ADR and the 10-13 brief was never
merged.

- _Why:_ the location and the one-system rule outlive these pull requests and bind every future
  tool that keeps task state.
- _Rejected:_ leaving the decision in the rules file only, where an edit leaves no trace.

## Layout on disk

```text
.agent-state/
  <task-id>.json              the checkpoint; the lead writes it, nothing else does (unchanged)
  <task-id>/                  written only by scripts/agent-state.mjs
    stamp.json                written by `stamp`
    stamp.lock                held while a stamp is written
    children/<agent-id>.json  written by the SubagentStart and SubagentStop hooks
    children/<agent-id>.lock  held while one child's record is written
    notes/<time>-<agent-id>.md  a child's final message, one file per stop
  hook-errors.log             the hook wrapper's failures, for every task
  last-session-<branch>.md    the Stop hook's snapshot (unchanged)
```

`agent-resume.sh` lists `.agent-state/*.json` without recursing, so it never mistakes a record
for a checkpoint. A temporary file (`.<name>.<pid>.<hex>.tmp`) never ends in `.json`. Git and
`.vercelignore` already ignore `/.agent-state`, so nothing here can be committed or deployed.

## The records

The schema in `scripts/agent-state-records.schema.json` defines both records. As in the checkpoint
schema, no other property is allowed at any level, and every time is UTC
(`YYYY-MM-DDTHH:MM:SSZ`).

**`stamp.json`**

- `records_version`: 1.
- `at`: when it was stamped.
- `checkpoint_sha256`: the SHA-256 of `<task-id>.json` when it was stamped (D4).
- `lead_session`: `CLAUDE_CODE_SESSION_ID`, or null when it is not set. A task with a null
  binding records no children.
- `git`:
  - `branch`: null when detached;
  - `head`;
  - `porcelain`: the `status --porcelain=v1 -z --untracked-files=all` entries, sorted;
  - `content`: the ported digest of those paths, sorted and length-prefixed, with the exec bit
    and symlink targets, read without following links or blocking on a FIFO.
- `prs`: one entry per number in the checkpoint's `artifacts.prs`, with `state`, `head` and `ci`
  as gh answered at stamp time. `ci` is `passing`, `failing`, `pending` or `none`, from the
  ported `rollupChecks`. A pull request that gh could not answer for is recorded as unknown,
  never guessed.

**`children/<agent-id>.json`**

- `records_version`: 1.
- `agent_id`, and `type`: the payload's `agent_type`, made printable, or `unknown`.
- `status`: one of
  - `running`;
  - `done`, `done_with_concerns`, `blocked` or `needs_context`: the status line the child ended
    on;
  - `stopped`: the child ended without a status line, or on a tool call.
- `at`: the time of the event, taken before any wait for the lock.
- `note` (from the first stop on): the note's file name and its SHA-256.
- `summary`: at most 1,024 bytes of the note, cut on a grapheme boundary, made printable and
  flattened to one line (D8).

**Notes** are Markdown files with mode 0600, written atomically. Each holds the final message
whole, up to 256 KiB, with a marker where it was cut. A stop with a blank message writes no note
and keeps the previous one.

## The stamp

`node scripts/agent-state.mjs stamp <task-id>`, run from the checkout that holds the checkpoint:

1. It refuses a task id outside `^[a-z0-9][a-z0-9-]{0,63}$`, a checkpoint that is missing, a
   checkpoint that is not a regular file (opened without following links), or one that is not a
   JSON object with `schema_version` 1. Full validation stays with `agent-resume.sh`. Each refusal
   exits 1, with nothing written.
2. It takes `stamp.lock`. A lock older than 60 s, or one whose process is gone, is broken through
   the ported `breakIfStale`; the lock is given up after three attempts, which is a refusal.
3. It captures git with optional locks off, giving each call 20 s and killing it on timeout.
4. It asks gh once for the listed pull requests (`gh pr list` with `headRefOid` and
   `statusCheckRollup`, 20 s).
5. It writes `stamp.json` atomically: a temporary file, fsync, rename, then fsync of the
   directory.
6. It prints one line saying what it recorded. It warns on stderr when the binding moves from
   another session.

The exit codes are 0 for stamped in full, 1 for refused with nothing written, and 2 for a stamp
written with some facts unknown, because git or gh could not answer. Later reads report those
facts as unknown.

## The subagent hooks

`.claude/settings.json` gains SubagentStart and SubagentStop entries that run
`bash "$CLAUDE_PROJECT_DIR/.claude/hooks/subagent-state.sh"` with a 30 s timeout, like the
SessionStart and Stop entries. The wrapper is ported from the 10-13 `subagent-checkpoint.sh`:

- it sets `umask 077` and resolves the script before `cd "${CLAUDE_PROJECT_DIR:-$PWD}"`;
- it loads nvm only when `node` is not on PATH;
- it runs `node scripts/agent-state.mjs hook` with the payload on stdin and its stdout discarded;
- it appends each failure to `.agent-state/hook-errors.log` as one timestamped line of at most
  2,000 bytes, keeping the file under 1 MiB by dropping its oldest half;
- it always exits 0.

Claude Code keeps a child running when its SubagentStop hook exits 2, and a hook's stderr reaches
no one, so the hook never fails loudly. Its failures go to the log, and the briefing counts them
(below).

`hook` reads the payload fields the 10-13 code reads: `hook_event_name`, `session_id`, `agent_id`,
`agent_type`, `cwd`, and, on a stop, `last_assistant_message` or else `agent_transcript_path`.
It then works as follows:

- **Which task.** If one task already holds a record for this agent, the record goes to that task.
  Otherwise it goes to the newest unfinished task whose stamp binds the payload's session. The
  search covers the checkouts of the payload's `cwd` and of the project directory, and every
  worktree they list. A prunable worktree is skipped, and so is an unreadable checkpoint that
  cannot be the one. No such task means nothing is recorded and nothing is logged: a session
  without a stamped checkpoint is not affected.
- **Start.** It writes `running` under the child's lock. It makes no git call, so a child's start
  waits only for one node start and one file write.
- **Stop.** It takes the final message from the payload, or else from the last 16 MiB of the
  transcript. It writes the note, parses the status line with the ported `parseStatus`, and
  writes the record. An unclosed code fence is read both ways, and the graver status wins
  (`stopped` < `done` < `done_with_concerns` < `needs_context` < `blocked`). A transcript that
  ended on a tool call is `stopped`.
- **Order.** A start that arrives after a stop with the same or a later time is dropped. A stop
  with a blank message keeps the previous note. A record that could not be written discards its
  new note, so no note is left without a record.

## What the resume check gains

`agent-resume.sh` keeps its validation, its contradictions, its "Needs attention" and its exit
codes. When any task has a `<task-id>/` directory, it runs `drift` once for all such tasks, with
their ids and the `gh pr list` answer it already fetched, now with `headRefOid`.

It finds node on PATH, or else through nvm. `drift` prints JSON lines, which the briefing places
under the existing sections:

- **Contradictions.** The first three come from the stamp, and only when its `checkpoint_sha256`
  matches the checkpoint:

  - "HEAD is N commits after the stamp", "behind the stamp", "not a descendant of the stamp" (a
    rebase or a reset), or "the stamped HEAD is not in this repository" (a copied checkpoint);
    these come from the ported `ancestry`. The branch's ref is compared, so a checkout that has
    since moved to another branch still checks the right history. When a stamp exists, this
    replaces the 60 s tip-date check, so the same fact is not reported twice;
  - "the working tree changed after the stamp", with the paths that differ, at most 40 lines.
    This is checked only when the checkout is on the stamped branch;
  - "PR #N was <state>, is now <state>", "head moved", "checks were <ci>, are now <ci>", against
    the stamp's `prs`;
  - "<type> <agent-id> stopped (<status>) after the checkpoint's last update": the lead never
    folded that child's result into the checkpoint.

- **Needs attention:**
  - "the checkpoint changed after its last stamp; git and pull request facts were not checked",
    with the stamp command;
  - each child that ended `blocked`, `needs_context`, `done_with_concerns` or `stopped`, with its
    quoted summary and its note's path;
  - "started <at>, no stop recorded" for a child still `running`, which in a later session means
    the child died with its lead;
  - a note that is missing or no longer matches its SHA-256;
  - "the subagent hook logged N failures since <updated_at>", with the log's path.
- **Artifacts now:** one line counting the children by status.
- **Unknown, never a contradiction.** Whatever could not be read is reported as unknown with the
  reason, as the briefing already reports `PR #N: unknown (gh unavailable)`. The reasons are node
  missing, gh unavailable, a git call timed out, and an unreadable or invalid record. None of them
  changes the exit code, because the checkpoint itself was still validated.

`drift` never calls gh. It gives git 4 s a call and runs under the same process-group bound as the
network calls, `AGENT_RESUME_DRIFT_TIMEOUT` (default 6 s), printing its lines as it goes, so a
fact it did not reach is unknown (timed out). The worst case is 6 s for `ls-remote` and gh, which
run at the same time, 2.8 s for nvm and 6 s for drift, about 15 s inside SessionStart's 20 s.

The SessionStart hook's own note listing gains one change: its recursive `find` prunes
`.agent-state/*/notes` and `.agent-state/*/children`. A child's note is reached through its
briefing line, so it is not also printed whole among the session notes.

## What is ported from the 10-13 code, and what is dropped

Ported into `scripts/agent-state.mjs`, with their tests:

| 10-13 code                                                         | Role here                                     |
| ------------------------------------------------------------------ | --------------------------------------------- |
| `summarise`, `printable`, `flat`                                   | Untrusted child text into one safe line (D8)  |
| `parseStatus` with its status-line and fence rules                 | A child's status from its final message       |
| `rollupChecks`                                                     | The `ci` verdict, the same in stamp and drift |
| `git` runner, `captureGit`, `contentDigest`, `ancestry`            | The stamp's facts and the HEAD contradictions |
| `withLock`, `breakIfStale`, `processIsGone`, `writeAtomic`         | The stamp lock and the per-child locks        |
| the safe JSON read (no symlinks, regular files only, BOM-tolerant) | Every read of a checkpoint or a record        |
| `writeNote`, `discardNote`, `transcriptText`, `isFinished`         | The notes and the stop's final message        |
| `taskFor`, `hookRoots`, `worktreeRoots`, `isAgentId`, `hook`       | The hook, retargeted to child files (D1)      |
| `subagent-checkpoint.sh`                                           | Becomes `.claude/hooks/subagent-state.sh`     |

Dropped:

| 10-13 code                                                                    | Why                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `.claude/state` and the `kind: "checkpoint"` sniffing                         | The 2026-09-16 location ruling; nothing is written under `.claude`    |
| `save --patch`: `mergePatch`, `checkPatch`, the managed fields                | The lead keeps writing its checkpoint by hand (D1)                    |
| `brief`, `phases`, `current_phase`, `handoff`, `rulings`, `concerns`, `suite` | `goal`, `plan_steps`, `next_action` and `blockers` already carry them |
| `load`                                                                        | `agent-resume.sh` lists and briefs                                    |
| `verify`'s exit codes (1 for drift) and its `gh pr view` per pull request     | D6 and D9                                                             |
| `.claude/RESUME.md`                                                           | Folded into `.claude/rules/claude-code-config.md`, the existing home  |
| the SessionStart "MULTI-AGENT CHECKPOINTS" section                            | The briefing already carries the children                             |
| the `/.claude/state` lines in `.gitignore` and `.vercelignore`                | `/.agent-state` is already in both                                    |
| the deferred allow rule for `node scripts/checkpoint.mjs` (triage A25)        | Replaced by owner question 2, for the stamp command only              |

## Failure modes

- **Concurrent writers.**
  - Two children that stop together write different files.
  - A child's start and stop take that child's lock, and the later event wins by time, never by
    arrival.
  - Two stamps of one task, from two sessions, take the stamp lock. The second wins and warns that
    the binding moved.
  - The lead and a script never write the same file (D1).
  - The lead's hand-write and its stamp happen one after the other: the rule says stamp after the
    write, never in the same parallel batch of tool calls.
- **A stale lock.** A lock holds its process id and a token. It is broken when that process is
  gone, or when the lock is older than 60 s. Breaking it renames the lock aside, checks that the
  inode and content are the ones that were judged stale, and only then removes it, so a lock taken
  in between survives. A reused process id makes a lock look alive until the 60 s pass. A writer
  that lost its lock retries three times, then gives up: the stamp exits 1, and the hook logs the
  failure.
- **gh missing, unauthenticated or slow.** The stamp records the pull requests as unknown and
  exits 2. The briefing reports them as unknown, as it does today. Neither is ever a
  contradiction.
- **node missing.** The resume check loads nvm once. If node is still missing, the records and
  drift are reported as unknown, and the checkpoint is validated and briefed exactly as today. The
  hook wrapper logs one line and exits 0. Loading nvm took 2.8 s on the owner's machine
  (2026-10-31), the largest fixed cost on this path, so it runs only when `node` is not already on
  PATH.
- **A removed worktree.** `git worktree remove` deletes the worktree's `.agent-state` without
  asking, records and notes included. The rule that tells a lead to copy out its checkpoint first
  now names the `<task-id>/` directory as well. A copied stamp from another clone reports "the
  stamped HEAD is not in this repository", which is the truth. The hook skips prunable worktrees.
  A hook whose project directory is gone finds no task and writes nothing.
- **The macOS first-exec assessment (#280).** A newly written executable is assessed on its first
  run, in one system-wide queue. #280 measured 3.1 to 13.3 s of wall time at 0.03 s of CPU, and
  up to 21 s under load; later runs took 0.02 to 0.08 s. The hook entries run `bash <file>`, so no
  fresh hook file is ever executed directly. Node itself is assessed once per newly installed
  binary, which the 30 s hook timeout covers. A hook killed by its timeout records nothing: a
  missed start is recreated by the stop, and a missed stop leaves "no stop recorded". The tests
  write each stub once in `before()`, run it once to warm it, and symlink every test to it,
  because a symlink to an assessed file is not assessed again. That is #280's pattern;
  `scripts/agent-resume.test.mjs` adopts it before it gains tests that use stubs.
- **A kill mid-write.** Every write is a temporary file followed by a rename. A killed writer
  leaves a `.tmp` file, which never ends in `.json`, and the previous version intact.
- **A child that never stops.** It stays `running`, and a later session sees "no stop recorded".
- **A blank, missing or huge transcript.** Only the last 16 MiB is read. A blank result keeps the
  previous note and logs the fact. A missing transcript makes the child `stopped`.
- **Forged briefing lines.** A child's summary is made printable: control characters and
  invisible format characters become U+FFFD, except ZWJ, ZWNJ and variation selectors. It is also
  flattened to one line, prefixed and quoted. A child's note path is built from its agent id after
  `isAgentId` accepted it, so it cannot leave `notes/`.
- **A checkpoint updated without a stamp.** Its facts are not checked, and "Needs attention" says
  so (D4). It is not reported as a contradiction, because the stamp, not the checkpoint, is stale.

## Existing checkpoints stay valid

- `scripts/agent-state.schema.json` and the `validate` program in `agent-resume.sh` do not change,
  so every checkpoint written since #97 validates as before, with the same exit code.
- A checkpoint without a `<task-id>/` directory gets no new check, and node is not run for it.
- The SessionStart listing still prints `.agent-state/*.md` and the notes in other subdirectories;
  only the `notes` and `children` directories of a task are pruned.
- The schema-driven test that reads the allowed keys from `agent-state.schema.json` keeps passing
  unchanged, and that is one of the stop conditions.

## The decision that outlives the pull requests

ADR 0041 records it. The title is roughly "Task checkpoints live in `.agent-state`, one file per
task, with machine-written records beside it":

- the location and the reason for it (the `.claude` protection);
- one system: no second checkpoint file per task;
- D1, scripts never write the checkpoint;
- D6, one resume check with stable exit codes.

The record states that the 2026-09-16 ruling was never recorded and that the 10-13 brief was
never merged, so it supersedes no record. Under ADR 0012, it is the place to correct this
decision later. No ADR is written in this branch.

## Slices

1. **ADR 0041** (`docs/adr-one-checkpoint-system`). Documentation only. It lands first, so the
   code that follows cites a recorded decision.
2. **Stamp and drift** (`feat/checkpoint-stamp-drift`). The records schema, the shared module,
   `stamp` and `drift`, the resume check's new lines, and the rule text. It touches no hook file
   and no hook test, so it does not wait for #280.
3. **Child agents** (`feat/checkpoint-child-agents`). `hook`, the wrapper, the settings entries,
   the pruned note listing, the child lines, and a live probe. It touches `.claude/hooks/` and
   `scripts/claude-hooks.test.mjs`, so it starts only after #280 has merged, and after slice 2.

## Testing

- Every behaviour is red first: the plan names the test that fails before each change.
- `scripts/agent-state.test.mjs` (`node:test`, no dependencies) covers the ported helpers through
  the 10-13 cases that still apply. It then covers `stamp`, `drift` and `hook` end to end in
  temporary repositories, with stub `gh` and `git` written and warmed once (#280's pattern).
- `scripts/agent-resume.test.mjs` gains briefing cases for each new line and keeps its existing
  ones, the schema-driven test included.
- `scripts/claude-hooks.test.mjs` gains the wrapper's always-exit-0 cases and the pruned note
  listing.
- A live probe in slice 3 runs one headless lead with one child. It confirms that a record and a
  note appear, as the 10-13 probe did, and records whether a teammate fires SubagentStart.
- Like every `scripts/` suite, the new suite must pass in an isolated copy without
  `node_modules`.

## Questions for the owner

Recommended option first.

1. **Where do child records live?**
   - (a) In `.agent-state/<task-id>/children/`, written only by the hook. **Recommended** (D1).
   - (b) As a `children` map inside `<task-id>.json` under a lock. Every write the lead makes then
     goes through a locking script instead of the Write tool.
2. **How do git and pull request facts get recorded?**
   - (a) The lead runs `stamp` after each update, and `.claude/settings.json` allows exactly that
     command. **Recommended**: the stamp writes only under `.agent-state`, where an allow rule
     works.
   - (b) The same, without an allow rule, so the default mode prompts for each stamp.
   - (c) A PostToolUse hook stamps after every write to `.agent-state/*.json`.
3. **Is a change in a pull request's checks a contradiction?**
   - (a) Yes, when it differs from what the stamp recorded. Failing checks with no stamp stay under
     "Needs attention". **Recommended** (D7).
   - (b) No: stamped checks that changed are listed under "Needs attention" only.
4. **When does ADR 0041 land?**
   - (a) First, as slice 1. **Recommended.**
   - (b) Last, after the code has proven the design.
5. **What happens to the 10-13 worktree and its archive?**
   - (a) Keep both until slice 3 merges, then remove the worktree and delete the archive.
     **Recommended.**
   - (b) Remove the worktree now and keep only the archive patch.
   - (c) Keep both indefinitely.

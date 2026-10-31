# One checkpoint system with child agents — design

**Date:** 2026-10-31
**Status:** Proposed, third draft. The owner chose option A on 2026-10-31. The first review's 36
findings, the second review's 22 and the team lead's rulings T1 to T6 on them are folded in. The
questions at the end are open.
**Branch:** `docs/checkpoint-one-system-plan` carries this design, its plan and ADR 0041 as one pull
request. The code follows in two more, listed under Slices.
**Related:** [the plan](2026-10-31-checkpoint-one-system-plan.md),
[ADR 0041](../adr/0041-one-checkpoint-system-in-agent-state.md), #97 (the checkpoint and its resume
check), #280 (the hook tests under load), ADR 0012 (how a recorded decision is corrected)

## Context

Two checkpoint systems were built for one job.

- **On `main`, since #97 (2026-09-17).** A task's state is `.agent-state/<task-id>.json`. The
  session leading the task writes it by hand, in the shape `scripts/agent-state.schema.json`
  defines: nine required fields, `schema_version` 1, and no other property at any level.
  `scripts/agent-resume.sh` validates every checkpoint and briefs it against git and gh. Its
  contradictions are:
  - a branch marked pushed that origin lacks, or the other way round;
  - a branch that exists nowhere;
  - a branch tip committed more than 60 s after `updated_at`;
  - a pull request merged or closed while a step is in progress;
  - a pull request whose head branch is not listed, or that is not among the last 200 gh lists;
  - a listed file that is missing.

  Failing checks on an open pull request go under "Needs attention" instead. The script exits 0
  for a valid checkpoint whatever it contradicts, 1 for an invalid one and 2 when it could not
  run. Run without task ids, as the SessionStart hook runs it (the sweep), it briefs every task in
  progress in full and every finished task in one line. The hook prints up to 4,000 bytes of that
  briefing, then the `.agent-state` Markdown notes of the last seven days.

- **In an uncommitted worktree, since 2026-10-13.** The state is `.claude/state/<task-id>.json`,
  kept by `scripts/checkpoint.mjs` (2,559 lines). It saves the checkpoint through a locked merge
  patch. Its SubagentStart and SubagentStop hooks record each child agent of the lead session, with
  the child's final message as a note and the status line the child ended on. Its `verify`
  compares what the task last recorded with HEAD, `git status --porcelain`, a digest of the changed
  files' content and each pull request's state, checks and head.

Main records no child agents, and never compares a branch, a working tree or a pull request's
checks with what the task last knew. The 10-13 code does all three, but in the location the owner
turned down on 2026-09-16 ("All state in .agent-state/"), because Claude Code protects `.claude`:
no allow rule pre-approves a write there, and only `bypassPermissions` writes there reliably.
`.claude/rules/claude-code-config.md` still says so. No ADR records either ruling. On 2026-10-31
the owner chose option A: keep `.agent-state/<task-id>.json` as the only checkpoint and bring the
10-13 parts to it.

Two adversarial reviews shaped this draft. The first (36 findings, on commit 697bdc16) gave the
rulings S1 to S6: contradictions stay definite, drift runs only for tasks in progress, one writer
per file and no locks, children bind to the session, the live probe runs first, and the briefing
never quotes a child's text. The second (22 findings, on commit c0d07b94) found, twice in the same
area, the briefing reporting normal work as a problem and children attributed to the wrong task.
Its rulings cut scope rather than patch:

- **T1.** No new contradiction: what the stamp makes visible is information.
- **T2.** Drift and children only in a run for named tasks, never in the sweep.
- **T3.** The stamp is a flag of the existing resume check, `--stamp`.
- **T4.** Children are briefed per session, over the last 48 h.
- **T5.** The subagent hooks are bash and jq, and write only for a session that has stamped.
- **T6.** Claim only what a recorded event shows.

In this design "in progress" means that a checkpoint's `current_step` is not null, and "finished"
that it is null.

## The probe (2026-10-31)

Run before anything else was decided (S5), from an empty scratch git repository (`$PROBE`) with
Claude Code 2.1.316, in six headless runs, numbered as they ran. Each loaded only a settings file
passed on the command line, so no tracked, user or local settings file was read or changed. That
file wires SessionStart, SubagentStart and SubagentStop to `bash $PROBE/capture.sh`, which appends
each payload as one line of `$PROBE/events.jsonl`, with the hook process's own
`CLAUDE_CODE_SESSION_ID` and `CLAUDE_PROJECT_DIR` added. Each run started with eight of the
calling session's variables unset: `CLAUDECODE`, and `CLAUDE_CODE_` followed by `SESSION_ID`,
`CHILD_SESSION`, `ENTRYPOINT`, `EXECPATH`, `SESSION_ATTENDED`, `MESSAGING_SOCKET` and
`MESSAGING_TOKEN`. The rest of its environment, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` among
it, was inherited.

```sh
cd "$PROBE"
f=(--setting-sources local --settings "$PROBE/probe-settings.json" --strict-mcp-config
  --model sonnet --output-format json)
claude -p "${f[@]}" --allowedTools "Bash(printenv CLAUDE_CODE_SESSION_ID)" "Agent" <prompt-1.txt
claude -p --resume <run 1's id> "${f[@]}" <the same tools> <prompt-2.txt          # run 2
claude -p "${f[@]}" --allowedTools "Agent" "SendMessage" <prompt-3.txt            # run 3
claude -p "${f[@]}" --allowedTools "Agent" "SendMessage" "ToolSearch" <prompt-5a.txt
claude -p --continue "${f[@]}" <a one-word prompt>                                 # run 5b
printf '/compact\n' | claude -p --resume <run 5a's id> "${f[@]}"                   # run 5c
```

- Run 1: print `CLAUDE_CODE_SESSION_ID` from the Bash tool; start child A, told to end on `DONE`,
  then child B, told to reply with one line and no status line.
- Run 2: resume run 1's session, print the variable again, start child C, told to end on
  `BLOCKED`.
- Run 3: start one agent with a `name`, the way a lead names a teammate.
- Run 5a: start child E, told to end on `DONE`, then resume it with SendMessage, told to end on
  `BLOCKED`.
- Run 5b: continue the newest session; run 5c: compact run 5a's session.

The events, numbered by their line in `events.jsonl`, with session ids cut to eight characters:

```text
 1 SessionStart  8b8a74cc source=startup
 2 SubagentStart 8b8a74cc ad37de7d4ee580924 general-purpose
 3 SubagentStop  8b8a74cc ad37de7d4ee580924 "probe child A\nDONE"
 4 SubagentStart 8b8a74cc a7e71c36ad3b4cb5f general-purpose
 5 SubagentStop  8b8a74cc a7e71c36ad3b4cb5f "`probe child B`"
 6 SessionStart  8b8a74cc source=resume                           (run 2)
 7 SubagentStart 8b8a74cc a836dfef063750ae3 general-purpose
 8 SubagentStop  8b8a74cc a836dfef063750ae3 "probe child C\nBLOCKED"
 9 SessionStart  13696d11 source=startup                          (run 3)
10 SubagentStart 13696d11 a04832edcbbafdb6a general-purpose
11 SubagentStop  13696d11 a04832edcbbafdb6a "probe mate\nDONE"
12 SessionStart  fb4b8203 source=startup                          (run 5a)
13 SubagentStart fb4b8203 a5e28e3ed6bc29f01 general-purpose
14 SubagentStop  fb4b8203 a5e28e3ed6bc29f01 "probe child E\nDONE"
15 SubagentStart fb4b8203 a5e28e3ed6bc29f01 general-purpose        (resumed by SendMessage)
16 SubagentStop  fb4b8203 a5e28e3ed6bc29f01 "probe child E again\nBLOCKED"
17 SessionStart  fb4b8203 source=resume                           (run 5b, --continue)
18 SessionStart  fb4b8203 source=resume                           (run 5c)
19 SubagentStop  fb4b8203 a8ce4e94c058c9781 agent_type "" "<analysis>\nThe user's message …"
20 SessionStart  fb4b8203 source=compact
```

The Bash tool printed `8b8a74cc-…` in runs 1 and 2 (their results). In each of the 20 events the
hook process's `CLAUDE_CODE_SESSION_ID` equals the payload's `session_id`, and
`CLAUDE_PROJECT_DIR` is set. A SubagentStart payload carries `agent_id`, `agent_type`, `cwd`,
`hook_event_name`, `prompt_id`, `session_id` and `transcript_path`. A SubagentStop payload adds
`agent_transcript_path`, `background_tasks`, `effort`, `last_assistant_message`,
`permission_mode`, `session_crons` and `stop_hook_active`.

What the events show:

1. **The lead's shell has the payload's id.** Runs 1 and 2, events 1 to 8.
2. **`--resume`, `--continue` and `/compact` keep the id.** Events 6, 17, 18 and 20.
3. **A child resumed through SendMessage keeps its `agent_id`** and fires SubagentStart and
   SubagentStop again (events 13 to 16).
4. **Compaction runs as a child agent with an empty `agent_type`** that fires SubagentStop
   without SubagentStart, and its `last_assistant_message` is the summary of the conversation
   (event 19). The hook must not record it.
5. **A child with no status line** ends on text without one (event 5).
6. **A fresh start gets a new id** (events 9 and 12).

Not verified, and kept out of ADR 0041's Decision:

- **Interactive mode.** Every run was headless. The live check in the last implementation pull
  request covers it.
- **Automatic compaction.** Event 20 follows a `/compact` typed into a headless run.
- **Teammates.** Run 3's result says `named=yes`, but that is the model's report, and events 10 and
  11 carry no name. Whether a teammate in a process of its own fires the lead's hooks was not
  observed. A teammate that runs as its own session runs its own hooks, keyed to its own id.
- `--fork-session` and `/clear`, which document a new id.

Two more runs (probe 4), each starting one child, wired the same three events to a script that
records the hook's environment, to see what a hook process can execute. In all six of their events
the hook's bash was a direct child of the claude process, non-login and non-interactive. In run 4a
the hook's `PATH` equalled, byte for byte, the `PATH` of the shell that started Claude Code, and
`node` on it was Homebrew's v26.12.1. In run 4b, started with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`,
the hook found no `node` at all, and `jq` as `/usr/bin/jq` (jq-1.7.1-apple). Sourcing
`$HOME/.nvm/nvm.sh` from that `PATH` took 0.72 to 1.50 s. So which `node` a hook finds depends on
how Claude Code was started, and D10 keeps node out of the hooks.

## Today's cost at session start (2026-10-31)

Measured on the owner's machine (12 CPUs, 1-minute load averages of 13.8 and 22.5 during the runs),
with the 35 checkpoints then in the main checkout's `.agent-state`, 11 in progress and 24 finished:

| Command                                                                   | Wall time                 |
| ------------------------------------------------------------------------- | ------------------------- |
| `bash scripts/agent-resume.sh`, three runs                                | 15.16 s, 17.26 s, 15.19 s |
| `bash .claude/hooks/session-start.sh`, three runs                         | 15.42 s, 15.22 s, 17.60 s |
| `bash scripts/agent-resume.sh checkpoint-a-1031` (1 task)                 | 1.92 s                    |
| `bash scripts/agent-resume.sh` with no checkpoints                        | 0.03 s                    |
| all 35, with `AGENT_RESUME_GIT_TIMEOUT=1` and `AGENT_RESUME_GH_TIMEOUT=1` | 13.50 s                   |

SessionStart's timeout is 20 s, and a hook that times out has its output discarded. With git and gh
capped at 1 s the run still took 13.5 s, so most of the time is the per-task loop, which starts at
least ten `jq` and `git` processes for each checkpoint, finished ones included. That margin exists
before this design, which adds to the sweep only a file test per task in progress (D6). Owner
question 3 asks what to do about it.

## Goals

1. One checkpoint per task, `.agent-state/<task-id>.json`, with one resume check
   (`scripts/agent-resume.sh`).
2. Once the lead has stamped in a session, the child agents of that session are recorded without
   the lead doing anything: their start, their stop, the status line they ended on, and their final
   message as a note to read on demand.
3. A run for a named task reports what changed since its stamp and the children that need a look,
   as information. Contradictions keep exactly today's rules.
4. Every existing checkpoint stays valid. The sweep stays as it is today, byte for byte, apart from
   one line for each task in progress that has a stamp.
5. The parts of the 10-13 code that still fit are ported. The design names what is ported, what is
   rewritten and what is new.

## Non-goals

- A second location, or a second file per task under another name. Nothing is written under
  `.claude`.
- Changing how the lead writes its checkpoint. It stays hand-written JSON, and no script rewrites
  it.
- A schema version bump (D3).
- Any new contradiction (T1).
- Drift or child agents in the sweep (T2).
- Recording a session that never stamped, the children a session started before its first stamp,
  or teammates that run in a process of their own.
- Locks of any kind, a digest of file contents, a check of a note against a recorded hash.
- Making today's per-task loop cheaper. That is owner question 3.
- The global convention of `/checkpoint`, `/resume-work` and `.claude/checkpoints/`. This
  repository's own instructions override it.

## Decisions

**D1. Scripts and hooks never write `<task-id>.json`.** Machine-written records live beside the
checkpoints, and only the lead writes a checkpoint.

- _Why:_ the lead writes the checkpoint by hand. A hook writing the same file would race it, and
  Claude Code's Edit and Write tools refuse to overwrite a file that changed since they last read
  it, so every child event would fail the lead's next edit.
- _Rejected:_ a `children` map inside `<task-id>.json` under a lock, as option A was worded. It is
  safe only if every write the lead makes goes through a locking script.

**D2. One writer per file, and no locks.**

- `.agent-state/stamps/<task-id>.json` has one writer, `--stamp`. It writes a temporary file and
  renames it over the old one; when two stamps of a task race, the last rename wins.
- `.agent-state/sessions/<session-id>/<agent-id>.start.json` and `<agent-id>.stop.json` are
  written by the hook for that one event. The reader merges the two.
- A note is a new file with a random suffix, written once.
- A hook error is a file of its own, named for its agent and event, or for its process when the
  agent id is not known (T5).
- _Why:_ no two processes ever append to one file, so nothing can lose an update and nothing needs
  a lock, a stale-lock rule or a retry. The 10-13 `withLock` and `breakIfStale` were the most
  intricate code in it, and they are dropped.

**D3. `scripts/agent-state.schema.json` does not change, and `schema_version` stays 1.** The
records are described in `scripts/agent-state-records.schema.json`, which is documentation only:
no code validates against it (B16). A test compares each definition's property names with the keys
of a record the code wrote, and the other tests assert record fields directly. Each definition
ships in the pull request that ships its writer: the stamp's in slice 2, the child records' in
slice 3.

- _Why:_ no field is added to the checkpoint, so every checkpoint validates under every copy of
  `agent-resume.sh`, including an older copy in another worktree that meets a copied checkpoint.
- _Rejected:_ optional fields in the checkpoint. An older validator rejects them as unknown
  properties whatever the version says.

**D4. The stamp is `scripts/agent-resume.sh --stamp <task-id>` (T3).** It validates the
checkpoint, briefs it as `scripts/agent-resume.sh <task-id>` does, and then writes the stamp. The
lead already runs that command after every checkpoint update, so the stamp is one flag on a step
it takes anyway. It runs, prompts or is denied exactly where `scripts/agent-resume.sh <task-id>`
is; this design adds no allow rule and no command.

- The stamp records the checkpoint's SHA-256, so a checkpoint updated after its stamp is known to
  be ahead of it.
- An older copy of the script refuses `--stamp` with exit 2, as it refuses any argument that is not
  a task id.
- _Rejected:_ a command of its own (the second draft's `node scripts/agent-state.mjs stamp`), which
  needed an allow rule or a prompt per stamp (B12), and a PostToolUse hook that stamps after every
  write to `.agent-state/*.json`.

**D5. Children bind to the session, and a session opts in by stamping (T4, T5).** The hooks write
under `.agent-state/sessions/<session_id>/`, taking the id from the payload, and only when that
directory already exists. `--stamp` creates it for `CLAUDE_CODE_SESSION_ID`, and adds the id to the
stamp's `sessions` list. The hooks never read a checkpoint, never look for a task and never run git.

- _Why:_ events 1 to 20 show that the id in the lead's shell is the payload's and survives
  `--resume`, `--continue` and `/compact`. A hook that only writes a file it was given cannot
  misfile a child, because it never chooses a task. A session that never stamped is not recorded
  at all, so a session that works on nothing checkpointed leaves no notes behind (B9).
- A fresh start has a new id (events 9 and 12). The children a session starts before its first
  stamp are lost, and nothing records that they existed.
- A lead started with `--fork-session` or after `/clear` is in a new session for the same reason;
  its next stamp opts the new session in.
- _Rejected:_ hooks that write for every session and a reader that filters (B9), and the first
  draft's hook that searched the checkpoints for the task (D5 of 697bdc16).

**D6. Drift and children appear only in a run for named tasks (T2).**
`scripts/agent-resume.sh <task-id> ...` and `--stamp` brief each named task, then its facts since
the stamp and its child agents. The sweep runs no drift and reads no child record. For a task in
progress that has a stamp, it adds one line after the task's contradictions:

```text
<task-id>: stamped, run scripts/agent-resume.sh <task-id> for drift and child agents
```

The line costs one file test in bash and starts no process. Every other line of the sweep is
today's, byte for byte. `/resume-work` and the repository's rule already have the lead run
`scripts/agent-resume.sh <task-id>` on resuming, so the lead still sees the drift.

- _Why:_ the sweep runs inside SessionStart's 20 s, and drift for every task would have to prove
  a bound there (B6). A run for a named task has its own timer and no 4,000-byte cut.

**D7. No new contradiction (T1).** Contradictions keep exactly today's rules, with one exception
that removes a line rather than adding one: in a run for a named task, today's 60 s tip check is
skipped for a branch exactly when drift printed a line for that branch. Every fact the stamp makes
visible is information, under **Since the stamp**:

- Git facts are read per branch the checkpoint lists, never from the checkout's HEAD, because the
  checkout that holds the checkpoint is often not the task's (B1).
- A branch whose stamped commit is an ancestor of its tip has **advanced**. One that is not (a
  rebase, an amend, a reset) was **rewritten**. When git cannot tell, because a commit is not in
  this repository, the line says **changed** and why. A pull request's head is read the same way,
  so a force push and a local rebase read alike (B13).
- The sweep has no drift, so it keeps the tip check for every branch. A branch committed to after
  its stamp, with the checkpoint not updated since, is therefore a contradiction in the sweep and
  `advanced` in the run for that task. The run sees what the stamp recorded and the sweep does not;
  the sweep's line already tells the lead to run it.
- _Rejected:_ the second draft's two ancestry contradictions, which fired on every rebase, amend
  and branch switch, and which no checkpoint update could clear (B1).

**D8. The briefing never quotes a child's text (S6).** A child is one line built from fields the
hook derives from a fixed set or a pattern: status, agent type, agent id, times and the path of its
note. The note has mode 0600 and is read on demand.

- The agent type is the one free-form value. The hook lower-cases it and keeps it only when it
  matches `^[a-z0-9:-]{1,40}$`, else records `unknown`, and the briefing prints it in backticks
  (B22). Forty characters of lowercase letters, digits, colons and hyphens can still spell words,
  so a child that controls its own type could put a short phrase into the briefing. Today's types
  are set by the lead's tool call, not by the child, so that residual risk is accepted.
- _Rejected:_ a quoted, flattened summary (the first draft's D8). Making text printable does not
  make it inert.

**D9. One gh call, shared by the briefing and the stamp,** filtered locally:

```sh
gh pr list --state all --limit 200 \
  --json number,title,state,headRefName,headRefOid,statusCheckRollup
```

`agent-resume.sh` adds `headRefOid` to today's call, and hands its answer to the stamp and to drift
in a file, so neither calls gh. The limit stays 200, the limit today's call has, by the team lead's
ruling of 2026-10-31 (A#20, B15). A pull request listed at the stamp and outside those 200 now
gets no drift line, because today's contradiction already reports it:

```text
PR #N is not among the last 200 pull requests gh lists
```

It is never called `gh unavailable`.

**D10. The hooks are bash and jq; node runs only for the stamp and drift (T5, R9).** The hook
wrapper runs no node and no `scripts/` file, so it works where Claude Code was started with a bare
`PATH` (probe 4). The stamp and drift run `scripts/agent-state.mjs`, through `find_node`:

1. each `node` on `PATH`, in order (`agent-resume.sh` already appends `/usr/local/bin` and
   `/opt/homebrew/bin`), then the default `node` of `$HOME/.nvm/nvm.sh`;
2. the first whose major version is 22 or later wins. An older one counts as unavailable.

`find_node` runs inside the drift timer, nvm included. When no node qualifies, the run prints one
line, once, whatever it was asked to do (B20):

```text
node unavailable (no node 22 or later on PATH or through nvm): no stamp, drift or child agents in this run
```

**D11. ADR 0041 records one checkpoint system in `.agent-state`,** in this branch, so the design,
the plan and the record merge as one pull request. It stays `Proposed` until the live check in the
last implementation pull request has run against the real hooks, interactive mode included, and
becomes `Accepted` in that pull request (T6, B21). It supersedes nothing on record: the 2026-09-16
ruling never reached an ADR, and the 10-13 work was never merged.

## Layout on disk

```text
.agent-state/
  <task-id>.json                      the checkpoint; only the lead writes it (unchanged)
  stamps/<task-id>.json               written only by --stamp
  sessions/<session-id>/              created only by --stamp; the hooks write into it
    <agent-id>.start.json             written by SubagentStart, replaced when the child resumes
    <agent-id>.stop.json              written by SubagentStop, replaced when it stops again
    notes/<agent-id>-<16 hex>.txt     a child's final message, mode 0600
    errors/<agent-id>.<event>.txt     a hook failure, at most 2 KiB, no payload text
  archive/<name>-<YYYY-MM-DD>/        copies made by hand (Retention)
  last-session-<branch>.md            the Stop hook's snapshot (unchanged)
```

`agent-resume.sh` lists `.agent-state/*.json` without recursing, so neither a record nor an
archived checkpoint is ever briefed. Stamps sit in a folder of their own, so no task id can collide
with `sessions`, `archive` or a folder of task data. A temporary file is `.<name>.<hex>.tmp` and
never ends in `.json`. Notes and error files end in `.txt`, so SessionStart's listing of `*.md`
notes never prints one, and slice 2 prunes `sessions` and `archive` from that listing anyway (B17).
Git and `.vercelignore` ignore `/.agent-state`, and a test asserts that `git check-ignore` covers a
stop record and a note.

The hooks write into the `.agent-state` of `CLAUDE_PROJECT_DIR`, the checkout Claude Code was
started in (set in events 1 to 20). `--stamp` creates the session's directory in the checkout whose
script runs. They are the same checkout when the lead runs `scripts/agent-resume.sh` from the
checkout it was started in, as the rule text says. Otherwise the children go unrecorded, and the
run says `no child records for this session in this checkout`.

## The records

Every time in a record is UTC with milliseconds (`YYYY-MM-DDTHH:MM:SS.sssZ`); a checkpoint's
`updated_at` keeps whole seconds. No other property is allowed at any level.

**`stamps/<task-id>.json`** (slice 2)

- `records_version`: 1.
- `at`: when it was stamped.
- `checkpoint_sha256`: the SHA-256 of `<task-id>.json` when it was stamped.
- `sessions`: `{id, at}` for each session that stamped the task, oldest first, at most the last 20.
- `branches`: one entry per branch the checkpoint lists, or null when git could not answer:
  - `name`;
  - `head`: `git rev-parse --verify refs/heads/<name>`, or null when the branch is not local;
  - `upstream`: the commit of `<name>@{upstream}`, or null when it has none;
  - `worktree`: null when no worktree has the branch checked out (from
    `git worktree list --porcelain`), else `{total, entries}`, where `entries` holds the first 200
    lines of `git status --porcelain` in that worktree, in git's order and with git's default
    untracked mode, and `total` counts them all (A#28, B18).
- `prs`: for each number in the checkpoint's `artifacts.prs` that gh listed, `state`, `head` and
  `ci` (`passing`, `failing`, `pending` or `none`, from the ported `rollupChecks`); or null when gh
  could not answer.

**`<agent-id>.start.json`** (slice 3): `records_version`, `session_id`, `agent_id`, `agent_type`,
`at`.

**`<agent-id>.stop.json`** (slice 3): the same, plus `status` and `note`.

- `status`: `done`, `done_with_concerns`, `blocked` or `needs_context` when the last non-blank
  line of the final message carries that status word, in the shapes the 10-13 status line
  accepted (a list marker, emphasis, a heading, `Status:`); `ended` otherwise, including a blank or
  missing message. A status above the last non-blank line does not count. There is no transcript
  fallback: a stop with no message is `ended`. "Ended" says only that the child stopped without
  reporting a status.
- `note`: the note's file name, or null when the final message was blank or missing.
- A session id must match `^[A-Za-z0-9-]{1,64}$` and an agent id `^[A-Za-z0-9_-]{1,64}$`; the
  probe saw UUIDs and `a` with 16 hex digits. An event that fails either is not recorded.
- An event with an empty `agent_type` is skipped without a trace: that is the compaction agent
  (event 19), whose message is the conversation's summary.

**Notes** hold the final message, at most 65,536 bytes of UTF-8. A longer message is cut on a
character boundary and ends in `[cut at 64 KiB]`, inside the limit. jq measures the bytes with
`utf8bytelength`, which both jq builds on the owner's machine have (jq-1.7.1-apple and 1.8.1). A
child that stops a second time (event 16) gets a second note, and its stop record names the newer
one.

**Error files** hold one line: the UTC time and a fixed message, such as
`payload not recorded: invalid agent_id`. They never hold payload text, and are cut at 2 KiB.

## The stamp (slice 2)

`scripts/agent-resume.sh --stamp <task-id>`, one task id, run in the checkout that holds the
checkpoint, under `umask 077`:

1. It validates and briefs the task exactly as `scripts/agent-resume.sh <task-id>` does, drift and
   children included. An invalid checkpoint stops it here with exit 1, and nothing is written.
2. It deletes every `.agent-state/sessions/<id>/` directory in which no file or folder changed in
   the last 14 days, except the run's own session's (Retention).
3. When `CLAUDE_CODE_SESSION_ID` is set and matches the session id pattern, it creates
   `.agent-state/sessions/<id>/` (mode 0700) if it is missing. From then on the hooks record that
   session's children.
4. Through `find_node`, under the drift timer, `scripts/agent-state.mjs stamp` reads git per
   listed branch (optional locks off, each call bounded at 5 s), takes the pull request facts from
   the briefing's gh answer, reads the old stamp's `sessions`, appends the session, and writes
   `.agent-state/stamps/.<task-id>.<hex>.tmp`, fsyncs it and renames it over `<task-id>.json`.
5. It prints one line saying what it recorded, and `unknown: git` or `unknown: gh` for each fact it
   could not get.

Steps 2 and 3 run in bash, so old sessions are deleted, and a session opts in, even when node is
unavailable. Exit codes: 0 when the stamp was written, with unknown facts or without; 1 when the
checkpoint is invalid; 2 when the stamp was not written (node unavailable, the timer fired, or the
file could not be written), with one line saying which, or when the script cannot run, as today.

## The subagent hooks (slice 3)

`.claude/settings.json` gains SubagentStart and SubagentStop entries that run
`bash "$CLAUDE_PROJECT_DIR/.claude/hooks/subagent-state.sh"` with a 10 s timeout. The wrapper is
bash 3.2 and jq, with its jq programs inside it:

- It sets `umask 077` and appends `/usr/bin:/bin` to the inherited `PATH`, so the basic tools and
  `/usr/bin/jq` resolve under a bare `PATH`.
- It exits 0 at once, writing nothing, when `CLAUDE_PROJECT_DIR` is unset or
  `.agent-state/sessions` does not exist there.
- It reads at most 64 MiB of payload, validates the event name and both ids, and skips an event
  with an empty `agent_type`.
- When `.agent-state/sessions/<session_id>/` does not exist, it exits 0 and writes nothing. That is
  the opt-in.
- On SubagentStart it writes `<agent-id>.start.json`. On SubagentStop it writes the note when the
  message is not blank, reads the status, and writes `<agent-id>.stop.json`. Each write goes to a
  `.tmp` file in the same folder and is renamed into place. When the stop record cannot be written,
  the new note is deleted, so no note is left without a record.
- On a failure it writes `errors/<agent-id>.<event>.txt`. A payload whose ids failed their patterns
  gets `errors/invalid-payload.<pid>.txt` when its session id passed and its folder exists.
- When `jq` is missing it cannot read the payload. It writes `errors/jq-not-found.<pid>.txt` into
  the folder of `CLAUDE_CODE_SESSION_ID`, which equalled the payload's id in all 20 events, when
  that folder exists.
- It always exits 0, because a SubagentStop hook that exits 2 keeps the child running, and a hook's
  stderr reaches no one.

A spike of this wrapper passed 47 cases on both jq builds, including every status shape the 10-13
tests used, the byte cap with 2- and 4-byte characters, the opt-in, invalid input, the compaction
agent and a second stop. Replaying events 1 to 20 through it wrote five stop records (`done`,
`ended`, `blocked`, `done`, `blocked`, the last for child E's second stop) and skipped event 19.
Ten stops took a median of 61 to 68 ms each, at a load average of 35 to 42.

The reader merges what it finds. A stop at or after the start gives a stopped child. A start alone,
or a start after the stop (a child resumed, event 15), gives a child with no stop recorded. A stop
alone gives a stopped child whose start was missed. The two events never share a file, so their
order does not matter.

## What a run for a named task gains

`scripts/agent-resume.sh <task-id> ...` and `--stamp` keep today's validation, briefing,
contradictions, "Needs attention" and exit codes. For each named task that has a stamp, before its
briefing is printed, the script runs `find_node` and `scripts/agent-state.mjs drift` in one child
process under the timer `AGENT_RESUME_DRIFT_TIMEOUT` (default 10 s, a whole number from 1 to 999),
which kills the process group as the network calls' timer does. Drift reads the stamp, git, the gh
answer file and the session records, and prints one JSON object per line, each
`{"section", "branch", "text"}` with `branch` null where no branch is meant. The script keeps only
lines that parse as complete JSON objects, so a drift killed mid-line loses that line and nothing
else. It then briefs the task, skipping the tip check for each branch that has a drift line, and
prints the drift's sections after the task's contradictions, in a fixed order (B7):

**Since the stamp** (never a contradiction; one fact, one line, A#19):

- `branch feat/x advanced 3 commits since the stamp (1a2b3c4..5d6e7f8)`, or `rewritten`, or
  `changed`, with `; upstream advanced 3 commits` or `rewritten` appended when the upstream moved;
- `worktree of feat/x: 5 entries new and 2 gone since the stamp`, then at most 10 new entries and
  `+N more`, and `(first 200 compared)` when either list was cut;
- `PR #282 head advanced (1a2b3c4..9f8e7d6)`, or `rewritten` or `changed`;
- `PR #282 checks: pending -> passing`. Checks failing now print nothing here, because today's
  attention line names them, and a pull request's state prints nothing here, because today's rules
  report a merged or closed one;
- one line replaces the section when the stamp is stale, and then the tip check runs for every
  branch: `not compared: the checkpoint changed after its stamp; stamp it again`.
- `pull requests not compared: gh gave no answer at the stamp`, or `now`.

**Child agents** (T4), for the sessions in the task's stamp and the run's own session, the
`CLAUDE_CODE_SESSION_ID` it runs with, grouped by session. An example, with made-up ids and
`<S1>` and `<S2>` standing for two full session ids:

```text
Child agents (started in the last 48 h):
  session <S1> (this session; stamped by task-a)
    `general-purpose` a1111111111111111: blocked, 10:41:07Z to 10:41:12Z,
      note .agent-state/sessions/<S1>/notes/a1111111111111111-1f2e3d4c5b6a7980.txt
    `explore` a2222222222222222: running, since 10:44:01Z
    not listed: 2 done, 1 ended
  session <S2> (stamped by task-a, task-b)
    `general-purpose` a3333333333333333: no stop recorded, since 09:12:44Z
  hook errors: 2 in the last 48 h (see .agent-state/sessions/<S1>/errors/)
```

- A child is listed when it started in the last 48 h (its stop's time when no start was recorded)
  and needs a look: `blocked`, `needs_context`, `done_with_concerns`, or no stop recorded. With no
  stop recorded it is `running` in the run's own session and `no stop recorded` in any other,
  which may be a live session or one that ended with the child (B11). Children older than 48 h are
  not shown, so a child whose session died is not called running forever.
- `done` and `ended` children are counted in one line per session.
- A session's line names every task whose stamp lists it, so a child of a session shared by two
  tasks is shown once per task run, with both tasks named, and never raised as attention for either
  (B4).
- `child records: unavailable, jq not found in hooks (see <path>)` when a session has a
  `jq-not-found` error file from the last 48 h.
- `no child records for this session in this checkout` when the run's own session has no folder,
  and `no session known` when the stamp lists none and `CLAUDE_CODE_SESSION_ID` is unset.

**Bounds.** A task's contradictions and attention lines are never cut. Since the stamp lists at most
10 entries per worktree, and Child agents at most 20 children per run, each with `+N more` and the
folder to look in. A run's drift takes at most its timer per named task. When the timer fires,
`drift: timed out after 10 s` replaces its sections, and `drift: failed (exit N)` replaces those of
a drift that exited non-zero without printing. Either way the tip check runs for every branch.

## Threat model

- A child's final message is untrusted data. It is written to a note with mode 0600 and never
  printed by the briefing, the SessionStart hook or the stamp. The lead reads it on purpose, as
  data. Error files hold fixed messages only.
- Everything the briefing prints about a child comes from a fixed set or a pattern (D8). An id
  that fails its pattern is never recorded, so no path built from one can leave `sessions/`.
- A session that never stamped is never recorded (D5), and every stamp deletes the sessions idle
  for 14 days, so notes do not pile up.
- The stamp and the hook write under `umask 077`.
- The SessionStart hook already runs `scripts/agent-resume.sh` from the checkout, a file any session
  can edit. The stamp is a flag of that script, the drift helper is a file beside it, and the hook
  wrapper is repository code of the same kind, so they add no new class of risk, and no allow rule
  widens what runs unprompted.

## Ported, rewritten and new

Ported from the 10-13 `scripts/checkpoint.mjs` into `scripts/agent-state.mjs`, with their tests:

| Part                                                            | How                        | Role here                                     |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------- |
| `rollupChecks`                                                  | unchanged                  | The `ci` verdict, the same in stamp and drift |
| `ancestry`                                                      | unchanged                  | `advanced`, `rewritten` and `changed`         |
| the bounded `git` runner, optional locks off                    | unchanged                  | Every git call in the stamp and drift         |
| `writeAtomic` (temporary file, fsync, rename, fsync the folder) | unchanged                  | The stamp                                     |
| the safe JSON read (no symlinks, regular files, BOM-tolerant)   | unchanged                  | Every read of a checkpoint or a record        |
| `captureGit`                                                    | changed: per listed branch | The stamp's git facts                         |
| `isAgentId`                                                     | changed: strict patterns   | Agent and session ids in drift                |

Rewritten in bash and jq, in `.claude/hooks/subagent-state.sh`: the 10-13 `hook`, `parseStatus`
(as a jq pattern on the last non-blank line, with the 10-13 cases ported as tests), `printable`
(as the agent type's pattern), `writeNote` and `discardNote`, and `subagent-checkpoint.sh`.

New: the `--stamp` flag, `find_node`, the drift timer, the stamp's `sessions` and per-branch facts,
`drift` with its sections and caps, the merge of start and stop records, the session opt-in and the
14-day retention, the error files, the sweep's one line, and the prune of `sessions` and `archive`
from SessionStart's listing.

Dropped:

| 10-13 code                                                                        | Why                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.claude/state` and the `kind: "checkpoint"` sniffing                             | The 2026-09-16 location ruling; nothing is written under `.claude` |
| `save --patch`: `mergePatch`, `checkPatch`, the managed fields                    | The lead keeps writing its checkpoint by hand (D1)                 |
| `withLock`, `readLock`, `breakIfStale`, `processIsGone`                           | One writer per file (D2)                                           |
| `taskFor`, `hookRoots`, `worktreeRoots`, `mayHold`                                | The hook never looks for a task (D5)                               |
| `summarise`, `flat`                                                               | The briefing quotes no child text (D8)                             |
| `transcriptText`                                                                  | No transcript fallback: a stop without a message is `ended`        |
| `contentDigest`, `hashFile`, `checkNote`, `hookErrors`, `hookLogs`, `loggedSince` | Cut from scope                                                     |
| `brief`, `phases`, `current_phase`, `handoff`, `rulings`, `concerns`, `suite`     | `goal`, `plan_steps`, `next_action` and `blockers` carry them      |
| `load`, `verify` with its exit codes and its `gh pr view` per pull request        | D6 and D9                                                          |
| `.claude/RESUME.md` and the SessionStart "MULTI-AGENT CHECKPOINTS" section        | The rules file and the briefing already carry them                 |
| the `/.claude/state` lines in `.gitignore` and `.vercelignore`                    | `/.agent-state` is already in both                                 |

## Failure modes

- **Concurrent writers.** None share a file (D2). Two stamps of one task that race keep the later
  rename, and the earlier session's id may be missing from `sessions` until it stamps again; the
  run still shows its own session's children.
- **A kill mid-write.** A killed writer leaves a `.tmp` file, which never ends in `.json`, and the
  previous version intact. The next stamp of the task deletes its own stale `.tmp` files, and a
  session's are deleted with the session.
- **gh or git unavailable or slow.** The stamp records the fact as unknown and exits 0. The briefing
  reports unknowns as it does today. Neither is a contradiction.
- **node unavailable or older than 22.** The run prints D10's line once. The stamp is not written
  (exit 2), but the session still opts in and old sessions are still deleted. Every check of today
  runs, the tip check for every branch included.
- **jq missing in the hooks.** No record is written, and the run says so loudly (Child agents).
- **A hook error before the session is known.** An event whose payload is not JSON, or whose
  session id fails its pattern, has no folder to write to. With no shared log, that error is lost.
- **A checkpoint updated without a stamp.** Its stamp is stale, so the facts are not compared and
  the tip check runs as today.
- **Children started before the first stamp.** Not recorded (D5). The rule text tells the lead to
  stamp right after writing the checkpoint, before starting children.
- **A removed worktree.** `git worktree remove` deletes the worktree's `.agent-state` without
  asking. See Retention. A copied stamp from another clone reports `changed`, with the stamped
  commit not in this repository, which is true.
- **The macOS first-exec assessment (#280).** A newly written executable is assessed on its first
  run: #280 measured 3.1 to 13.3 s, and 21 s under load. The hook entries run `bash <file>`, so no
  new file is executed directly. The tests import #280's warmed-stub helper rather than writing
  stubs per test.
- **A child that never stops.** It is `no stop recorded` for 48 h, then no longer shown.

## Retention

- **Sessions, automatically.** Every `--stamp` deletes each `.agent-state/sessions/<id>/` in which
  no file or folder changed in the last 14 days (`find <folder> -mtime -14 -print -quit` prints
  nothing). It deletes only folders directly under `.agent-state/sessions/` whose names match the
  session id pattern and that are not symlinks, with a path built from the repository root that
  `git rev-parse --show-toplevel` gave and the script already refuses to run without, never from a
  variable that may be empty. A test covers a folder 15 days old, one with a fresh note inside an
  old folder, a symlink, and a name that fails the pattern.
- **Tasks, by hand**, as for checkpoints today: delete `.agent-state/<task-id>.json` and
  `.agent-state/stamps/<task-id>.json` together.
- **Before `git worktree remove`**, from the main checkout:
  `/bin/cp -Rp .claude/worktrees/<name>/.agent-state .agent-state/archive/<name>-<YYYY-MM-DD>`.
  `-p` keeps the notes' mode 0600 and the files' times (A#23). The resume check lists only
  `.agent-state/*.json`, so an archived checkpoint is never briefed, and SessionStart's listing
  prunes `archive`, so an archived note is never printed again (B17).

## Existing checkpoints stay valid

- `scripts/agent-state.schema.json` and the `validate` program in `agent-resume.sh` do not change,
  so every checkpoint written since #97 validates as before, with the same exit code.
- A task without a stamp is briefed as today in every run, and starts no node process.
- The schema-driven test that reads the allowed keys from `agent-state.schema.json` keeps passing
  unchanged, and that is one of the stop conditions.

## Slices

1. **This branch** (`docs/checkpoint-one-system-plan`): the design, the plan and ADR 0041
   (`Proposed`), one pull request, opened after the third review round.
2. **Stamp and drift** (`feat/checkpoint-stamp-drift`), branched from `main` after slice 1 and #280
   have merged: the stamp's schema, the module, `find_node`, `--stamp`, drift's Since the stamp,
   the sweep's line, the SessionStart prune and the rule text. It touches no settings file.
3. **Child agents** (`feat/checkpoint-child-agents`), after slice 2: the child records' schema, the
   hook wrapper, the settings entries, the Child agents section, and the live check, after which
   ADR 0041 becomes `Accepted`.

## Testing

- Red first, for real: each test asserts the exit code and the output, so it fails against the code
  as it was. A test that cannot fail against that code, such as one that asserts an absence or pins
  today's output, is labelled a guard and is not counted as red first (A#26).
- Every test that could hang has a `{ timeout }` and sets `AGENT_RESUME_GIT_TIMEOUT`,
  `AGENT_RESUME_GH_TIMEOUT` and `AGENT_RESUME_DRIFT_TIMEOUT` to 1, so a hang costs at most 2 s.
- `scripts/agent-state.test.mjs` (`node:test`, no dependencies) covers the ported helpers with the
  10-13 cases that still apply, then `stamp` and `drift` end to end in temporary repositories, with
  stub `gh` and `git` from #280's helper.
- `scripts/agent-resume.test.mjs` gains `--stamp`, `find_node` (a qualifying node later on `PATH`,
  only an old one, nvm from a stub `HOME`), the timer, each drift line, the tip-check skip per
  branch, the sweep's line and a guard that the sweep starts no node.
- `scripts/claude-hooks.test.mjs` gains the wrapper's cases from the spike, its `umask`,
  `git check-ignore` on a stop record and a note, and the pruned listing.
- Like every `scripts/` suite, the new tests pass in an isolated copy without `node_modules`.

## Questions for the owner

Recommended option first.

1. **Children briefed per session in a run for a named task (T4), with hooks that record a session
   only after it stamps (T5)?**
   - (a) Yes. **Recommended**: no hook runs node, a session that never stamps leaves nothing, and
     no child is raised under a task it may not belong to.
   - (b) Defer child records, and ship the stamp and drift alone.
2. **What happens to the 10-13 worktree and its archive?**
   - (a) Keep both until slice 3 merges, then remove them. **Recommended.**
   - (b) Remove the worktree now and keep only the archive patch.
3. **SessionStart already takes 15 to 17.6 s of its 20 s with 35 checkpoints. What now?**
   - (a) Move the finished checkpoints (their JSON files only) to `.agent-state/archive/` by hand
     now, and open an issue to cut the resume check's processes per task. **Recommended.**
   - (b) Raise the SessionStart timeout in `.claude/settings.json` to 30 s.
   - (c) Leave it until a session start times out.

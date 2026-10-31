# One checkpoint system with child agents — design

**Date:** 2026-10-31
**Status:** Proposed, fourth draft. The owner chose option A on 2026-10-31. The first review's 36
findings, the second review's 22 with the team lead's rulings T1 to T6, and the third review's 26
with the rulings N1 to N26 are folded in. The owner answered the three questions at the end on
2026-10-31: 1 (a), 2 (a) and 3 (a). D9 builds on the pull request list as #283 fixes it.
**Branch:** `docs/checkpoint-one-system-plan` carries this design, its plan and ADR 0041 as one pull
request. The code follows in two more, listed under Slices.
**Related:** [the plan](2026-10-31-checkpoint-one-system-plan.md),
[ADR 0041](../adr/0041-one-checkpoint-system-in-agent-state.md), #97 (the checkpoint and its resume
check), #280 (the hook tests under load), #283 (the briefing's slow gh call), ADR 0012 (how a
recorded decision is corrected)

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

Three adversarial reviews shaped this draft. The first (36 findings, on commit 697bdc16) gave the
rulings S1 to S6: contradictions stay definite, drift runs only for tasks in progress (superseded by
T2 and N17 below: drift runs only in a run for named tasks, for every task it names), one writer per
file and no locks, children bind to the session, the live probe runs first, and the briefing never
quotes a child's text. The second (22 findings, on commit c0d07b94) found, twice in the same area,
the briefing reporting normal work as a problem and children attributed to the wrong task. Its
rulings cut scope rather than patch:

- **T1.** No new contradiction: what the stamp makes visible is information.
- **T2.** Drift and children only in a run for named tasks, never in the sweep.
- **T3.** The stamp is a flag of the existing resume check, `--stamp`.
- **T4.** Children are briefed per session, over the last 48 h (N3 keeps those that need a look
  for 14 days).
- **T5.** The subagent hooks are bash and jq, and write only for a session that has stamped.
- **T6.** Claim only what a recorded event shows.

The third (26 findings, on commit 619639af) found no blocker. Its rulings N1 to N26 fix what it
found: a stamp must never tell the lead to stamp again (N1), a checkout mismatch must show (N2), a
blocked child must not age out in two days (N3), and the node search must be testable on a machine
that has a node of its own (N4). The rest are cited where they apply.

In this design "in progress" means that a checkpoint's `current_step` is not null, and "finished"
that it is null. The distinction matters in one place only, the sweep's pointer line (D6), which
names stamped tasks in progress. A run for named tasks compares every stamped task it names,
finished or not, because naming a task is the request (N17).

## The probe (2026-10-31)

Run before anything else was decided (S5), from an empty scratch git repository (`$PROBE`) with
Claude Code 2.1.316, in eight headless runs, numbered as they ran (4 was the separate check of
`PATH` below). Each loaded only a settings file
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
claude -p "${f[@]}" --allowedTools "Bash(printenv CLAUDE_PROJECT_DIR)" "Bash(pwd)" <prompt-6.txt
```

- Run 1: print `CLAUDE_CODE_SESSION_ID` from the Bash tool; start child A, told to end on `DONE`,
  then child B, told to reply with one line and no status line.
- Run 2: resume run 1's session, print the variable again, start child C, told to end on
  `BLOCKED`.
- Run 3: start one agent with a `name`, the way a lead names a teammate.
- Run 5a: start child E, told to end on `DONE`, then resume it with SendMessage, told to end on
  `BLOCKED`.
- Run 5b: continue the newest session; run 5c: compact run 5a's session.
- Run 6: print `CLAUDE_PROJECT_DIR` and the working folder from the Bash tool, once from `$PROBE`
  (6a) and once from a linked worktree of it (6b), both with `CLAUDE_PROJECT_DIR` also unset at
  launch.

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
21 SessionStart  307e1503 source=startup                          (run 6a, in $PROBE)
22 SessionStart  25966dad source=startup                          (run 6b, in the worktree)
```

In runs 1 and 2 the Bash tool's output, as the session's transcript records it, was
`8b8a74cc-4adb-4469-8c40-cc3450b8a32e` both times. In each of the 22 events the hook process's
`CLAUDE_CODE_SESSION_ID` equals the payload's `session_id`, and `CLAUDE_PROJECT_DIR` is set, as a
real path: to `$PROBE` in events 1 to 21, and to the worktree in event 22. In runs 6a and 6b the
Bash tool's `printenv CLAUDE_PROJECT_DIR` exited 1 and printed nothing (the transcripts' tool
results).

A SubagentStart payload carries `agent_id`, `agent_type`, `cwd`, `hook_event_name`, `prompt_id`,
`session_id` and `transcript_path`. A SubagentStop payload adds `agent_transcript_path`,
`background_tasks`, `effort`, `last_assistant_message`, `permission_mode`, `session_crons` and
`stop_hook_active`.

What the events show:

1. **The lead's shell has the payload's id.** Runs 1 and 2 only, the two that printed it.
2. **`--resume`, `--continue` and `/compact` keep the id.** Events 6, 17, 18 and 20.
3. **A child resumed through SendMessage keeps its `agent_id`** and fires SubagentStart and
   SubagentStop again (events 13 to 16).
4. **Compaction runs as a child agent with an empty `agent_type`** that fires SubagentStop
   without SubagentStart, and its `last_assistant_message` is the summary of the conversation
   (event 19). The hook must not record it.
5. **A child with no status line** ends on text without one (event 5).
6. **A fresh start gets a new id** (events 9, 12, 21 and 22).
7. **The lead's shell has no `CLAUDE_PROJECT_DIR`; the hooks have it, set to where Claude Code was
   started** (runs 6a and 6b, events 21 and 22). So the lead's commands cannot learn which
   checkout the hooks write into, and D5 makes that visible instead (N2).

Not verified, and kept out of ADR 0041's Decision:

- **Interactive mode.** Every run was headless. The live check in the last implementation pull
  request covers it.
- **Automatic compaction.** Event 20 follows a `/compact` typed into a headless run.
- **Teammates.** Run 3's result says `named=yes`, but that is the model's report, and events 10 and
  11 carry no name. Whether a teammate in a process of its own fires the lead's hooks, or runs
  hooks of its own under an id of its own, was not observed either way.
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
before this design, which adds to the sweep only a file test per task in progress (D6).

The same day #283 found the briefing's one gh call, `gh pr list --state all --limit 200` with
`statusCheckRollup`, taking 9.14 s and 8.10 s against gh's 6 s timer, so the timer kills it and
every pull request is briefed `unknown (gh unavailable)`; without `statusCheckRollup` the list took
1.33 s and 1.65 s. The briefing makes that call only when some checkpoint lists a pull request, and
the table's runs gave it the 6 s timer, except the last row, which set it to 1 s. The owner answered
question 3 with (a) and moved 21 finished checkpoints to `.agent-state/archive/`, which the briefing
does not read. `.claude/hooks/session-start.sh`, three runs each (#283):

| Checkpoints in `.agent-state` | Wall time                 | Load average |
| ----------------------------- | ------------------------- | ------------ |
| 35                            | 23.78 s, 17.35 s, 18.00 s | 18 to 22     |
| 14, after the move            | 13.85 s, 13.06 s, 12.83 s | not recorded |

One run with 35 was over the 20 s timeout. #283's trace at 14 checkpoints puts 6 s on the gh call,
waiting for its timer, and the rest on about 4,300 commands, mostly one `jq` or `git` process per
field per checkpoint. Its fix lists pull requests without the rollups; D9 builds on that list.

## Goals

1. One checkpoint per task, `.agent-state/<task-id>.json`, with one resume check
   (`scripts/agent-resume.sh`).
2. Once the lead has stamped in a session, the child agents of that session are recorded without
   the lead doing anything: their start, their stop, the status line they ended on, and their final
   message as a note to read on demand.
3. A run for a named task reports what changed since its stamp and the children that need a look,
   as information. Contradictions keep today's rules, except that a run for named tasks skips the
   60 s tip check for a branch that drift reports as advanced, rewritten or changed since its stamp
   (N5).
4. Every existing checkpoint stays valid. The sweep stays as it is today, byte for byte, apart from
   one pointer line naming the stamped tasks in progress.
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
checkpoint, briefs it with today's rules and no drift, and then writes the stamp and prints one
line saying so (N1). The lead already runs `scripts/agent-resume.sh <task-id>` after every
checkpoint update, so the stamp is one flag on a step it takes anyway. It runs, prompts or is
denied exactly where `scripts/agent-resume.sh <task-id>` is; this design adds no allow rule and no
command.

- `--stamp` runs no drift, because the stamp it is about to write replaces what drift would compare
  against: a stamp taken right after a checkpoint update never tells the lead to stamp again.
  Drift is shown only by the plain run for named tasks.
- `--stamp` keeps the validate step's exit codes, 0 or 1 for an invalid checkpoint, and reports a
  stamp it could not write in the line `not stamped: <reason>`, never with exit 2 (N5). Exit 2
  stays what it is today: the script could not run, or its arguments were wrong.
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

- _Why:_ runs 1 and 2 show that the id in the lead's shell is the payload's, and events 6, 17, 18
  and 20 that it survives `--resume`, `--continue` and `/compact`. A hook that only writes a file it
  was given cannot misfile a child, because it never chooses a task. A session that never stamped
  is not recorded at all, so a session that works on nothing checkpointed leaves no notes behind
  (B9).
- A fresh start has a new id (events 9, 12, 21 and 22). The children a session starts before its
  first stamp are lost, and nothing records that they existed.
- `--fork-session` and `/clear` are documented to start a new session, which this probe did not
  check. If they do, the next stamp opts the new session in.
- One pattern defines a session id everywhere, in `--stamp`, the hook, drift and retention:
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, the lower-case UUID of all 22
  events. So every folder the hook can write into is one retention can delete (N7). When
  `CLAUDE_CODE_SESSION_ID` is set but does not match it, `--stamp` opts no session in and its
  stamp line says `session none (CLAUDE_CODE_SESSION_ID is not a session id)`.
- The lead's shell has no `CLAUDE_PROJECT_DIR` (run 6), so `--stamp` cannot tell which checkout
  the hooks write into: they write into the one Claude Code was started in (events 21 and 22).
  Run from a linked worktree (`git rev-parse --git-dir` differs from `--git-common-dir`), `--stamp`
  adds the line `child agents are recorded only when Claude Code was started in this checkout`, and
  a run for a named stamped task always prints its Child agents section, empty or not (N2).
- _Rejected:_ hooks that write for every session and a reader that filters (B9), and the first
  draft's hook that searched the checkpoints for the task (D5 of 697bdc16).

**D6. Drift and children appear only in a run for named tasks (T2).**
`scripts/agent-resume.sh <task-id> ...` briefs each named task, then its facts since the stamp and
its child agents; `--stamp` shows neither (N1). The sweep runs no drift and reads no child record.
When any task in progress has a stamp, the sweep prints one pointer line in total, as its first
line, so the SessionStart hook's 4,000-byte cut can never drop it (N8):

```text
stamped tasks in progress: a, b, c (run scripts/agent-resume.sh <id> for drift and child agents)
```

The line is at most 200 bytes: when the ids would make it longer, the last ones that fit are
followed by `+N more`. It costs one file test per task in progress in bash and starts no process.
Every other line of the sweep is today's, byte for byte. The line names the command, and slice 2
adds to the rule text in `.claude/rules/claude-code-config.md`, which today says to run
`scripts/agent-resume.sh` on resuming and that `scripts/agent-resume.sh <task-id>` briefs a task in
full, that a stamped task is resumed with the second. Neither depends on a resume skill such as
`/resume-work`, so a lead that never uses one still sees the drift (N17).

- _Why:_ the sweep runs inside SessionStart's 20 s, and drift for every task would have to prove
  a bound there (B6). A run for a named task has its own timer and no 4,000-byte cut.

**D7. No new contradiction (T1).** Contradictions keep today's rules, except that a run for named
tasks skips the 60 s tip check for a branch that drift reports as advanced, rewritten or changed
since its stamp (N5). The exception removes a line rather than adding one, and only a branch-head
line triggers it: a branch whose only drift line is about its working tree keeps its tip check
(N6). Every fact the stamp makes visible is information, under **Since the stamp**:

- Git facts are read per branch the checkpoint lists, never from the checkout's HEAD, because the
  checkout that holds the checkpoint is often not the task's (B1).
- A branch whose stamped commit is an ancestor of its tip has **advanced**. One that is not (a
  rebase, an amend, a reset) was **rewritten**. When git cannot tell, because a commit is not in
  this repository, the line says **changed** and why. A pull request's head is read the same way,
  so a force push and a local rebase read alike (B13).
- The sweep has no drift, so it keeps the tip check for every branch. A branch committed to after
  its stamp, with the checkpoint not updated since, is therefore a contradiction in the sweep and
  `advanced` in the run for that task. The run sees what the stamp recorded and the sweep does not,
  so for a stamped task the run is the authority, and the sweep's pointer line tells the lead to
  run it.
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

**D9. The briefing's gh answer, shared with the stamp and drift,** filtered locally. D9 builds on
the call as #283 fixes it, not on today's, which asks for `statusCheckRollup` on 200 pull requests
and is killed at gh's 6 s timer (Today's cost). After that fix the briefing lists pull requests
without the rollups, fetches checks only for the open pull requests some checkpoint lists, and
prints one line when the list fails. D9 adds `headRefOid` to that list:

```sh
gh pr list --state all --limit 200 \
  --json number,title,state,headRefName,headRefOid
```

`agent-resume.sh` writes the list and the checks it fetched to one file and hands it to the stamp
and to drift, so neither calls gh. The limit stays 200, the limit today's call has, by the team
lead's ruling of 2026-10-31 (A#20, B15). A pull request listed at the stamp and outside those 200
now gets no drift line, because today's contradiction already reports it:

```text
PR #N is not among the last 200 pull requests gh lists
```

It is never called `gh unavailable`.

**D10. The hooks are bash and jq; node runs only for the stamp and drift (T5, R9).** The hook
wrapper runs no node and no `scripts/` file, so it works where Claude Code was started with a bare
`PATH` (probe 4). The stamp and drift run `scripts/agent-state.mjs`, through `find_node`:

1. each `node` in the `PATH` the script was started with, in order;
2. then each `node` in `AGENT_RESUME_NODE_DIRS`, which defaults to the two folders the script
   already appends to its `PATH` today, `/usr/local/bin:/opt/homebrew/bin` (an empty value means
   none);
3. then the default `node` of `$NVM_DIR/nvm.sh`, with `NVM_DIR` as given or `$HOME/.nvm`;
4. the first whose major version is 22 or later wins. An older one counts as unavailable.

The two variables exist so the tests can point both searches at stub folders, which they must on a
machine like the owner's, where `/usr/local/bin/node` is Homebrew's v26 (probe 4, run 4a) (N4).
`find_node` runs once per run of the script, under the drift timer, nvm included, and the node it
found is handed to every drift and stamp process the run starts (N24). When no node qualifies, a run
for named tasks prints one line, once, however many tasks it names (B20):

```text
node unavailable (no node 22 or later on PATH or through nvm): no drift or child agents in this run
```

`--stamp` gives the same reason in its stamp line instead:
`not stamped: node unavailable (no node 22 or later on PATH or through nvm)`.

**D11. ADR 0041 records one checkpoint system in `.agent-state`,** in this branch, so the design,
the plan and the record merge as one pull request. It stays `Proposed` until the live check in the
last implementation pull request has run against the real hooks, and becomes `Accepted` in that
pull request (T6, B21). The interactive and teammate parts of that check are the owner's to run:
the plan writes them as exact commands with the expected output, and the record is accepted only
after the owner has pasted what they printed. Teammate behaviour that the check does not show stays
out of the Decision (N18). It supersedes nothing on record: the 2026-09-16
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
  archive/<task-id>.json              a finished checkpoint, moved by hand (question 3)
  archive/<name>-<UTC time>/          a worktree's .agent-state, copied by hand (Retention)
  last-session-<branch>.md            the Stop hook's snapshot (unchanged)
```

`agent-resume.sh` lists `.agent-state/*.json` without recursing, so neither a record nor an
archived checkpoint is ever briefed. Stamps sit in a folder of their own, so no task id can collide
with `sessions`, `archive` or a folder of task data. A temporary file is `.<name>.<hex>.tmp` and
never ends in `.json`. Notes and error files end in `.txt`, so SessionStart's listing of `*.md`
notes never prints one. Today `archive` holds only the JSON files of the finished checkpoints the
owner moved there, which that listing never prints either. Slice 2 prunes `sessions` and `archive`
from it anyway, so the `*.md` notes in a worktree copy are not printed again (B17).
Git and `.vercelignore` ignore `/.agent-state`, and a test asserts that `git check-ignore` covers a
stop record and a note.

The hooks write into the `.agent-state` of `CLAUDE_PROJECT_DIR`, the checkout Claude Code was
started in (events 1 to 22). `--stamp` creates the session's directory in the checkout whose script
runs, because the lead's shell has no `CLAUDE_PROJECT_DIR` to name another (run 6). They are the
same checkout when the lead stamps from the checkout it was started in, as the rule text says.
Otherwise the children go unrecorded, and two lines say so (N2): `--stamp` in a linked worktree
prints `child agents are recorded only when Claude Code was started in this checkout`, and every
run for the stamped task prints its Child agents section, which then reads
`Child agents: none recorded for sessions <ids>`. A lead started in a linked worktree that stamps
from the main checkout gets no warning from `--stamp`, only that empty section; this is a stated
limitation.

## The records

Every time in a record is UTC with milliseconds (`YYYY-MM-DDTHH:MM:SS.sssZ`); a checkpoint's
`updated_at` keeps whole seconds. No other property is allowed at any level.

**`stamps/<task-id>.json`** (slice 2)

- `records_version`: 1.
- `at`: when it was stamped.
- `checkpoint_sha256`: the SHA-256 of `<task-id>.json` when it was stamped.
- `sessions`: `{id, at}` for each session that stamped the task, oldest first, at most the last 20.
  A session already listed moves to the end with its new time, so one session stamping 25 times
  never pushes another out (N9).
- `branches`: an object keyed by each branch the checkpoint lists. A branch git could not answer
  for is `null`, with the reason in `branch_errors`, and never nulls another branch (N12). Each
  other value holds:
  - `head`: `git rev-parse --verify refs/heads/<name>`, or null when the branch is not local;
  - `upstream`: the commit of `<name>@{upstream}`, or null when it has none;
  - `worktree`: null when no worktree has the branch checked out (from
    `git worktree list --porcelain`), else `{total, entries}`, where `entries` holds the first 200
    lines of `git -c core.quotePath=true status --porcelain` in that worktree, in git's order and
    with git's default untracked mode, and `total` counts them all (A#28, B18).
- `branch_errors`: an object keyed by each branch that is `null`, holding a fixed reason such as
  `git timed out` or `git failed (exit 128)`; empty when every branch was read.
- `prs`: for each number in the checkpoint's `artifacts.prs` that gh listed, `state`, `head` and
  `ci`; or null when gh could not answer. `ci` is `passing`, `failing`, `pending` or `none`, from
  the ported `rollupChecks` over the checks the briefing fetched, or null for a pull request whose
  checks it did not fetch: one that is not open, or one whose checks call failed (D9).

**`<agent-id>.start.json`** (slice 3): `records_version`, `session_id`, `agent_id`, `agent_type`,
`at`.

**`<agent-id>.stop.json`** (slice 3): the same, plus `status` and `note`.

- `status`: `done`, `done_with_concerns`, `blocked` or `needs_context` when the last non-blank
  line of the final message carries that status word, in the shapes the 10-13 status line
  accepted (a list marker, emphasis, a heading, `Status:`); `ended` otherwise, including a blank or
  missing message. A status above the last non-blank line does not count. There is no transcript
  fallback: a stop with no message is `ended`. "Ended" says only that the child stopped without
  reporting a status.
- `note`: the note's file name, `<agent-id>-<16 hex>.txt`, chosen before either file is written, or
  null when the final message was blank or missing. The record is written first and the note
  second (N11), so a note never exists without a record that names it; a record whose note is
  absent is shown as `note missing`.
- A session id must match D5's UUID pattern and an agent id `^[A-Za-z0-9_-]{1,64}$`; the probe saw
  `a` followed by 16 hex digits. An event that fails either is not recorded.
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

1. It validates the checkpoint and briefs it with today's rules: its contradictions and "Needs
   attention", and no drift or child agents (N1). An invalid checkpoint stops it here with exit 1,
   and nothing is written.
2. It deletes the session folders idle for 14 days, except the run's own session's (Retention).
3. When `CLAUDE_CODE_SESSION_ID` matches D5's pattern, it creates `.agent-state/sessions/<id>/`
   (mode 0700) if it is missing. From then on the hooks record that session's children.
4. With the node `find_node` found, under the drift timer, `scripts/agent-state.mjs stamp` reads git
   per listed branch (optional locks off, each call bounded at 5 s), takes the pull request facts
   from the briefing's gh answer, reads the old stamp's `sessions`, moves or appends the session,
   and writes `.agent-state/stamps/.<task-id>.<hex>.tmp`, fsyncs it and renames it over
   `<task-id>.json`.
5. It prints exactly one stamp line, and in a linked worktree D5's warning line after it:

```text
stamped <task-id>: <n> branches, <m> PRs, session <id>
not stamped: <reason>
```

`<n>` counts the branches recorded, followed by `(<k> not read)` when some are `null`; `<m> PRs`
reads `PRs unknown (gh gave no answer)` when gh failed; `session <id>` reads `session none` when no
session was opted in, with D5's reason when `CLAUDE_CODE_SESSION_ID` is set but invalid. The
reasons for `not stamped` are fixed: D10's node phrase, `timed out after <s> s`, or
`could not write .agent-state/stamps/<task-id>.json`.

Steps 2 and 3 run in bash, so old sessions are deleted, and a session opts in, even when node is
unavailable. Exit codes are the validate step's (N5): 0, with the stamp written or not, and 1 when
the checkpoint is invalid. Exit 2 stays what it is today: the script could not run, or its
arguments were wrong (no task id, or more than one).

## The subagent hooks (slice 3)

`.claude/settings.json` gains SubagentStart and SubagentStop entries that run
`bash "$CLAUDE_PROJECT_DIR/.claude/hooks/subagent-state.sh"` with a 10 s timeout. The wrapper is
bash 3.2 and jq, with its jq programs inside it:

- It sets `umask 077` and appends `AGENT_STATE_HOOK_DIRS`, by default `/usr/bin:/bin`, to the
  inherited `PATH`, so the basic tools and `/usr/bin/jq` resolve under a bare `PATH` (probe 4, run
  4b). The variable exists for the tests, which run the real wrapper with a `PATH` of linked tools
  and no `jq`: the test of a missing `jq` sets it empty, and the test of the fallback sets it to
  a temporary folder whose stub `jq` runs the suite's own, so no test assumes `/usr/bin/jq`
  exists and both behave the same on any machine (N22).
- It reads its whole standard input before anything else, keeping at most 64 MiB and discarding the
  rest, so no early exit leaves Claude Code writing into a closed pipe, and it writes nothing to
  standard output (N26).
- It exits 0, writing nothing, when `CLAUDE_PROJECT_DIR` is unset or `.agent-state/sessions` does
  not exist there.
- It validates the event name and both ids, and skips an event with an empty `agent_type`.
- When `.agent-state/sessions/<session_id>/` does not exist, it exits 0 and writes nothing. That is
  the opt-in.
- On SubagentStart it writes `<agent-id>.start.json`. On SubagentStop it reads the status, chooses
  the note's name when the message is not blank, writes `<agent-id>.stop.json`, and then the note
  (N11). Each write goes to a `.tmp` file in the same folder and is renamed into place. A note that
  cannot be written leaves a record whose note is shown as `note missing`, and an error file.
- On a failure it writes `errors/<agent-id>.<event>.txt`. A payload whose ids failed their patterns
  gets `errors/invalid-payload.<pid>.txt` when its session id passed and its folder exists.
- When `jq` is missing it cannot read the payload. It writes `errors/jq-not-found.<pid>.txt` into
  the folder of `CLAUDE_CODE_SESSION_ID`, which equalled the payload's id in all 22 events, when
  that id matches D5's pattern and its folder exists.
- It always exits 0, because a SubagentStop hook that exits 2 keeps the child running, and a hook's
  stderr reaches no one.

A spike of this wrapper passed 47 cases on both jq builds, including every status shape the 10-13
tests used, the byte cap with 2- and 4-byte characters, the opt-in, invalid input, the compaction
agent and a second stop. Replaying events 1 to 20 through it wrote five stop records (`done`,
`ended`, `blocked`, `done`, `blocked`, the last for child E's second stop) and skipped event 19.
Ten stops took a median of 61 to 68 ms each, at a load average of 35 to 42. The spike wrote the note
before the record, read its input after its first checks and had no `AGENT_STATE_HOOK_DIRS`; slice
3 changes all three (N11, N26, N22), and its tests are ported from the spike's cases with those
changes.

The reader merges what it finds. A stop at or after the start gives a stopped child. A start alone,
or a start after the stop (a child resumed, event 15), gives a child with no stop recorded. A stop
alone gives a stopped child whose start was missed. The two events never share a file, so their
order does not matter. The reader trusts no record: it checks every field against the hook's own
patterns (the status set, the `agent_type` and id patterns, the note name, the time format) and
prints `invalid record <file>` and nothing else from a record that fails (N16).

## What a run for a named task gains

`scripts/agent-resume.sh <task-id> ...` keeps today's validation, briefing, contradictions, "Needs
attention" and exit codes; `--stamp` runs none of what follows (N1). For each named task that has a
stamp, before its briefing is printed, the script runs `scripts/agent-state.mjs drift` with the node
`find_node` found, in one child process under the timer `AGENT_RESUME_DRIFT_TIMEOUT` (default 10 s,
a whole number from 1 to 999), which kills the process group as the network calls' timer does.
`find_node` itself runs once, before the first task's drift, under the same timer (N24). Drift
reads the stamp, git, the gh answer file and the session records, and prints one JSON object per
line, each `{"section", "kind", "branch", "text"}`:

- `kind` is one of a fixed set: `head` for a branch-head line (`advanced`, `rewritten` or
  `changed`), `worktree`, `upstream`, `pr`, `checks`, `not-compared`, `child`, `summary`;
- `branch` is null where no branch is meant.

The script keeps only lines that parse as complete JSON objects with a known `section` and `kind`,
so a drift killed mid-line loses that line and nothing else. It then briefs the task, skipping the
tip check for each branch that has a `head` line and for no other (N6), and prints the drift's
sections after the task's contradictions, in a fixed order (B7):

**Since the stamp** (never a contradiction; one fact, one line, A#19):

- `branch feat/x advanced 3 commits since the stamp (1a2b3c4..5d6e7f8)`, or `rewritten`, or
  `changed`, with `; upstream advanced 3 commits` or `rewritten` appended when the upstream moved;
- `worktree of feat/x: 5 entries new and 2 gone since the stamp`, then at most 10 new entries and
  `+N more`, and `(first 200 compared)` when either list was cut. Each entry is printed in
  backticks, with every byte outside printable ASCII and every backtick and backslash written as
  `\xNN`, so a file name cannot end the code span or carry a control character (N16). A
  working-tree line never skips the tip check (N6);
- `feat/x: not compared: git timed out`, or another fixed reason, for a branch that is `null` in the
  stamp or that git could not read now; the other branches are compared as usual, and this one keeps
  its tip check (N12);
- `PR #282 head advanced (1a2b3c4..9f8e7d6)`, or `rewritten` or `changed`;
- `PR #282 checks: pending -> passing`, only when the stamp and now both have a `ci` verdict.
  Checks failing now print nothing here, because today's attention line names them, and a pull
  request's state prints nothing here, because today's rules report a merged or closed one;
- one line replaces the section when the stamp is stale, and then the tip check runs for every
  branch: `not compared: the checkpoint changed after its stamp; stamp it again`.
- `pull requests not compared: gh gave no answer at the stamp`, or `now`.

**Child agents** (T4), for the sessions in the task's stamp and the run's own session, the
`CLAUDE_CODE_SESSION_ID` it runs with, grouped by session. The section is printed for every stamped
task, also when it has nothing to list, so an empty section is a fact on screen rather than an
absence (N2). An example, with made-up ids and `<S1>` and `<S2>` standing for two full session ids:

```text
Child agents:
  session <S1> (this session; stamped by task-a)
    `general-purpose` a1111111111111111: blocked, 2026-10-31 10:41:07Z to 10:41:12Z,
      note .agent-state/sessions/<S1>/notes/a1111111111111111-1f2e3d4c5b6a7980.txt
    `explore` a2222222222222222: running since 2026-10-31 10:44:01Z
    `explore` a4444444444444444: done_with_concerns, 2026-10-29 08:02:11Z to 08:09:40Z,
      note missing
    not listed: 2 done, 1 ended in the last 48 h
  session <S2> (stamped by task-a, task-b)
    `general-purpose` a3333333333333333: no stop recorded, since 2026-10-31 09:12:44Z
    invalid record a5555555555555555.stop.json
  hook errors: 2 in the last 48 h (see .agent-state/sessions/<S1>/errors/)
```

and, when nothing qualifies, one line:

```text
Child agents: none recorded for sessions <S1>, <S2>
```

- A child that stopped `blocked`, `needs_context` or `done_with_concerns` is listed for as long as
  its session folder is kept, 14 days (N3). A child with no stop recorded is listed when it started
  in the last 48 h: `running` in the run's own session and `no stop recorded` in any other, which
  may be a live session or one that ended with the child (B11). Every time carries its date (N19).
- A child in the run's own session that died without a stop event is called `running` until 48 h
  after its start. This is a stated limitation (N10); the date beside it lets the lead judge.
- `done` and `ended` children of the last 48 h are counted in one line per session.
- A stop record whose note file is absent ends in `note missing` (N11). A record that fails any of
  the hook's patterns prints `invalid record <file>` and nothing from it (N16).
- A session's line names every task whose stamp lists it, so a child of a session shared by two
  tasks is shown once per task run, with both tasks named, and never raised as attention for either
  (B4).
- `child records: unavailable, jq not found in hooks (see <path>)` when a session has a
  `jq-not-found` error file from the last 48 h.
- `no child records for this session in this checkout` when the run's own session is valid and
  has no folder here, and `no session known` when the stamp lists none and
  `CLAUDE_CODE_SESSION_ID` is unset.

**Bounds.** A task's contradictions and attention lines are never cut. Since the stamp lists at most
10 entries per worktree, and Child agents at most 20 children per run, each with `+N more` and the
folder to look in. A run's node work takes at most one timer for `find_node` and one per named task
with a stamp. When a timer fires, `drift: timed out after 10 s` replaces that task's sections, and
`drift: failed (exit N)` replaces those of a drift that exited non-zero without printing. Either way
the tip check runs for every branch of that task.

## Threat model

Two channels carry text that no one reviewed into the briefing, which reaches the next session's
context (N16):

- **What a child wrote**: its final message and the fields of its records. The message is written
  to a note with mode 0600 and never printed by the briefing, the SessionStart hook or the stamp;
  the lead reads it on purpose, as data. Error files hold fixed messages only. Everything the
  briefing prints about a child comes from a fixed set or a pattern (D8), and drift checks every
  record field against the hook's patterns again before printing it, so a record written by
  anything other than the hook prints `invalid record <file>` and no field. An id that fails its
  pattern is never recorded, so no path built from one can leave `sessions/`.
- **File names in a working tree**, which any child or tool can create. Drift prints them only as
  escaped code spans (Since the stamp), never raw, and at most 10 per worktree.
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

New: the `--stamp` flag and its stamp line, `find_node` with its two test overrides, the drift
timer, the stamp's deduplicated `sessions` and per-branch facts, `drift` with its kinds, sections
and caps, the escaping of file names, the re-validation of records, the merge of start and stop
records, the session opt-in and the 14-day retention with its location check, the error files, the
sweep's pointer line, and the prune of `sessions` and `archive` from SessionStart's listing.

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
- **gh or git unavailable or slow.** The stamp records an unknown pull request fact as null and a
  branch git could not read as `null` with its reason, one branch at a time, and exits 0 (N12).
  Drift says `not compared` for that branch and compares the others. The briefing reports unknowns
  as it does today. None of it is a contradiction.
- **node unavailable or older than 22.** A run for named tasks prints D10's line once, and
  `--stamp` prints `not stamped: node unavailable (...)` and keeps the validate step's exit code
  (N5). The session still opts in and old sessions are still deleted. Every check of today runs,
  the tip check for every branch included.
- **jq missing in the hooks.** No record is written, and the run says so loudly (Child agents).
- **A note that cannot be written.** The stop record is written first and names the note it was
  about to write (N11), so the run shows the child with `note missing`, and an error file says
  why. A note can never exist without a record.
- **Claude Code started in another checkout.** The hooks write into that checkout's `.agent-state`.
  `--stamp` in a linked worktree says so, and the run's Child agents section is printed empty, with
  the sessions it looked for (N2).
- **A symlinked `.agent-state` or `sessions`.** Retention resolves the folder first and skips with a
  reason rather than follow it (Retention, N7).
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
- **A child that never stops.** It is `running` or `no stop recorded`, with its start date, for
  48 h, then no longer shown (N10).
- **Automatic compaction (N25).** The only compaction observed is event 19, after a `/compact`
  typed into a headless run; automatic compaction was not probed. If it fires SubagentStop with a
  non-empty `agent_type`, the hook records the conversation's summary as a child's note, with the
  status `ended` unless the summary's last line carries a status word. The note stays local, mode
  0600, and is never quoted (D8, S6). The live check asks the owner for the type of any automatic
  compaction it meets.

## Retention

- **Sessions, automatically.** Every `--stamp` deletes each `.agent-state/sessions/<id>/` in which
  no file or folder changed in the last 14 days (`find <folder> -mtime -14 -print -quit` prints
  nothing). Before deleting anything it checks where it is (N7):
  - it resolves `.agent-state/sessions` with `realpath` and requires the result to equal
    `<toplevel>/.agent-state/sessions`, where `<toplevel>` is the resolved path
    `git rev-parse --show-toplevel` gave, which the script already refuses to run without; a
    symlinked `.agent-state` or `sessions` fails that, and the stamp prints
    `retention skipped: <reason>` and deletes nothing;
  - it deletes only folders directly under it whose names match D5's session id pattern, the
    lower-case UUID, and that are not symlinks, never through a variable that may be empty.

  A test covers a folder 15 days old, one with a fresh note inside an old folder, a symlink, a
  name that fails the pattern (an upper-case UUID among them), and a symlinked `.agent-state`.

- **Tasks, by hand**, as for checkpoints today: move a finished `.agent-state/<task-id>.json` to
  `.agent-state/archive/`, as the owner did for question 3, or delete it, and delete
  `.agent-state/stamps/<task-id>.json` with it, since nothing reads a stamp once its checkpoint has
  gone.
- **Before `git worktree remove`**, from the main checkout, with a destination unique to the run
  (N20):

  ```sh
  mkdir -p .agent-state/archive
  /bin/cp -Rp .claude/worktrees/<name>/.agent-state \
    ".agent-state/archive/<name>-$(date -u +%Y%m%dT%H%M%SZ)"
  ```

  `-p` keeps the notes' mode 0600 and the files' times (A#23), and the time in the name means a
  second copy never lands inside the first, and no copy is named like a checkpoint moved there. The
  resume check lists only `.agent-state/*.json`, so an archived checkpoint is never briefed, and
  SessionStart's listing prunes `archive`, so a copied note is never printed again (B17).

## Existing checkpoints stay valid

- `scripts/agent-state.schema.json` and the `validate` program in `agent-resume.sh` do not change,
  so every checkpoint written since #97 validates as before, with the same exit code.
- A task without a stamp is briefed as today in every run, and starts no node process.
- The schema-driven test that reads the allowed keys from `agent-state.schema.json` keeps passing
  unchanged, and that is one of the stop conditions.

## Slices

1. **This branch** (`docs/checkpoint-one-system-plan`): the design, the plan and ADR 0041
   (`Proposed`), one pull request, opened after the third review round.
2. **Stamp and drift** (`feat/checkpoint-stamp-drift`), branched from `main` after slice 1, #280 and
   the fix for #283 have merged: the stamp's schema, the module, `find_node`, `--stamp`, the session
   opt-in and retention, drift's Since the stamp, the sweep's line, the SessionStart prune and the
   rule text. It touches no settings file.
3. **Child agents** (`feat/checkpoint-child-agents`), after slice 2: the child records' schema, the
   hook wrapper, the settings entries, the Child agents section, and the live check, after which
   ADR 0041 becomes `Accepted` once the owner has pasted the output of their part of it (N18).

### If the owner chooses drift only (question 1 b, N15)

Not taken: the owner answered 1 (a) on 2026-10-31. The path stays as the team lead ruled it (N15).

- Slice 3 is dropped, with its hooks, settings entries, records and tests.
- Slice 2 creates no `sessions/` folder, opts no session in and has no retention; `--stamp` writes
  only the stamp, and its line ends at `<m> PRs`. The stamp has no `sessions` field.
- The sweep's pointer line and D10's node line name drift alone:
  `stamped tasks in progress: a, b (run scripts/agent-resume.sh <id> for drift)` and
  `node unavailable (...): no drift in this run`.
- Before it is accepted, the still-`Proposed` ADR 0041 is edited to remove the child records from
  its Decision and Consequences, and its live check moves to slice 2: a headless and an
  interactive run of `--stamp` and of the named run against a real task, pasted by the owner.
- D5, D8, the hooks and Child agents sections of this design stay as the record of what was
  considered, under a dated note that the owner chose drift only.

## Testing

- Red first, for real: each test asserts the exit code and the output, so it fails against the code
  as it was. A test that cannot fail against that code, such as one that asserts an absence or pins
  today's output, is labelled a guard and is not counted as red first (A#26).
- Only the tests that make a call hang set `AGENT_RESUME_GIT_TIMEOUT`, `AGENT_RESUME_GH_TIMEOUT` or
  `AGENT_RESUME_DRIFT_TIMEOUT` to 1; every other test runs with the default timers, so a test of
  normal work cannot pass only because a short timer cut it (N13). A hang test costs one timer for
  each bounded call it makes hang, 1 s each, because `limited` sends SIGTERM to the call's process
  group and the stubs exit on it; its `{ timeout }` is that count in seconds plus 10 s. `limited`
  sends no SIGKILL, so a stub that ignored SIGTERM would hang the test until that `{ timeout }`;
  the stubs do not ignore it, and this design does not change the timer.
- `scripts/agent-state.test.mjs` (`node:test`, no dependencies) covers the ported helpers with the
  10-13 cases that still apply, then `stamp` and `drift` end to end in temporary repositories, with
  stub `gh` and `git` from #280's helper.
- `scripts/agent-resume.test.mjs` gains `--stamp` with its full output pinned, `find_node` (a
  qualifying node later on `PATH`, only an old one, nvm from a stub `NVM_DIR`, each with
  `AGENT_RESUME_NODE_DIRS` pointing at a stub folder, so the owner's `/usr/local/bin/node` never
  answers), the timer, each drift line, the tip-check skip per branch, the sweep's line and a guard
  that the sweep starts no node.
- `scripts/claude-hooks.test.mjs` gains the wrapper's cases from the spike, changed for N11, N22
  and N26, its `umask`, `git check-ignore` on a stop record and a note, and the pruned listing.
- Like every `scripts/` suite, the new tests pass in an isolated copy without `node_modules`. The
  copy holds `scripts/`, its `.sh` files included, and `.claude/hooks/`, which the tests run (N21).

## Questions for the owner

Recommended option first. The team lead put these to the owner on 2026-10-31, after the third
review, and the owner answered the same day: 1 (a), 2 (a) and 3 (a).

1. **Children briefed per session in a run for a named task (T4), with hooks that record a session
   only after it stamps (T5)?**
   - (a) Yes. **Recommended**: no hook runs node, a session that never stamps leaves nothing, and
     no child is raised under a task it may not belong to.
   - (b) Drift only: ship the stamp and drift alone, on the path in Slices (N15).
   - **Answer: (a).** The child records ship; the drift-only path is not taken.
2. **What happens to the 10-13 worktree and its archive?**
   - (a) Keep both until the last implementation pull request merges, then remove them.
     **Recommended.**
   - (b) Remove the worktree now and keep only the archive patch.
   - **Answer: (a).** Both stay until the last implementation pull request merges.
3. **SessionStart already takes 15 to 17.6 s of its 20 s with 35 checkpoints. What now?**
   - (a) Move the finished checkpoints (their JSON files only) to `.agent-state/archive/` by hand
     now, and open an issue to cut the resume check's processes per task. **Recommended.**
   - (b) Raise the SessionStart timeout in `.claude/settings.json` to 30 s.
   - (c) Leave it until a session start times out.
   - **Answer: (a).** 21 finished checkpoints moved; SessionStart went from 17.35 to 23.78 s with 35
     checkpoints to 12.83 to 13.85 s with 14 (Today's cost). The issue is #283.

# One checkpoint system with child agents — design

**Date:** 2026-10-31
**Status:** Proposed, second draft. The owner chose option A on 2026-10-31. The first adversarial
review's 36 findings are folded in, and the questions at the end are open.
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
  kept by `scripts/checkpoint.mjs` (2,559 lines). It saves the checkpoint through a locked merge
  patch. Its SubagentStart and SubagentStop hooks record each child agent of the lead session, with
  the child's final message as a note and the status line the child ended on. Its `verify`
  compares what the task last recorded with HEAD, `git status --porcelain`, a digest of the changed
  files' content and each pull request's state, checks and head.

Main records no child agents, and never compares HEAD, the working tree or a pull request's checks
with what the task last knew. The 10-13 code does all three, but in the location the owner turned
down on 2026-09-16 ("All state in .agent-state/"), because Claude Code protects `.claude`: no allow
rule pre-approves a write there, and only `bypassPermissions` writes there reliably.
`.claude/rules/claude-code-config.md` still says so. No ADR records either ruling. On 2026-10-31
the owner chose option A: keep `.agent-state/<task-id>.json` as the only checkpoint and bring the
10-13 parts to it.

The first draft of this design (commit 697bdc16 on this branch) went through an adversarial review
with 36 findings, all accepted. The six rulings that resolve most of them are folded in below: S1,
contradictions stay definite; S2, drift runs only for unfinished tasks; S3, one writer per file
and no locks; S4, children bind to the session, not the task; S5, the live probe runs first; S6,
the briefing never quotes a child's text.

## The probe (2026-10-31)

Run before anything else was decided (S5), from an empty scratch git repository (`$PROBE`) with
Claude Code 2.1.316. Each run was headless and loaded only a settings file passed on the command
line, so no tracked, user or local settings file was read or changed. The settings file wires
SessionStart, SubagentStart and SubagentStop to `bash $PROBE/capture.sh`, which appends each
payload to `events.jsonl` with the hook process's own `CLAUDE_CODE_SESSION_ID` and
`CLAUDE_PROJECT_DIR` added. The runs started with the calling session's `CLAUDE_CODE_*` variables
unset, apart from `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

```sh
cd "$PROBE"
claude -p --setting-sources local --settings "$PROBE/probe-settings.json" --strict-mcp-config \
  --model sonnet --output-format json \
  --allowedTools "Bash(printenv CLAUDE_CODE_SESSION_ID)" "Agent" <prompt-1.txt   # run 1
claude -p --resume <run 1 session id> <the same flags> <prompt-2.txt          # run 2
claude -p <the same flags, tools "Agent" "SendMessage"> <prompt-3.txt         # run 3
```

- Run 1: print `CLAUDE_CODE_SESSION_ID` from the Bash tool; start child A, told to end on `DONE`;
  then child B, told to reply with one line and no status line.
- Run 2: resume run 1's session, print the variable again, start child C, told to end on
  `BLOCKED`.
- Run 3: start one agent with a `name`, the way a lead names a teammate.

The output, with session ids cut to eight characters:

```text
run 1 result: env=8b8a74cc-…   (the Bash tool's CLAUDE_CODE_SESSION_ID)
  SessionStart  session_id=8b8a74cc source=startup  hook env CLAUDE_CODE_SESSION_ID=8b8a74cc
  SubagentStart session_id=8b8a74cc agent_id=ad37de7d4ee580924 agent_type=general-purpose
  SubagentStop  session_id=8b8a74cc agent_id=ad37de7d4ee580924
                last_assistant_message="probe child A\nDONE"
  SubagentStart session_id=8b8a74cc agent_id=a7e71c36ad3b4cb5f agent_type=general-purpose
  SubagentStop  session_id=8b8a74cc agent_id=a7e71c36ad3b4cb5f
                last_assistant_message="`probe child B`"
run 2 result: env=8b8a74cc-…
  SessionStart  session_id=8b8a74cc source=resume
  SubagentStart session_id=8b8a74cc agent_id=a836dfef063750ae3
  SubagentStop  session_id=8b8a74cc agent_id=a836dfef063750ae3
                last_assistant_message="probe child C\nBLOCKED"
run 3 result: spawned=yes, named=yes, result=probe mate
  SessionStart  session_id=13696d11 source=startup
  SubagentStart session_id=13696d11 agent_id=a04832edcbbafdb6a agent_type=general-purpose
  SubagentStop  session_id=13696d11 agent_id=a04832edcbbafdb6a
                last_assistant_message="probe mate\nDONE"
```

Every hook process saw its own `CLAUDE_CODE_SESSION_ID` equal to the payload's `session_id`, and
`CLAUDE_PROJECT_DIR` set to the probe directory with `/tmp` resolved to its real path. The Bash
tool's environment had no `CLAUDE_PROJECT_DIR`. A SubagentStart payload carries `agent_id`,
`agent_type`, `cwd`, `hook_event_name`, `prompt_id`, `session_id` and `transcript_path`. A
SubagentStop payload adds `agent_transcript_path`, `background_tasks`, `effort`,
`last_assistant_message`, `permission_mode`, `session_crons` and `stop_hook_active`.

The answers to S5's questions:

1. **Is `CLAUDE_CODE_SESSION_ID` set in the lead's Bash?** Yes, in runs 1 and 2.
2. **Does it equal the hook payload's `session_id`?** Yes, for all three events, in every run.
3. **Does a resumed session keep the id?** Yes: `--resume` fired SessionStart with
   `source=resume` and the same id, and child C carries it. A compacted session keeps it too: the
   session that ran this probe had been compacted and kept its id. Not tried: `--fork-session`,
   which documents a new id, and `/clear`.
4. **Does a teammate fire SubagentStart and SubagentStop?** A named agent started in the lead's
   process does, with the lead's id, and its transcript sits under the lead's session. A teammate
   in a process of its own, like the session that wrote this design, has its own session id and
   runs its own SessionStart hook. Whether the lead's hooks fire for such a teammate could not be
   observed here, so it is unverified.
5. **What does a child with no status line look like?** Child B: its `last_assistant_message` has
   no status line, so it is recorded as `ended` (S6).

What follows from it:

- The session id is a reliable key: the same in the lead's shell and in every payload, and stable
  across resume and compaction. Children bind to it (D5).
- A session started with `--fork-session` or after `/clear` has a new id. The lead's next stamp adds
  it to the task's sessions, so only the children started between the new session and that stamp
  are missed.
- A teammate in its own process keeps its own checkpoint, as before. Child records cover the
  lead's in-process children only, and the briefing never claims more.
- Hooks always have `CLAUDE_PROJECT_DIR`, so the wrapper needs no `$PWD` fallback, and drops it.

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
least ten `jq` and `git` processes for each checkpoint, finished ones included, and more for each
branch and file it lists. So today's margin at this count is 2.4 s, before any of this design.
Owner question 4 asks what to do about it. This design adds no per-task process to that loop and
runs its own work alongside it.

## Goals

1. One checkpoint per task, `.agent-state/<task-id>.json`, with one resume check
   (`scripts/agent-resume.sh`) and one briefing at session start.
2. The child agents of a lead's session are recorded without the lead doing anything: their start,
   their stop, the status line they ended on, and their final message as a note to read on demand.
3. The resume check reports what changed since the lead last recorded the facts. A contradiction
   still means the checkpoint is wrong. Progress since then (commits, a changed working tree, a
   pull request's new head or green checks, children that started or stopped) is reported apart,
   and never as a contradiction.
4. Every existing checkpoint stays valid and is briefed as today, and SessionStart stays inside its
   20 s.
5. The parts of the 10-13 code that still fit are ported, unchanged where they can be. The design
   names what is ported unchanged, what is ported with changes, and what is new.

## Non-goals

- A second location, or a second file per task under another name. Nothing is written under
  `.claude`.
- Changing how the lead writes its checkpoint. It stays hand-written JSON, and no script rewrites
  it.
- A schema version bump (D3).
- Recording teammates that run in their own process (the probe). Each keeps its own checkpoint.
- Locks of any kind (S3), a digest of file contents, a check of a note against a recorded hash, and
  counts of hook errors (R14).
- Retention beyond the steps by hand under Retention.
- Making today's per-task loop cheaper. That is owner question 4.
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

**D2. One writer per file, and no locks (S3).**

- `.agent-state/<task-id>/stamp.json` has one writer, the `stamp` command. It writes a temporary
  file and renames it over the old one, and when two stamps of a task race, the last rename wins.
- `.agent-state/sessions/<session-id>/<agent-id>.start.json` and `<agent-id>.stop.json` are
  written by the hook for that one event, each once per event. The reader merges the two.
- A note is a new file with a random suffix, written once.
- The hook error log is one per session directory, rotated by renaming it.
- _Why:_ no two processes ever write one file, so nothing can lose an update and nothing needs a
  lock, a stale-lock rule or a retry. The 10-13 `withLock` and `breakIfStale` were the most
  intricate code in it, and they are dropped.
- _Rejected:_ one record per child that its start and its stop both update under a lock, as the
  first draft had.

**D3. `scripts/agent-state.schema.json` does not change, and `schema_version` stays 1.** The
records get their own schema, `scripts/agent-state-records.schema.json`, versioned on its own. Each
definition ships in the pull request that ships its writer (R36): the stamp's in slice 2, the child
records' in slice 3.

- _Why:_ no field is added to the checkpoint, so every checkpoint validates under every copy of
  `agent-resume.sh`, including an older copy in another worktree that meets a copied checkpoint.
- _Rejected:_ optional fields in the checkpoint. An older validator rejects them as unknown
  properties whatever the version says.

**D4. The lead records the facts with `node scripts/agent-state.mjs stamp <task-id>` after each
update of its checkpoint.** The stamp stores the checkpoint's SHA-256, so a checkpoint updated
after its stamp is known to be ahead of it. No allow rule is added for the command (owner question
2): in the default mode each stamp prompts, as any other script does.

- _Why:_ HEAD and a porcelain list cannot be written by hand, and the hash ties the facts to the
  checkpoint text they describe.
- _Rejected:_ a PostToolUse hook that stamps after every write to `.agent-state/*.json`, and facts
  written into the checkpoint by a script (D1).

**D5. Children bind to the session, not the task (S4).** The hooks write under
`.agent-state/sessions/<session_id>/`, taking the id from the payload. They never read a
checkpoint, never search for a task and never run git. The stamp appends the lead's
`CLAUDE_CODE_SESSION_ID` to a `sessions` list in `stamp.json`. The resume check joins task, sessions
and child records: a task's children are the records of its sessions that started no earlier than
60 s before the task's stamp.

- _Why:_ the probe showed that the id in the lead's shell is the payload's, and that it survives
  resume and compaction. A hook that only writes one file is fast, and it cannot misfile a child,
  because it never chooses a task.
- _Rejected:_ the first draft's hook, which found "the newest unfinished task bound to the session"
  by reading checkpoints across worktrees. It ran git in every hook and read files a lead might be
  writing.
- A stamp taken where `CLAUDE_CODE_SESSION_ID` is unset records no session, and the briefing says
  `binding: unknown` for that task.
- One session that works two unfinished tasks binds both. A child then shows under each task whose
  stamp it postdates, which says no more than what happened.

**D6. The resume check stays `scripts/agent-resume.sh`.** Its sections stay, and its exit codes 0,
1 and 2 keep their meanings. It runs `node scripts/agent-state.mjs drift` once, for the tasks that
have a stamp and a step in progress (S2), and places the lines it returns.

- _Why:_ one entry point and one briefing, already wired into SessionStart and the skills. A
  finished task, or one without a stamp, costs nothing new.
- _Rejected:_ the 10-13 `verify` with its own exit codes, where 1 meant drift.

**D7. Contradictions stay definite (S1).** Drift adds two, from the ported `ancestry`, for a task
whose stamp is current:

- "the stamped head <sha> is not in this repository";
- "HEAD <sha> does not descend from the stamped head <sha>" (rebased, reset, behind it, or on
  another line of history).

Everything else that changed since the stamp goes to a new, informational section, **Since the
stamp**, which is never a contradiction. Checks that went from passing to failing join the
existing failing-checks line under "Needs attention": one line per pull request, never two. A pull
request's state is checked by today's rule only.

The 60 s tip check is skipped for a task only when drift printed an ancestry result for it (R2):
then commits after the stamp are reported as progress, and a rewritten history as the
contradiction above. In every other case (a stale stamp, node missing, drift timed out, git unable
to answer) the tip check runs as today.

- _Why:_ the first draft made green checks a contradiction, which fired on every pull request that
  finished CI after its stamp. A contradiction must mean "trust git and gh, and fix the
  checkpoint", or it stops being read.
- _Rejected:_ progress as a contradiction (the first draft's D7), and checks as a contradiction
  (its question 3).

**D8. The briefing never quotes a child's text (S6).** A child is one line: status, agent type,
start and stop times, and the path of its note. The note is mode 0600 and read on demand.

- _Why:_ the briefing is injected into the next session's context, and a child that read a web
  page or a pull request body can end on any text. Fields the hook derives from a fixed set (the
  status, a validated type, times, a path built from validated ids) cannot carry an instruction.
- _Rejected:_ a quoted, flattened summary (the first draft's D8). Making text printable does not
  make it inert.

**D9. One gh call, the same for the stamp and the resume check (R20),** filtered locally:

```sh
gh pr list --state all --limit 200 \
  --json number,title,state,headRefName,headRefOid,statusCheckRollup
```

`agent-resume.sh` gains `headRefOid` and hands its answer to `drift` in a file, so drift never
calls gh.

- _Review note:_ the review's ruling named `--limit 100` and four fields. Today's briefing reads
  `headRefName` for two of its contradictions and `title` for its pull request lines
  (`scripts/agent-resume.sh`, the `briefing` program), and a limit of 100 would make older pull
  requests unknown where today they are checked. This draft keeps 200 and the two fields, for the
  team lead to confirm.
- A pull request unknown at stamp time and known later is not drift. One known at stamp time and
  unknown now is briefed as today's `PR #N: unknown (gh unavailable)`.

**D10. Neither the resume check nor the hook wrapper loads nvm.** Both run `node` from `PATH`; when
there is none, the hook writes nothing and the briefing says so (Unknown). Loading nvm took 2.8 s on
the owner's machine, more than the whole drift budget. The code uses nothing newer than Node 22,
and CI runs its tests on Node 22.

**D11. ADR 0041 records one checkpoint system in `.agent-state`,** in this branch, so the design,
the plan and the record merge as one pull request (R24). It supersedes nothing on record: the
2026-09-16 ruling never reached an ADR, and the 10-13 work was never merged.

## Layout on disk

```text
.agent-state/
  <task-id>.json                      the checkpoint; only the lead writes it (unchanged)
  <task-id>/stamp.json                written only by `stamp`
  sessions/<session-id>/
    <agent-id>.start.json             written once by SubagentStart
    <agent-id>.stop.json              written by SubagentStop, replaced if the child stops again
    notes/<agent-id>-<16 hex>.txt     a child's final message, mode 0600
    hook-errors.log                   the wrapper's failures in this session; .1 once rotated
  last-session-<branch>.md            the Stop hook's snapshot (unchanged)
```

`agent-resume.sh` lists `.agent-state/*.json` without recursing, so a record is never mistaken for
a checkpoint. A temporary file is `.<name>.<pid>.<hex>.tmp` and never ends in `.json`. Notes end in
`.txt`, so SessionStart's listing of `*.md` notes never prints one, and slice 3 also prunes
`sessions` from that listing. Git and `.vercelignore` ignore `/.agent-state`, and a test asserts
that `git check-ignore` covers a stop record and a note (R23).

The hooks write into the `.agent-state` of `CLAUDE_PROJECT_DIR`, the checkout Claude Code was
started in. A lead that keeps its checkpoint in another checkout finds no child records there, and
its briefing says `children: none recorded in this checkout`.

## The records

Every time in a record is UTC with milliseconds (`YYYY-MM-DDTHH:MM:SS.sssZ`); a checkpoint's
`updated_at` keeps whole seconds (R34). No other property is allowed at any level.

**`stamp.json`** (slice 2)

- `records_version`: 1.
- `at`: when it was stamped.
- `checkpoint_sha256`: the SHA-256 of `<task-id>.json` when it was stamped.
- `sessions`: `{id, at}` for each session that stamped the task, in order, at most 20.
- `git`: `branch` (null when detached), `head`, and `porcelain`, the sorted entries of
  `git status --porcelain=v1 -z --untracked-files=all`; or null when git could not answer.
- `prs`: for each number in the checkpoint's `artifacts.prs`, `state`, `head` and `ci` (`passing`,
  `failing`, `pending` or `none`, from the ported `rollupChecks`); or null when gh could not
  answer.

**`<agent-id>.start.json`** (slice 3): `records_version`, `session_id`, `agent_id`, `agent_type`,
`at`.

**`<agent-id>.stop.json`** (slice 3): the same, plus `status` and `note`.

- `status`: `done`, `done_with_concerns`, `blocked` or `needs_context` from the status line the
  child ended on, through the ported `parseStatus`; `ended` when there is none, or the transcript
  ended on a tool call. "Ended" says only that the child stopped without reporting.
- `note`: the note's file name, or null when the final message was blank.
- `agent_type` is kept when it matches `^[A-Za-z0-9:_-]{1,64}$`, else `unknown`. A session id must
  match `^[A-Za-z0-9-]{1,64}$` and an agent id `^[A-Za-z0-9_-]{1,64}$`; the probe saw UUIDs and
  `a` with 16 hex digits. An event with an id that fails is not written, and the wrapper logs it.

**Notes** hold the final message whole, up to 256 KiB, with a marker where it was cut. A child
that stops a second time (resumed through SendMessage) gets a second note, and its stop record
names the newer one.

## The stamp (slice 2)

`node scripts/agent-state.mjs stamp <task-id>`, run in the checkout that holds the checkpoint,
under `umask 077`:

1. It refuses a task id that fails `^[a-z0-9][a-z0-9-]*$`, the pattern `agent-resume.sh` applies
   (`id_re`; the schema has none, because the id is the file name), a checkpoint that is missing or
   not a regular file (opened without following links), and one that is not a JSON object with
   `schema_version` 1. Full validation stays with `agent-resume.sh`.
2. It reads git with optional locks off, each call bounded at 5 s and killed on timeout: the branch,
   HEAD and the porcelain list. There is no content digest (R14).
3. It makes the one gh call (D9), bounded at 6 s.
4. It reads the old `stamp.json`, if any, for its `sessions`, and appends `CLAUDE_CODE_SESSION_ID`
   when it is set and new.
5. It writes `.stamp.json.<pid>.<hex>.tmp` in the task's directory, fsyncs it and renames it over
   `stamp.json`.
6. It prints one line saying what it recorded, and `unknown: git` or `unknown: gh` on stderr for
   each fact it could not get.

Its exit codes (R31): 0 when the stamp was written, with unknown facts or without; 1 for invalid
usage or an invalid checkpoint, with nothing written; 2 when the stamp could not be written.

## The subagent hooks (slice 3)

`.claude/settings.json` gains SubagentStart and SubagentStop entries that run
`bash "$CLAUDE_PROJECT_DIR/.claude/hooks/subagent-state.sh"` with a 30 s timeout. The wrapper,
ported from the 10-13 `subagent-checkpoint.sh` with changes:

- sets `umask 077`, and exits 0 at once, writing nothing, when `CLAUDE_PROJECT_DIR` is unset (R23)
  or `node` is not on `PATH` (R22);
- runs `node scripts/agent-state.mjs hook` from `CLAUDE_PROJECT_DIR`, with the payload on stdin and
  its stdout discarded;
- on a failure, appends one line of at most 2,000 bytes to its session's `hook-errors.log`, and
  renames the log to `hook-errors.log.1` once it passes 64 KiB;
- always exits 0, because a SubagentStop hook that exits 2 keeps the child running, and a hook's
  stderr reaches no one.

`hook` reads `hook_event_name`, `session_id`, `agent_id`, `agent_type` and, on a stop,
`last_assistant_message`, or else the last 16 MiB of `agent_transcript_path`:

- **Start:** it writes `<agent-id>.start.json`.
- **Stop:** it writes the note when the message is not blank, parses the status, and writes
  `<agent-id>.stop.json`. When the record cannot be written it deletes the new note, so no note is
  left without a record.

The reader merges what it finds. Start and stop give a stopped child. A start alone gives a running
child in the current session, or "no stop recorded" in an earlier one, where the child died with its
lead. A stop alone gives a stopped child whose start was missed. Because the two events never share
a file, their order no longer matters, and the 10-13 rules for a late start and a blank stop go.

## What the resume check gains

`agent-resume.sh` keeps its validation, its contradictions, its "Needs attention" and its exit
codes. Before its per-task loop it notes which tasks have a stamp and a step in progress; for them
alone, once the network calls have returned, it starts
`node scripts/agent-state.mjs drift <task-id>...` in the background with the gh answer file, under
the same process-group timer as its network calls, `AGENT_RESUME_DRIFT_TIMEOUT` (default 4 s). The
timer wraps the whole node process. The loop briefs every other task as today, while drift runs;
the stamped tasks in progress are briefed after it returns.

Drift prints one JSON object per line. The bash side keeps only lines that parse as complete JSON,
so a drift killed mid-line loses that line and nothing else (R35). Drift also deletes `*.tmp` files
older than an hour in the directories it reads.

For a stamped task in progress, the briefing gains:

- **Contradictions:** D7's two, when the stamp is current.
- **Needs attention:**
  - checks that went from passing to failing, merged into the existing failing-checks line;
  - one line per child that ended `BLOCKED`, `NEEDS_CONTEXT` or `DONE_WITH_CONCERNS`, with no
    word of its text, such as
    `child general-purpose a836dfef063750ae3: BLOCKED, 10:41:07Z to 10:41:12Z, note <path>`,
    where the path is the note's, under `.agent-state/sessions/<session-id>/notes/`;
  - `hook errors: see <path>` when its sessions' error log is not empty.
- **Since the stamp** (new; never a contradiction), one fact per line (R19):
  - `HEAD advanced 3 commits (1a2b3c4..5d6e7f8)`;
  - `working tree changed: 12 paths`, then at most 10 of them and `+2 more`;
  - `PR #282 head advanced (1a2b3c4 -> 9f8e7d6)`;
  - `PR #282 checks: pending -> passing`;
  - `children: 2 done, 1 ended, 1 running, 1 no stop recorded`. A child of the session now
    running, as at SessionStart after a compaction, is `running`, never a contradiction (R5).
  - `not checked: the checkpoint changed after its stamp` replaces the whole section when the stamp
    is stale.
- **Unknown, never a contradiction:** `binding: unknown` for a stamp without a session;
  `child records: node unavailable`, once, for a task with a stamp; `drift: timed out`;
  `git: unknown`.

Each task's drift lines take at most 1,200 bytes, cut on a line boundary with `+N more` (R8), and
the briefing as a whole keeps SessionStart's 4,000-byte cut. A test briefs ten children and 200
changed paths and checks both bounds.

**Time.** Drift starts once gh and `ls-remote` have returned, which takes at most 6 s, and runs
alongside the per-task loop, so it adds at most its own 4 s, and only when the loop finishes first.
With node, git and gh all stubbed to sleep, the resume check takes 6 s for the network and then the
larger of drift's 4 s and the loop, and SessionStart takes the larger of that and its own gh's 8 s.
A test asserts that it ends under 20 s (R9). With today's 35 checkpoints the loop alone takes
13.5 s, so drift runs inside that time.

## Threat model

- A child's final message is untrusted data. It is written to a note file with mode 0600 and never
  printed by the briefing, the SessionStart hook or the stamp. The lead reads it on purpose, as
  data.
- Everything the briefing prints about a child comes from a fixed set or a validated pattern:
  status, type, times, and a path built from a validated session id and agent id. An id that fails
  its pattern writes nothing, so no path can leave `sessions/`.
- The stamp, the hook and its wrapper write under `umask 077`.
- The SessionStart hook already runs `scripts/agent-resume.sh` from the checkout, a file any
  session can edit. The stamp command and the hook wrapper are repository code of the same kind, so
  they add no new class of risk, and no allow rule widens what runs unprompted (owner question 2).

## Ported unchanged, ported with changes, and new

From the 10-13 `scripts/checkpoint.mjs` into `scripts/agent-state.mjs`, with their tests:

| Part                                                            | How                                            | Role here                                          |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `parseStatus` with its status-line and fence rules              | unchanged                                      | A child's status from its final message            |
| `rollupChecks`                                                  | unchanged                                      | The `ci` verdict, the same in stamp and drift      |
| `printable`                                                     | unchanged                                      | The agent type before it is checked                |
| `ancestry`                                                      | unchanged                                      | D7's contradictions and "HEAD advanced"            |
| the bounded `git` runner, optional locks off                    | unchanged                                      | Every git call                                     |
| `writeAtomic` (temporary file, fsync, rename, fsync the folder) | unchanged                                      | Every record and note                              |
| the safe JSON read (no symlinks, regular files, BOM-tolerant)   | unchanged                                      | Every read of a checkpoint or a record             |
| `transcriptText`                                                | unchanged                                      | The stop's final message when the payload has none |
| `writeNote`, `discardNote`                                      | changed: random suffix, `.txt`, session folder | The notes                                          |
| `captureGit`                                                    | changed: no content digest                     | The stamp's git facts                              |
| `hook`                                                          | changed: no task search, start and stop files  | The hook (D5)                                      |
| `isAgentId`                                                     | changed: a strict file-name pattern            | Agent and session ids                              |
| `subagent-checkpoint.sh`                                        | changed: no nvm, no `$PWD`, a log per session  | `.claude/hooks/subagent-state.sh`                  |

New: `stamp`'s `sessions` list, `drift` with its Since-the-stamp lines and byte caps, the merge of
start and stop records, the background drift run and the JSON-line filter in `agent-resume.sh`,
the deferred briefing of stamped tasks, the `.tmp` sweep, and the SessionStart prune.

Dropped:

| 10-13 code                                                                        | Why                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.claude/state` and the `kind: "checkpoint"` sniffing                             | The 2026-09-16 location ruling; nothing is written under `.claude` |
| `save --patch`: `mergePatch`, `checkPatch`, the managed fields                    | The lead keeps writing its checkpoint by hand (D1)                 |
| `withLock`, `readLock`, `breakIfStale`, `processIsGone`                           | One writer per file (D2)                                           |
| `taskFor`, `hookRoots`, `worktreeRoots`, `mayHold`                                | The hook never looks for a task (D5)                               |
| `summarise`, `flat`                                                               | The briefing quotes no child text (D8)                             |
| `contentDigest`, `hashFile`, `checkNote`, `hookErrors`, `hookLogs`, `loggedSince` | Cut from scope (R14)                                               |
| `brief`, `phases`, `current_phase`, `handoff`, `rulings`, `concerns`, `suite`     | `goal`, `plan_steps`, `next_action` and `blockers` carry them      |
| `load`, `verify` with its exit codes and its `gh pr view` per pull request        | D6 and D9                                                          |
| `.claude/RESUME.md` and the SessionStart "MULTI-AGENT CHECKPOINTS" section        | The rules file and the briefing already carry them                 |
| the `/.claude/state` lines in `.gitignore` and `.vercelignore`                    | `/.agent-state` is already in both                                 |

## Failure modes

- **Concurrent writers.** None share a file (D2). Two stamps of one task that race keep the later
  rename, and the earlier session's id may be missing from `sessions` until it stamps again.
- **A kill mid-write.** A killed writer leaves a `.tmp` file, which never ends in `.json`, and the
  previous version intact. Drift sweeps it after an hour.
- **gh or git unavailable or slow.** The stamp records the fact as unknown and exits 0. The
  briefing reports unknowns as it does today. Neither is a contradiction.
- **node missing.** The hook writes nothing. The briefing prints `child records: node unavailable`
  once for each stamped task, and runs every check it ran before, the 60 s tip check included.
- **A checkpoint updated without a stamp.** Its stamp is stale, so the facts are not checked and the
  tip check runs as today.
- **A removed worktree.** `git worktree remove` deletes the worktree's `.agent-state` without
  asking. See Retention. A copied stamp from another clone reports that the stamped head is not in
  this repository, which is true.
- **The macOS first-exec assessment (#280).** A newly written executable is assessed on its first
  run: #280 measured 3.1 to 13.3 s, and 21 s under load. The hook entries run `bash <file>`, so no
  new hook file is executed directly. The tests import #280's warmed-stub helper (R25) rather than
  writing stubs per test.
- **A child that never stops.** In a later session it shows as "no stop recorded".
- **A blank, missing or huge transcript.** Only the last 16 MiB is read. A blank message writes no
  note. A missing transcript gives `ended`.

## Retention

By hand, as for checkpoints today (R23):

- A task's records go with it: delete `.agent-state/<task-id>.json` and `.agent-state/<task-id>/`
  together. A `sessions/<session-id>/` folder can go once no unfinished task's stamp lists it.
- Before `git worktree remove`, copy the worktree's `.agent-state` to
  `.agent-state/archive/<worktree-name>-<YYYY-MM-DD>/` in the main checkout. The resume check lists
  only `.agent-state/*.json`, so an archived checkpoint is never briefed.
- The SessionStart prune of `sessions` ships in slice 3, in the same pull request as the hooks.

## Existing checkpoints stay valid

- `scripts/agent-state.schema.json` and the `validate` program in `agent-resume.sh` do not change,
  so every checkpoint written since #97 validates as before, with the same exit code.
- A finished task, and one without a stamp, gets no new check and starts no node process.
- The schema-driven test that reads the allowed keys from `agent-state.schema.json` keeps passing
  unchanged, and that is one of the stop conditions.

## Slices

1. **This branch** (`docs/checkpoint-one-system-plan`): the design, the plan and ADR 0041, one pull
   request, opened after the second review round.
2. **Stamp and drift** (`feat/checkpoint-stamp-drift`), branched from `main` after slice 1 and #280
   have merged: the stamp's schema, the module, `stamp`, `drift`, the resume check's new lines and
   the rule text. It touches no hook file and no settings file.
3. **Child agents** (`feat/checkpoint-child-agents`), after slice 2: the child records' schema,
   `hook`, the wrapper, the settings entries, the SessionStart prune, the child lines in drift, and
   a live probe against the real hooks.

## Testing

- Red first, for real: each test asserts the exit code and the output, so it fails against today's
  code rather than only asserting that nothing was written (R26). A test that cannot fail against
  today's code, such as "an unstamped checkpoint briefs exactly as before", is labelled a guard and
  is not counted as red first.
- Every test that could hang has a `{ timeout }`, and sets `AGENT_RESUME_GIT_TIMEOUT`,
  `AGENT_RESUME_GH_TIMEOUT` and `AGENT_RESUME_DRIFT_TIMEOUT` to 1, so a hang costs at most 2 s
  (R27).
- `scripts/agent-state.test.mjs` (`node:test`, no dependencies) covers the ported helpers with the
  10-13 cases that still apply, then `stamp`, `drift` and `hook` end to end in temporary
  repositories, with stub `gh` and `git` from #280's helper.
- `scripts/agent-resume.test.mjs` gains a case for each new line, the fallbacks of the tip check
  (stale stamp, node missing, drift timed out, git unknown), a merged and deleted branch, green
  checks after the stamp (no contradiction and no attention line), and gh unknown at stamp time and
  known later (no drift line).
- `scripts/claude-hooks.test.mjs` gains the wrapper's exit-0 cases, the `umask` of what the stamp
  and the hook write, `git check-ignore` on a stop record and a note, the pruned listing, and the
  SessionStart time bound with node, git and gh stubbed to sleep.
- A test runs the stamp's id pattern and `agent-resume.sh`'s `id_re` over the same valid and
  invalid ids, including the 35 ids present on 2026-10-31, all of which pass both (R29).
- Like every `scripts/` suite, the new suite passes in an isolated copy without `node_modules`.

## Questions for the owner

These go to the owner after a second review round. Recommended option first.

1. **Do child records bind to the lead's session (S4)?**
   - (a) Yes: the hooks write under `.agent-state/sessions/<session-id>/`, and a task's stamp lists
     its sessions. **Recommended**; the probe confirmed the id in the shell and the payload match
     and survive resume and compaction.
   - (b) No: the hook finds the task itself, reading checkpoints and running git on every child
     event.
2. **Is the stamp command allowed without a prompt?**
   - (a) No allow rule. **Recommended**: it adds no new class of risk, and changes no settings.
   - (b) An allow rule for exactly `node scripts/agent-state.mjs stamp *`.
3. **What happens to the 10-13 worktree and its archive?**
   - (a) Keep both until slice 3 merges, then remove the worktree and delete the archive.
     **Recommended.**
   - (b) Remove the worktree now and keep only the archive patch.
4. **SessionStart already takes 15 to 17.6 s of its 20 s with 35 checkpoints. What now?**
   - (a) Archive the 24 finished checkpoints by hand now (Retention), and open an issue to cut the
     resume check's processes per task. **Recommended.**
   - (b) Raise the SessionStart timeout in `.claude/settings.json` to 30 s.
   - (c) Leave it until a session start times out.

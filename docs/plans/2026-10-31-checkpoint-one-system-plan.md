# One Checkpoint System with Child Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.agent-state/<task-id>.json` stays the only checkpoint. It gains the 10-13 parts:

- child agents recorded by SubagentStart and SubagentStop hooks;
- notes holding the children's final messages;
- HEAD, working tree and pull request drift in the resume check.

All of these sit in a directory beside the checkpoint that only scripts write. Every existing
checkpoint stays valid and is briefed as it is today.

**Architecture:** one new dependency-free module, `scripts/agent-state.mjs`, with three
subcommands:

- `stamp`: the lead records git and pull request facts after each checkpoint update;
- `drift`: called once by `scripts/agent-resume.sh`, it turns those facts and the child records
  into briefing lines;
- `hook`: called by `.claude/hooks/subagent-state.sh` on SubagentStart and SubagentStop.

The hardened helpers come from the unshipped 10-13 `scripts/checkpoint.mjs`, with their tests:
status parsing, untrusted text, locks, atomic writes, notes and the CI rollup.
`scripts/agent-state.schema.json` does not change.

**Tech Stack:** Node 22 (`node:test`, no dependencies, type-checked through JSDoc by the
`scripts` package), bash 3.2 with jq and perl, Claude Code hooks.

**Design:** [the design](2026-10-31-checkpoint-one-system-design.md): decisions D1 to D10 and the
owner's answers to its five questions.

**Branch:** this plan and its design ship on `docs/checkpoint-one-system-plan`. The work ships as
three pull requests, one branch each, made from `main` when its slice starts:

- PR 1: `docs/adr-one-checkpoint-system`;
- PR 2: `feat/checkpoint-stamp-drift`;
- PR 3: `feat/checkpoint-child-agents`.

**Order and dependencies:**

- Nothing starts before the owner has answered the design's five questions. An answer other than
  the recommended one changes the tasks it names, in the commit that records the answer.
- PR 2 starts after PR 1 has merged, because the code cites ADR 0041.
- PR 3 starts after **#280 has merged**, because it edits `.claude/hooks/` and
  `scripts/claude-hooks.test.mjs`, which #280 rewrites (the stop hook's trap and the warmed
  stubs). It also waits for PR 2, whose module it extends.
- PR 2 touches no hook file and no hook test, so it does not wait for #280.
- `CLAUDE.md` is 16,383 bytes against its 16,384-byte budget (`scripts/claude-md-budget.test.mjs`).
  No task grows it; guidance goes into `.claude/rules/claude-code-config.md`.

**Red first:** every task that changes behaviour starts with a test that fails, and its
documentation changes in the same commit. Four tasks are verification steps instead, and their
stop conditions are the checks themselves: the three that open pull requests (Tasks 2, 9 and 14)
and the live probe (Task 13).

**Stop condition for the whole plan (all must hold):**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:scripts   # exit 0
pnpm check:adrs && pnpm check:adr-history && pnpm check:docs-drift      # exit 0
git diff --exit-code 05abb5d1 -- scripts/agent-state.schema.json        # no output: unchanged
bash scripts/agent-resume.sh; echo "exit $?"   # exit 0 on the main checkout; old checkpoints briefed as before
gh pr checks <N> --watch                       # green on the head SHA, for each of PR 1, 2 and 3
```

Task 13's live probe also records one child, with its note, against a stamped task.

---

## PR 1: ADR 0041 (`docs/adr-one-checkpoint-system`)

### Task 1: Record the decision in ADR 0041

**Files:**

- Create: `docs/adr/0041-one-checkpoint-system.md`
- Modify: `docs/adr/README.md` (index row), `docs/drift-manifest.json` (an entry per new link),
  `.claude/rules/claude-code-config.md` (the sentence on why `.agent-state` sits at the root cites
  ADR 0041), this plan (tick)

- [ ] **Step 1: Red.** Add only the index row for 0041 to `docs/adr/README.md`, then run:

```bash
pnpm check:adrs; echo "exit $?"
```

Expected: exit 1, reporting that the row's record does not exist.

- [ ] **Step 2: Write the record.** Its sections are Status, Date, Context, Decision, Consequences
      and Alternatives considered. The Decision covers:
  - the location and its reason, the `.claude` protection;
  - one checkpoint file per task;
  - scripts and hooks writing only `.agent-state/<task-id>/` (D1);
  - one resume check whose exit codes keep their meanings (D6).

  Context says that the 2026-09-16 ruling was never recorded and that the 10-13 brief was never
  merged, so the record supersedes nothing. It cites no local or untracked file.

- [ ] **Step 3: Green.** Run:

```bash
pnpm check:adrs && pnpm check:adr-history && pnpm check:docs-drift && pnpm format:check
```

Expected: exit 0 for each.

- [ ] **Step 4: Commit** `docs(adr): record one checkpoint system in .agent-state`, signed.

**Stop condition:** the four commands in Step 3 exit 0, and `git show --stat HEAD` lists only the
files above.

### Task 2: Open PR 1

**Files:** none beyond Task 1.

- [ ] **Step 1:** Write the PR 1 checkpoint, then follow `.claude/skills/open-pr/SKILL.md`. Work
      the template's checklist with the real output pasted in. `adversarial-reviewer` gets the diff
      only. Triage its findings in the Review section.
- [ ] **Step 2:** Watch the checks until every one is green on the pushed head SHA:
      `gh pr checks <N> --watch`, then
      `gh pr view <N> --json headRefOid,statusCheckRollup`.

**Stop condition:** all checks are green on the head SHA. The owner merges; the agent never does.

---

## PR 2: stamp and drift (`feat/checkpoint-stamp-drift`)

### Task 3: Warm the resume-check stubs once

`scripts/agent-resume.test.mjs` writes a fresh `gh` stub in every `beforeEach`. On macOS, each
newly written executable waits for its first-exec assessment (#280 measured 3.1 to 13.3 s). PR 2
adds tests that use stubs, so the suite adopts #280's pattern first.

**Files:**

- Modify: `scripts/agent-resume.test.mjs`

- [ ] **Step 1: Red.** Add a test asserting that each test's `bin/gh` is a symlink to one stub that
      `before()` wrote and ran once. Run:

```bash
node --test scripts/agent-resume.test.mjs
```

Expected: that test fails, and every other test passes.

- [ ] **Step 2: Green.** Write the stubs (`gh`, and `jq` where a test needs one) once in
      `before()`, run each once with a 120 s timeout, and symlink them in `beforeEach`. The
      per-test answer files (`gh.json`, `gh.sleep`) stay per test.
- [ ] **Step 3:** Run the suite above, then `pnpm test:scripts`. Expected: exit 0 for both.
- [ ] **Step 4: Commit** `test(scripts): warm the agent-resume stubs once`.

**Stop condition:** both runs exit 0 with the same test count as before plus one.

### Task 4: Port the pure helpers and add the records schema

**Files:**

- Create: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`,
  `scripts/agent-state-records.schema.json`
- Modify: `.claude/rules/claude-code-config.md` (its `paths` gain the three new files, so Claude
  Code loads the rule while they are being written)

- [ ] **Step 1: Red.** First, add the three paths to the rule's `paths`, then run
      `node --test scripts/claude-md-budget.test.mjs`. Expected: it fails, because the patterns
      match no tracked file. Next, port the 10-13 test cases that still apply. Cover:
  - `summarise`: the 1,024-byte grapheme-safe cut;
  - `printable`: control and invisible format characters become U+FFFD, while ZWJ, ZWNJ and
    variation selectors are kept;
  - `flat`;
  - `parseStatus`: status lines, an unclosed fence read both ways, the graver status winning;
  - `rollupChecks`: CheckRun against StatusContext, the newest run of a name, STALE as pending,
    a tie going to the graver verdict, unnamed checks kept apart;
  - a records validator, checked against the schema the same way the existing schema-driven test
    checks `agent-state.schema.json`.

  Run `node --test scripts/agent-state.test.mjs`. Expected: it fails, because the module does not
  exist.

- [ ] **Step 2: Green.** Port the functions unchanged where the design does not change them. Write
      the schema with `records_version` 1, the `stamp` and `child` definitions, and
      `additionalProperties: false` at every level. Stage the new files.
- [ ] **Step 3:** Run the suites, the typecheck and the isolation check. `scripts/` has its own
      `node_modules`, so the copy takes only the three files:

```bash
node --test scripts/agent-state.test.mjs scripts/claude-md-budget.test.mjs && pnpm typecheck
dir=$(mktemp -d /tmp/checkpoint-stamp-XXXX) && mkdir "$dir/scripts" &&
  /bin/cp scripts/agent-state.mjs scripts/agent-state.test.mjs scripts/agent-state-records.schema.json "$dir/scripts/" &&
  (cd "$dir" && node --test scripts/agent-state.test.mjs)
```

Expected: exit 0 for each, the last without any `node_modules`.

- [ ] **Step 4: Commit** `feat(scripts): port the checkpoint text, status and CI helpers`.

**Stop condition:** the Step 3 commands exit 0, and the PR description lists the ported test count
next to the 10-13 count.

### Task 5: Port git facts, locks and atomic writes

**Files:**

- Modify: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1: Red.** Port these tests, run in temporary repositories:
  - `captureGit`: porcelain with `-z`, and a detached HEAD;
  - `contentDigest`: sorted, length-prefixed, the exec bit and symlink targets, a FIFO that does
    not block;
  - `ancestry`: equal, N commits after, behind, not an ancestor, not in this repository;
  - `withLock` and `breakIfStale`: a dead process id, a lock older than 60 s, a lock taken while
    another was being broken, three attempts;
  - `writeAtomic`: a temporary name that never ends in `.json`, and the previous version intact
    after a kill;
  - the safe JSON read: a symlink and a non-regular file refused, a BOM tolerated.

  Any stub is written and warmed once. Expected: the new tests fail.

- [ ] **Step 2: Green.** Port the functions. Git runs with `GIT_OPTIONAL_LOCKS=0` and is killed on
      its timeout.
- [ ] **Step 3:** `node --test scripts/agent-state.test.mjs && pnpm typecheck`. Expected: exit 0.
- [ ] **Step 4: Commit** `feat(scripts): port the checkpoint git facts, locks and atomic writes`.

**Stop condition:** Step 3 exits 0.

### Task 6: `stamp`

**Files:**

- Modify: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`
- Modify: `.claude/rules/claude-code-config.md` (the checkpoint bullet: stamp after each update,
  never in the same parallel batch as the write; the `<task-id>/` directory; copying it out with
  the checkpoint before `git worktree remove`)
- Modify: `.claude/skills/open-pr/SKILL.md` (its checkpoint step adds the stamp)
- Modify: `.claude/settings.json`, only if the owner chose 2(a): one allow rule for exactly
  `node scripts/agent-state.mjs stamp`

- [ ] **Step 1: Red.** Write end-to-end tests that run `node scripts/agent-state.mjs stamp <id>` in
      a temporary repository with a stub `gh`. Each asserts on the written `stamp.json`, not only
      on the output:
  - exit 0 records `head`, `branch`, `porcelain`, `content`, `prs` with `state`, `head` and `ci`,
    `lead_session` from `CLAUDE_CODE_SESSION_ID`, and `checkpoint_sha256`;
  - exit 1, with nothing written, for a bad id, a missing checkpoint, a symlinked checkpoint, a
    non-object or `schema_version` other than 1, and a lock not won after three attempts;
  - exit 2, with the facts written as unknown, for a `gh` that fails or hangs past its timeout;
  - a warning on stderr when `lead_session` changes;
  - two concurrent stamps both exit 0, and the file is one of the two complete versions;
  - with answer 2(a), `.claude/settings.json` allows the stamp command and nothing wider.

  Expected: the tests fail.

- [ ] **Step 2: Green.** Implement `stamp` as the design describes it. Write the rule and skill
      text. If the settings change, validate them with `jq -e . .claude/settings.json`.
- [ ] **Step 3:** Run:

```bash
node --test scripts/agent-state.test.mjs && pnpm typecheck && pnpm format:check
```

Expected: exit 0.

- [ ] **Step 4: Commit** `feat(scripts): stamp a checkpoint with its git and pull request facts`.

**Stop condition:** Step 3 exits 0.

### Task 7: `drift`

**Files:**

- Modify: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1: Red.** Write a test for each line the design lists, and assert the JSON line's
      section and text. The cases are:
  - HEAD after the stamp, behind it, rewritten, or missing;
  - the working tree changed (capped at 40 paths), and not compared on another branch;
  - a pull request's state, head or checks changed;
  - the checkpoint changed after its stamp, which reports "Needs attention", not contradictions;
  - an unreadable or invalid record, reported as unknown;
  - git timing out, reported as unknown;
  - a gh answer file that is absent, so the pull requests are unknown.

  `drift` must make no gh call; a `gh` stub that fails the test when run enforces it. Expected:
  the tests fail.

- [ ] **Step 2: Green.** Implement `drift`. It prints one JSON line per finding as it goes.
- [ ] **Step 3:** `node --test scripts/agent-state.test.mjs && pnpm typecheck`. Expected: exit 0.
- [ ] **Step 4: Commit** `feat(scripts): report checkpoint drift against the stamp`.

**Stop condition:** Step 3 exits 0.

### Task 8: Fold drift into the resume check

**Files:**

- Modify: `scripts/agent-resume.sh`, `scripts/agent-resume.test.mjs`
- Modify: `.claude/rules/claude-code-config.md` (the new briefing lines; unknown is never a
  contradiction)
- Modify: `.claude/rules/ci-and-scripts.md` (the scripts list and its count, the command-table row
  for `agent-state.mjs`, and `AGENT_RESUME_DRIFT_TIMEOUT` beside the existing timeouts)

- [ ] **Step 1: Red.** Before changing anything, save the main checkout's briefing for the PR
      description (`bash scripts/agent-resume.sh > <tmp>/before.txt`). Then add briefing tests:
  - a stamped task whose branch moved one commit shows "HEAD is 1 commit after the stamp" under
    Contradictions, the 60 s tip-date line does not appear, and the exit stays 0;
  - a task with no `<task-id>/` directory never starts node: a `node` stub that records being run
    stays unrun;
  - node missing, with no usable nvm, gives an unknown line and the same exit code;
  - a `node` stub that sleeps is cut off by `AGENT_RESUME_DRIFT_TIMEOUT=1`, which gives
    "unknown (timed out)" within 3 s;
  - the `gh pr list` call asks for `headRefOid`, which the stub asserts.

  Expected: the new tests fail, and the existing ones, the schema-driven one included, pass.

- [ ] **Step 2: Green.** After its `wait`, `agent-resume.sh` runs `drift` once for the tasks that
      have a directory. It finds node on PATH or else through nvm, bounds the run with the same perl
      process-group alarm as the network calls, and places the lines under the existing sections.
      Write the rule text.
- [ ] **Step 3:** Run:

```bash
node --test scripts/agent-resume.test.mjs && pnpm test:scripts && pnpm format:check
git diff --exit-code main -- scripts/agent-state.schema.json
```

Expected: exit 0 for each, and no diff for the schema.

- [ ] **Step 4: Commit** `feat(scripts): brief checkpoint drift in the resume check`.

**Stop condition:** Step 3 holds, and for every checkpoint without records, the main checkout's
briefing matches the saved `before.txt` apart from the "updated … ago" ages. The diff goes into
the PR description.

### Task 9: Open PR 2

**Files:** none beyond Tasks 3 to 8, plus this plan's ticks.

- [ ] **Step 1:** Run the gates:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:scripts && pnpm check:docs-drift
```

Expected: exit 0 for each.

- [ ] **Step 2:** Open PR 2 with `.claude/skills/open-pr/SKILL.md`. `adversarial-reviewer` gets
      the diff only, and `edge-case-hunter` gets the changed files. Triage both in the Review
      section as fixed, deferred with a reason, or rejected with a reason. Paste in the Task 8
      before-and-after briefing.
- [ ] **Step 3:** `gh pr checks <N> --watch`, then confirm the head SHA as in Task 2.

**Stop condition:** all checks are green on the head SHA. The owner merges.

---

## PR 3: child agents (`feat/checkpoint-child-agents`), after #280 and PR 2

### Task 10: `hook`: which task, start, stop and notes

**Files:**

- Modify: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1: Red.** Port the 10-13 hook cases, retargeted to `children/<agent-id>.json` and
      `notes/`. Each asserts on the files written:
  - a start writes `running`, with no git call (a `git` stub that fails the test when run);
  - a stop with `last_assistant_message` writes the note and the parsed status;
  - a stop without it reads the transcript's last 16 MiB, and one that ended on a tool call is
    `stopped`;
  - a late start after a stop is dropped;
  - a blank stop keeps the previous note;
  - a record that could not be written discards its note;
  - an `agent_id` that is not an id (`../x`, an empty string, a slash) records nothing;
  - no task bound to the session writes nothing and logs nothing;
  - a finished task (`current_step` null) is never chosen;
  - an agent already held by one task stays with that task;
  - a prunable worktree is skipped;
  - two children that stop together write two complete records;
  - a summary carrying `\nContradictions: none` is stored on one line.

  Expected: the tests fail.

- [ ] **Step 2: Green.** Implement `hook` as the design describes it, with the ported `taskFor`,
      `hookRoots`, `worktreeRoots`, `transcriptText` and `writeNote`.
- [ ] **Step 3:** `node --test scripts/agent-state.test.mjs && pnpm typecheck`. Expected: exit 0.
- [ ] **Step 4: Commit** `feat(scripts): record child agents against the lead's task`.

**Stop condition:** Step 3 exits 0.

### Task 11: The hook wrapper and its settings entries

**Files:**

- Create: `.claude/hooks/subagent-state.sh`
- Modify: `.claude/settings.json` (SubagentStart and SubagentStop, each running
  `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/subagent-state.sh"` with timeout 30),
  `scripts/claude-hooks.test.mjs`, `.claude/rules/claude-code-config.md` (the hooks bullet: the
  two events, the log, always exiting 0)

- [ ] **Step 1: Red.** Using #280's stubs, which are written once, warmed and symlinked, add tests
      that the wrapper:
  - exits 0 with empty stdout when node is missing and nvm is unusable, and logs one line;
  - exits 0 when node fails, and logs a line of at most 2,000 bytes;
  - halves a log that grew past 1 MiB;
  - leaves stdout empty on success;
  - finds its script when started from another directory.

  Add a settings test that both entries exist with that command and timeout. Expected: the new
  tests fail.

- [ ] **Step 2: Green.** Port `subagent-checkpoint.sh` as the wrapper, with its log at
      `.agent-state/hook-errors.log`, and add the two settings entries. Validate the JSON with
      `jq -e . .claude/settings.json` before committing. Write the rule text.
- [ ] **Step 3:** `node --test scripts/claude-hooks.test.mjs && pnpm test:scripts`. Expected:
      exit 0.
- [ ] **Step 4: Commit** `feat(claude): run the subagent hooks into the task's records`.

**Stop condition:** Step 3 exits 0, and `jq -e . .claude/settings.json` exits 0.

### Task 12: Child lines in the briefing, and the pruned note listing

**Files:**

- Modify: `scripts/agent-state.mjs` (`drift`'s child lines), `scripts/agent-resume.test.mjs`,
  `.claude/hooks/session-start.sh`, `scripts/claude-hooks.test.mjs`
- Modify: `.claude/rules/claude-code-config.md` (the child lines; the SessionStart listing skips a
  task's `notes` and `children`), `README.md` (one line in the Claude Code section, beside the
  existing settings bullet)

- [ ] **Step 1: Red.** Add these tests:
  - "Artifacts now" counts the children by status;
  - `blocked`, `needs_context`, `done_with_concerns` and `stopped` children appear under "Needs
    attention" with a quoted summary and the note's path;
  - a `running` child shows "started <at>, no stop recorded";
  - a child that stopped after `updated_at` is a contradiction;
  - a missing or altered note is reported;
  - the hook log's failures since `updated_at` are counted;
  - a forged summary prints as one quoted line;
  - in SessionStart, `.agent-state/t/notes/n.md` and `.agent-state/t/children/` are not printed,
    while `.agent-state/x.md` and `.agent-state/sub/y.md` still are.

  Expected: the new tests fail.

- [ ] **Step 2: Green.** Implement the lines. In `session-start.sh`, the `find` prunes
      `.agent-state/*/notes` and `.agent-state/*/children`. Write the rule and README text without
      growing `CLAUDE.md`.
- [ ] **Step 3:** `pnpm test:scripts && pnpm format:check`. Expected: exit 0.
- [ ] **Step 4: Commit** `feat(claude): brief child agents in the resume check`.

**Stop condition:** Step 3 exits 0.

### Task 13: Live probe

This is the end-to-end test. It runs once the unit tests of Tasks 10 to 12 are green.

**Files:** none committed. The output goes into the PR description.

- [ ] **Step 1:** In the PR 3 worktree, run one headless lead (`claude -p`) with this prompt:
  1. write a throwaway checkpoint `probe-<date>`;
  2. stamp it;
  3. start one `general-purpose` child that replies `DONE`;
  4. print `CLAUDE_CODE_SESSION_ID`.

  Allow only the tools the probe needs. Record the exact command in the PR description.

- [ ] **Step 2:** Check the result:

```bash
jq . .agent-state/probe-<date>/stamp.json .agent-state/probe-<date>/children/*.json
ls .agent-state/probe-<date>/notes/
bash scripts/agent-resume.sh probe-<date>
```

Expected: a non-null `lead_session`, one child with status `done`, and one note. The briefing
counts one child done.

- [ ] **Step 3:** If the environment can start a teammate, start one and record whether
      SubagentStart fired. Either answer goes into the design's non-goal note, in this pull request.
- [ ] **Step 4:** Delete `.agent-state/probe-<date>.json` and `.agent-state/probe-<date>/`, naming
      the exact paths.

**Stop condition:** Step 2's expectations hold, and the output is pasted into the PR description.

### Task 14: Open PR 3

**Files:** this plan's ticks; this plan's and the design's rows in `docs/plans/README.md` move to
`Shipped`.

- [ ] **Step 1:** Run the Task 9 gates. Expected: exit 0 for each.
- [ ] **Step 2:** Open PR 3 with `.claude/skills/open-pr/SKILL.md`. Reviews and triage are as in
      Task 9, and the Task 13 output is pasted in.
- [ ] **Step 3:** `gh pr checks <N> --watch`, then confirm the head SHA.
- [ ] **Step 4:** After the owner merges, and only as the owner answered question 5, remove the
      10-13 worktree and its archive by their exact paths. If git refuses the removal because of
      the worktree's modified files, ask the owner before using `--force`.

**Stop condition:** all checks are green on the head SHA, the owner has merged, and the whole-plan
stop condition holds on `main`.

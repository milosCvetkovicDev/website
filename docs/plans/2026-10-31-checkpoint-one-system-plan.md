# One Checkpoint System with Child Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.agent-state/<task-id>.json` stays the only checkpoint. A run of the resume check for a
named task reports what changed since the lead last stamped its facts, and the child agents of the
sessions that stamped, as information. Contradictions keep today's rules, every existing checkpoint
stays valid, and the SessionStart sweep gains one line per stamped task in progress.

**Architecture:**

- `scripts/agent-resume.sh --stamp <task-id>`: the resume check, plus the stamp. Bash opts the
  session in and deletes idle sessions; `scripts/agent-state.mjs stamp` writes
  `.agent-state/stamps/<task-id>.json`.
- `scripts/agent-state.mjs drift`, run by `scripts/agent-resume.sh <task-id> ...` for each named
  task that has a stamp, under its own timer: the Since the stamp and Child agents sections, as
  JSON lines.
- `scripts/agent-resume.sh` reaches node only through `find_node` (node 22 or later on `PATH`,
  then nvm's default), and only in a run for named tasks.
- `.claude/hooks/subagent-state.sh`, bash and jq, on SubagentStart and SubagentStop: one file per
  event under `.agent-state/sessions/<session-id>/`, only when `--stamp` created that folder.

Every file has one writer, so nothing takes a lock. `scripts/agent-state.schema.json` does not
change.

**Tech Stack:** bash 3.2 with jq and perl, Node 22 (`node:test`, no dependencies, type-checked
through JSDoc by the `scripts` package), Claude Code hooks.

**Design:** [the design](2026-10-31-checkpoint-one-system-design.md), decisions D1 to D11, with the
probe, the hook spike and the measured cost of today's session start. **Record:**
[ADR 0041](../adr/0041-one-checkpoint-system-in-agent-state.md), `Proposed` until Task 13.

**Branches and pull requests:**

- PR 1 is this branch, `docs/checkpoint-one-system-plan`: the design, this plan and ADR 0041,
  merged as one pull request after the third review round.
- PR 2, `feat/checkpoint-stamp-drift`, and PR 3, `feat/checkpoint-child-agents`, are branched from
  `main` only after the pull request before them has merged.

**Order and dependencies:**

- PR 1 waits for the third review round and the owner's answers to the design's three questions.
  An answer other than the recommended one changes the tasks it names, in the commit that records
  the answer. Answer 1(b) drops PR 3.
- PR 2 waits for PR 1 and for **#280**: its tests import #280's warmed-stub helper rather than
  copying it (Task 4).
- PR 3 waits for PR 2, whose module and timer it extends.
- `CLAUDE.md` is 16,383 bytes against its 16,384-byte budget (`scripts/claude-md-budget.test.mjs`).
  No task grows it; guidance goes into `.claude/rules/claude-code-config.md`.

**Red first:** every task that changes behaviour starts with tests that assert the exit code and
the output, run against the code as it was before the task, and fail. A test that cannot fail
against that code, because it asserts an absence or pins today's output, has `(guard)` in its title
and is not counted as red first. A table-driven test counts once. Ported tests that fail only
because the module does not exist yet are counted as ported, not as red first. Each task's stop
condition gives the counts.

**Hangs:** every test that runs git, gh, node or a hook has `{ timeout: 10_000 }` and sets
`AGENT_RESUME_GIT_TIMEOUT`, `AGENT_RESUME_GH_TIMEOUT` and `AGENT_RESUME_DRIFT_TIMEOUT` to 1, so a
test of a hang costs at most 2 s.

**Stop condition for the whole plan (all must hold):**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:scripts   # exit 0
pnpm check:adrs && pnpm check:adr-history && pnpm check:docs-drift      # exit 0
git fetch origin && git diff --exit-code "$(git merge-base origin/main HEAD)" -- scripts/agent-state.schema.json
bash scripts/agent-resume.sh; echo "exit $?"   # exit 0 on the main checkout, old ones as before
gh pr checks <N> --watch                       # green on the head SHA, for each of PR 1, 2 and 3
```

The `git diff` runs on each pull request's branch and prints nothing: no pull request in this plan
changes the checkpoint schema against the point where its branch left `main`. Task 13's live check
also shows one `blocked` child with its note path and none of its text.

---

## PR 1: the design, this plan and ADR 0041 (`docs/checkpoint-one-system-plan`)

### Task 1: The live probe and the hook spike

**Files:**

- Modify: the design (the probe section, the cost table and the subagent hooks section)

The probe and the spike ran outside the repository, in a scratch git repository with a settings
file passed on the command line; no settings file was read or changed.

- [x] **Step 1:** Write a capture hook that appends each SessionStart, SubagentStart and
      SubagentStop payload, with the hook's own `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PROJECT_DIR`.
- [x] **Step 2:** Runs 1 to 3: two children (one without a status line), a resume with a `BLOCKED`
      child, and a named agent.
- [x] **Step 3:** Probe 4: what a hook process can execute, with the launching `PATH` and with a
      bare one.
- [x] **Step 4:** Runs 5a to 5c: a child resumed through SendMessage, `--continue`, and
      `/compact`.
- [x] **Step 5:** Spike the bash and jq hook wrapper: 47 cases on both jq builds, and a replay of
      the probe's 20 events.
- [x] **Step 6:** Record the commands, the events and what they show in the design, with every
      claim citing an event or marked not verified, and measure today's resume check and
      SessionStart (the design's cost table).

**Stop condition:** the design's probe section cites an event for every claim it makes and lists
what is not verified. Met on 2026-10-31.

### Task 2: Record the decision in ADR 0041

**Files:**

- Create: `docs/adr/0041-one-checkpoint-system-in-agent-state.md`, status `Proposed`
- Modify: `docs/adr/README.md` (its index row), `docs/drift-manifest.json` (the index entries and
  one per new link), `docs/plans/README.md` (this plan's and the design's rows)

- [x] **Step 1:** Write the record: Status, Date, Context, Decision, Consequences and Alternatives
      considered. Its Context cites no local or untracked file, and its Decision states nothing the
      probe left unverified.
- [x] **Step 2:** Add the index row and the manifest entries.
- [x] **Step 3:** Run the gates:

```bash
pnpm format:check && pnpm check:adrs && pnpm check:adr-history && pnpm check:docs-drift
```

**Stop condition:** the four commands exit 0 (output in the third draft's report).

### Task 3: Third review, the owner's answers, and PR 1

**Files:** this design, this plan, ADR 0041 and its index row.

- [ ] **Step 1:** `adversarial-reviewer` gets this branch's diff and the second round's findings,
      and nothing else. The team lead triages its findings; each is fixed, deferred with a reason
      or rejected with a reason in the pull request's Review section.
- [ ] **Step 2:** The owner answers the design's three questions. The answers go into the design,
      and into any task they change, in one commit.
- [ ] **Step 3:** Write the PR 1 checkpoint, open the pull request with
      `.claude/skills/open-pr/SKILL.md`, and watch the checks on the pushed head SHA:
      `gh pr checks <N> --watch`, then `gh pr view <N> --json headRefOid,statusCheckRollup`.

ADR 0041 stays `Proposed` in PR 1; Task 13 accepts it.

**Stop condition:** every check is green on the head SHA. The owner merges; the agent never does.

---

## PR 2: stamp and drift (`feat/checkpoint-stamp-drift`)

Branched from `main` after PR 1 and #280 have merged.

### Task 4: Share #280's warmed stubs

#280 writes the `gh` and `git` stubs once in `before()`, runs each once outside every deadline, and
links each test to them, because macOS assesses a new executable on its first run (3.1 to 13.3 s,
21 s under load). `scripts/agent-resume.test.mjs` still writes its `gh` stub in every
`beforeEach`, and PR 2 adds tests that use stubs.

**Files:**

- Create: `scripts/test-support/warmed-stubs.mjs`, #280's setup moved, not copied
- Modify: `scripts/claude-hooks.test.mjs` (imports it), `scripts/agent-resume.test.mjs` (links to
  the warmed `gh` stub), `.claude/rules/ci-and-scripts.md` (lists the helper)

- [ ] **Step 1 (guard):** Move #280's stub writing and warming into the module, exported as one
      function returning the stub paths, and let it warm any extra stub a suite asks for (the
      `node` stubs of Task 7). `scripts/claude-hooks.test.mjs` imports it. Run
      `pnpm test:scripts` and compare the pass count with the count before the move.
- [ ] **Step 2 (guard):** `scripts/agent-resume.test.mjs` links its `bin/gh` to the warmed stub
      instead of writing one per test. Run the suite again.
- [ ] **Step 3:** Copy `scripts/*.mjs`, `scripts/*.json` and `scripts/test-support/` to an isolated
      directory without `node_modules` and run `node --test` there.
- [ ] **Step 4:** Commit `test(scripts): share the warmed stubs between the hook and resume tests`.

**Stop condition:** `pnpm test:scripts` exits 0 with the same number of tests as before, the
isolated copy passes, and no test writes an executable after `before()`. Red first: 0 (a refactor).

### Task 5: Keep `sessions` and `archive` out of the SessionStart listing

**Files:** `.claude/hooks/session-start.sh`, `scripts/claude-hooks.test.mjs`

- [ ] **Step 1 (red):** Add these tests:
  - `a Markdown note under .agent-state/archive is not listed`;
  - `a Markdown file under .agent-state/sessions is not listed`;
  - `a Markdown note in .agent-state and in a task's data folder is still listed (guard)`.
- [ ] **Step 2:** Run the file: the two red tests fail, because the listing's `find` is recursive,
      and the guard passes.
- [ ] **Step 3:** Prune `.agent-state/sessions` and `.agent-state/archive` in that `find`.
- [ ] **Step 4:** Commit `fix(hooks): keep session records and archives out of the session notes`.

**Stop condition:** `node --test scripts/claude-hooks.test.mjs` passes, with 2 tests red first and
1 guard.

### Task 6: Port the helpers that move unchanged

**Files:**

- Create: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1 (ported):** Bring the 10-13 tests of `rollupChecks`, `ancestry`, the bounded `git`
      runner, `writeAtomic` and the safe JSON read. Run `node --test scripts/agent-state.test.mjs`:
      it fails, because the module does not exist.
- [ ] **Step 2:** Port those functions unchanged, with their JSDoc types.
- [ ] **Step 3:** Run the test file and `pnpm typecheck`.
- [ ] **Step 4:** Commit `feat(scripts): port the checkpoint helpers that still fit`.

**Stop condition:** the test file passes, `pnpm typecheck` exits 0, and a diff of each function
against the 10-13 code shows no change but formatting. Red first: 0; ported: the count of tests.

### Task 7: `find_node` and the drift timer

**Files:** `scripts/agent-resume.sh`, `scripts/agent-resume.test.mjs`

Each test writes a stamp file by hand and uses warmed `node` stubs that answer the version check
and log or sleep on `scripts/agent-state.mjs drift`.

- [ ] **Step 1 (red):** Add these tests:
  - `a named task with a stamp runs drift through the first node 22 or later on PATH`, with a
    node 20 stub earlier on `PATH`;
  - `with only node 20, the node-unavailable line prints once for two named tasks`;
  - `with no node on PATH, nvm's default node is used` (a stub `HOME` with `.nvm/nvm.sh`);
  - `a sleeping drift is cut at the timer, and the tip check runs`, with
    `AGENT_RESUME_DRIFT_TIMEOUT=1` and the line `drift: timed out after 1 s`;
  - `only complete JSON lines from drift are kept`;
  - `a drift that exits 3 without output prints drift: failed (exit 3)`;
  - `the sweep starts no node (guard)`;
  - `a named task without a stamp starts no node (guard)`.
- [ ] **Step 2:** Run the file: the red tests fail, the guards pass.
- [ ] **Step 3:** Implement `find_node` (each `node` from `type -ap node`, then nvm's default; major
      22 or later), the timer around `find_node` and drift in one child process, the JSON-line
      filter, and the timed-out, failed and node-unavailable lines.
- [ ] **Step 4:** Run the file and the isolated copy.
- [ ] **Step 5:** Commit `feat(scripts): find node 22 for the resume check's drift, under a timer`.

**Stop condition:** the file passes, with 6 tests red first and 2 guards.

### Task 8: `--stamp`

**Files:**

- Create: `scripts/agent-state-records.schema.json`, with the stamp's definition only
  (documentation; no code validates against it)
- Modify: `scripts/agent-resume.sh`, `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`,
  `scripts/agent-resume.test.mjs`

- [ ] **Step 1 (red):** Add these tests, each in a temporary repository with stub `gh` and `git`,
      each asserting the exit code, the output and the files on disk:
  - `--stamp writes the checkpoint's hash, each branch's facts and the session`: the SHA-256,
    each listed branch's head, upstream and worktree, asserted directly, and `at` in milliseconds;
  - `--stamp appends a new session and keeps the last 20`;
  - `--stamp records the first 200 worktree entries and their total` (250 untracked files);
  - `--stamp takes the pull requests from the briefing's one gh call, with headRefOid`;
  - `--stamp records prs as null, prints unknown: gh and exits 0 when gh fails`;
  - `--stamp on an invalid checkpoint exits 1 and writes neither a stamp nor a session folder`;
  - `--stamp writes the stamp 0600 and creates the session folder 0700`;
  - `--stamp without CLAUDE_CODE_SESSION_ID creates no session folder and records no session`;
  - `--stamp with node unavailable exits 2 with the one line, and still creates the session folder`;
  - `--stamp deletes session folders idle for 14 days and keeps the rest`, table-driven: a folder
    15 days old goes; an old folder with a fresh note, the run's own old folder, a symlink (and its
    target) and a folder whose name fails the pattern stay;
  - `--stamp with no task id, or two, exits 2 with its usage line`, which today's
    `not a task id` line is not;
  - `the records schema's stamp properties are the keys of a written stamp`.
- [ ] **Step 2:** Run both files: every new test fails (no `--stamp` yet).
- [ ] **Step 3:** Implement the flag in `agent-resume.sh` (retention and the session folder in bash,
      from the repository root the script already requires) and `stamp` in the module, with the
      shared gh answer file (D9).
- [ ] **Step 4:** Run both files, `pnpm typecheck` and the isolated copy.
- [ ] **Step 5:** Commit `feat(scripts): stamp a checkpoint's facts with agent-resume.sh --stamp`.

**Stop condition:** both files pass, with 12 tests red first.

### Task 9: Since the stamp

**Files:** `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`, `scripts/agent-resume.sh`,
`scripts/agent-resume.test.mjs`

- [ ] **Step 1 (red):** Add these tests; each stamps a task, changes git or the gh stub, then runs
      `scripts/agent-resume.sh <task-id>` and asserts the exit code and the whole briefing:
  - `commits after the stamp give one advanced line and skip that branch's tip check`, while
    another branch's tip check still runs;
  - `a rebased branch gives rewritten, and no contradiction` (the second review's blocker);
  - `a stamped commit missing from the repository gives changed, with the reason`;
  - `an upstream that moved is appended to its branch's line`;
  - `a changed worktree lists 10 new entries, +N more, and (first 200 compared)`;
  - `a pull request's head gives advanced, or rewritten after a force push` (table-driven);
  - `pending -> passing gives one line, and checks failing now give only today's attention line`;
  - `a merged pull request gives only today's contradiction`;
  - `a pull request outside the 200-PR window gives only today's contradiction`;
  - `gh with no answer at the stamp gives pull requests not compared`;
  - `a stale stamp gives the not-compared line, and the tip check runs for every branch`;
  - `a task's contradictions print before Since the stamp, and none is cut`, with 300 changed
    entries and five contradictions;
  - `switching the checkout to another branch changes no line (guard)`.
- [ ] **Step 2:** Run both files: the red tests fail, the guard passes.
- [ ] **Step 3:** Implement `drift`'s Since the stamp, and in `agent-resume.sh` the drift lines
      after the contradictions and the tip check skipped per branch that has a drift line.
- [ ] **Step 4:** Run both files, `pnpm typecheck` and the isolated copy.
- [ ] **Step 5:** Commit `feat(scripts): brief what changed since a checkpoint's stamp`.

**Stop condition:** both files pass, with 12 tests red first and 1 guard.

### Task 10: The sweep's line, the rules, and PR 2

**Files:** `scripts/agent-resume.sh`, `scripts/agent-resume.test.mjs`,
`.claude/rules/claude-code-config.md` (the `--stamp` step right after each checkpoint update and
before starting children, Since the stamp, the session opt-in, retention and the copy-out),
`.claude/rules/ci-and-scripts.md` (the module, the suite and the `--stamp` row of the commands
table), `docs/plans/README.md` (this plan's row: `In progress`), this plan (ticks)

- [ ] **Step 1 (red):** `the sweep prints the stamped line after the task's contradictions`, for
      a stamped task in progress.
- [ ] **Step 2 (guard):** `the sweep is byte for byte the main copy's`, for unstamped tasks and
      for finished stamped tasks.
- [ ] **Step 3:** Implement the line: one file test per task in progress, no process.
- [ ] **Step 4:** Time the sweep against a worktree of `main`, five runs each, interleaved, and put
      the medians in the pull request. This is information, not a gate: the line adds no process.
- [ ] **Step 5:** Write the rule text.
- [ ] **Step 6:** Write the PR 2 checkpoint and open the pull request with
      `.claude/skills/open-pr/SKILL.md`: `adversarial-reviewer` on the diff only and
      `edge-case-hunter` on the changed scripts, with the findings triaged in the Review section.
      Watch the checks on the pushed head SHA.

**Stop condition:** the whole-plan gates exit 0, with 1 test red first and 1 guard, and every check
is green on the head SHA.

---

## PR 3: child agents (`feat/checkpoint-child-agents`)

Branched from `main` after PR 2 has merged.

### Task 11: The hook wrapper and the settings entries

**Files:**

- Create: `.claude/hooks/subagent-state.sh`
- Modify: `.claude/settings.json` (SubagentStart and SubagentStop, `bash` on the wrapper, 10 s),
  `scripts/agent-state-records.schema.json` (the start and stop definitions),
  `scripts/claude-hooks.test.mjs`

- [ ] **Step 1 (red):** Port the spike's cases (the design's subagent hooks section) as these
      tests, each feeding a payload shaped like the probe's events and asserting the exit code and
      the files on disk:
  - `settings.json runs the wrapper with bash on SubagentStart and SubagentStop, with 10 s`;
  - `the status comes from the last non-blank line`, table-driven over the 15 shapes;
  - `a blank, missing or non-string message gives ended and no note`;
  - `a stop writes a 0600 note and a record that names it`: the note is
    `<agent-id>-<16 hex>.txt` in a 0700 folder, and the record has milliseconds and exactly its
    keys;
  - `a note is cut to at most 65,536 bytes on a character boundary`, with its marker, for 1-, 2-
    and 4-byte characters, while a message of exactly 65,536 bytes is not cut;
  - `a start writes exactly its keys, with the type lower-cased`;
  - `an agent type outside the pattern is recorded as unknown`;
  - `an empty agent type, the compaction agent, writes nothing`;
  - `a session without a folder, or no CLAUDE_PROJECT_DIR, writes nothing and exits 0`;
  - `an invalid payload writes no record and exits 0`, and its error file exists only when its
    session is known, and holds no payload text;
  - `a PATH without jq still finds /usr/bin/jq`;
  - `with no jq at all, jq-not-found is written to the folder of CLAUDE_CODE_SESSION_ID`, on a copy
    of the wrapper without its `PATH` line;
  - `a second stop writes a second note, and the record names the newer one`;
  - `no .tmp is left, and a stop record that cannot be written leaves no note`;
  - `git check-ignore covers a stop record and a note (guard)`.
- [ ] **Step 2:** Run the file: the red tests fail, the guard passes.
- [ ] **Step 3:** Write the wrapper and the two settings entries, and check them with
      `jq -e . .claude/settings.json`.
- [ ] **Step 4:** Commit `feat(hooks): record child agents of stamped sessions`.

**Stop condition:** `node --test scripts/claude-hooks.test.mjs` passes, with 14 tests red first and
1 guard, and `jq -e . .claude/settings.json` exits 0.

### Task 12: Child agents in a run for a named task

**Files:** `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`,
`scripts/agent-resume.test.mjs`

- [ ] **Step 1 (red):**
  - `a blocked child is one line, and no word of its text appears`: its type in backticks, its
    times and its note path;
  - `done and ended children are one count line per session`;
  - `a start without a stop is running in the run's own session and no stop recorded in another`;
  - `a start after its stop, a resumed child, has no stop recorded`;
  - `a child that started more than 48 h ago is not listed`;
  - `a session line names every task whose stamp lists it`, and a child of a shared session
    raises no attention line;
  - `the section holds the named sessions only`: their children are listed, and a blocked child
    of a third session is not;
  - `error files from the last 48 h give hook errors: N, and older ones nothing`;
  - `a jq-not-found error file gives the child records unavailable line`;
  - `no folder for the run's own session, or no session at all, gives its one line`
    (table-driven);
  - `more than 20 children are cut with +N more and the folder`;
  - `the records schema's start and stop properties are the keys of written records`.
- [ ] **Step 2:** Run both files: every new test fails.
- [ ] **Step 3:** Implement the merge of start and stop records and the Child agents section.
- [ ] **Step 4:** Commit `feat(scripts): brief the child agents of a task's sessions`.

**Stop condition:** both files pass, with 12 tests red first.

### Task 13: The live check, ADR 0041, and PR 3

**Files:** `docs/adr/0041-one-checkpoint-system-in-agent-state.md`, `docs/adr/README.md` and
`docs/drift-manifest.json` (the status), `.claude/rules/claude-code-config.md` (the hooks and the
Child agents section), `docs/plans/README.md` (the design's and this plan's rows: `Shipped`), this
plan (ticks)

- [ ] **Step 1:** In a scratch clone of the branch, with the repository's own settings, start a
      headless lead: write a checkpoint, run `--stamp`, start one child that ends on `BLOCKED`, one
      that ends without a status line, resume one through SendMessage, then `/compact`. Run
      `bash scripts/agent-resume.sh <task-id>`. Expected: one line for the blocked child with its
      note path, `not listed: 1 done, 1 ended` or the counts that match, no word of any child's
      text, and no record of the compaction agent. Paste the commands and the output into the pull
      request.
- [ ] **Step 2:** Repeat Step 1 by hand in one interactive session, which the probe did not cover.
- [ ] **Step 3:** Start a child in a session that never stamped, and show that nothing is written
      under `.agent-state/sessions`.
- [ ] **Step 4:** When Steps 1 to 3 hold, ADR 0041 becomes `Accepted` in the record, its index row
      and its manifest entries, in one commit; after that its Decision is never edited (ADR 0012).
      When one fails, the design and the record are revised first, in this pull request.
- [ ] **Step 5:** Write the rule text and the README rows.
- [ ] **Step 6:** Write the PR 3 checkpoint and open the pull request as in Task 10, with
      `edge-case-hunter` on the wrapper.
- [ ] **Step 7:** After the owner merges PR 3, carry out the answer to owner question 2 (the 10-13
      worktree and archive).

**Stop condition:** the whole-plan stop condition holds, the live check's output matches Steps 1 to
3, and the ADR index check passes with ADR 0041 `Accepted`.

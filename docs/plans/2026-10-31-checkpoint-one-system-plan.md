# One Checkpoint System with Child Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.agent-state/<task-id>.json` stays the only checkpoint. The resume check learns what
changed since the lead last stamped its facts, and the lead's child agents are recorded by
SubagentStart and SubagentStop hooks. Every existing checkpoint stays valid and is briefed as it
is today, and SessionStart stays inside its 20 s.

**Architecture:** one new dependency-free module, `scripts/agent-state.mjs`, with three
subcommands:

- `stamp`: the lead records git and pull request facts, and its session, after each checkpoint
  update, into `.agent-state/<task-id>/stamp.json`;
- `drift`: run once by `scripts/agent-resume.sh`, in the background, for the stamped tasks still in
  progress; it prints one JSON object per briefing line;
- `hook`: run by `.claude/hooks/subagent-state.sh` on SubagentStart and SubagentStop; it writes one
  file per event under `.agent-state/sessions/<session-id>/` and never reads a checkpoint.

Every file has one writer, so nothing takes a lock. `scripts/agent-state.schema.json` does not
change.

**Tech Stack:** Node 22 (`node:test`, no dependencies, type-checked through JSDoc by the `scripts`
package), bash 3.2 with jq and perl, Claude Code hooks.

**Design:** [the design](2026-10-31-checkpoint-one-system-design.md), decisions D1 to D11, with the
probe and the measured cost of today's session start. **Record:**
[ADR 0041](../adr/0041-one-checkpoint-system-in-agent-state.md).

**Branches and pull requests:**

- PR 1 is this branch, `docs/checkpoint-one-system-plan`: the design, this plan and ADR 0041,
  merged as one pull request after the probe (done) and a second review round.
- PR 2, `feat/checkpoint-stamp-drift`, and PR 3, `feat/checkpoint-child-agents`, are branched from
  `main` only after PR 1 has merged, so their code cites a merged record.

**Order and dependencies:**

- PR 1 waits for the second review round and the owner's answers to the design's four questions.
  An answer other than the recommended one changes the tasks it names, in the commit that records
  the answer.
- PR 2 waits for PR 1 and for **#280**: its tests import #280's warmed-stub helper rather than
  copying it (Task 4).
- PR 3 waits for PR 2, whose module it extends. Its first task prunes the SessionStart listing, so
  the prune lands no later than the hooks.
- `CLAUDE.md` is 16,383 bytes against its 16,384-byte budget (`scripts/claude-md-budget.test.mjs`).
  No task grows it; guidance goes into `.claude/rules/claude-code-config.md`.

**Red first:** every task that changes behaviour starts with tests that assert the exit code and
the output, run against the code as it was before the task, and fail. A test that cannot fail
against that code (one that pins today's behaviour) has `(guard)` in its title and is not counted
as red first. Ported tests that fail only because the module does not exist yet are counted as
ported, not as red first. Each task's stop condition gives the counts.

**Hangs:** every test that runs git, gh, node or a hook has `{ timeout: 10_000 }` and sets
`AGENT_RESUME_GIT_TIMEOUT`, `AGENT_RESUME_GH_TIMEOUT` and `AGENT_RESUME_DRIFT_TIMEOUT` to 1, which
the stamp reads too, so a test of a hang costs at most 2 s.

**Stop condition for the whole plan (all must hold):**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:scripts   # exit 0
pnpm check:adrs && pnpm check:adr-history && pnpm check:docs-drift      # exit 0
git fetch origin && git diff --exit-code origin/main -- scripts/agent-state.schema.json
bash scripts/agent-resume.sh; echo "exit $?"   # exit 0 on the main checkout, old ones as before
gh pr checks <N> --watch                       # green on the head SHA, for each of PR 1, 2 and 3
```

The `git diff` prints nothing: no pull request in this plan changes the checkpoint schema, so it
is the same file on `origin/main` before PR 2 and after PR 3. Task 14's live probe also shows one
`BLOCKED` child as an attention line with its note path and none of its text.

---

## PR 1: the design, this plan and ADR 0041 (`docs/checkpoint-one-system-plan`)

### Task 1: Run the live probe

**Files:** none in the repository. The probe ran in a scratch git repository outside it, with a
settings file passed on the command line; no settings file was read or changed.

- [x] **Step 1:** Write a capture hook that appends each SessionStart, SubagentStart and
      SubagentStop payload, with the hook's own `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PROJECT_DIR`.
- [x] **Step 2:** Run the three headless runs in the design's probe section: two children (one
      without a status line), a resume with a `BLOCKED` child, and a named agent.
- [x] **Step 3:** Record the commands, the output and the answers to S5's five questions in the
      design, and measure today's resume check and SessionStart (the design's cost table).

**Stop condition:** the design's probe section answers all five questions from recorded output.
Met on 2026-10-31.

### Task 2: Record the decision in ADR 0041

**Files:**

- Create: `docs/adr/0041-one-checkpoint-system-in-agent-state.md`, status `Proposed`
- Modify: `docs/adr/README.md` (its index row), `docs/drift-manifest.json` (the index entries and
  one per new link), `docs/plans/README.md` (this plan's and the design's rows)

- [x] **Step 1:** Write the record: Status, Date, Context, Decision, Consequences and Alternatives
      considered. Its Context cites no local or untracked file.
- [x] **Step 2:** Add the index row and the manifest entries.
- [x] **Step 3:** Run the gates:

```bash
pnpm format:check && pnpm check:adrs && pnpm check:docs-drift
```

**Stop condition:** the three commands exit 0 (output in the second draft's report).

### Task 3: Second review, the owner's answers, and PR 1

**Files:** this design, this plan, ADR 0041 and its index row.

- [ ] **Step 1:** `adversarial-reviewer` gets this branch's diff against `origin/main` and nothing
      else. The team lead triages its findings; each is fixed, deferred with a reason or rejected
      with a reason in the pull request's Review section.
- [ ] **Step 2:** The owner answers the design's four questions. The answers go into the design,
      and into any task they change, in one commit.
- [ ] **Step 3:** When the decision stands as written, ADR 0041 becomes `Accepted` in the record,
      its index row and its manifest entries, in one commit. After that its Decision is never
      edited (ADR 0012).
- [ ] **Step 4:** Write the PR 1 checkpoint, open the pull request with
      `.claude/skills/open-pr/SKILL.md`, and watch the checks on the pushed head SHA:
      `gh pr checks <N> --watch`, then `gh pr view <N> --json headRefOid,statusCheckRollup`.

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
      function returning the stub paths. `scripts/claude-hooks.test.mjs` imports it. Run
      `pnpm test:scripts` and compare the pass count with the count before the move.
- [ ] **Step 2 (guard):** `scripts/agent-resume.test.mjs` links its `bin/gh` to the warmed stub
      instead of writing one per test. Run the suite again.
- [ ] **Step 3:** Copy `scripts/*.mjs`, `scripts/*.json` and `scripts/test-support/` to an isolated
      directory without `node_modules` and run `node --test` there.
- [ ] **Step 4:** Commit `test(scripts): share the warmed stubs between the hook and resume tests`.

**Stop condition:** `pnpm test:scripts` exits 0 with the same number of tests as before, the
isolated copy passes, and no test writes an executable after `before()`. Red first: 0 (a refactor).

### Task 5: Port the helpers that move unchanged

**Files:**

- Create: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1 (ported):** Bring the 10-13 tests of `parseStatus`, `rollupChecks`, `printable`,
      `ancestry`, the bounded `git` runner, `writeAtomic`, the safe JSON read and `transcriptText`.
      Run `node --test scripts/agent-state.test.mjs`: it fails, because the module does not exist.
- [ ] **Step 2:** Port those functions unchanged, with their JSDoc types.
- [ ] **Step 3:** Run the test file and `pnpm typecheck`.
- [ ] **Step 4:** Commit `feat(scripts): port the checkpoint helpers that still fit`.

**Stop condition:** the test file passes, `pnpm typecheck` exits 0, and a diff of each function
against the 10-13 code shows no change but formatting. Red first: 0; ported: the count of tests.

### Task 6: The stamp

**Files:**

- Create: `scripts/agent-state-records.schema.json`, with the stamp's definition only
- Modify: `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1 (red):** Add these tests, each in a temporary repository with stub `gh` and `git`,
      each asserting the exit code, stdout, stderr and the file written:
  - `stamp writes stamp.json with the branch, head, porcelain and session` (exit 0; the file
    validates against the schema; `at` has milliseconds; `sessions` holds the session id);
  - `stamp appends a new session and keeps the earlier one, at most 20`;
  - `stamp records prs as null, prints unknown: gh and exits 0 when gh fails`;
  - `stamp exits 0 within 2 s with prs null when gh hangs`;
  - one table-driven test: `stamp refuses with exit 1 and writes nothing` for a bad id, a missing,
    symlinked or non-object checkpoint, and `schema_version` 2;
  - `stamp exits 2 when the task folder cannot be written`;
  - `stamp writes mode 0600 files in a 0700 folder` (`umask 077`);
  - `stamp's id pattern is agent-resume.sh's id_re`, run over valid and invalid ids and the 35 ids
    present on 2026-10-31.
- [ ] **Step 2:** Run the file: every new test fails (no `stamp` yet).
- [ ] **Step 3:** Implement `stamp` as the design's six steps, with the shared gh call (D9).
- [ ] **Step 4:** Run the file, `pnpm typecheck` and the isolated copy.
- [ ] **Step 5:** Commit `feat(scripts): stamp a checkpoint's git and pull request facts`.

**Stop condition:** the file passes, with 8 tests red first.

### Task 7: Drift

**Files:** `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1 (red):** Add these tests; each runs `drift` on a stamped task and asserts the exit
      code and the JSON lines:
  - `commits after the stamp are a since line, not a contradiction`;
  - `a rewritten history is a contradiction`, and `HEAD behind the stamp is a contradiction`;
  - `a stamped head missing from the repository is a contradiction`;
  - `a changed working tree lists 10 paths and +N more`;
  - `a pull request's new head and pending -> passing checks are since lines`;
  - `passing -> failing checks are one attention fact`;
  - `a pull request unknown at stamp time and known now prints nothing`;
  - `a stale stamp prints only "not checked"`;
  - `a stamp without a session prints binding: unknown`;
  - `a task's lines over 1,200 bytes are cut on a line with +N more`;
  - `a .tmp file older than an hour is deleted and a fresh one kept`;
  - `every line of output is one complete JSON object`.
- [ ] **Step 2:** Run the file: every new test fails (no `drift` yet).
- [ ] **Step 3:** Implement `drift` as the design's "What the resume check gains", without children
      (Task 13 adds them).
- [ ] **Step 4:** Run the file, `pnpm typecheck` and the isolated copy.
- [ ] **Step 5:** Commit `feat(scripts): report what changed since a checkpoint's stamp`.

**Stop condition:** the file passes, with 13 tests red first.

### Task 8: Drift in the resume check

**Files:** `scripts/agent-resume.sh`, `scripts/agent-resume.test.mjs`

- [ ] **Step 1 (red):** Add these tests, each asserting the exit code and the whole briefing:
  - green checks after the stamp give the since line `PR #N checks: pending -> passing`, and no
    contradiction and no attention line (the blocker of the first review);
  - commits after the stamp skip the 60 s tip check and show `HEAD advanced`;
  - the tip check stays, four tests: for a stale stamp; with node missing, which also prints
    `child records: node unavailable` once; when drift times out, which also prints
    `drift: timed out`; and when git cannot answer;
  - a step in progress on a merged and deleted branch keeps today's contradiction and adds that
    HEAD does not descend from the stamped head;
  - gh is called once, with `headRefOid`;
  - a half-written drift line is dropped and the rest briefed;
  - a hanging drift is cut at `AGENT_RESUME_DRIFT_TIMEOUT`;
  - 200 changed paths stay inside 1,200 bytes for the task;
  - two guards: an unstamped checkpoint briefs byte for byte as before, and a finished task with a
    stamp starts no drift; the existing schema-driven test stays unchanged.
- [ ] **Step 2:** Run `node --test scripts/agent-resume.test.mjs`: the red tests fail, the guards
      pass.
- [ ] **Step 3:** Implement: one `jq` call per checkpoint for its three flags (in place of today's
      two), `headRefOid` in the gh call, drift in the background after the network calls under the
      process-group timer, the stamped tasks in progress briefed after it, only complete JSON lines
      read, and the tip check skipped only for a task drift gave an ancestry result for.
- [ ] **Step 4:** Run the file, `pnpm test:scripts` and the isolated copy, then time
      `bash scripts/agent-resume.sh` three times on the main checkout against the design's baseline.
- [ ] **Step 5:** Commit `feat(scripts): brief what changed since the stamp in the resume check`.

**Stop condition:** the file passes, with 11 tests red first and 2 guards, and the three timings
are no slower than the design's baseline by more than its run-to-run spread.

### Task 9: The SessionStart bound, the rules, and PR 2

**Files:** `scripts/claude-hooks.test.mjs`, `.claude/rules/claude-code-config.md` (the stamp step,
Since the stamp, retention and the copy-out folder), `.claude/rules/ci-and-scripts.md` (the new
script and suite), `docs/plans/README.md` (this plan's row: `In progress`), this plan (ticks)

- [ ] **Step 1 (guard):** `SessionStart ends under 20 s with node, git and gh stubbed to sleep`.
- [ ] **Step 2:** Write the rule text.
- [ ] **Step 3:** Write the PR 2 checkpoint and open the pull request with
      `.claude/skills/open-pr/SKILL.md`: `adversarial-reviewer` on the diff only and
      `edge-case-hunter` on the changed scripts, with the findings triaged in the Review section.
      Watch the checks on the pushed head SHA.

**Stop condition:** the whole-plan gates exit 0 and every check is green on the head SHA.

---

## PR 3: child agents (`feat/checkpoint-child-agents`)

Branched from `main` after PR 2 has merged.

### Task 10: Keep session records out of the SessionStart listing

**Files:** `.claude/hooks/session-start.sh`, `scripts/claude-hooks.test.mjs`

- [ ] **Step 1 (red):** `a Markdown file under .agent-state/sessions is not listed`. It fails today,
      because the listing's `find` is recursive.
- [ ] **Step 2:** Prune `sessions` in that `find`.
- [ ] **Step 3:** Commit `fix(hooks): keep session records out of the session-start notes`.

**Stop condition:** `node --test scripts/claude-hooks.test.mjs` passes, with 1 test red first.

### Task 11: The child records and `hook`

**Files:** `scripts/agent-state-records.schema.json` (the start and stop definitions),
`scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`

- [ ] **Step 1 (red):** Add these tests, each feeding a payload shaped like the probe's and
      asserting the exit code and the files written:
  - `a start writes <agent-id>.start.json under the payload's session`;
  - `a stop writes a 0600 .txt note with a random suffix and a stop record with done`;
  - `a final message with no status line gives ended` (the probe's child B);
  - `BLOCKED gives blocked` (the probe's child C);
  - `a transcript that ended on a tool call gives ended`;
  - `a blank message writes no note and a null note`;
  - `a second stop writes a second note, and the record names the newer one`;
  - `an invalid session or agent id writes nothing and exits 1`;
  - `an agent type outside the pattern is recorded as unknown`;
  - `a stop record that cannot be written leaves no note`;
  - `the hook runs no git and opens no checkpoint` (a git stub that logs every call, and a
    checkpoint with mode 000);
  - `git check-ignore covers a stop record and a note (guard)`.
- [ ] **Step 2:** Run the file: the red tests fail, the guard passes.
- [ ] **Step 3:** Implement `hook` with the ported `parseStatus`, `transcriptText` and
      `writeAtomic`, and the changed `writeNote` and `discardNote`.
- [ ] **Step 4:** Commit `feat(scripts): record child agents by session`.

**Stop condition:** the file passes, with 11 tests red first and 1 guard.

### Task 12: The wrapper and the settings entries

**Files:** create `.claude/hooks/subagent-state.sh`; modify `.claude/settings.json` (SubagentStart
and SubagentStop, `bash` on the wrapper, 30 s), `scripts/claude-hooks.test.mjs`

- [ ] **Step 1 (red):**
  - `settings.json runs the wrapper with bash on SubagentStart and SubagentStop`;
  - `the wrapper exits 0 and writes nothing without CLAUDE_PROJECT_DIR`, and `without node`;
  - `a failing hook exits 0 and logs one line to its session's hook-errors.log`;
  - `the log is renamed to hook-errors.log.1 past 64 KiB`;
  - `the wrapper writes under umask 077`.
- [ ] **Step 2:** Run the file: every new test fails.
- [ ] **Step 3:** Write the wrapper (no nvm, no `$PWD` fallback) and the two settings entries.
- [ ] **Step 4:** Commit `feat(hooks): record child agents on SubagentStart and SubagentStop`.

**Stop condition:** `node --test scripts/claude-hooks.test.mjs` passes, with 6 tests red first, and
`jq -e . .claude/settings.json` exits 0.

### Task 13: The children in the briefing

**Files:** `scripts/agent-state.mjs`, `scripts/agent-state.test.mjs`,
`scripts/agent-resume.test.mjs`

- [ ] **Step 1 (red):**
  - `a BLOCKED child is one attention line with its note path, and none of its text appears`;
  - `done, ended and running children are counted under Since the stamp`;
  - `a start without a stop is running in this session`, and `no stop recorded in an earlier one`
    (counted as one test, table-driven);
  - `a child started more than 60 s before the stamp is not counted`;
  - `a session the stamp does not list contributes nothing`;
  - `a non-empty hook log gives hook errors: see <path>`;
  - `a checkout without session records says children: none recorded in this checkout`;
  - `ten children and 200 paths stay inside 1,200 bytes for the task and 4,000 in SessionStart`.
- [ ] **Step 2:** Run both files: every new test fails.
- [ ] **Step 3:** Implement the merge of start and stop records and the child lines.
- [ ] **Step 4:** Commit `feat(scripts): brief a task's child agents since its stamp`.

**Stop condition:** both files pass, with 8 tests red first.

### Task 14: A live probe against the real hooks, and PR 3

**Files:** `.claude/rules/claude-code-config.md` (the hooks and the child lines),
`docs/plans/README.md` (the design's and this plan's rows: `Shipped`), this plan (ticks)

- [ ] **Step 1:** In a scratch clone of the branch, start a headless lead with the repository's
      own settings, stamp a task, start one child that ends on `BLOCKED` and one that ends without
      a status line, then run `bash scripts/agent-resume.sh <task-id>`. Expected: one attention
      line for the `BLOCKED` child with its note path, `children: 1 ended`, and no word of either
      child's text. Paste the commands and output into the pull request.
- [ ] **Step 2:** Write the rule text and the README rows.
- [ ] **Step 3:** Write the PR 3 checkpoint and open the pull request as in Task 9, with
      `edge-case-hunter` on the hook and the wrapper.
- [ ] **Step 4:** After the owner merges PR 3, carry out the answer to owner question 3 (the 10-13
      worktree and archive).

**Stop condition:** the whole-plan stop condition holds, and the probe output matches Step 1.

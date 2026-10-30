# 0037. Next.js keeps its agent instruction blocks out of the app, on 16.4's sync

## Status

Accepted

## Date

2026-10-20

## Context

[ADR 0019](0019-next-agent-rules-disabled.md) turned off the agent instruction files Next.js 16.3
generated (`agentRules: false` in `apps/web/next.config.ts`), and its Decision names the 16.3 code
that `apps/web/src/test/next-config.test.ts` reads to check the option is still honoured. Next.js
16.4 replaced that code, so the Dependabot update to 16.4 (#275, at 16.4.2 first and at 16.4.3 since
its 2026-10-26 rebase) failed four of those checks. The decision still stands; the code it rests on,
and some of what the record says follows from it, do not. Read in the installed 16.4.3 (first read
in 16.4.2), in both the CommonJS and the ESM build of `dist/server/lib`:

- `start-server.js` no longer generates the files inside an `if (<result>.agentRules !== false)`
  block. In development it calls `syncAgentRulesForDev(dir, <result>.agentRules !== false)` on
  every start, where `<result>` is what `getRequestHandlers` returned, the object the router
  server's `initialize` builds from the loaded config (`agentRules: config.agentRules`, as before).
- `syncAgentRulesForDev` in `app-info-log.js` opens with
  `if (!enabled) return removeAgentRulesFiles(dir)`. Only when enabled does it go on to look for an
  agent (`getAgentName`, `@vercel/detect-agent` as before), skip when `AGENTS.md` already holds the
  current block, and otherwise call `writeAgentFiles`.
- `generate-agent-files.js` now manages `AGENTS.md` alone, inside the markers
  `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->`; nothing in it writes
  `CLAUDE.md` any more. `removeAgentRulesFiles` strips that block and deletes the file when nothing
  else is left in it. Next's own page on the option says so: "`v16.4.0` Setting `agentRules` to
  `false` removes an existing managed block on `next dev`"
  (`dist/docs/01-app/03-api-reference/05-config/01-next-config-js/agentRules.md`). The guide that
  documented `agentRules: false` before, `dist/docs/01-app/02-guides/ai-agents.md`, no longer
  documents the setting itself: it links to that page instead.
- A second block is new: `syncAgentFeedbackForDev(dir, agentFeedbackConfigured && telemetryEnabled)`,
  called only outside CI, where `agentFeedbackConfigured` is `<result>.agentFeedback === true` and
  `initialize` passes `agentFeedback: config.experimental.agentFeedback` (default `false` in
  `config-shared.js`). Switched off, it removes its own block (`removeAgentFeedbackFiles`);
  switched on, and with telemetry enabled, `writeAgentFeedbackFiles` adds a feedback block to
  `AGENTS.md`, telling agents the owner "enabled `experimental.agentFeedback`, authorizing this
  feedback pass".
- `experimental.agentUpgrade`, also new and `'security'` by default, prints upgrade reminders during
  `next dev` and `next build` and keeps retry receipts under the build directory's `cache`. It
  writes no instruction file and is not part of this record.

Run from a Claude Code shell (`CLAUDECODE` and `AI_AGENT` set) in this repository on 16.4.2 with
`agentRules: false`, `next dev` wrote neither file into `apps/web`, and with an `apps/web/AGENTS.md`
holding nothing but a stale managed block it logged "Removed agent rules from AGENTS.md because
`agentRules` is disabled." and the file was gone, all on 2026-10-20.

## Decision

`apps/web/next.config.ts` keeps `agentRules: false` and leaves `experimental.agentFeedback` unset,
so Next.js writes no agent instructions into the app and removes its own blocks from an
`apps/web/AGENTS.md` it finds there.

- Unit tests pin this against whichever Next.js is installed: they fail when the config stops
  setting `agentRules: false` or stops leaving `experimental.agentFeedback` unset or `false`; when
  `AGENTS.md` or `CLAUDE.md` in `apps/web` is tracked; when the installed Next.js's compiled dev
  server no longer shows `agentRules` as the whole switch on the rules block it writes into the
  app, or `agentFeedback === true` as a term the switch on the feedback block requires, a block
  Next also leaves off in CI and without telemetry; and when its bundled docs stop documenting
  `agentRules: false`. What the tests read in that code is under Consequences, because it changes
  with each release that restructures it.
- The repository's own reviewed files, the root `CLAUDE.md` and the scoped rules in
  `.claude/rules/`, stay the only instructions for this project, and the root `CLAUDE.md` keeps
  pointing agents at `apps/web/node_modules/next/dist/docs`, as under ADR 0019.
- A stray `apps/web/CLAUDE.md`, which only 16.3 wrote and 16.4 never touches, is still deleted by
  hand and never ignored; so is an `apps/web/AGENTS.md` that holds anything besides Next's blocks.

## Consequences

### Positive

- A leftover managed block in `apps/web/AGENTS.md` is now removed by the next `next dev` instead of
  waiting for someone to delete it, so ADR 0019's trade-off of copies that "stay in other checkouts
  until someone deletes them" holds only for `CLAUDE.md`.
- The feedback block cannot appear without a change to `next.config.ts` that review sees, and the
  unit tests fail on that change as well.
- Every instruction file an agent loads for this repository is still one a person wrote and
  reviewed. The upgrade reminders `experimental.agentUpgrade` prints are console output, not a
  file, and outside this record.

### Trade-offs

- The checks match compiled code. In 16.4, `apps/web/src/test/next-config.test.ts` reads both the
  CommonJS and the ESM build of `dist/server/lib`, and fails if `router-server.js`'s `initialize`
  stops returning `agentRules` and `agentFeedback` from the config; if `start-server.js` stops
  calling `syncAgentRulesForDev` or `syncAgentFeedbackForDev`, or calls either anywhere in a form
  the test cannot read, `<name>(<identifier>, <switch>)` with no parenthesis in the switch; if a
  call of `syncAgentRulesForDev` there takes anything but `<result>.agentRules !== false`, alone,
  as its switch, on the object `getRequestHandlers` returned; if a call of
  `syncAgentFeedbackForDev` stops having `<result>.agentFeedback === true` among the `&&` terms of
  its switch, on that object; if either switch gains a top-level `||`, `??`, conditional `?` or
  comma; if either function in `app-info-log.js` stops opening with the removal when switched off,
  or stops being where its writer is called; or if any other `.js`, `.cjs` or `.mjs` file under
  `dist` (bar the vendored bundles in `dist/compiled`, and `dist/docs`, which holds only Markdown)
  calls either function or either writer. It also checks that
  `dist/docs` ships and that
  `dist/docs/01-app/03-api-reference/05-config/01-next-config-js/agentRules.md` still documents
  `agentRules: false`. So the next release that restructures that code fails them, as 16.4 did,
  and whoever bumps Next.js reads this record against the new code before updating the patterns.
  The list describes 16.4 and stays true of it: under ADR 0012 a later release's readings go in a
  note in a later record, and this one is superseded only when the behaviour its Decision states
  changes. Generation moving behind another option or a renamed function is still not noticed
  automatically; the behavioural check stays manual:
  `git status --porcelain --ignored -- apps/web/AGENTS.md apps/web/CLAUDE.md` prints nothing after
  an agent-run `next dev` or local e2e.
- The removal is Next's, and it reaches a hand-written `apps/web/AGENTS.md` too: it keeps that
  file's other text and drops only the marked block, but a file holding only the block is deleted.
  Nobody keeps such a file here; the repository's instructions live in the root `CLAUDE.md`.

## Alternatives considered

- **Correct ADR 0019 instead.** ADR 0012 corrects only what was false when a record was accepted.
  ADR 0019's account of 16.3 was true then, and its Decision names the checks this change replaces,
  so the change is recorded here and 0019 is superseded.
- **Turn the sync on and ignore `apps/web/AGENTS.md`.** Claude Code would still read an untracked,
  dependency-written instruction file, the harm ADR 0019 removed.
- **Turn on `experimental.agentFeedback`.** It would add unreviewed instructions to the same file
  and needs Next's telemetry on; nothing here needs it.

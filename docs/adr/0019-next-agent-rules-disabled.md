# 0019. Next.js does not generate agent instruction files

## Status

Accepted

## Date

2026-09-27

## Context

Next.js 16.3 writes two files into the app directory when `next dev` starts in a shell it
recognises as an AI agent's. The finding was made on 16.3.4. In the 16.3.5 installed when this
record was written, `dist/server/lib/start-server.js` (lines 419 and 420) calls
`ensureAgentRulesForDev` in development unless `agentRules` is `false` in the Next config
(`agentRules?: boolean`, default `true`, in `dist/server/config-shared.d.ts`), a value that
`dist/server/lib/router-server.js` (line 751) hands back to it from the loaded config. That function
(`dist/server/lib/app-info-log.js`, lines 125 to 129) returns early unless `@vercel/detect-agent`
finds an agent and neither file already holds Next's current managed block, and
`dist/server/lib/generate-agent-files.js` (lines 112 and 113) then writes `AGENTS.md` and
`CLAUDE.md`. Claude Code sets `CLAUDECODE` and `AI_AGENT` in the shells it runs, so every
agent-run `next dev` in this repository left `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` behind.

That reaches further than `pnpm dev`. `apps/web/playwright.config.ts` merges its `webServer.env`
over `process.env`, so a local e2e run started from a Claude Code session hands both variables to
the `next dev` it boots, and the suite writes the pair as a side effect of testing.

The repository neither committed, ignored nor disabled the files:

- `git check-ignore -v` exits 1 for both paths, so they appear as untracked files in every agent
  checkout. They appeared in the main checkout and in another local worktree on 2026-09-11, again
  on 2026-09-17 in a fresh worktree of `main`, whose `next dev` logged "Generated AGENTS.md and
  CLAUDE.md for AI agents", and were still sitting untracked in the main checkout on 2026-09-27.
- Both files pass Prettier, so `pnpm format:check` never notices them.
- The generated `AGENTS.md` tells agents that committing it "keeps the tree clean", which invites
  exactly the commit nobody decided on.
- Claude Code loads a nested `CLAUDE.md` as project instructions for work under that directory. An
  untracked file, written by a dependency and rewritten on its schedule, was therefore instructing
  agents about `apps/web` alongside the repository's own reviewed instructions.

The generated `AGENTS.md` does carry one useful thing: a pointer to the documentation bundled with
the installed Next.js, which matches the version the app actually runs rather than whatever the
current online docs describe. Next.js's own guide to the option
(`dist/docs/01-app/02-guides/ai-agents.md`, "Opting out") recommends leaving generation on for that
reason, and documents `agentRules: false` as the way to turn it off.

Pull request #28 noticed the files and deferred the decision. The owner decided on 2026-09-11 to
disable generation.

## Decision

`apps/web/next.config.ts` sets `agentRules: false`, and Next.js writes no agent instruction files.

- `apps/web/src/test/next-config.test.ts` asserts the default export's `agentRules` is `false`. It
  also reads the installed Next.js's compiled dev server, and fails if
  `dist/server/lib/router-server.js` stops passing `agentRules` on or if
  `dist/server/lib/start-server.js` calls `ensureAgentRulesForDev` without the
  `agentRules !== false` check.
- The repository's own reviewed files, the root `CLAUDE.md` and the scoped rules in
  `.claude/rules/`, stay the only instructions for this project. The root `CLAUDE.md`'s Gotchas
  list points agents at `apps/web/node_modules/next/dist/docs`, the version-matched documentation
  the generated file used to reference, so that pointer is kept without the file.
- Copies already written into local checkouts are untracked and are deleted by hand, not ignored:
  ignoring them would hide them while Claude Code still loads them. Nothing in the repository
  removes them, and `next-config.test.ts` fails if either path is ever tracked, so a `git add -A`
  in such a checkout cannot commit them unnoticed.

## Consequences

### Positive

- An agent-run `next dev` or local e2e run leaves `git status --porcelain apps/web` empty, so an
  untracked instruction file can no longer be committed by accident or loaded unreviewed.
- Every instruction an agent reads about this repository is in a file a person wrote and reviewed.
- A Next.js upgrade cannot change agent behaviour in this repository by rewriting a managed block.

### Trade-offs

- A later Next.js that drops the option fails `pnpm typecheck`, because the config is a typed
  `NextConfig` object literal. One that keeps the option but stops passing it on or checking it
  fails the source checks in `next-config.test.ts`. Those match compiled code, so a release that
  only restructures that code fails them as well, and whoever bumps Next.js checks this record
  against the new code before updating the pattern. Nothing automated notices generation moving
  behind a different option or into another module: the behavioural check is
  `git status --porcelain apps/web` after an agent-run `next dev` or local e2e, and it is manual.
- Agents lose the automatic pointer to the bundled docs and have to find it in `CLAUDE.md`. This
  goes against the default Next.js recommends; the pointer it rests on is kept, in a reviewed file.
- Copies written before this change stay in other checkouts until someone deletes them. Next.js no
  longer updates them, and Claude Code keeps loading them there in the meantime.

## Alternatives considered

- **Commit the generated pair.** Keeps git clean, but adds a nested instruction file whose content
  Next.js controls: every Next bump can rewrite its managed block, and a review of a dependency
  update would then have to review agent instructions too.
- **Ignore both paths in `.gitignore`.** Keeps git clean, but Claude Code still loads the nested
  `CLAUDE.md`. The untracked file was never the harm; unreviewed instructions were.
- **Strip `CLAUDECODE` and `AI_AGENT` from Playwright's `webServer.env`.** Covers the e2e run only,
  not `pnpm dev`, and depends on the list of variables `@vercel/detect-agent` reads, which changes
  between releases and is not this repository's to track.
- **Leave it as it was.** Every agent checkout collects two untracked files that instruct agents,
  and nobody decided what they say.

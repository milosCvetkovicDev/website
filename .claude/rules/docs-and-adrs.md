---
paths:
  - 'docs/**'
  - '.github/prompts/**'
  - '.github/workflows/docs-drift.yml'
  - 'scripts/check-docs-drift.ts'
  - 'scripts/docs-drift-patch.mjs'
  - 'scripts/ai-refusals.test.mjs'
---

# Documentation, ADRs and the drift check

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Quality gates

- The docs are checked for drift, outside the required checks. `docs/drift-manifest.json` catalogues
  the machine-verifiable claims in `docs/` that the checker can check (settings read with `gh api`,
  `path:line` citations, config values, package scripts; its `rules` block lists what is excluded),
  and `pnpm check:docs-drift` checks them. The `rules` block also says which claims are `live` and
  which are `historical`, read at the commit that wrote them because ADR 0012 forbids correcting a
  claim that was true then. A new link, backticked `pnpm` script command or `path:line` citation in
  `docs/`, in the forms `rules.coverage` lists, without a manifest entry is itself reported, so add
  the entry with the doc. `.github/workflows/docs-drift.yml` runs the check weekly and on every push
  to `main` that touches `docs/adr/`. When it finds drift, `claude -p` drafts a correction following
  `.github/prompts/docs-drift.md` in a job with no GitHub token, no shell and edits confined to
  `docs/`, and a separate job with no agent checks the change and opens one pull request, assigned
  to the owner. The workflow needs the `ANTHROPIC_API_KEY` and `DOCS_DRIFT_TOKEN` secrets and stops
  with a notice without them; it has not yet run with them. Protection and merge settings need an
  admin token, so CI reports those claims as skipped. The owner's token checks them locally; with
  any other token they cannot run (exit 2), so pass `--skip-requires admin`.
- The AI-facing refusals are gated. `scripts/ai-refusals.test.mjs` runs under `pnpm test:scripts` and
  fails when a mechanism `docs/adr/0017-ai-discoverability-policy.md` refuses reappears: an
  `llms-full.txt`, `ai.txt`, `tdmrep.json`, `ai-plugin.json`, `agents.json`, `cv.json`, `resume.json`
  or `agent-skills` path anywhere under `apps/web`, an `AGENTS.md` under `apps/web/public` or as a
  route directory under the app router, a
  `middleware.ts` or `proxy.ts`, a `FAQPage`, `HowTo`, `speakable`, `SearchAction`, `potentialAction`
  or `modelContext` string under `apps/web/src`, an IndexNow reference, a `Content-Signal` line or a
  second `userAgent` group in `robots.ts`, or a `nonce` in `next.config.ts`. It also fails when that
  record's refusal table loses a row, a source URL or a date. Adding one of these is a deliberate
  act: supersede the record and delete the matching assertion in the same pull request.

## Documentation

- `docs/adr` — numbered architecture decision records, indexed in `docs/adr/README.md`. Naming is
  `NNNN-kebab-title.md`, numbers are never reused, and the section order is Status, Date, Context,
  Decision, Consequences, Alternatives considered, optionally followed by Corrections. An accepted
  record's `## Decision` is never edited: supersede it with a new number and set the old status to
  `Superseded by ADR-NNNN`. Its other sections may be corrected when they state something that was
  false when the record was accepted, under the rules in
  `docs/adr/0012-correcting-accepted-records.md`, which sets the status to
  `Accepted (corrected YYYY-MM-DD)` and adds a dated, append-only `## Corrections` entry.
- Before editing a document that describes repository or CI settings, check each claim against the
  live settings (`gh api repos/milosCvetkovicDev/website`, `.../branches/main/protection`) rather
  than trusting the existing text, and cite code as a path with line numbers checked against
  current `main`.

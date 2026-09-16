# Plans and design documents

This directory holds the design documents and implementation plans for the portfolio monorepo. Each
file is dated, so the directory reads chronologically and old thinking is kept rather than rewritten.

## Convention

Two file types live here, and they are named for it:

- `YYYY-MM-DD-topic-design.md` captures **what is being built and why**. It states the context, the
  goals and non-goals, and the decisions with their rationale, usually as a numbered decision table.
  A design is normally written first, discussed, and approved before any plan is derived from it.
  Where a plan has no design of its own, the plan carries the rationale instead.
- `YYYY-MM-DD-topic-plan.md` is the **executable task list** derived from a design. Tasks are
  ordered, each names the files it touches, and steps use checkbox (`- [ ]`) syntax with verifiable
  stop conditions, normally a command and its expected exit code or output. Ticking a box is part of
  the work: update the plan in the commit that carries the work where possible, and otherwise in a
  `docs(plans):` commit immediately after, so the plan and the code never drift by more than one
  commit.

One file predates the convention. `2026-02-22-hero-section-redesign.md` is a plan despite its name,
and its reference is an HTML prototype that its own final task deletes, so it has no design in this
directory. Existing files are not renamed, because their names are cited from commit messages and
pull requests; new files follow the convention.

Two neighbouring directories hold documents that are deliberately not plans:

- [`docs/adr/`](../adr/README.md) records **decisions that outlive a single piece of work**: the
  choice of toolchain, the formatting and linting standard, the CI gates, the hosting provider. An
  ADR is short, immutable once accepted, and superseded rather than edited. Plans come and go; ADRs
  are the standing record of why the repository is shaped the way it is.
- [`docs/runbooks/`](../runbooks/deploy.md) records **operations**: the exact steps, commands and
  values needed to deploy, to change DNS, to verify a release, to roll back. A runbook is written to
  be followed under pressure by someone who has not read the design.

A design answers "what and why" for one piece of work; an ADR answers "why" for a decision that
outlives it. ADR-0001 describes `docs/plans/` as the "how" directory, which is a simplification: this
directory holds both the design and the plan for a piece of work.

Both directories were introduced by the documentation pull request described in
[2026-09-08-docs-and-deployment-plan.md](2026-09-08-docs-and-deployment-plan.md) (tasks C2 and C3).

## Index

Status means: **Shipped** (merged into `main`), **In review** (an open or draft pull request),
**Planned** (written and approved, not started). Shipped describes the code, not the site; the
deployment state is kept in [the deployment runbook](../runbooks/deploy.md).

A row of type **Epic** is work tracked with the `/pm:*` ceremony rather than as a plan file: its
PRD lives in `.claude/prds/`, its tasks in `.claude/epics/<name>/` (one file per GitHub issue), and
its status is the epic issue's. The convention above applies to plan files; an epic's task list is
the GitHub sub-issues, not checkboxes in this directory.

| Document                                                                                         | Type   | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2026-01-27-monorepo-design.md](2026-01-27-monorepo-design.md)                                   | Design | Shipped | The Turborepo and pnpm workspace layout in use today, with three gaps. `packages/ui` was never created; the packages that exist are `eslint-config`, `prettier-config` and `typescript-config`, and only `@repo/prettier-config` is referenced by a workspace (wiring the other two is open question 3 in the 2026-09-08 design). The versions have moved on: pnpm 9 to 10.33, Next.js 15 to 16, Node 20 to 22. The Vercel section (a project per app, a `playground` subdomain, remote caching) was only partly realised: one project for `web` exists since 2026-09-09, the playground is not deployed, and remote caching stays off outside Vercel's own builds. |
| [2026-01-27-portfolio-design.md](2026-01-27-portfolio-design.md)                                 | Design | Shipped | Brand, audience and page structure: tone, palette, fonts, the seven routes and the three case studies. Redacted 2026-09-12: the column mapping each public case study to its internal employer project, and the Content Sources line citing a CV PDF tracked under `docs/`, were removed and the PDF was deleted from the repository, because the repository is public and both contradicted the Data Protection Rules the document itself states. A dated note in the document records what went and why.                                                                                                                                                          |
| [2026-01-27-animated-homepage-design.md](2026-01-27-animated-homepage-design.md)                 | Design | Shipped | The scroll story on the home page: boot screen, the five phase sections, and the closing call to action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [2026-02-22-circuit-background-design.md](2026-02-22-circuit-background-design.md)               | Design | Shipped | The animated SVG circuit board behind the hero, synced to the boot progress bar. Paired with the plan below. Merged in PR #2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [2026-02-22-circuit-background-plan.md](2026-02-22-circuit-background-plan.md)                   | Plan   | Shipped | Task by task implementation of the circuit background, merged in PR #2. The manual QA checkboxes in the final task were never ticked; they are left as-is for the record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [2026-02-22-hero-section-redesign.md](2026-02-22-hero-section-redesign.md)                       | Plan   | Shipped | The tmux terminal background and frosted glass content island, merged in PR #1. Same note about the unticked manual checklist at the end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [2026-09-08-repo-hardening-and-launch-design.md](2026-09-08-repo-hardening-and-launch-design.md) | Design | Shipped | Quality gates, CI, the Featured Work feature, documentation and the launch, all delivered. Decisions D1 to D8 shipped in PR #3, D9 in PR #4, D10 in PR #5. D11 was executed on 2026-09-09 (Vercel project, first production build, `www` redirect, `.vercelignore`, Namecheap DNS cutover); the site is live. `main` was put under protection during the launch with both CI checks required (open question 2, answered by Milos); ADR 0021 records the current settings.                                                                                                                                                                                           |
| [2026-09-08-tooling-and-quality-gates-plan.md](2026-09-08-tooling-and-quality-gates-plan.md)     | Plan   | Shipped | Merged in PR #3. Node and pnpm pinning, the shared Prettier config, the missing Turbo tasks, Husky with commitlint and lint-staged, every React Hooks finding fixed, the three failing Playwright tests repaired, and the GitHub Actions pipeline.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [2026-09-08-featured-work-plan.md](2026-09-08-featured-work-plan.md)                             | Plan   | Shipped | Merged in PR #4. The architecture graph data and its active-connection rule, the deterministic metric counter, the card and diagram components, and the unit and end-to-end coverage for hover, keyboard focus and reduced motion.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [2026-09-08-docs-and-deployment-plan.md](2026-09-08-docs-and-deployment-plan.md)                 | Plan   | Shipped | Merged in PR #5. The root README, the six ADRs, the deployment runbook, this index and the rewritten project instructions; its checkboxes were ticked retroactively in the pull request that recorded the deployment.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [2026-09-09-home-page-performance-plan.md](2026-09-09-home-page-performance-plan.md)             | Plan   | Shipped | Merged in PR #15, with its section-hydration decision reverted in PR #22. Home page CLS and TBT: shift-free tmux log slots, compositor-only keyframes, code-split story sections, FeaturedWork out of the layout chunk. Carries its own rationale; the standing rules are [ADR 0009](../adr/0009-animation-performance-rules.md).                                                                                                                                                                                                                                                                                                                                   |
| [2026-09-10-local-playwright-port-design.md](2026-09-10-local-playwright-port-design.md)         | Design | Shipped | Why local Playwright runs stopped using port 3000 and stopped reusing a running server. Decisions D1-D6; the standing record is [ADR 0014](../adr/0014-playwright-owns-its-server.md). Merged in PR #28.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [2026-09-10-local-playwright-port-plan.md](2026-09-10-local-playwright-port-plan.md)             | Plan   | Shipped | The five tasks deriving from that design: the resolved port and owned server, the `.next-e2e` build directory, the three reworded title guards, the documentation, and verification against a foreign `next start` on 3000. Merged in PR #28.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [audit-remediation-2026-09](../../.claude/epics/audit-remediation-2026-09/epic.md)               | Epic   | Planned | The 2026-09-11 state-of-the-project audit, turned into ten tracked tasks: [#42](https://github.com/milosCvetkovicDev/website/issues/42) with sub-issues #43-#52. 165 findings, each mapped to a task or a recorded reason in [the finding register](../../.claude/epics/audit-remediation-2026-09/finding-register.md); the PRD is `.claude/prds/audit-remediation-2026-09.md`. No epic branch: each task lands as its own squash-merged PR.                                                                                                                                                                                                                        |
| [ai-discoverability-2026-09](../../.claude/epics/ai-discoverability-2026-09/epic.md)             | Epic   | Planned | Making the site legible to search engines, answer engines and AI agents: [#54](https://github.com/milosCvetkovicDev/website/issues/54) with sub-issues #55-#64. Ten tasks, weighted by evidence rather than fashion - dates and quotable metrics, a connected entity graph, extractable content, Markdown twins with `Accept` negotiation, `llms.txt` and JSON, a read-only MCP server - plus [ADR 0017](../adr/0017-ai-discoverability-policy.md) recording the crawler policy and a dated list of the eighteen mechanisms deliberately not built. Starts after #48 of epic #42 lands.                                                                             |

## Starting a new plan

1. **Brainstorm and write the design.** Establish the context, the goals and the non-goals, then
   record each decision with the reason it was taken and what was rejected. Save it as
   `docs/plans/YYYY-MM-DD-topic-design.md`.
2. **Get the design approved** before writing any tasks. A design that is still being argued about
   produces a plan that has to be rewritten.
3. **Write the plan.** Break the design into ordered tasks, name the files each task creates or
   modifies, use `- [ ]` checkboxes for the steps, and give every task a stop condition that can be
   checked by running something. Give the whole plan a stop condition too. Open it with the header
   the 2026-09-08 plans use: a `> **For agentic workers:** REQUIRED SUB-SKILL:` line, then **Goal**,
   **Design** (a link to the design it derives from), **Branch**, and a **Stop condition** block of
   commands for the whole plan; then numbered `### Task N` sections, each with a **Files:** list.
   `2026-09-08-tooling-and-quality-gates-plan.md` is the template to copy.
4. **Add a row to the Index above** in the same commit that adds the plan file: document, type, a
   status of `In review` (or `Planned`), and the branch and pull request number in Notes. Move the
   row to `Shipped` in the pull request that merges the work into `main`.
5. **Execute task by task**, ticking the boxes as you go and committing the plan alongside the code
   it describes. If reality diverges from the plan, change the plan in the same commit rather than
   letting the two drift apart.

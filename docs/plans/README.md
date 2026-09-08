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
**Planned** (written and approved, not started). Shipped describes the code, not the site: nothing is
deployed yet, see [the deployment runbook](../runbooks/deploy.md).

| Document                                                                                         | Type   | Status    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2026-01-27-monorepo-design.md](2026-01-27-monorepo-design.md)                                   | Design | Shipped   | The Turborepo and pnpm workspace layout in use today, with three gaps. `packages/ui` was never created; the packages that exist are `eslint-config`, `prettier-config` and `typescript-config`, and only `@repo/prettier-config` is referenced by a workspace (wiring the other two is open question 3 in the 2026-09-08 design). The versions have moved on: pnpm 9 to 10.33, Next.js 15 to 16, Node 20 to 22. The Vercel section (a project per app, a `playground` subdomain, remote caching) is still intent; nothing is deployed. |
| [2026-01-27-portfolio-design.md](2026-01-27-portfolio-design.md)                                 | Design | Shipped   | Brand, audience and page structure: tone, palette, fonts, the seven routes and the three case studies.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [2026-01-27-animated-homepage-design.md](2026-01-27-animated-homepage-design.md)                 | Design | Shipped   | The scroll story on the home page: boot screen, the five phase sections, and the closing call to action.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [2026-02-22-circuit-background-design.md](2026-02-22-circuit-background-design.md)               | Design | Shipped   | The animated SVG circuit board behind the hero, synced to the boot progress bar. Paired with the plan below. Merged in PR #2.                                                                                                                                                                                                                                                                                                                                                                                                          |
| [2026-02-22-circuit-background-plan.md](2026-02-22-circuit-background-plan.md)                   | Plan   | Shipped   | Task by task implementation of the circuit background, merged in PR #2. The manual QA checkboxes in the final task were never ticked; they are left as-is for the record.                                                                                                                                                                                                                                                                                                                                                              |
| [2026-02-22-hero-section-redesign.md](2026-02-22-hero-section-redesign.md)                       | Plan   | Shipped   | The tmux terminal background and frosted glass content island, merged in PR #1. Same note about the unticked manual checklist at the end.                                                                                                                                                                                                                                                                                                                                                                                              |
| [2026-09-08-repo-hardening-and-launch-design.md](2026-09-08-repo-hardening-and-launch-design.md) | Design | In review | PR #3, branch `chore/tooling-and-quality-gates`. The current effort: quality gates, CI, the featured work feature, documentation and the launch. One row per decision, each with its rationale.                                                                                                                                                                                                                                                                                                                                        |
| [2026-09-08-tooling-and-quality-gates-plan.md](2026-09-08-tooling-and-quality-gates-plan.md)     | Plan   | In review | PR #3, branch `chore/tooling-and-quality-gates`. Node and pnpm pinning, Prettier config wiring, the one-off repository-wide reformat, Turbo tasks, Husky and commitlint, editor and Claude Code project configuration, ESLint fixes including React Hooks, Playwright fixes, GitHub Actions, Dependabot and the pull request template.                                                                                                                                                                                                 |
| `2026-09-08-featured-work-plan.md` (not linked yet)                                              | Plan   | In review | PR #4 (draft), branch `feat/featured-work-architecture-diagram`. The file lives on that branch only, so it is deliberately not linked from here; add the link once PR #4 has merged into the shared base branch `chore/tooling-and-quality-gates`.                                                                                                                                                                                                                                                                                     |
| [2026-09-08-docs-and-deployment-plan.md](2026-09-08-docs-and-deployment-plan.md)                 | Plan   | In review | PR #5 (draft), branch `docs/readme-adrs-and-deploy`. The root README, the ADRs, the deployment runbook, the project `CLAUDE.md` and this index.                                                                                                                                                                                                                                                                                                                                                                                        |

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

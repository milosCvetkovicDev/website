# Plans and design documents

This directory holds the design documents and implementation plans for the portfolio monorepo. Each
file is dated, so the directory reads chronologically and old thinking is kept rather than rewritten.

## Convention

Two file types live here, and they are named for it:

- `YYYY-MM-DD-topic-design.md` captures **what is being built and why**. It states the context, the
  goals and non-goals, and the decisions with their rationale, usually as a numbered decision table.
  A design is written first, discussed, and approved before any plan is derived from it.
- `YYYY-MM-DD-topic-plan.md` is the **executable task list** derived from a design. Tasks are ordered,
  each names the files it touches, and steps use checkbox (`- [ ]`) syntax with verifiable stop
  conditions, normally a command and its expected exit code or output. A plan is updated in the same
  commit as the work it describes, so the ticked boxes in git history match what actually landed.

Two neighbouring directories hold documents that are deliberately not plans:

- `docs/adr/` records **decisions that outlive a single piece of work**: the choice of toolchain, the
  formatting and linting standard, the CI gates, the hosting provider. An ADR is short, immutable
  once accepted, and superseded rather than edited. Plans come and go; ADRs are the standing record
  of why the repository is shaped the way it is.
- `docs/runbooks/` records **operations**: the exact steps, commands and values needed to deploy, to
  change DNS, to verify a release, to roll back. A runbook is written to be followed under pressure
  by someone who has not read the design.

Both directories are created by the documentation pull request described in
[2026-09-08-docs-and-deployment-plan.md](2026-09-08-docs-and-deployment-plan.md) (tasks C2 and C3).

## Index

Status means: **Shipped** (merged and live in the code on `main`), **In review** (an open pull
request), **Planned** (written and approved, not started).

| Document                                                                                         | Type   | Status    | Notes                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2026-01-27-monorepo-design.md](2026-01-27-monorepo-design.md)                                   | Design | Shipped   | The Turborepo and pnpm structure in use today. The versions in its decision table have moved on (pnpm 10.33, Node 22, Next.js 16), and the Vercel section is still the deployment intent, not a description of a live site. |
| [2026-01-27-portfolio-design.md](2026-01-27-portfolio-design.md)                                 | Design | Shipped   | Brand, audience and page structure: tone, palette, fonts, the seven routes and the three case studies.                                                                                                                      |
| [2026-01-27-animated-homepage-design.md](2026-01-27-animated-homepage-design.md)                 | Design | Shipped   | The scroll story on the home page: boot screen, the five phase sections, and the closing call to action.                                                                                                                    |
| [2026-02-22-circuit-background-design.md](2026-02-22-circuit-background-design.md)               | Design | Shipped   | The animated SVG circuit board behind the hero, synced to the boot progress bar. Paired with the plan below. Merged in PR #1 and PR #2.                                                                                     |
| [2026-02-22-circuit-background-plan.md](2026-02-22-circuit-background-plan.md)                   | Plan   | Shipped   | Task by task implementation of the circuit background. The manual QA checkboxes in the final task were never ticked; they are left as-is for the record.                                                                    |
| [2026-02-22-hero-section-redesign.md](2026-02-22-hero-section-redesign.md)                       | Plan   | Shipped   | The tmux terminal background and frosted glass content island, merged in PR #2. Same note about the unticked manual checklist at the end.                                                                                   |
| [2026-09-08-repo-hardening-and-launch-design.md](2026-09-08-repo-hardening-and-launch-design.md) | Design | In review | The current effort: quality gates, CI, the featured work feature, documentation and the launch. One row per decision, each with its rationale.                                                                              |
| [2026-09-08-tooling-and-quality-gates-plan.md](2026-09-08-tooling-and-quality-gates-plan.md)     | Plan   | In review | PR #3, branch `chore/tooling-and-quality-gates`. Prettier config wiring, Turbo tasks, Husky and commitlint, React Hooks fixes, Playwright fixes, GitHub Actions.                                                            |
| `2026-09-08-featured-work-plan.md`                                                               | Plan   | In review | PR #4, branch `feat/featured-work-architecture-diagram`. The file is not on this branch yet, so the link resolves only once that branch is merged.                                                                          |
| [2026-09-08-docs-and-deployment-plan.md](2026-09-08-docs-and-deployment-plan.md)                 | Plan   | In review | This pull request: the root README, the ADRs, the deployment runbook, the project `CLAUDE.md` and this index.                                                                                                               |

## Starting a new plan

1. **Brainstorm and write the design.** Establish the context, the goals and the non-goals, then
   record each decision with the reason it was taken and what was rejected. Save it as
   `docs/plans/YYYY-MM-DD-topic-design.md`.
2. **Get the design approved** before writing any tasks. A design that is still being argued about
   produces a plan that has to be rewritten.
3. **Write the plan.** Break the design into ordered tasks, name the files each task creates or
   modifies, use `- [ ]` checkboxes for the steps, and give every task a stop condition that can be
   checked by running something. Give the whole plan a stop condition too.
4. **Execute task by task**, ticking the boxes as you go and committing the plan alongside the code
   it describes. If reality diverges from the plan, change the plan in the same commit rather than
   letting the two drift apart.

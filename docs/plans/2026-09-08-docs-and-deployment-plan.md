# Documentation & Deployment Plan (PR C)

**Status:** Shipped in PR #5. The boxes below were ticked retroactively on 2026-09-09, in the pull
request that recorded the deployment this plan only prepared (see `docs/runbooks/deploy.md`).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan produces documentation, so the content is authored directly in the target files; each task lists the sections the file must contain and how it is verified.

**Goal:** Make the repository self-explaining for a reader who lands on GitHub (README, ADRs, runbooks, an honest project `CLAUDE.md`) and prepare everything for the first production deployment on Vercel, leaving only the interactive login step to Milos.

**Design:** `docs/plans/2026-09-08-repo-hardening-and-launch-design.md` (D10, D11). **Branch:** `docs/readme-adrs-and-deploy`, based on `chore/tooling-and-quality-gates` (PR #3).

**Stop condition:** `pnpm format:check` passes; every command quoted in `README.md` and `CLAUDE.md` has been executed once during this PR; every relative link in the new documents resolves (`node -e` link check in Task C6); `docs/runbooks/deploy.md` lists exact commands and DNS records; CI green.

---

### Task C1: Root README

**Files:** Create `README.md`

- [x] Sections: title and one-line pitch; badges (CI workflow, Next.js, pnpm, Node); _What this is_; _Live site_ (deployment status and runbook link); _Stack_ table with versions; _Repository layout_ tree; _Getting started_ (Node 22 via nvm, pnpm via corepack, install, dev); _Quality gates_ table (command, what it checks, when it runs); _Testing_ (unit, e2e, CI mode, the hydration-wait convention); _Conventions_ (commits, formatting, linting, hooks, PR template); _Working with Claude Code_ (project hooks, `ui-reviewer`, plans in `docs/plans`); _Documentation map_; _Deployment_ summary linking the runbook.
- [x] Verify: every command in the file executed once; `pnpm format:check` passes. Commit: `docs: add root README`.

### Task C2: Architecture decision records

**Files:** Create `docs/adr/README.md`, `docs/adr/0001-record-architecture-decisions.md`, `docs/adr/0002-monorepo-toolchain.md`, `docs/adr/0003-formatting-and-linting-standards.md`, `docs/adr/0004-ci-pipeline-and-quality-gates.md`, `docs/adr/0005-hosting-on-vercel.md`, `docs/adr/0006-hydration-safe-client-state.md`

- [x] MADR-style sections in each: Status, Date, Context, Decision, Consequences, Alternatives considered. Index in `docs/adr/README.md`. Commit: `docs(adr): record toolchain, quality, hosting and client-state decisions`.

### Task C3: Deployment runbook and environment template

**Files:** Create `docs/runbooks/deploy.md`; Modify `.env.example`

- [x] Runbook sections: prerequisites; one-time Vercel project setup (dashboard and CLI paths, root directory `apps/web`, Node 22, `NEXT_PUBLIC_SITE_URL`); domain and DNS (Namecheap records, apex primary, `www` redirect, removing the parking records); verifying a deployment (curl, dig, sitemap); rollback; preview deployments on PRs. `.env.example` documents `NEXT_PUBLIC_SITE_URL`. Commit: `docs(runbooks): deployment runbook and env template`.

### Task C4: Project CLAUDE.md rewrite

**Files:** Modify `CLAUDE.md`

- [x] Every documented command exists and works; sections: Architecture, Routes, Commands, Quality gates and hooks, Testing notes (hydration wait, `matchMedia` and `IntersectionObserver` stubs), Conventions, Workflow and documentation (plans, ADRs, handoff note), Claude Code project config (hooks, agents), Gotchas (nvm, new worktrees need `pnpm install`). Commit: `docs(claude): make the project instructions match the repository`.

### Task C5: Plans index and status

**Files:** Create `docs/plans/README.md`; Modify the two February plans (status line under the title)

- [x] Index table: document, type (design / plan), status (Shipped, In progress, Planned) with PR links. Commit: `docs(plans): index plans and mark the February work as shipped`.

### Task C6: Verify, push, PR

- [x] Link check: `node -e` script that extracts relative markdown links from the new files and asserts each target exists.
- [x] `pnpm format:check`; push; `gh pr create --base chore/tooling-and-quality-gates`; watch CI.

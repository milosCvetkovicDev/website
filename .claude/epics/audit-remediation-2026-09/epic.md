---
name: audit-remediation-2026-09
status: backlog
created: 2026-09-11T19:42:54Z
updated: 2026-09-12T07:13:57Z
progress: 0%
prd: .claude/prds/audit-remediation-2026-09.md
github: https://github.com/milosCvetkovicDev/website/issues/42
---

# Epic: audit-remediation-2026-09

## Overview

The epic closes the gaps from the 2026-09-11 audit, in ten tasks. It adds no features; every task removes a
failure mode the audit verified. The strategy borrows the walkthrough epic's rule: **every fix extends a mechanism
the repository already has** rather than introducing a new one. Examples:

- the axe gate grows a contrast budget, instead of a second accessibility tool appearing;
- metadata moves into the per-route `metadata` exports and `metadataBase` that already exist;
- security headers go in `next.config.ts`'s `headers()`, which ADR 0005 already names as the place;
- the About page reads `caseStudies`, as every other page does.

Task #43 lands the acceptance tests first, as the ceremony requires. Tasks #44, #45, #50 and #51 do not wait for
it, because their stop conditions are CI and production evidence rather than page behaviour. Task #52 verifies
the whole epic on production.

## Architecture Decisions

**Fixed (reuse, no debate):**

- **Static prerendering stays.** Headers are static `headers()` entries, and the CSP carries no script rules, so
  no route turns dynamic. A nonce-based strict CSP would need dynamic rendering; that trade is out of scope.
- **Metadata:** per-route `metadata` / `generateMetadata` resolved against the existing `metadataBase`. The social
  image is generated at build time (`opengraph-image` file convention with `ImageResponse`), so it stays static.
- **Colours:** only the theme tokens from ADRs 0010 and 0011. No new palette classes and no alpha on text.
- **Mobile menu:** a native `<dialog>` opened with `showModal()`, which renders in the top layer where no ancestor
  can become its containing block. It also provides the dialog semantics, Escape handling and focus containment
  that #46 needs.
- **Content:** `src/data/case-studies.ts` remains the single source; pages read from it (CLAUDE.md, Conventions).
- **Tests:** RED-first acceptance tests land as expected failures that name their fixing issue (see the PRD's
  Testing Requirements). The gate specs keep `retries: 0`.
- **Execution model:** one or more small PRs per task from a typed branch, squash-merged. There is no epic branch
  and no epic worktree; CLAUDE.md's merge rules and strict branch protection make a long-lived branch the wrong
  tool here.

**Decided in the task that meets them (one ADR each, numbered at PR time):**

1. The Ignored Build Step policy: which changes skip a Vercel build (#44).
2. The security-header set and the CSP's scope (#48).
3. Disabling Next.js's generated agent files (#50).
4. The Dependabot policy for majors that cannot pass (#45).

## Technical Approach

### Frontend Components

- `components/navigation.tsx`: the mobile menu moves to `<dialog>` outside the blurred header. Parent nav items
  get `aria-current`.
- `components/animated-hero/*`:
  - the execution and strategy grids get `minmax(0,1fr)` tracks, and the `pre` scrolls;
  - hero text colours move to tokens;
  - AnimatedText exposes word-level names, honours reduced motion and shares one split/cleanup scaffold;
  - endless animations pause when off-screen;
  - LoopPhase resets on replay;
  - unreachable modules are deleted.
- `app/**`:
  - `layout.tsx` metadata is completed, and routes override title, description, openGraph and twitter together;
  - canonical `alternates` are added;
  - `robots.ts` and `sitemap.ts` are corrected;
  - `not-found.tsx` gets a single robots tag;
  - a `global-error.tsx` is added;
  - `skills/layout.tsx` folds into the page;
  - the About page reads `caseStudies`.
- `app/icon`, `apple-icon`, `manifest.ts` and `opengraph-image` replace the create-next-app favicon.

### Backend Services

None. The site has no route handlers or middleware, and the epic adds none.

### Infrastructure

- **Vercel:** an Ignored Build Step, a redeploy of main HEAD, and a decision on the production alias (redirect to
  the apex, or noindex).
- **GitHub:**
  - Dependabot alerts and security updates are switched on;
  - `.github/dependabot.yml` gets ignore rules;
  - CI gains a commit-message check for the squash-commit path.
- **DNS:** a DMARC record (owner).
- **Turbo:** build outputs exclude `.next/dev`, and `.env.local` is declared as a build input.

## Implementation Strategy

- **Order.** #44 first, because it is urgent and independent: production is two merges behind. #51's CV removal
  and #43 go next, in parallel. Then #46, #48, #49 and #47 flip #43's RED tests. #45 and #50 run alongside
  whenever they are free of conflicts. #52 comes last.
- **Conflicts to respect.** The `conflicts_with` field in each task's frontmatter names only that task's primary
  pairs, so it is **not** a complete parallelism gate even though `/pm:epic-start` reads it as one. Schedule from
  the file map below instead: two tasks may run at the same time only when they share no line here. Each task's
  Technical Details carries the authoritative per-file list for that task — #48's "Merge order" bullet and
  #50's "Conflicts" and "Softer overlaps" bullets are the fullest. Tasks sharing a line land one after the
  other, and whichever is second rebases rather than reverting the other side:
  - hero phases, `apps/web/src/components/animated-hero/{execution-phase,strategy-phase,hero-content}.tsx`:
    #46 (the grids, the island padding, the headline nowrap), #47 (markup and colour), #49 (copy
    only)
  - `apps/web/src/app/globals.css`: #47 (the pause rule and the animation classes), #48 (the background
    and `color-scheme`), #49 (deleting the unused blocks)
  - `apps/web/src/app/layout.tsx`, `apps/web/src/components/json-ld.tsx` and the route `metadata` exports:
    #48, #49, #50 (`layout.tsx` only), and #44 only if the analytics script is wired in
  - `apps/web/src/app/about/page.tsx` and `apps/web/src/app/skills/page.tsx`: #46, #48 (which also
    folds `apps/web/src/app/skills/layout.tsx` into that page, and deliberately leaves
    `apps/web/src/components/navigation.tsx` to #46), #49
  - `apps/web/next.config.ts` and `apps/web/src/test/next-config.test.ts`: #48, #50, and #51 (one
    comment). Keep the security-header test in its own file so the two do not collide inside one test file.
  - `apps/web/playwright.config.ts`, `apps/web/src/test/playwright-config.test.ts` and the `apps/web/e2e` specs,
    the hydration wait included: #43, #47, #50; the second adopts the first's helper and marker
  - hero unit tests, `apps/web/src/components/animated-hero/__tests__/{story-phases,gauntlet-phase}.test.tsx`:
    #43, #47, #50
  - `package.json`, `apps/web/package.json`, `pnpm-lock.yaml` (through pnpm only) and
    `.claude/agents/ui-reviewer.md`: #45, #50
  - `.github/workflows/ci.yml`: #43, #50, #45 (only if dependency review is adopted) and #51
    (comments only)
  - `docs/runbooks/deploy.md`: #44, #45, #48, #51, and #47 only if the boot-loader CLS
    note becomes untrue
  - `CLAUDE.md`: #45, #47, #48, #49, #50, #51
  - `docs/adr/README.md`, a Prettier-aligned table each of #44, #45, #48, #50 and #51
    adds a row to: rebase and re-run `pnpm format` rather than hand-merging the column widths
  - `docs/plans/`: #45 (one design's non-goals), #47 and #51 (`docs/plans/README.md`, the same
    Prettier-aligned-table rule), #51 (the plan documents)
  - `README.md`: #45, #51
- **Risk mitigation.**
  - Every UI change is checked against its RED test in both schemes and at phone width before merge.
  - The header and CSP change is verified against the production build locally (`CI=true` e2e) before merge.
  - The Ignored Build Step is tested on a docs-only PR before it is relied on.
- **Testing:** RED first through #43. Each later task adds any tests its findings name. Every UI PR attaches
  Playwright screenshots in light, dark and mobile, as CLAUDE.md requires.

## Task Breakdown Preview

- [ ] **#43 - Acceptance test baseline:** a mobile project, navigation/theme/client-nav e2e, axe across every route
      with a contrast budget and hover/focus, SEO-surface tests and render tests. RED where the defect still
      exists.
- [ ] **#44 - Release pipeline:** deploy main, add an Ignored Build Step, add a runbook recovery for rate-limited
      deploys and correct the stale runbook steps; `.vercelignore`; DMARC.
- [ ] **#45 - Supply chain:** Dependabot ignore rules and security updates, the vite 8 bump, an in-range advisory
      refresh, pnpm ≥ 10.34.5, @types/node 22, and a decision on the unused packages.
- [ ] **#46 - Mobile navigation and layout:** the `<dialog>` menu and the phone-width overflow.
- [ ] **#47 - Hero accessibility and motion:** colour tokens, word-level names, reduced motion, off-screen pause,
      LoopPhase, and dead-code and scaffold consolidation.
- [ ] **#48 - Head and crawl surface:** canonical URLs, complete OG/Twitter metadata, og:image, robots, sitemap,
      404 robots, icons and manifest, security headers and JSON-LD escaping.
- [ ] **#49 - Content consistency:** single-source metrics, experience claims, headline metrics on case studies,
      tokenised colours, dead components and assets, and global-error.
- [ ] **#50 - Gates and tooling:** the symlink-safe allowBuilds gate, the barrel lint, commit checks on main, jsdom
      environment and noise, hydration waits, retries and traces, server-output reading, agentRules off, turbo
      outputs, and the ui-reviewer agent.
- [ ] **#51 - Docs and hygiene:** CV removal, ADR corrections (per ADR 0012), README, CLAUDE.md and PR checklist
      drift, and pruning of branches, refs and worktrees.
- [ ] **#52 - Production verification:** all outcomes proven on `miloscvetkovic.dev`.

## Dependencies

- **Upstream:** eslint-plugin-react support for ESLint 10 (keeps the eslint major ignored meanwhile).
- **Vercel:** the quota window for the first redeploy; project settings for the Ignored Build Step and the alias.
- **Owner actions:** the DMARC record at the DNS host; confirming the About page's 40% figure and its
  human-approval wording; a real-phone check in #52.
- **Prerequisite work:** none. The audit itself is the gap analysis.

## Success Criteria (Technical)

- All seven CI gates and both e2e modes stay green throughout. The e2e job stays under 20 minutes with the mobile
  project.
- 0 horizontal overflow at 320/375/414px, and a green mobile-menu cycle, in CI and against production.
- Axe: 0 violations and no growth in unresolved contrast on every route, in both schemes, on desktop and mobile.
- Every route: a canonical URL, an og:image (200), route-specific twitter:title, and the security headers. All
  routes stay static.
- First-load JS: `/` ≤ 233 KB gzip; other routes ≤ 174 KB gzip.
- Production's commit equals main's HEAD within an hour of each merge, for 14 days after #44.
- `pnpm audit`: no high advisory fixable in range. No Dependabot PR red for more than seven days.
- Every finding in the register is resolved or closed with a reason.

## Estimated Effort

- **Timeline:** about 79 hours in total, roughly two to three weeks alongside other work. #44 is a half-day and
  should land first.
- **Critical path:** #43 → #46 / #47 / #48 / #49 → #52.
- **Sizing:**
  - L: #43, #47, #48, #50
  - M: #45, #46, #49, #51
  - S: #44, #52

## Tasks Created

- [ ] #43 - Acceptance test baseline: RED tests for the verified defects and coverage for untested routes (parallel: true)
- [ ] #44 - Get production back to main and keep deploys within the Vercel quota (parallel: true)
- [ ] #45 - Unjam dependency updates: Dependabot policy, advisories and toolchain versions (parallel: true)
- [ ] #46 - Fix the mobile navigation and phone-width layout (parallel: true)
- [ ] #47 - Hero story: accessibility, motion and simplification (parallel: true)
- [ ] #48 - Head and crawl surface: metadata, social image, canonical, robots, sitemap, icons and security headers (parallel: true)
- [ ] #49 - Content correctness and visual consistency (parallel: true)
- [ ] #50 - Harden the CI gates, test harness and agent tooling (parallel: true)
- [ ] #51 - Documentation accuracy and repository hygiene (parallel: true)
- [ ] #52 - Production verification of the remediation (parallel: false)

Total tasks: 10
Parallel tasks: 9
Sequential tasks: 1

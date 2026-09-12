---
name: audit-remediation-2026-09
description: Close the verified gaps from the 2026-09-11 state-of-the-project audit - production lag, the phone experience, blind gates, the crawl surface, jammed updates, content drift and doc drift
status: backlog
created: 2026-09-11T19:42:54Z
---

# PRD: audit-remediation-2026-09

## Executive Summary

On 2026-09-11 the repository was audited along eight dimensions: every quality gate run for real, dependency
health, a code review of the animated hero, routes/SEO/content, the test suite, documentation and repository
hygiene, CI/tooling, and the live production site. Each dimension's findings were then re-checked by an
independent skeptic that tried to refute them. The result is 165 findings: 163 are assigned to a task and 2 are recorded as not actioned. The project is in good health where
it has been measured: all seven CI gates pass, 51 of 51 end-to-end tests pass with no flakes in both local and CI
modes, `pnpm audit --prod` is clean, and Lighthouse scores 100 for Accessibility, Best Practices and SEO on the
home page and a case study.

The gaps sit where nothing measures. Merged work has stopped reaching production. The site is broken on a phone.
The accessibility gate cannot see the hero. Link previews and search results show the wrong thing. Dependency
updates are jammed. The About page contradicts the single source of truth. Several documents describe a
repository that no longer exists.

This PRD turns every finding into tracked work. Nothing is dropped silently: the
[finding register](../epics/audit-remediation-2026-09/finding-register.md) maps each finding to the task that
resolves it, or records why it is not being actioned.

## Problem Statement

**What:** seven classes of gap, each stated as the failure mode rather than as a list of the files that exhibit
it, because the fix has to remove the failure mode rather than patch one instance.

1. **Merged work does not reach production.** Preview builds (31 of the last 100 from Dependabot branches) used up
   Vercel Hobby's 100 deployments a day. The production deployments of the last two merges were marked "rate
   limited - retry in 24 hours" and never retried, so production still serves 6e0a87a while main is at 9189af4,
   and the keyboard and screen-reader fix from #40 is not live. Nothing alerts on the lag, and the runbook's
   recovery step (`vercel redeploy`) rebuilds the commit already deployed.
2. **Phone visitors get a broken site.** At 375px the mobile menu's panel and backdrop are clipped to the 72px
   header, because the header's `backdrop-blur` makes it the containing block for its fixed descendants. The
   links spill over the page with no panel behind them, and tapping outside cannot close the menu. The execution
   grid sizes to its code sample's width, so at 320 to 414px the whole home page scrolls sideways by 49 to 143px
   once the story has settled, and by 79 to 173px while a reveal's from-state is on screen.
3. **Gates pass what they exist to catch.** The axe gate treats `incomplete` results as passes, so the hero
   island's alpha-dimmed, hard-coded accent text ships green although it misses WCAG AA. Axe covers 2 of the 9 URL
   routes, the console gate runs in the light scheme only, and no test uses a phone viewport. The allowBuilds
   drift gate exits 0 silently when it is invoked by an absolute symlinked path rather than through pnpm. Commit
   messages on main are never checked,
   because squash commits bypass the local commitlint hook.
4. **Sharing and search show the wrong thing.** No route has an `og:image`, although every page declares a
   `summary_large_image` card. No route has a canonical URL, and a byte-identical, indexable copy of the site is
   public on the `vercel.app` alias. `robots.txt` blocks `/_next/`, which holds the CSS and JS crawlers need to
   render the pages. Sub-pages inherit the home page's Twitter title, and 404 pages emit conflicting robots tags.
5. **Dependency updates are jammed.** Both open Dependabot PRs fail for upstream reasons and will be rebased on
   every push to main indefinitely. There are 40 dev-only advisories that an in-range lockfile refresh would
   clear, the pinned pnpm 10.33.0 is affected by 18 published advisories, and Dependabot alerts and security
   updates are switched off.
6. **Content contradicts its single source.** `case-studies.ts` is meant to be the only place project metrics
   live. The About page restates them with different meanings: 73% is "faster resolution" in one place and "errors
   resolved autonomously, with no human intervention" in the other, while the case study says humans approve every
   fix. Experience claims are stale across pages, metadata and structured data. A CV PDF with personal contact
   details is tracked in the public repository, although nothing on the site links to it.
7. **The written record drifts.** The runbook sends the operator to a page #39 deleted, and its
   `pnpm approve-builds` row is stale: it names a package that no longer has an install script and presents a
   question ADR 0013 already answered. ADRs 0002, 0005, 0014 and 0015 each state something untrue (0004's claim
   was true when it was accepted, so ADR 0012 forbids correcting it). Gate lists in the README, CLAUDE.md and the
   deploy runbook miss two gates. Thirteen squash-merged branches, 19
   orphaned refs and two idle worktrees remain.

**Why now:** the site went live on 2026-09-09, and each class compounds. Every busy merge day stalls production
again. Every jammed Dependabot PR occupies one of five slots that a security bump needs. Every new component is
reviewed against gates that cannot see the most visible part of the page.

## User Stories

### US-1: A phone visitor can navigate and read the site

As a **visitor on a phone**, I want the menu to open as a full panel I can close, and pages that do not scroll
sideways, so that the site works at the width most first visits arrive at.
**Pain today:** the menu is a transparent overlay clipped to the header; the home page overflows by up to 143px
once settled, and by up to 173px mid-reveal.

### US-2: Assistive technology gets the same site

As a **screen-reader or keyboard user**, I want the menu to behave as a dialog, story headings announced as words
and every piece of text readable, so that nothing on the page is sighted-only.
**Pain today:** no dialog semantics or focus management; three headings are announced letter by letter; hero text
misses AA.

### US-3: Reduced motion means reduced motion

As a **visitor who prefers reduced motion**, I want hover effects and background animations to respect that
preference, so that the page does not move when I asked it not to.
**Pain today:** letters scatter, flip and follow the cursor under `reduce`; endless animations keep running
off-screen.

### US-4: A shared link previews correctly and search points at the real site

As **someone sharing a page** (a recruiter posting a case study, say), I want the preview to show that page's
title, description and an image, and search results to point at `miloscvetkovic.dev`, so that the link represents
the work.
**Pain today:** no image on any card, the wrong Twitter title on five routes, an indexable duplicate on
`vercel.app`, and crawlers blocked from the site's CSS and JS.

### US-5: A merge reaches production the same day

As **the owner merging a PR**, I want main to be live within the hour, and bot or docs-only PRs not to consume
the deployment quota, so that "merged" means "shipped".
**Pain today:** production is two merges behind and nothing says so.

### US-6: Dependency updates flow

As **the owner maintaining dependencies**, I want security fixes to arrive as PRs that can pass, and majors that
cannot pass yet to stay quiet until they can, so that the update queue never blocks on noise.
**Pain today:** two permanently red PRs, security updates off, advisories fixable in range but not fixed.

### US-7: A green gate means the thing it checks is true

As **the owner relying on CI**, I want each gate to fail when its property does not hold (contrast on the hero,
every route, a phone viewport, a supply-chain check run from any path, conventional commits on main), so that
green is evidence rather than an absence of evidence.
**Pain today:** each of those passes without checking.

### US-8: One number means one thing

As **a reader of the site**, I want every figure and claim to agree across pages, metadata and structured data,
so that the site is credible.
**Pain today:** 73% and 40% mean different things on different pages; experience years disagree.

### US-9: The documents describe the repository as it is

As **a maintainer or agent reading the docs**, I want the runbook, ADRs, README and CLAUDE.md to be true today,
so that following them does not break anything.
**Pain today:** stale runbook steps, four ADRs with untrue claims, gate lists missing two gates.

## Acceptance Criteria (Gherkin)

```gherkin
Feature: Mobile navigation and layout (US-1, US-2)

  Scenario: The menu opens as a full-height panel
    Given the home page at a 375x812 viewport, hydrated
    When the visitor taps the menu button
    Then the menu panel is as tall as the viewport and sits above the page content
    And tapping the backdrop closes it
    And pressing Escape closes it and returns focus to the menu button

  Scenario: The menu is a dialog
    Given the open menu
    Then it is exposed as a modal dialog with an accessible name
    And keyboard focus cannot leave it until it closes

  Scenario Outline: No route scrolls sideways
    Given <route> at a <width>px viewport after scrolling to the bottom and back
    Then document.documentElement.scrollWidth is at most its clientWidth
    Examples:
      | route                    | width |
      | /                        | 320   |
      | /                        | 375   |
      | /                        | 414   |
      | /work/self-healing-agent | 320   |
```

```gherkin
Feature: The accessibility gate sees the whole page (US-2, US-7)

  Scenario: Unresolved contrast fails the gate
    Given a route whose text axe reports as colour-contrast "incomplete"
    When the accessibility gate runs
    Then the gate fails if that count exceeds the recorded budget for the route

  Scenario Outline: Every route is audited in both schemes
    Given <route> in the <scheme> colour scheme
    When the accessibility gate runs at rest and after interaction states (hover and focus)
    Then axe reports zero violations
    Examples:
      | route | scheme |
      | /     | light  |
      | /     | dark   |
      | /about| light  |
      | /blog | dark   |

  Scenario: Hero text meets AA
    Given the hero at rest in the light theme
    Then the "Scroll" label and every skill tag use a theme token with no alpha channel
    And each has a contrast ratio of at least 4.5:1 against its rendered background, hovered or not
```

```gherkin
Feature: Motion respects the visitor (US-3)

  Scenario: Hover effects are inert under reduced motion
    Given prefers-reduced-motion is "reduce"
    When the pointer moves over an animated heading
    Then no letter changes position, rotation or opacity

  Scenario: Off-screen animations stop
    Given the visitor has scrolled past the hero
    Then no endless hero animation is running
```

```gherkin
Feature: Head and crawl surface (US-4)

  Scenario Outline: Every route carries its own preview metadata
    When <route> is fetched
    Then it has a canonical link to https://miloscvetkovic.dev<path>
    And og:title, og:description, og:url, og:image and twitter:title describe <route>, not the home page
    And the og:image URL responds 200 with an image content type
    Examples:
      | route                    | path                     |
      | /                        |                          |
      | /about                   | /about                   |
      | /work/self-healing-agent | /work/self-healing-agent |

  Scenario: Crawlers can render the site
    When /robots.txt is fetched
    Then it does not disallow /_next/

  Scenario: The placeholder blog is not indexed
    Given /blog has no posts
    Then /blog carries robots noindex and is absent from the sitemap

  Scenario: The duplicate host is not indexable
    When a page is fetched from the vercel.app production alias
    Then it redirects to the apex, or it is served with X-Robots-Tag noindex

  Scenario: Security headers are sent
    When any route is fetched
    Then the response carries X-Content-Type-Options nosniff, a Referrer-Policy, a Permissions-Policy,
      Cross-Origin-Opener-Policy same-origin and a Content-Security-Policy with frame-ancestors 'none'
    And the route is still statically prerendered
```

```gherkin
Feature: Merges reach production (US-5)

  Scenario: Production serves main
    Given a PR is merged to main
    Then within one hour the production deployment's commit equals main's HEAD

  Scenario: Bot and docs-only changes do not deploy
    Given a Dependabot branch, or a commit that changes nothing the site is built from
    Then Vercel skips the build instead of consuming a deployment
```

```gherkin
Feature: Dependency updates flow (US-6)

  Scenario: A blocked major stays quiet
    Given eslint 10 cannot pass because eslint-config-next pins an incompatible eslint-plugin-react
    Then Dependabot ignores the eslint major until the pin is lifted
    And no open Dependabot PR has been red for more than seven days

  Scenario: In-range advisories are cleared
    When pnpm audit runs
    Then it reports no high-severity advisory that an in-range update would fix
```

```gherkin
Feature: One number means one thing (US-8)

  Scenario: The About page reads metrics from the source
    Given case-studies.ts defines the self-healing agent's metric as 73% of production errors resolved autonomously
    When the About page and the case study page render
    Then both show the same value and the same meaning
    And no page restates a case-study metric with its own copy
```

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                             | Task     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-1  | Production serves main's HEAD within one hour of a merge; a rate-limited deployment has a documented recovery that actually works.                                      | #44      |
| FR-2  | Dependabot branches and commits that change nothing the site is built from skip the Vercel build.                                                                       | #44      |
| FR-3  | The mobile menu renders as a full-height modal panel above the page, closes on backdrop tap and Escape, and manages focus.                                              | #46      |
| FR-4  | No route overflows horizontally at 320, 375 or 414px, at rest or after walking the story.                                                                               | #46      |
| FR-5  | Hero text uses theme tokens with no alpha channel and meets AA in both themes, hovered or not.                                                                          | #47      |
| FR-6  | Story headings expose word-level accessible names.                                                                                                                      | #47      |
| FR-7  | AnimatedText hover effects honour reduced motion; endless animations stop when off-screen.                                                                              | #47      |
| FR-8  | Unreachable hero modules are removed and AnimatedText variants share one scaffold, with behaviour pinned by tests first.                                                | #47      |
| FR-9  | Every route has a canonical URL and complete, route-specific Open Graph and Twitter metadata, including an image.                                                       | #48      |
| FR-10 | robots.txt allows assets; the sitemap carries no stale modification dates (real dates, or none at all); the placeholder /blog is not indexed; 404s emit one robots tag. | #48      |
| FR-11 | Static security headers are sent on every route, and every route stays statically prerendered.                                                                          | #48      |
| FR-12 | JSON-LD output is escaped against `</script>` breakout.                                                                                                                 | #48      |
| FR-13 | A real favicon, an apple-touch icon, a web manifest, theme-color and color-scheme are served.                                                                           | #48      |
| FR-14 | The About page reads case-study metrics from case-studies.ts; 73% is labelled as errors resolved autonomously; claims agree.                                            | #49      |
| FR-15 | Status and accent colours are tokenised; unrendered components and unused assets are removed; a global-error.tsx exists.                                                | #49      |
| FR-16 | Dependabot ignores majors that cannot pass; the vite 8 bump lands as one PR; in-range advisories are cleared; security updates are on.                                  | #45      |
| FR-17 | The gates fail when their property does not hold: contrast budget, every route, a phone viewport, symlinked invocation, main's commits.                                 | #43, #50 |
| FR-18 | The runbook, ADRs, README and CLAUDE.md are true; merged branches and orphaned refs are pruned; the CV PDF is removed.                                                  | #44, #51 |

### Non-Functional Requirements

- **Static delivery stays.** Every route remains statically prerendered (`○` or `●` in the build route table); no
  change introduces a dynamic route to satisfy a header or metadata requirement.
- **No gate is weakened.** No threshold is lowered, no test is skipped or deleted, and no `eslint-disable` is
  added for a React Hooks rule. Expected-failure annotations are allowed only in #43's baseline, each naming
  the issue that removes it.
- **Performance holds.** First-load JS for `/` stays at or under the measured 233 KB gzip; other routes at or under
  174 KB gzip. Lighthouse Accessibility, Best Practices and SEO stay 100.
- **CI budget.** The e2e job stays inside its 20-minute timeout on one worker after the mobile project is added.

## Testing Requirements

- **Test first, in two layers.** Task #43 lands the acceptance suite before any fix. It covers the Gherkin above:
  a mobile Playwright project; e2e for navigation, the mobile menu, client-side navigation and theme persistence;
  the axe gate across every route in both schemes, with a contrast budget and hover/focus states; SEO tests over
  served HTML; render tests for the case-study, 404 and error pages. Tests for defects that still exist land as
  expected failures (`test.fail()` in Playwright, `it.fails` in Vitest), each annotation naming the issue that
  fixes it. CI stays green, and the fixing PR must remove the annotation, because an unexpected pass fails the
  run. Every later task starts by confirming its RED tests fail for the documented reason.
- **Test types:** Vitest unit tests (jsdom only where a DOM is needed), Playwright e2e against the dev server
  locally and the production build in CI, axe-core with the Lighthouse rule set, and node:test for `scripts/`.
- **Must be covered:** the mobile menu open/close/focus cycle; horizontal overflow at 320/375/414px; unresolved
  contrast on the hero; per-route canonical and og:image; robots and sitemap output; security headers; the
  allowBuilds gate invoked through a symlink; LoopPhase restart under reduced-motion toggling.
- **Gate specs keep `retries: 0`.**

## Success Criteria

- Every finding in the register is resolved, or closed with a recorded reason.
- For 14 days after #44 lands, production's deployed commit equals main's HEAD within an hour of each merge.
- Zero horizontal overflow and a green mobile-menu cycle at 320, 375 and 414px, in CI and against production.
- Axe reports zero violations and no growth in unresolved contrast on every route, in both schemes, on desktop and
  mobile.
- Every route serves a canonical URL, an og:image that responds 200, and the security headers.
- No Dependabot PR stays red for more than seven days; `pnpm audit` reports no high advisory that an in-range
  update would fix.
- Lighthouse Accessibility, Best Practices and SEO stay 100 on `/` and `/work/self-healing-agent`.

## Constraints & Assumptions

- **One maintainer, small PRs.** Each task lands as one or more PRs from a typed branch (`fix/`, `chore/`,
  `docs/`, `test/`, `ci/`), squash-merged, green on both required checks. There is no epic branch: `main` is
  protected, requires linear history and serialises merges, and a long-lived epic branch would fight that.
- **Vercel Hobby plan**, 100 deployments a day. Every PR builds a preview until #44 lands.
- **Owner decisions recorded on 2026-09-11:**
  - The CV PDF is deleted from the repository without rewriting history.
  - Next.js's generated agent files are disabled (`agentRules: false`).
  - Dependabot alerts and security updates are switched on, and an Ignored Build Step skips Vercel builds for
    Dependabot and docs-only changes.
  - 73% means production errors resolved autonomously.
- **Settings changes need a go-ahead.** Any other GitHub, Vercel or DNS setting change is proposed in its task and
  made only with the owner's go-ahead at the time.
- **ADR numbers are taken at PR time**, not reserved in advance, because parallel sessions have collided on them
  before.

## Out of Scope

- Writing blog content, or redesigning the hero or the story.
- Moving off the Vercel Hobby plan.
- Rewriting git history to purge the CV PDF (owner decision).
- The remember plugin's failing save step (finding docs-20), which lives in the owner's user-level Claude setup
  rather than in this repository.
- Migrating to TypeScript 6/7, pnpm 11 or React 19.3. These are recorded in #45 as facts to watch, not
  actioned.

## Dependencies

- **Upstream:** eslint-config-next moving to an eslint-plugin-react release that supports ESLint 10 (blocks the
  eslint major); vite 8 (available).
- **Vercel:** the deployment quota window, and the project's Ignored Build Step and domain settings.
- **DNS host:** a DMARC record, added by the owner.
- **GitHub repository settings:** Dependabot alerts and security updates (approved).

## Production Verification

Task #52 checks the following on https://miloscvetkovic.dev, after every other task has merged.

- **Deployment:** the latest Production deployment's commit equals main's HEAD
  (`gh api repos/{owner}/{repo}/commits/<sha>/status`, plus a marker only main's build contains).
- **Business smoke:** Playwright against production opens the mobile menu at 375px and asserts the panel height;
  checks scroll width at 320, 375 and 414px; runs axe on every route in both schemes.
- **Crawl surface:** `curl -sSI` shows the security headers on `/`, a case study, a static asset and a 404;
  `/robots.txt` and `/sitemap.xml` match the routes; every route's og:image responds 200.
- **Manual:** the menu on a real phone, and a link-preview card for a case study.
- **Monitoring:** watch Vercel's runtime logs for 15 minutes after the final deploy, and look for no new errors.
- **Rollback:** Vercel instant rollback to the previous production deployment, as in `docs/runbooks/deploy.md`.
- **Sign-off:** the owner.

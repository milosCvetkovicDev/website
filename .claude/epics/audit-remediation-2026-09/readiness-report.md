---
name: audit-remediation-2026-09
verdict: READY
round: 4
checked: 2026-09-12T07:03:04Z
critical: 0
major: 2
minor: 5
---

# Readiness report — audit-remediation-2026-09 (round 4)

This round replaces rounds 1 to 3. Every check was re-run from scratch against the worktree at
`origin/main` (9189af4) rather than read off the earlier reports: the PRD, `epic.md`, all ten task
files and the finding register were read in full, and the finding, dependency, publication-safety and
citation checks were computed mechanically rather than sampled by eye.

**Verdict: READY.** No CRITICAL finding survives. Two MAJOR findings remain, both single-line factual
corrections that do not change any task's scope, plus five MINOR items. The threshold for NEEDS WORK
is three MAJOR.

## What each check found

### 1. Finding coverage — PASS (critical)

Computed by extracting every `**<id>**` bullet from each task file's "Audit findings" section and
comparing it with the task assignment in the decomposition data.

| Measure                                                 | Result |
| ------------------------------------------------------- | ------ |
| Findings in the store                                   | 165    |
| Assigned to a task                                      | 163    |
| Recorded as not actioned (docs-20, docs-21)             | 2      |
| Verdict `refuted` (excluded from the expectation)       | 0      |
| **Expected** in an "Audit findings" section             | 163    |
| **Covered**                                             | 163    |
| **Missing**                                             | 0      |
| **Duplicated** (twice in one task, or across two tasks) | 0      |
| Stray ids (in a section but assigned to no task)        | 0      |

Per task: #43 11/11, #44 16/16, #45 23/23, #46 5/5, #47 16/16, #48 20/20, #49 13/13, #50 34/34,
#51 25/25, #52 0/0 (verification only, no findings assigned). No finding id is bolded outside an
"Audit findings" section, so nothing double-counts. The two not-actioned ids appear only in the
register's "Not actioned" list with their reasons.

### 2. FR coverage — PASS (critical)

All eighteen requirements are covered by the task(s) their row names, checked by confirming that each
FR's subject findings sit in that task and that the task carries an acceptance criterion for the
requirement:

| FR            | Task     | Where it is discharged                                                             |
| ------------- | -------- | ---------------------------------------------------------------------------------- |
| FR-1, FR-2    | #44      | AC 1-5, 7-9 (deploy, Ignored Build Step, rate-limit recovery)                      |
| FR-3, FR-4    | #46      | AC 1-5 (dialog, focus), AC 7-9 (overflow at 320/375/414 and 768-1024)              |
| FR-5 to FR-8  | #47      | AC 2 (tokens at alpha 1), AC 3 (word-level names), AC 4-5 (motion), AC 11-13       |
| FR-9 to FR-13 | #48      | AC 1, 3-4 (canonical, OG/Twitter, image), AC 7-10, AC 11-13, AC 14-16, AC 18-19    |
| FR-14, FR-15  | #49      | AC 1-4, 6-7 (single source), AC 9-11, 13 (tokens, dead code), AC 16 (global-error) |
| FR-16         | #45      | AC 1-3, 4, 12, 13 (ignore rules, vite group, advisories, security updates)         |
| FR-17         | #43, #50 | #43 AC 1, 8, 9 (phone projects, every route, contrast budget); #50 AC 3-6          |
| FR-18         | #44, #51 | #44 AC 7-13 (runbook); #51 AC 1, 4-20 (ADRs, README, CLAUDE.md, branches, CV)      |

Nothing is missing. FR-10's wording now admits the end state #48 actually builds ("real dates, or
none at all" against #48 AC 8's removal of `<lastmod>`), which was a round-2 finding.

### 3. Dependency graph — PASS (critical)

Every task's `depends_on` and `conflicts_with` matches the decomposition data exactly once zero-padding
is normalised, `parallel` matches, and each `name` matches character for character.

- **Symmetry:** 16 distinct conflict pairs, every one mutual — 001-005, 001-008, 002-009, 003-008,
  003-009, 004-005, 004-006, 004-007, 005-006, 005-007, 005-008, 006-007, 006-008, 006-009, 007-008,
  008-009. Zero asymmetric edges.
- **Cycles:** none. A topological sort orders all ten (#43, #44, #45, #50, #51, #46, #47, #48, #49,
  #52); no `depends_on` target dangles.
- **#43** is the testing task, `depends_on: []`, `parallel: true`.
- **#52** depends on exactly the other nine, `parallel: false`, `conflicts_with: []`.
- **Strict YAML:** all eleven frontmatter blocks (the epic plus ten tasks) parse under the repo's
  `yaml` package with `strict` and `uniqueKeys`, with zero errors and zero warnings. Names containing
  `": "` are quoted in #43, #45, #47 and #48. The list values are unquoted zero-padded numbers, which
  is the CCPM template's own form (`conflicts_with: []  # … e.g., [#45, #46]`), so a parser reads them
  as integers by design and the sync step rewrites them textually.

One documented limitation, not a defect: `conflicts_with` carries only each task's primary pairs, so a
few file-map pairs (002-003 and 002-006 on the runbook, 003-005/006/007 and 005-009/007-009 on
`CLAUDE.md` and `docs/plans/`) are enforced by prose. `epic.md` states this explicitly, says the field
is **not** a complete parallelism gate even though `/pm:epic-start` reads it as one, and gives the
authoritative per-file map to schedule from. Carried forward as MINOR-5 below.

### 4. Verifiable criteria — PASS with one MINOR

234 acceptance criteria across the ten tasks. Every one resolves to a command, a named test or row, a
URL check, a file assertion or a measured bound. Eleven did not carry a command in their own text; ten
of those are continuation criteria ("In the same spec, …") that inherit the command from the criterion
above and state concrete assertions of their own (`open === false`, `aria-expanded`,
`document.activeElement`, computed `transform`), which is sound.

The one weak criterion is **#49 AC 19**: "Each of #43's expected-failure annotations covering a
finding in this task is removed in the same pull request as its fix, and the run is green with no
unexpected pass." It asserts a test outcome but gives no mechanical check for the annotation removal,
where its siblings do — #46 AC 16 runs `git grep -n "#46" apps/web/e2e apps/web/src` and #47 AC 1
runs `git grep -nE 'test\.fail\(|it\.fails' -- apps/web`. Recorded as MINOR-1.

Three further criteria assert the content of a document or a pull-request body without a command
(#43 AC 23 on the e2e wall-clock, #45 AC 14 and AC 20 on the new ADR's content, #50 AC 25 on a PR
description). Each is checkable by reading the named artifact, and #44 AC 17 and #51 AC 3 show the
stronger `gh pr view … | grep -c` form for the same shape. Not flagged individually.

### 5. Publication safety — PASS (critical)

Scanned the PRD, `epic.md`, all ten task files and the finding register for every prohibited class:

| Class                                                        | Hits |
| ------------------------------------------------------------ | ---- |
| Absolute local path (a home directory or a system temp root) | 0    |
| The agent working-directory noun this epic was drafted in    | 0    |
| Email address                                                | 0    |
| Phone number (national or international shape)               | 0    |
| Secret or token (PAT, key, bearer, private key)              | 0    |
| Vercel team slug or internal project/deployment id           | 0    |

Also checked, and clean:

- **Employer names.** Every proper noun and corporate-suffix name in the CV source was matched against
  all fourteen files. The only hits are generic technical and section words ("Architecture",
  "Integration", "Production", "Claude Code"). No employer name appears anywhere.
- **The internal-name leak the epic is fixing is not reproduced.** The January design document maps
  each public case-study name to an internal project name, and #51's pages-2 correctly identifies
  that column as the second leak — without quoting either internal name. Neither internal name appears
  in any of the fourteen files.
- **The CV PDF is never named.** Every reference is a glob or a regex (`docs/*.pdf`, `\.pdf$`,
  `docs/<the tracked CV PDF>`); the filename, which carries a person's name, appears nowhere. The file
  is described only as carrying "personal contact details" in the PRD, `epic.md`, #46, #49, #51, #52
  and the register. The register's pages-2 and critic-1 rows, which in round 2 described it as exposing
  a phone number, email and employer details, now read "personal contact details" — that finding is
  closed.
- **Long digit runs** resolve to an HSTS `max-age`, a public CI run id and a public commit SHA.
- **Two deliberate, already-public values.** `portfolio-theta-gold-77.vercel.app` (#48, #52) is the
  production alias; it is the subject of live-3/pages-7 and is already named in the repository's own
  `CLAUDE.md` and deploy runbook, so naming it in the issue discloses nothing new. `@milos_dev`
  (#48's helper sketch) is the `twitter:creator` value already served in every page's HTML. Neither is
  a team slug.
- **#52 carries the rule forward** into execution: its "Keep the public issue clean" note tells the
  operator to paste `dpl_` ids and redact the team scope from `vercel` output, to paste only the DMARC
  `p=` policy and not the report address, and that the CV PDF is referred to as carrying personal
  contact details and nothing more.

This report contains no personal data.

### 6. Citation accuracy — 291 checked, 1 wrong (MAJOR-1)

624 `file:line` citations were extracted from the ten task files. Mechanically, **zero** point past the
end of their file, and every path resolves to a file tracked at `origin/main` — the 43 apparent misses
are basename abbreviations whose full path is given earlier in the same bullet, plus five deliberate
`node_modules` references that the text labels as such.

**291 citations were then opened and read against the source** — far past the four-per-file floor:

| Task | Checked | Wrong |
| ---- | ------- | ----- |
| #43  | 44      | 1     |
| #44  | 17      | 0     |
| #45  | 26      | 0     |
| #46  | 26      | 0     |
| #47  | 37      | 0     |
| #48  | 29      | 0     |
| #49  | 31      | 0     |
| #50  | 43      | 0     |
| #51  | 30      | 0     |
| #52  | 8       | 0     |

The single wrong citation is **MAJOR-1** below. Round 2's other citation findings are all fixed and
verified: #44's docs-1 now cites `apps/web/e2e/console-clean.spec.ts:24-25`, which is exactly the two
not-found URLs; #47's hero-3 and hero-10 now cite `discovery-phase.tsx:182`, `execution-phase.tsx:351`
and `loop-phase.tsx:245` for the `<h2>`s, all three correct, while keeping `loop-phase.tsx:243` for
hero-11's `opacity-0` headline block, where it is right; and #47's critic-8 cites
`animated-text.tsx:384`, the cyan `opacity-70` class.

Round 2's claim that `animated-text.tsx:1011-1012` should have been `:1010-1011` was itself wrong and
has rightly not been applied: `:1011` is the `inline-block` span and `:1012` the character split, the
same shape as the other five pairs the finding cites (`:166-167`, `:309-310`, `:594-595`, `:677-678`,
`:815-816`), all six verified.

Two numeric claims that differ between files were resolved against the source in the tasks' favour:
there are exactly five `<h2>` elements in the phase components, so #47's "three of the story's five h2
headings" is right; and all seven infinite animations hero-4 names exist at the lines cited.

### 7. Cross-reference form — PASS with MINOR

No `#0NN` form anywhere. Task cross-references in the ten task files use `task 0NN`, bare `0NN`, or a
range (`#43, #44, #45, #46, #47, #48, #49, #50, #51`), all of which the rewrite step handles. Two exceptions, both MINOR:

- `epic.md` labels its Task Breakdown Preview, Critical path and Sizing lists `#43` to `#52`
  (29 occurrences). `T<n>` is not rewritten to an issue link (MINOR-2).
- `009.md:643` points at "#51 in the Task Breakdown Preview" and `009.md:286` at "Task 6" of a plan
  document. Both are correct pointers to a literal label inside another document rather than task
  cross-references, so neither is a defect in itself (MINOR-3).

## Outstanding

| ID      | Severity | Where              | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Fix                                                                                                                                           |
| ------- | -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| MAJOR-1 | MAJOR    | #43                | RED manifest row R17 cites `animated-text.tsx:385` for the glitch variant's `opacity-70` duplicate. `:385` is `style={{`; the cyan `opacity-70` class is at `:384` and the red one at `:394`, and #47's critic-8 already cites `:384, :394` correctly. (Round 2 m4, still unfixed — the only wrong citation in 291 checked.)                                                                                                                                           | In row R17's last column, change `animated-text.tsx:385` to `:384`, leaving `:394` as it is.                                                  |
| MAJOR-2 | MAJOR    | prd                | Problem statement 7 says "ADRs 0004, 0005, 0014 and 0015 each state something untrue". Task #51 corrects 0002, 0005, 0014 and 0015, and both #45 AC 17 and #51 AC 10 require a **zero diff** on `docs/adr/0004-ci-pipeline-and-quality-gates.md`, because the verifier found its claim was true when accepted. The PRD names the one record the epic forbids touching and omits 0002.                                                                                  | Change the list to "ADRs 0002, 0005, 0014 and 0015".                                                                                          |
| MINOR-1 | MINOR    | #49                | AC 19 asserts the expected-failure annotations are gone and the run is green, but gives no command for the annotation half, where #46 AC 16 and #47 AC 1 both do.                                                                                                                                                                                                                                                                                                      | Add `git grep -n "#49" apps/web/e2e apps/web/src` prints nothing, as #46 AC 16 words it.                                                      |
| MINOR-2 | MINOR    | epic               | The Task Breakdown Preview, Critical path and Sizing lists use `#43`-`#52` (29 occurrences). That form is never rewritten to an issue link, so those lists publish as bare labels.                                                                                                                                                                                                                                                                                     | Either accept it (they read as section labels, and the Implementation Strategy above them already uses `task 0NN`), or relabel to `task 0NN`. |
| MINOR-3 | MINOR    | prd                | Problem statement 7 says the gate lists in "the README, CLAUDE.md and the PR checklist" miss two gates. `.github/pull_request_template.md:9-10` begins with `pnpm check:allowbuilds` and `pnpm test:scripts`, so the template has both; docs-6 names the runbook, README and CLAUDE.md, and gates-6 names CLAUDE.md's own inline checklist as the one that contradicts the template.                                                                                   | Say "the README, CLAUDE.md and the deploy runbook".                                                                                           |
| MINOR-4 | MINOR    | prd, #44, #45, #50 | Three narrative figures in the PRD are looser than the verified findings the tasks carry: "a quarter of them from Dependabot branches" against 31 of 100 (#44 says "a third"); "recommends `pnpm approve-builds`, which ADR 0013 rejected", where #44's docs-2 narrows it (only `--all` is forbidden; the row's real fault is being stale); and the allowBuilds symlink claim, which #50's tooling-6 narrows to a hand-typed `node` run by an absolute symlinked path. | Align the three sentences with the task wording, or leave them as summary prose — the tasks carry the accurate claims.                        |
| MINOR-5 | MINOR    | register           | Two register rows keep the pre-verification counts while the task files carry the corrected ones, with no cue for a reader comparing them: hero-3 reads "three of six story headings" (there are five `<h2>`s, as #47 says) and hero-4 reads "Six endless hero animations" (seven, as #47 and #43 R18 both list, all seven verified present). Both rows are marked `confirmed`.                                                                                        | Update the two row titles to five headings and seven animations.                                                                              |

Also carried forward, and not a defect: `conflicts_with` covers each task's primary pairs only, so a
few file-map pairs are enforced by prose. `epic.md` says so in terms, warns that `/pm:epic-start` reads
the field as a complete gate, and supplies the authoritative per-file map — the mitigation is to start
tasks from that map rather than from the field.

## Method

- Finding coverage, the dependency graph, YAML strictness, the publication-safety sweep, the
  acceptance-criterion scan and the citation extraction were all computed by script over the fourteen
  files, not sampled.
- Every citation reported as verified was opened at the cited line in the worktree at `origin/main`
  (9189af4) and read against the claim around it.
- Employer names and the CV filename were matched programmatically against the CV source so that no
  personal value had to be reproduced in order to check for it.
- Rounds 1 to 3 were treated as unverified: each of their remaining findings was re-derived, which is
  how MAJOR-1 was confirmed still open and how their `animated-text.tsx:1011-1012` recommendation was
  found to have been wrong.

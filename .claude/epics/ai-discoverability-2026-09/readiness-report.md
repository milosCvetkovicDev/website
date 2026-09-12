---
name: ai-discoverability-2026-09
verdict: READY
round: 3
checked: 2026-09-12T12:29:36Z
critical: 0
major: 1
minor: 17
---

# Readiness check: ai-discoverability-2026-09, round 3

Independent check by an agent that wrote none of these files. The PRD, `epic.md`, the decomposition data
and all ten task files were read in full against the worktree at `origin/main` 223a555; the frontmatter,
the FR matrix, the refusal scan, the publication grep and the measure-block census were computed
mechanically rather than sampled by eye. Verdict rule: NOT READY on any CRITICAL, NEEDS WORK on three or
more MAJOR, otherwise READY.

**Verdict: READY.** Every CRITICAL check passes. Round 2's four MAJOR defects — the placeholder-gate
contradictions in #57, #58, #60 and #61 — are all fixed: each of those tasks now names the Vitest
command, adds its own `{ id, value }` entry to the one source array #56 declares, requires a register
row with a `why` and an owner-set `expires`, and describes the red run as the one with that row deleted or
expired. One MAJOR remains, a single Consumed-by sentence in #61 that claims more twin consumption
than this epic's own design delivers. Seventeen MINOR items stand, thirteen of them round 2's, none of
which changes a task's scope, its dependencies or its stop conditions.

## What each check found

### 1. FR coverage — PASS (critical)

Every FR-1 to FR-16 is claimed by exactly the task(s) the PRD's requirements table names, verified by
extracting every `FR-<n>` token from each task file and comparing with the table. No requirement is
unowned and no task claims a requirement the table gives to someone else.

| FR    | PRD names     | Claimed in                     | Status |
| ----- | ------------- | ------------------------------ | ------ |
| FR-1  | #55, #58, #59 | #55, #58, #59 (#64 verifies)   | Full   |
| FR-2  | #55           | #55 (#64 verifies)             | Full   |
| FR-3  | #55           | #55 (#64 verifies)             | Full   |
| FR-4  | #55           | #55 (#64 verifies)             | Full   |
| FR-5  | #55           | #55 (#64 compares against it)  | Full   |
| FR-6  | #56           | #56 (markup half in #57)       | Full   |
| FR-7  | #56, #58      | #56, #58                       | Full   |
| FR-8  | #57           | #57 (#64 verifies)             | Full   |
| FR-9  | #57           | #57 (#64 verifies)             | Full   |
| FR-10 | #58           | #58                            | Full   |
| FR-11 | #59           | #59 (#64 verifies)             | Full   |
| FR-12 | #60           | #60 (#64 verifies)             | Full   |
| FR-13 | #61           | #61 (#64 verifies)             | Full   |
| FR-14 | #62           | #62 (#64 verifies)             | Full   |
| FR-15 | #63           | #63 (#64 holds the walk to it) | Full   |
| FR-16 | #64           | #64                            | Full   |

FR-6 is the one row worth a footnote: its markup clause is delivered by #57 and its visible/sitemap
clauses by #56. Task #56 says so in as many words and tells its PR not to claim the FR complete, so
nothing is missing — the PRD's row is simply narrower than the requirement (MINOR-15).

### 2. Dependency graph — PASS (critical)

Each of the ten frontmatter blocks parses under the repository's own `yaml@2.9.0` in strict mode, carries
exactly the eight template keys, and matches the decomposition byte for byte on `name`, `depends_on`,
`parallel` and `conflicts_with`. `status` is `open` everywhere, `created` equals `updated` in every file
and every id is a quoted string, so no `depends_on` value parses as a number.

| Task | depends_on                          | parallel | conflicts_with |
| ---- | ----------------------------------- | -------- | -------------- |
| #55  | —                                   | true     | #63            |
| #56  | #55                                 | true     | #58            |
| #57  | #55, #56                            | true     | #58, #59       |
| #58  | #55, #56                            | true     | #56, #57       |
| #59  | #55, #56                            | true     | #57, #60, #61  |
| #60  | #59                                 | true     | #59, #62       |
| #61  | #55, #59                            | true     | #59            |
| #62  | #56, #60                            | true     | #60            |
| #63  | —                                   | true     | #55            |
| #64  | #55,#56,#57,#58,#59,#60,#61,#62,#63 | false    | —              |

Conflicts are symmetric in all six pairs (#55↔#63, #56↔#58, #57↔#58, #57↔#59, #59↔#60, #59↔#61, #60↔#62),
a depth-first walk of `depends_on` finds no cycle, #55 and #63 have no dependency, and #64 depends on the
other nine with `parallel: false`. Branch names match the decomposition in all ten files (MINOR-13 records
#55's extra `docs/` branch for its baseline record).

### 3. Evidence honesty — PASS (critical), with one MAJOR inside it

All 51 measures across the ten files carry a `**What:**`, `**Consumed by:**`, `**Evidence:**` and
`**Done when:**` line — counted mechanically, and the counts equal the `###` measure headings in every
file. No task claims a benefit the research contradicts:

- **llms.txt.** Task #60 states the measured non-consumption (Ahrefs, 137,210 domains, 2026-06-15, 97%
  fetched zero times) and Google's statement that Search ignores such files, and writes its honest reason:
  coding agents a human pointed at the domain, and completeness. No traffic claim anywhere.
- **Structured data.** Task #57 states Google's "not required for generative AI search" and Ahrefs' null
  difference-in-differences over 1,885 pages, and says in its own words that the work ships for two rich
  results and entity resolution. Tasks #56, #58, #63 and #64 repeat the null result rather than softening
  it. No knowledge panel and no ProfilePage rich result is promised; the circulating 90-day `dateModified`
  rule is named as absent from Google's documentation.
- **Markdown twins.** Task #59 is the most careful file in the set: it records that ChatGPT, Claude.ai,
  Gemini and Perplexity fetch HTML only, that the `Accept: text/markdown` agents send that header to the
  canonical URL, and that because this epic ships no negotiation they reach a twin only through discovery
  or a handed URL — so the one documented consumer is OpenAI's Codex CLI.
- **The feed.** Task #61 states "zero evidence" that a feed changes answer-engine behaviour.
- **MCP.** Task #62 opens with "almost nobody, for its data", labels reach speculative, and names
  demonstration as the reason in exactly those words; #64 repeats it.
- **Demonstration stated as such** also appears for #56's placeholder register, #61's posts and
  #63's ADR.

The MAJOR is the one place this discipline slips: #61 (`007.md:81`) lists the twins as "read by Claude
Code, Cursor and both GitHub Copilot clients (they send `Accept: text/markdown`)". Given #59's own
measured reasoning, those clients send that header to the canonical URL and get HTML; only Codex CLI
follows the discovery link. The same phrasing sits in `009.md:107` (the README requirement) and `010.md:95`
(a Consumed-by list, where Codex is at least named as "the one documented consumer" of discovery).

### 4. No duplication of epic #42 — PASS (critical)

Nothing plans canonical URLs, `og:image`, per-route Open Graph or Twitter metadata, icons, the manifest,
`theme-color`, security headers, `robots.txt` hygiene, `serializeJsonLd`, `mergeMetadata`, the route list
or the served-HTML test pattern, the per-character span fix, or `/blog`'s `noindex` as its own work. Each
task carries a "consumes from epic #42" subsection naming #43, #47, #48 and #49 by issue number and what
it takes from each. Three boundaries worth recording because they look like overlaps and are not:

- Task #56 adds `lastModified` back for dated case-study URLs only, after #48 removes the build-time stamp
  — assigned by FR-6, and it edits nothing else of #48's sitemap.
- Task #61 removes `/blog`'s `noindex` and re-enters its sitemap rows — assigned by FR-13, and the task
  states this is the condition #48 named rather than a reversal of #48.
- Tasks #59 and #61 add `alternates.types` entries _inside_ #48's helper and explain why a layout-level
  `alternates` would be shallow-merge replaced; #57 reads #48's canonical rather than setting
  `alternates` anywhere.

Task #57's AC 7 expects `apps/web/src/data/social.ts` to be the only home of the profile URLs. That module
does not exist at 223a555 (the URLs are in nine files today) — it is created by #49
(`.claude/epics/audit-remediation-2026-09/49.md:132`), which #57 names in its Dependencies. Consumption,
not duplication.

### 5. No refused measures — PASS (critical)

Every mention of the PRD's Out of Scope list across the ten files is a refusal, a guard assertion or a 404
expectation. Scanned mechanically for `llms-full`, FAQPage, HowTo, `speakable`, `SearchAction`, `ai.txt`,
TDMRep, Content-Signals, `ai-plugin.json`, `agents.json`, JSON Resume, WebMCP, `agent-skills`, IndexNow,
Wikidata, a robots allowlist and a nonce CSP: no hit plans one. Three are actively fenced —
#60's AC 4 asserts `/llms-full.txt` stays a 404, #57's AC 10 and #58's AC 13 grep for the dead markup, and
#63's `scripts/ai-refusals.test.mjs` fails `pnpm test:scripts` when any refused artefact reappears. The
only "allowlist" hits outside #63 are #55's function allowlist for the build-output gate, a different
thing.

### 6. Verifiable criteria — PASS (major bar), one MINOR

164 acceptance criteria across ten files. Every one names a command, a named spec file, a served-response
or header check, a build-output assertion, a file assertion, or a recorded PR artefact (screenshots, a
pasted run, a reviewer's written finding). No criterion uses "improve", "ensure", "consider", "properly"
or "as needed" — the only `improve` in any AC is inside #63's grep pattern that forbids such wording in
`README.md`. All ten files spell out the seven `quality` gates as commands and both e2e invocations, and
each endpoint-adding task asserts the build output separately. The single soft criterion is #58's AC 10
(MINOR-8), whose pass condition branches on an owner decision the criterion does not locate.

### 7. Citation accuracy — PASS (major bar), five wrong of 88

58 repo `file:line` citations were opened at 223a555 (at least three per task, and every line number in
#55, #56, #57 and #59) and 30 research citations were checked against the six research files plus
`plan.json`. Five repo citations are wrong, all off-by-one ranges or one mis-attribution; none is
fabricated, and none changes what the task does. Details in MINOR-1 to MINOR-5. Notable spot-checks that
were exact: `case-studies.ts:49` (`{ value: 73, suffix: '%', label: 'faster resolution' }`),
`sitemap.ts` `lastModified` at 10/16/22/28/34/40/48, `accessibility.spec.ts:151` (floor 40),
`accessibility.spec.ts:132-135`, `hero-content.tsx:134-136` (the `<br />`), all six phase closing pairs,
all six `animated-text.tsx` per-character span sites, `ci.yml:25/42-61/64-94/66`, `.mcp.json:1-8`,
`apps/web/package.json:17-23`, `docs/adr/README.md:27-43/45-47/69/77`, `docs/plans/README.md:49-52/69`.

Research: the Ahrefs llms.txt study (137,210 domains, 28% valid, 97% zero-fetch, 2026-06-15), the Ahrefs
JSON-LD difference-in-differences (1,885 pages vs ~4,000 controls, AIO −4.6%, AI Mode +2.2%, ChatGPT
+2.2%, 2026-05-11), the KDD 2024 GEO figures (+37% statistics, +30% cited sources, −9% keyword stuffing,
arXiv 2311.09735, revised 2024-06-28), acceptmarkdown.com (2026-06-22, HTML-only surfaces each verified
2026-04-18), Google's AI-optimization guide (2026-07-10), Google's AI-features eligibility sentence
(2025-12-10), Apple 119829 (2026-09-04), Mueller on Content-Signals (2026-07-06), Vercel/MERJ (2024-12-17),
cloro (2026-07-06, 1,058 domains, authors' no-causation caveat), Cloudflare's crawl-to-refer ratios,
searchVIU (published 2025-12-02, tested Oct 2025), schema.org v30.0 (2026-03-19), the Lighthouse 13.4.1
probe (`agentic-browsing` 1.0 with `llms-txt`, three `webmcp-*`, `canonical` and `image-alt` all
`notApplicable`), the `llms-txt` audit's 4xx→`notApplicable` rule, lighthouse issue 17082/PR 17083,
validator.schema.org's `)]}'` prefix and `INVALID_PREDICATE` probe, the Rich Results Test's 405, the MCP
2026-07-28 wire details (`server/discover`, `ttlMs`/`cacheScope`, `-32020`, Origin MUST), SEP-2127 open on
2026-09-11, the IETF draft expiring 2026-09-25, the registry's own "not intended to be directly consumed"
line, the Connectors Directory's Team/Enterprise gate, `mcp-handler@^2`/`@modelcontextprotocol/server@^2`/
`zod@^4`, Next's 15.0.0-RC default change and the `cacheComponents` removal, llmstxt.org v2 (2026-08-10),
RFC 7763, Google Feedfetcher in Vercel's directory (2026-08-11), and both dashboards' dates (GSC
2026-06-03/2026-08-31, Bing 2026-02-10/2026-06-16, the 2026-02-19 Q&A) all check out as stated. The one
research imprecision is the 77% characterisation (MINOR-16). RFC 4287's December 2005 date is correct but
sits outside the research corpus (MINOR-17 note).

### 8. Static posture — PASS (major bar)

Every task that adds a route handler requires `export const dynamic = 'force-static'` on each one (#59's
seven handlers, #60's `/llms.txt` and two JSON endpoints, #61's `feed.xml` and post twins), names the
measured trap — `○ /llms.txt` with the export against `ƒ /llms-full.txt` without it, next 16.3.4,
2026-09-12 — and asserts the build output separately: #59 AC 2, #60 AC 9, #61 AC 9. The three tasks that
add no endpoint still assert it (#56 AC 15, #57 AC 12, #58 AC 17), because a new data import can move a
metadata route silently. Task #62 is the only function: it explains that a `POST` handler cannot be
prerendered, narrows #55's gate from "zero functions" to "exactly one, `/mcp`" (AC 10), and #64 AC 4
checks `x-nextjs-prerender: 1` on all nine page routes and every endpoint and `0` on `/mcp` alone. Every
file also records that `force-static` disappears only under `cacheComponents` and that `[slug].md` cannot
work because a partial dynamic segment types as a literal with no params.

### 9. Publication safety — PASS (critical)

The agreed grep over `.claude/prds` and `.claude/epics/ai-discoverability-2026-09` returns three hits, all
the same `/tmp/lh-ai.json` in one Lighthouse command in `010.md` (MINOR-6). No `/Users/...` path, no
`/private/...` path, no reference to a scratch directory, no email address, no phone number, no employer
name and no secret appears in any task file, the PRD or the epic. Cross-references use "task 0NN" for
siblings and `#43`..`#52` for epic #42's real issues. Two deliberate protections are worth noting: #64's
setup block tells the operator to redact the Vercel team scope before pasting CLI output, and it records
deployment ids rather than URLs. Task #57 asks the owner for the locality and credential strings the
`Person` node may assert without writing either into the task file.

### 10. Placeholder discipline — PASS (major bar)

No invented date, metric, credential, location or benchmark figure appears anywhere: a scan for
`datePublished:` literals and for new percentage claims returns nothing. One sentinel convention serves
the whole epic — #56's `OWNER_TODO` constant, the `ownerTodo(hint)` marker helper, the
`unfilledOwnerFields` register with an owner-set `expires`, and one Vitest checker walking registered
`{ id, value }` sources. Tasks #57 (`profile`), #58 (`profile`), #60 (`llms-txt`, the generated body) and
#61 (`posts`) each add their own source entry plus a register row, which is what round 2's four MAJORs
asked for. Four layers keep a placeholder out of production: the discriminated union at compile time,
total renderers that omit rather than print, a served-HTML grep for the literal over every route, and the
dated register. The merge story is honest — a registered, in-date marker is green by design, so each task
pastes the red run from a removed or expired row. Task #63's ADR `## Date` is the owner's and its AC 11
greps for leftover placeholder tokens; #55 needs none because its one owner artefact is the baseline
record and AC 1 blocks the PR until it is real.

## Citation spot-check tally

| Source                   | Checked | Wrong | Notes                                                      |
| ------------------------ | ------- | ----- | ---------------------------------------------------------- |
| Repo `file:line` (#55)   | 17      | 0     | Every cited line opened                                    |
| Repo `file:line` (#56)   | 13      | 0     | Every cited line opened                                    |
| Repo `file:line` (#57)   | 11      | 0     | Includes the `social.ts` expectation, which is #49's       |
| Repo `file:line` (#58)   | 12      | 1     | MINOR-5 (an axe rule listed as unselected but enabled)     |
| Repo `file:line` (#59)   | 12      | 0     | Includes all six phase ranges and six span sites           |
| Repo `file:line` (#60)   | 5       | 0     |                                                            |
| Repo `file:line` (#61)   | 8       | 4     | MINOR-1 (three ranges), MINOR-2 (ADR attribution)          |
| Repo `file:line` (#62)   | 9       | 0     |                                                            |
| Repo `file:line` (#63)   | 9       | 1     | MINOR-4 (`CLAUDE.md:100-101`)                              |
| Repo `file:line` (#64)   | 8       | 1     | MINOR-3 (`case-studies.ts:27-42`)                          |
| **Repo subtotal**        | **58**  | **5** | Off-by-one ranges and one mis-attribution; none fabricated |
| Research (source + date) | 30      | 1     | MINOR-16 (the 77% characterisation)                        |
| **Total**                | **88**  | **6** |                                                            |

## Outstanding

| #        | Severity | Task            | Check               | Problem                                                                                                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                           |
| -------- | -------- | --------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAJOR-1  | MAJOR    | #61 (#63, #64)  | Evidence honesty    | `007.md:81` says the twins "are read by Claude Code, Cursor and both GitHub Copilot clients (they send `Accept: text/markdown`)". Task #59 measured the opposite reachability: those clients send that header to the canonical URL, this epic ships no negotiation, so only Codex CLI (via `rel="alternate"`) and a handed URL reach a twin. `009.md:107` and `010.md:95` carry the same phrasing. | Adopt #59's sentence in all three: they send the header to the canonical URL and get HTML; the documented twin consumers are Codex CLI's discovery and anyone handed the URL. |
| MINOR-1  | MINOR    | #61             | Citation accuracy   | Three ranges still wrong (carried from round 2): `case-studies.ts:171-173` (actual `:170-172`), `work/[slug]/page.tsx:18-23` (actual `:17-23`; `:18` is blank), `blog/page.tsx:19-49` presented as holding the `H1`, which is at `:17` (`Coming Soon` is at `:43`).                                                                                                                                | Correct the three ranges.                                                                                                                                                     |
| MINOR-2  | MINOR    | #61             | Citation accuracy   | Attributes "`--accent` at 3.5:1 on the background and 3.2:1 on the card in dark" to ADRs 0010 and 0011. Those figures are in `CLAUDE.md:114-115`; ADR 0008 records the pre-correction 4.1:1 / 4.3:1 / 3.9:1 and neither 0010 nor 0011 contains them.                                                                                                                                               | Cite `CLAUDE.md` for the two figures, or quote the numbers the cited records actually carry.                                                                                  |
| MINOR-3  | MINOR    | #64             | Citation accuracy   | Cites `apps/web/src/data/case-studies.ts:27-42` for the `CaseStudy` interface; it is `:27-41` and `:42` is blank (carried from round 2).                                                                                                                                                                                                                                                           | Correct to `:27-41`.                                                                                                                                                          |
| MINOR-4  | MINOR    | #63             | Citation accuracy   | Cites "the single-source convention at `CLAUDE.md:100-101`"; that is the Conventions heading and the conventional-commits bullet. The rule is at `:105-106` (carried from round 2).                                                                                                                                                                                                                | Correct to `:105-106`.                                                                                                                                                        |
| MINOR-5  | MINOR    | #58             | Citation accuracy   | Lists `table-duplicate-name` among rules "not selected by those tags" while `accessibility.spec.ts:132` enables it in the same map the task cites at `:132-135` as the reason `td-has-header` and `table-fake-caption` run (carried from round 2).                                                                                                                                                 | Drop it from that list, keeping `scope-attr-valid` and `empty-table-header`, or say the tag filter governs regardless of the map's entry.                                     |
| MINOR-6  | MINOR    | #64             | Publication safety  | The Lighthouse block writes and re-reads `/tmp/lh-ai.json` (three occurrences), the only hit in the publication grep. It mirrors the deploy runbook's own command and leaks nothing (carried from round 2).                                                                                                                                                                                        | Write the report to a git-ignored path in the repository, or `"${TMPDIR:-/tmp}"`, so the grep stays clean.                                                                    |
| MINOR-7  | MINOR    | #60 (#61)       | Structure           | The template's standalone "Branch: … Lands as N PR(s)" line is folded into the closing Description paragraph in #60 and runs on from the previous sentence without a blank line in #61 (carried from round 2).                                                                                                                                                                                     | Put the Branch sentence on its own line in both.                                                                                                                              |
| MINOR-8  | MINOR    | #58             | Verifiable criteria | AC 10 reads `grep -n 'Left Unfinished' … prints nothing unless the owner supplied a denominator`, so the criterion cannot be evaluated without a decision it does not locate (carried from round 2).                                                                                                                                                                                               | Name where the decision is recorded (the PR's Review section) and give each branch its own assertion.                                                                         |
| MINOR-9  | MINOR    | #64             | Coverage            | The setup block hardcodes the nine page routes and derives `twins` from them, so AC 5, 6, 7 and 13 never reach #61's post routes or post twins; only AC 12's production e2e run covers them (carried from round 2).                                                                                                                                                                                | Derive the arrays from #43's route list as extended by #61, or add the post routes and twins explicitly.                                                                      |
| MINOR-10 | MINOR    | 007/008/009/010 | Evidence labels     | Four `**Evidence:**` lines label a claim "formal standard" (#61's feed, #62's protocol twice, #64's protocol and media type) and #63's measure table adds "de-facto standard", beyond the epic's four agreed labels (carried from round 2).                                                                                                                                                        | Adopt a fifth label in the epic explicitly, or map RFC- and spec-backed claims to vendor-documented and keep "formal standard" in the prose.                                  |
| MINOR-11 | MINOR    | #59             | Self-consistency    | AC 13 and Technical Details say "nine records", while the same section says `pages.ts` holds one record per static route and that `/work/<slug>` needs "nothing new at all, because `caseStudies` already holds it" (carried from round 2).                                                                                                                                                        | State the count the design implies (six page records plus three case studies read from `caseStudies`), or say `pages.ts` carries all nine.                                    |
| MINOR-12 | MINOR    | #58             | Unowned handoff     | #59 assigns #58's table and Q&A copy to `apps/web/src/data/pages.ts` and enforces it with AC 14's page-versus-record parity spec. #58 names neither `pages.ts` nor #59 in that role, so it learns about the gate by failing it (carried from round 2).                                                                                                                                             | Name `apps/web/src/data/pages.ts` and #59's AC 14 in #58's Dependencies and Project Structure.                                                                                |
| MINOR-13 | MINOR    | #55             | Dependency graph    | #55 introduces a second branch, `docs/ai-discoverability-baseline`, that the decomposition does not list — defensible under the repository's branch-prefix rule, recorded so the two agree (carried from round 2).                                                                                                                                                                                 | Add the second branch to the decomposition entry, or fold the record into the `test/` branch.                                                                                 |
| MINOR-14 | MINOR    | #55             | Cross-epic conflict | #55's AC 15 edits `.github/pull_request_template.md`, which epic #42's #51 also rewrites. #55 records its `ci.yml` conflict with #63 but not this one (carried from round 2).                                                                                                                                                                                                                      | Add #51 to #55's Dependencies as a rebase note.                                                                                                                               |
| MINOR-15 | MINOR    | PRD             | FR coverage         | FR-6's row names #56 only, while the `Article` markup half lands in #57. Task #56 states this and tells its PR not to claim the FR complete (carried from round 2).                                                                                                                                                                                                                                | Informational: add #57 to that row if the PRD is revised; no task work is missing.                                                                                            |
| MINOR-16 | MINOR    | PRD/006/009/010 | Citation accuracy   | All four say 77% of the requests that reached an `llms.txt` came from SEO tooling. Ahrefs' figure is that 77% of the _bots_ reading `llms.txt` are not AI tools; by request share SEO audit tools were 21.7%, with AI categories totalling 19.4%.                                                                                                                                                  | Say "77% of the bots that read one are not AI tools", keeping the 1.1% AI-retrieval figure. The conclusion is unaffected.                                                     |
| MINOR-17 | MINOR    | #62             | Self-consistency    | AC 5 asserts `POST /sse` and `POST /message` return 404, while the same file's refusal list says `mcp-handler@2.0.0` answers `410 Gone` on those paths; #64's AC 14 accepts "410 or 404".                                                                                                                                                                                                          | Match 010: assert 404-or-410 and explain that nothing is mounted there, so Next answers 404 and the package's 410 applies only to a mounted path.                             |

Two further observations that are not defects. Task #56's Description runs to roughly twice the template's
three-to-eight sentences, which buys precision about the #49 boundary; and #63's frontmatter carries
no `depends_on`, matching the decomposition, while its body requires the second PR to land after #62
— the ordering is written down where an implementer will read it.

## What would make this READY-with-nothing-outstanding

Fix MAJOR-1, which is one sentence in #61 and its echo in #63 and #64. The five wrong citations
(MINOR-1 to MINOR-5) are one-line edits. MINOR-11 and MINOR-12 are the two worth doing beyond that,
because an implementer meets both as a failing test rather than as a note. The graph, the FR coverage, the
evidence labelling, the scope boundary against epic #42, the refusal fencing, the static posture and the
placeholder discipline are sound as they stand.

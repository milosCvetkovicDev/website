# 0017. AI discoverability policy, and what is deliberately not built

## Status

Accepted

## Date

2026-09-12

## Context

A machine reading this repository cannot learn what the site's posture towards AI crawlers is, or
why. `apps/web/src/app/robots.ts` disallows `/_next/` and an `/api/` that does not exist, and nothing
records whether either was a decision. Nothing says whether training crawlers are welcome. Nothing
says why the site carries no `llms-full.txt`, no `FAQPage` markup and no
`/.well-known/ai-plugin.json`, so each absence reads as an oversight rather than a choice — and the
next well-meaning article about ranking in answer engines will offer to fix all three.

The research behind the `ai-discoverability-2026-09` epic is unusually one-sided, which is the reason
the record is worth more than the endpoints. Google states that no machine-readable file is needed:
"You don't need to create new machine readable files, AI text files, markup, or Markdown to appear in
Google Search", including its generative capabilities
([ai-optimization-guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide),
updated 2026-07-10). Ahrefs crawled 137,210 domains and found 97% of valid `llms.txt` files fetched
zero times in May 2026; of the fetches that did land, 77% came from SEO tooling and 1.1% from AI
retrieval bots ([llmstxt-study](https://ahrefs.com/blog/llmstxt-study/), 2026-06-15). A matched
difference-in-differences over 1,885 pages against roughly 4,000 controls measured, after JSON-LD was
added, AI Overviews −4.6%, AI Mode +2.2% and ChatGPT +2.2%
([schema-ai-citations](https://ahrefs.com/blog/schema-ai-citations), 2026-05-11) — three results
straddling zero.

What does read machine-readable output is developer tooling, not answer engines.
[acceptmarkdown.com/status](https://acceptmarkdown.com/status) (last updated 2026-06-22) records
Claude Code, Cursor, Copilot Chat, Copilot CLI, Microsoft Copilot and OpenCode sending
`Accept: text/markdown`, and Codex CLI following a `rel="alternate"` link, while ChatGPT browse, the
Claude.ai web app, Gemini and Perplexity fetched HTML only (each verified 2026-04-18).

The site is not invisible to a crawler that does not run JavaScript. A GPTBot-user-agent fetch of the
live home page on 2026-09-12 returned 200 with the whole scroll story in the prerendered HTML — about
5,156 characters of body text against 5,320 rendered — because [ADR
0009](0009-animation-performance-rules.md) imports the phases directly rather than deferring them.
The home page's 681 per-character spans are a hazard for _some_ extractors and not an absence of
content: Chrome's `innerText` and a tag-strip that joins with nothing both reassemble the sentence
they split, and only an extractor that inserts whitespace at tag boundaries mangles it. #47 removes
those spans. The premise that AI crawlers do not execute JavaScript rests on one primary measurement,
Vercel and MERJ's roughly 1.3 billion fetches
([the-rise-of-the-ai-crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler), 2024-12-17); no
vendor has documented rendering behaviour since, so that figure is 21 months old and this record
treats it as dated rather than current.

This record is written before the epic's measures land. At its date none of #55 to #62 has merged, so
nothing below asserts that an endpoint exists; the statements are decisions, in the sense
[docs/adr/README.md](README.md) gives that word — `Accepted` means the decision stands, not that it
is implemented, with [ADR 0005](0005-hosting-on-vercel.md) as the precedent (accepted 2026-09-08,
carried out 2026-09-09). Two boundaries follow from that. #48 owns `robots.txt`, the canonical URLs,
the security headers and the sitemap, so this record describes the file that task ships and adds no
rule to it. #59 owns the route-handler pattern and the `export const dynamic = 'force-static'` rule
that keeps generated endpoints static; that record is not this one.

## Decision

### 1. The crawler policy: one group, open to everything

`robots.txt` carries a single `*` group with `Allow: /`, plus a `Sitemap:` line, and nothing else.
There is no training opt-out — no `Google-Extended`, `GPTBot`, `ClaudeBot`, `CCBot` or
`Applebot-Extended` group — no per-bot `Allow` group, no `Content-Signal` line, no allowlist, no
`Crawl-delay` and no `Host:`. The file itself, and the removal of the `/api/` and `/_next/` disallow
rules that are in it today, belong to #48; the rules are not restated here.

**The trade-off, in the same breath as the openness.** Every mechanism that earns a citation is the
mechanism that feeds training. The two arrive over the same request from the same operator, and no
vendor documents a token that means "cite me but never train on me" which anyone honours. Cloudflare
measured the exchange rate as crawl-to-refer ratios of 38,065:1 for Anthropic, 1,091:1 for OpenAI,
195:1 for Perplexity, 40.7:1 for Microsoft and 5.4:1 for Google, with roughly 80% of AI bot activity
being training, 17% search and 3.2% user actions
([crawlers-click-ai-bots-training](https://blog.cloudflare.com/crawlers-click-ai-bots-training/),
2025-08-29). Those are the terms. The owner accepts them because this site is marketing for one
engineer, not a content business whose revenue depends on visits, and because being quoted by an
assistant is the outcome it is built for. The choice is revocable: a single group added to
`robots.ts` reverses it, and this record is superseded rather than edited when it is.

**What is documented, and what is only correlated.** These are not the same class of evidence and the
record keeps them apart.

- Blocking a **search** crawler verifiably costs that vendor's citations, because the vendor says so.
  OpenAI documents that a site opting out of OAI-SearchBot "will not be shown in ChatGPT search
  answers" ([developers.openai.com/api/docs/bots](https://developers.openai.com/api/docs/bots),
  fetched 2026-09-12).
- Blocking a **training** crawler is documented as costless for search and citations. Google states
  that Google-Extended "does not impact a site's inclusion in Google Search"
  ([google-common-crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers),
  2026-07-14); Apple documents the same separation for Applebot-Extended
  ([support.apple.com/en-us/119829](https://support.apple.com/en-us/119829), 2026-09-04), and
  DuckDuckGo likewise.
- The only measurement that exists points the other way and cannot say why. cloro compared 1,058
  domains and found a median 0.003 ChatGPT citations per Google ranking for GPTBot-blockers against
  0.417 for non-blockers ([cloro.dev/research/ai-crawler-blocks](https://cloro.dev/research/ai-crawler-blocks/),
  2026-07-06). It is correlational, and its authors say so in terms: "The data can't prove
  causation." Sites that block crawlers differ from sites that do not in every other way too. This
  record therefore does not claim that blocking a training crawler costs citations; it claims that
  the openness which earns them is the same openness that feeds training, which is a different and
  documented statement.

**Why one `*` group and not a per-bot list.** RFC 9309 (September 2022) makes a crawler obey the most
specific `User-agent` group that matches it, to the exclusion of `*`. A per-bot `Allow: /` group
would therefore silently exempt that bot from any `Disallow` a later maintainer adds to `*` — a
booby-trap that reads as generosity. `Crawl-delay` and `Host:` are not in RFC 9309 either;
`MetadataRoute.Robots` still exposes `host`, and emitting it adds a line no crawler reads
([rfc9309](https://www.rfc-editor.org/rfc/rfc9309.html)).

**Why the policy is not an access-control mechanism at all.** `robots.txt` is advice. OpenAI
documents that for ChatGPT-User "robots.txt rules may not apply", Perplexity documents that
Perplexity-User "generally ignores robots.txt rules", and `meta-externalfetcher` and Google's
user-triggered fetchers are documented as exempt on the same grounds. Anthropic is the lone outlier
claiming blanket compliance for all three of its bots
([support.claude.com article 8896518](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler),
2026-04-07), and TollBit's H1-2026 data puts AI-fetcher non-compliance at roughly 15% of European
sites that carry disallow rules. A policy whose enforcement is voluntary is a statement of intent,
which is the honest thing for it to be.

**One trap for whoever edits the file next.** The legacy tokens `anthropic-ai` and `Claude-Web`
appear in countless `robots.txt` files, `cloudflare.com/robots.txt` included, and in no current
Anthropic documentation. Do not add them: they name nothing, and copying them in is how the myth
survives.

### 2. What each measure of this epic is for

One row per measure, with the consumer it is built for and the strength of the evidence behind it.
The labels are the epic's six: `measured` (someone counted), `vendor-documented` (the operator states
the mechanism, not the outcome), `formal-standard` and `de-facto-standard` (the claim rests on a
published specification, or on ubiquity without one), `convention-only` (a practice with no
documented consumer) and `speculative` (a plausible effect nobody has measured). Where the honest
reason is that a measure demonstrates the owner's engineering, the row says that instead of inventing
a benefit.

| Measure                                          | Lands in | Who consumes it                                                                   | Evidence                                                          | What it is for, and what it does not buy                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gates and the measurement baseline           | #55      | CI, and the maintainer reading a build                                            | measured in this repository                                       | Lighthouse 13.4.1 scored `agentic-browsing` 1.0 with four of its six audits `notApplicable` and SEO 1.0 while every route lacked a canonical, so the score is not the signal and the gates have to be specific.                                                                                                                    |
| Real dates and `TechArticle` on the case studies | #56, #57 | Google Search, Bing, and any reader judging whether the work is current           | vendor-documented                                                 | `Article` is one of the 31 live features in Google's gallery (verified 2026-06-15) and Microsoft states freshness helps AI systems reference the current version (2026-02-10). That dates drive AI citation specifically is convention-only and is not asserted.                                                                   |
| `BreadcrumbList` and `ProfilePage` in the graph  | #57      | Google Search; a parser resolving who the site is about                           | vendor-documented mechanism, speculative as a citation lever      | The mechanism is documented (profile-page, 2026-09-08). The one matched study found AI Overviews −4.6%, AI Mode +2.2%, ChatGPT +2.2%, so no citation lift is claimed. No knowledge panel is promised: the gallery has no `Person` feature, and the 90-day `dateModified` rule SEO posts assert appears in no Google documentation. |
| Metric definitions with a scope and a window     | #56, #58 | A human reader, and any engine quoting a number                                   | measured, but academic                                            | The KDD 2024 GEO paper reports statistics +37% and cited sources +30% relative visibility in generative engines ([2311.09735](https://arxiv.org/abs/2311.09735)); direction supported, magnitude unknown for this site. A number without a scope is also simply not true.                                                          |
| Headings that name the subject, and real tables  | #58      | Every crawler and every extractor                                                 | vendor-documented, magnitude unmeasured                           | Google documents headings and Microsoft names tables (2026-02-10). Multiple `H1`s were never the problem here: each route already has exactly one.                                                                                                                                                                                 |
| Markdown twins for every route                   | #59      | Claude Code, Cursor, Copilot Chat and CLI, Microsoft Copilot, OpenCode, Codex CLI | measured consumption, measured non-consumption by answer engines  | The clients above send `Accept: text/markdown` or follow `rel="alternate"` (2026-06-22); the answer engines fetch HTML (verified 2026-04-18). Insurance against a whitespace-inserting extractor, and developer-tool ergonomics — not a visibility measure.                                                                        |
| `llms.txt`                                       | #60      | Coding agents pointed at it by a human                                            | measured non-consumption, vendor-documented publish-side adoption | 97% of valid files were fetched zero times in May 2026 across 137,210 domains. It ships for completeness and because a person can paste it into an agent, and for no other reason.                                                                                                                                                 |
| A static JSON representation of the site         | #60      | Any agent or script with a fetch tool                                             | de-facto-standard                                                 | The best effort-to-reach ratio in the epic: no protocol to adopt, no client to wait for. No citation claim.                                                                                                                                                                                                                        |
| An Atom feed for the blog                        | #61      | Feed readers, and aggregators that poll                                           | formal-standard (RFC 4287), with documented consumers             | A standard with real clients and zero evidence of any citation effect. It exists because a blog without a feed is a blog with a missing part.                                                                                                                                                                                      |
| A read-only MCP server at `/mcp`                 | #62      | An agent a human has configured to call it                                        | formal-standard protocol, speculative reach                       | Demonstration is the stated reason. Nothing discovers an MCP server automatically — server cards were still an open pull request (SEP-2127) on 2026-09-11 — and Anthropic's Connectors Directory submission needs a Team or Enterprise organisation. It shows the owner can build one.                                             |

### 3. Deliberately not built, with the source that kills each one

Eighteen mechanisms were considered and refused on the evidence. The nineteenth row is middleware,
which is refused by the static posture rather than by a missing consumer; it is in the table because
every assertion in `scripts/ai-refusals.test.mjs` must answer to a row here. `Source` is the primary
source that settles it, and `Date` is that source's own date where it has one, or the date it was
checked where it does not.

| Mechanism                                   | Why not                                                                                                                                                                                                                                                                                                                                                                                   | Source                                                                                                | Date       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| `llms-full.txt`                             | Not in the `llms.txt` specification or the AnswerDotAI repository at all, and the published ones have outgrown every context window — Cloudflare's 50.8 MB and Anthropic's 34.3 MB, measured on the date in this row, against roughly 12 KB of content source here, so #60's `llms.txt` is already the whole site. Mintlify replaced its own monolith with a hierarchy on 2026-09-01.     | [llmstxt.org](https://llmstxt.org/)                                                                   | 2026-09-12 |
| `FAQPage` markup                            | The FAQ rich result stopped appearing in May 2026 and Google deleted the documentation page on the date in this row. The site has no question-and-answer content to mark up either.                                                                                                                                                                                                       | [faqpage](https://developers.google.com/search/docs/appearance/structured-data/faqpage)               | 2026-06-15 |
| `HowTo` markup                              | Documentation removed 2023-09-14 and never restored; absent from the 31 live features in Google's gallery when it was verified on the date in this row. A portfolio has no procedure to describe.                                                                                                                                                                                         | [search-gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) | 2026-06-15 |
| `speakable`                                 | Still BETA after roughly seven years, restricted to US-English Google Home users and topical news queries. This site is neither news nor US-only.                                                                                                                                                                                                                                         | [speakable](https://developers.google.com/search/docs/appearance/structured-data/speakable)           | 2026-09-08 |
| `SearchAction` and the sitelinks search box | Deprecated on the date in this row and retired globally on 2024-11-21. The site also has no search to describe.                                                                                                                                                                                                                                                                           | [sitelinks-search-box](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)        | 2024-10-21 |
| `ai.txt`                                    | A 2023 Spawning proposal whose IETF incarnation, `draft-car-ai-txt-wellknown`, is an unadopted individual submission with no documented consumer. It also asks for the opt-out part 1 declines to make.                                                                                                                                                                                   | [draft-car-ai-txt-wellknown](https://datatracker.ietf.org/doc/draft-car-ai-txt-wellknown/)            | 2026-09-12 |
| TDMRep                                      | A W3C Community Group Final Report, explicitly not a Standard, whose only cited adopter is the spawning.ai API. Its function is an EU DSM Article 4 rights reservation, which part 1 does not make.                                                                                                                                                                                       | [CG-FINAL-tdmrep](https://www.w3.org/community/reports/tdmrep/CG-FINAL-tdmrep-20240202/)              | 2024-02-02 |
| Content-Signals in `robots.txt`             | John Mueller, on the date in this row: "none of the crawlers / llms use the content-signal robots.txt directives", and "It was made up by a CDN". `draft-romm-aipref-contentsignals-00` expired unadopted on 2026-04-04. Next 16.3.0's per-rule `other` field makes it a one-line change, so the refusal is about consumers, not cost.                                                    | [seroundtable 41631](https://www.seroundtable.com/google-cloudflare-content-signals-41631.html)       | 2026-07-06 |
| `/.well-known/ai-plugin.json`               | New plugin conversations were blocked on 2024-03-19 and all plugin chats shut down on 2024-04-09. OpenAI's 2026 plugin documentation never mentions the file, and the only well-known path OpenAI fetches is `/.well-known/openai-apps-challenge`, a one-time domain proof during directory submission.                                                                                   | [openai deprecations](https://platform.openai.com/docs/deprecations)                                  | 2026-09-12 |
| `agents.json`                               | Still 0.1.0 with no evidence of consumption, and a portfolio's interaction model is list-then-read, which #62's `tools/list` already covers.                                                                                                                                                                                                                                              | [wild-card-ai/agents-json](https://github.com/wild-card-ai/agents-json)                               | 2026-09-12 |
| JSON Resume (`cv.json`, `resume.json`)      | No documented consumer among Google, Bing, ChatGPT, Claude or Perplexity, and #60's JSON representation carries the same content for a wider audience.                                                                                                                                                                                                                                    | [jsonresume schema](https://jsonresume.org/schema/)                                                   | 2026-09-12 |
| WebMCP (`document.modelContext`)            | A non-Standards-Track Community Group draft in a Chrome origin trial, renamed twice in about four months (`window.agent`, then `navigator.modelContext`, now `document.modelContext`), with no mainstream agent consuming it. It would also light three Lighthouse `agentic-browsing` audits that are currently `notApplicable`, which looks like progress on a score that means nothing. | [webmcp draft](https://webmachinelearning.github.io/webmcp/)                                          | 2026-09-10 |
| `/.well-known/agent-skills/index.json`      | Publish-side adoption is real — Cloudflare, Stripe, X and every Mintlify site, verified on the date in this row — but consumption is a human typing `npx skills add <url>`: Anthropic closed the Claude Code auto-discovery request as not planned, and `vercel-labs/skills` issue 985 reports the index not being fetched.                                                               | [claude-code issue 61513](https://github.com/anthropics/claude-code/issues/61513)                     | 2026-09-12 |
| IndexNow                                    | The participant registry lists exactly seven endpoints — bing, yandex, seznam, naver, yep, internetarchive and amazonbot — none of them an AI vendor, and nine rarely-changing routes do not need a push protocol.                                                                                                                                                                        | [searchengines.json](https://www.indexnow.org/searchengines.json)                                     | 2026-09-12 |
| A self-created Wikidata item                | An item created for a non-notable person is deleted, and the attempt stays visible in the edit history. No Google documentation describes markup or Wikidata as a route into the Knowledge Graph. This is the one row no assertion can cover, because the act would happen off-site.                                                                                                      | [Wikidata:Notability](https://www.wikidata.org/wiki/Wikidata:Notability)                              | 2026-09-12 |
| A `robots.txt` allowlist                    | Honoured only by the compliant crawlers that were never the worry, while guaranteeing the exclusion of every operator nobody thought of; under RFC 9309 each per-bot group overrides `*` entirely, and the enforcing half would live in Vercel Firewall dashboard state that no code review sees.                                                                                         | [rfc9309](https://www.rfc-editor.org/rfc/rfc9309.html)                                                | 2026-09-12 |
| A nonce-based CSP                           | Next documents that a nonce disables static optimization and ISR and is incompatible with PPR, so it would turn all nine routes into request-time renders. #48 keeps the security headers in their `headers()` form.                                                                                                                                                                      | [content-security-policy](https://nextjs.org/docs/app/guides/content-security-policy)                 | 2026-03-20 |
| An `AGENTS.md` served at the web root       | A repository convention with no HTTP story, and imperative text by design, which is the shape of a prompt-injection surface. A git-tracked `AGENTS.md` at the repository root is repository hygiene, and is not this epic.                                                                                                                                                                | [agents.md](https://agents.md/)                                                                       | 2026-09-12 |
| Middleware (`middleware.ts`, `proxy.ts`)    | It runs on every matching request and ends the static posture the whole epic rests on. #59 negotiates `Accept: text/markdown` with a `beforeFiles` rewrite instead, which a probe confirmed keeps every page route static. Next 16 renamed the file to `proxy.ts`, so both names are refused.                                                                                             | [middleware](https://nextjs.org/docs/app/api-reference/file-conventions/middleware)                   | 2026-09-12 |

`scripts/ai-refusals.test.mjs` asserts that each of those artefacts is still absent and that every
row here still carries a source and a date. It runs under `pnpm test:scripts`, which is already a
step in the CI `quality` job, so it needs no workflow change. Its failure messages quote the row
rather than the path, so the next maintainer meets the evidence rather than a bare assertion.

### What would reverse any of this

A documented consumer. Not adoption by publishers, not a specification, not a vendor blog post about
a format — a statement from an operator that it reads the thing, or a measurement showing that it
does. That is precisely what none of the nineteen rows has, and it is the one fact that would move
any of them. Adding one is then a deliberate act: supersede this record under the rules in
[ADR 0012](0012-correcting-accepted-records.md), and delete the matching assertion in the same pull
request.

Two smaller triggers. If `cacheComponents` is ever enabled, `force-static` goes away and every
generated endpoint has to be revisited — #59's record owns that rule, and this one names the
dependency. And if the site ever becomes a content business rather than marketing for one engineer,
part 1's trade-off is the first thing to reopen.

## Consequences

### Positive

- The crawler policy is a decision with its cost written next to it, so the next maintainer inherits
  an argument rather than a file whose intent has to be guessed.
- Every measure states who consumes it. A measure that turns out to reach nobody can be removed
  without re-deriving why it was added.
- The refusals are enumerated, dated and sourced, so the next article recommending `ai.txt`,
  `llms-full.txt` or a `FAQPage` block meets a specific counter-source instead of a shrug.
- A refusal cannot be undone in silence. `pnpm test:scripts` fails when one of the artefacts
  reappears, and the message carries the row, so the undoing is at least informed.
- Nothing here claims a benefit its source does not support, which means the record can be read in a
  year without recalibrating for enthusiasm.

### Trade-offs

- The evidence dates. Several rows rest on a source that could be superseded next month, and this
  record has no mechanism that notices: the guard checks that the rows exist, not that they are still
  true. A source that changes is found by a person reading it.
- The guard is a string and path check. It fires on `FAQPage` appearing in a comment, and it misses a
  mechanism spelled in a way it does not know — a schema type assembled from string fragments, say. It
  makes the common regression loud, which is all it claims.
- Two rows are not fully mechanical. The Wikidata row has no assertion at all, because the act would
  happen on another site. The IndexNow row is checked by looking for a reference to the service, not
  for its key file, whose name is a value nobody can predict from here.
- Accepting a policy before the measures ship means the record and the repository can diverge. The
  answer is ADR 0012's mechanism, not an edit: the decision is not rewritten, it is superseded.
- Openness is accepted in full, including training, which is a real cost with a measured exchange
  rate of up to 38,065 crawls per referral. The owner takes it knowingly, and it stays revocable.
- Nineteen rows is a maintenance surface of its own. The alternative was zero rows and an absence
  that reads as an oversight, which is the state this record replaces.

## Alternatives considered

**Block the training crawlers and keep the search ones.** Google, Apple and DuckDuckGo all document
that their training tokens are separable from search, so this is technically available and costs
nothing they document. Rejected on two grounds. The separation exists for three operators and not for
the ones that matter most here: OpenAI documents OAI-SearchBot's opt-out as removing a site from
ChatGPT search answers, and there is no documented token that keeps Anthropic's citations while
refusing its training. And the shape of the decision is wrong for this site — it optimises against a
cost the owner has decided to accept, for a site whose whole purpose is being quoted.

**An allowlist: deny `*`, allow the named operators.** Rejected, and the reasons compound. It is
honoured only by crawlers that honour `robots.txt` at all, which are the ones that were never the
problem. It guarantees the exclusion of any operator nobody thought of, which in a market that adds a
crawler a month is a slow, silent narrowing. Under RFC 9309 each per-bot group overrides `*`
entirely, so the file's apparent default stops applying to exactly the bots it names. And the half
that would actually enforce anything lives in Vercel Firewall dashboard state, invisible to code
review and to this repository.

**Ship the fashionable files anyway, on the grounds that they are cheap.** `ai.txt`, `llms-full.txt`
and a `FAQPage` block are minutes of work each. Rejected because cheap is not the test — a file with
no consumer is a maintenance obligation, a second place for a fact to go stale, and a claim about the
site that is not true. `Content-Signals` is the clearest case: Next 16.3.0's per-rule `other` field
makes it one line, and it still buys nothing, which is why the refusal is recorded as being about
consumers rather than cost.

**A public `/ai-policy` page on the site.** Rejected as scope rather than on evidence: the refusals
are a repository decision aimed at whoever changes this repository, and a public page would be a
maintenance obligation that nothing reads. If the policy ever needs to be public, it is a link to
this record.

**Put the refusals in `CLAUDE.md` only.** Rejected. `CLAUDE.md` states current rules and is rewritten
freely as the repository changes; a decision with its evidence needs a record whose decision is never
edited and whose number is never reused. `CLAUDE.md` instead points at this record before any
AI-facing file is added, which is the division the two documents already have.

**A monthly answer-engine prompt-sampling runbook** — ten fixed prompts, checked by hand once a
month — as the proportionate substitute for a paid citation tracker. Available and sensible, and
deliberately not created as an obligation: nothing in CI can enforce a human's monthly habit, and #64
owns the one dated snapshot this epic actually commits to. Named here so the option is not lost, not
scheduled.

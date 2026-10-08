# 0035. A value only the owner can supply is a registered placeholder with a deadline the owner sets

## Status

Proposed

## Date

2026-09-29

## Context

Some of what the site states is known only to the owner: the window and method behind a case
study's headline figure, or what one of `/about`'s quick facts counts. Code that shows such a value
has to be able to merge before the owner has supplied it, without inventing the value and without
printing a half-filled sentence.

[#56](https://github.com/milosCvetkovicDev/website/issues/56) set out the convention for that: one
marker, a typed placeholder that the compiler makes every reader narrow, a helper for a gap inside a
drafted sentence, renderers that leave the gap out, a search of every served body, and a register
in which each unfilled field carries a deadline the owner chooses. The owner item of its checklist
said that the convention would be recorded by #63's ADR and its `CLAUDE.md` line.

[#155](https://github.com/milosCvetkovicDev/website/pull/155), merged on 2026-09-29 as 55fb8b9,
built it: `apps/web/src/data/owner-todo.ts`, the gate in its test, the served-output check in
`e2e/seo-surface.spec.ts`, and an Owner placeholders section in
[the app router and content rule](../../.claude/rules/app-router-and-content.md). It added no record
and no `CLAUDE.md` line. Its review bounded how far ahead a deadline may be, since a row expiring on
`9999-12-31` would switch the gate off for its field while looking like a deadline, and set
`MAX_EXPIRY_DAYS` to 366. The gate counts the UTC day, and the pull request put a local day to the
owner as a one-line change.

[#167](https://github.com/milosCvetkovicDev/website/pull/167), merged the same day as a0331e4,
registered the first rows: one `metricDefinition` per case study, each expiring on 2026-10-31, the
date the owner chose. [#244](https://github.com/milosCvetkovicDev/website/pull/244) added two rows
for `/about`'s quick facts, also expiring on 2026-10-31. On `main` at d0daec2 the register,
`apps/web/src/data/owner-todo.ts:79-105`, holds those five rows, `MAX_EXPIRY_DAYS` is declared at
`apps/web/src/data/owner-todo.ts:111`, and the test that a deadline ends at midnight UTC is at
`apps/web/src/data/__tests__/owner-todo.test.ts:237`. Unless each of those values is filled or its
date moved first, `pnpm test` turns red on every branch on 2026-10-31.

The owner's comment of 2026-09-30 on [#63](https://github.com/milosCvetkovicDev/website/issues/63)
asked for this record, since a contributor who meets that red test needs the record and not only a
rule file; a scoped rule is loaded only when a session reads a file in its area.
[ADR 0028](0028-blog-posts-as-typed-data.md) named the marker only to say that posts do not use it.
[ADR 0034](0034-blog-posts-drafted-with-claude.md), which superseded it, has posts drafted with
Claude and approved by the owner line by line, so the rule that an agent invents no owner value has
to say which values it covers.

## Decision

A value only the owner can supply is left as a registered placeholder, never invented, through the
one convention in [`apps/web/src/data/owner-todo.ts`](../../apps/web/src/data/owner-todo.ts).

1. **One marker, spelled once.** The marker is `OWNER-TODO`, exported as `OWNER_TODO`. No file under
   `apps/web/src` or `apps/web/public` other than `owner-todo.ts` spells it out; everything else
   reaches it through the constant or through `ownerTodo(hint)`. A typed placeholder is a union
   branch `{ state: typeof OWNER_TODO }`, so `pnpm typecheck` fails on code that reads the value
   without narrowing the union first. A gap in prose is `ownerTodo(hint)`, whose hint is plain words
   saying what the owner has to supply, and `ownerTodo` throws on a hint that a finding could not
   name the gap by. The `one spelling` test in `owner-todo.test.ts` fails on any other file under
   those two directories that contains the literal.
2. **A marker never reaches served output.** Whatever renders a field omits the whole sentence, row
   or block while its marker survives, rather than printing a half-filled one.
   `e2e/seo-surface.spec.ts` and `e2e/machine-readable.spec.ts` fail when a served body they check
   carries the marker.
3. **One register row per unfilled field.** `unfilledOwnerFields` holds a row for each field:
   `field`, named as the gate names it (`<source>.<path>` for a typed placeholder, and
   `<source>.<path>#<hint>` for each marker in a string); `why`, what the owner supplies and why no
   one else can; and `expires`, a `YYYY-MM-DD` day. A row goes in with the commit that leaves the
   placeholder and comes out with the commit that fills it. `findOwnerTodoProblems` is the gate, and
   the live test in `owner-todo.test.ts` runs it over every source in `OWNER_TODO_SOURCES` against
   the register. It fails on an unfilled field without a row, on a row that matches no unfilled
   field or repeats another, on a row with no `why`, and on an `expires` that is no deadline under
   decision 6. The same file fails on a module under `apps/web/src` that imports `owner-todo.ts`
   and is neither walked through `OWNER_TODO_SOURCES` nor named in `RENDERS_ONLY`.
4. **Only the owner sets a date.** Only the owner sets or moves an `expires`. For a register field,
   an agent leaves the marker in place, invents no value for it and never picks or moves its date.
   This covers the fields of `unfilledOwnerFields`; how posts are written is decided by ADR 0034,
   under which posts are drafted with Claude and approved by the owner.
5. **An expired row is red on every branch.** The live test reads the real clock, never a frozen
   one. From the day a row's `expires` is reached, `pnpm test` fails on every branch that carries
   the row, until the owner fills the value or moves the date in a pull request. That pull request
   is green on its own head.
6. **The deadline counts the UTC day.** A row fails from 00:00 UTC on its `expires` day, and an
   `expires` may be at most `MAX_EXPIRY_DAYS` days after the current UTC day. An `expires` that is
   missing, a placeholder or not a real day fails as well.

## Consequences

### Positive

- Code that shows an owner-only value merges before the value exists, once the owner has named a
  date. Until the value lands the page says less, never something invented.
- A placeholder is neither published nor forgotten without a test failing: the compiler refuses an
  unnarrowed read, the served-output searches refuse a leaked marker, and the register refuses an
  unregistered field and a passed deadline. Each finding names the field.
- A red `pnpm test` on a deadline has a record that says why it is red and what turns it green.

### Trade-offs

- When a deadline passes, every open pull request fails `pnpm test`, and with it CI's required
  `quality` job, whatever it changes, until the owner's pull request merges. Rows that share a day
  lapse together.
- No agent can turn the gate green on its own: the only ways out are the owner's value and the
  owner's date.
- A row lapses at 00:00 UTC on its date, whatever the time zone of the person or machine running
  the test.
- The `one spelling` test is an exact byte search. It catches the literal typed by hand, not a
  marker assembled from pieces, which only the served-output searches would catch.
- The served-output searches read what the e2e specs fetch. A marker that only a client component
  renders would sit in a JavaScript chunk they do not read. #155's review deferred a chunk search,
  since one would match the constant wherever a client module imports it. The backstop is that
  every module importing `owner-todo.ts` is walked by the gate or named in `RENDERS_ONLY` with a
  reason.
- Rows name array indices (`case-studies.0.metricDefinition`), so reordering a source fails the gate
  as a stale row and an unregistered field until the rows are renamed.

## Alternatives considered

- **A plain string type, such as `datePublished: string | 'OWNER-TODO'`.** Rejected in #56: the
  union collapses to `string`, so the compiler makes no reader handle the unfilled case.
- **A spelling per task**, such as the `[[owner: …]]` placeholders in #58's drafts. Rejected in
  #56: one marker lets one gate and one served-output search cover every task.
- **A text scan in `scripts/`, beside `check-allowbuilds-drift.mjs`.** Rejected in #56: a scan of
  the source would miss a marker composed at run time, such as a generated body, and would flag the
  one module that spells the literal. The Vitest gate walks the exported values and names
  `<source>.<path>`.
- **Freezing the clock in the live test, a warning window, or a separate job.** Rejected in #56
  and in #155's review: a frozen clock switches every deadline off, and a separate job would add a
  required check, which [ADR 0021](0021-squash-only-merges-and-required-checks.md) governs. The red
  test is the point, and the pull request that fills or moves a row is green on its own head.
- **No upper bound on `expires`.** Rejected in #155's review: a far-off date switches the gate off
  while looking like a deadline, hence `MAX_EXPIRY_DAYS`.
- **CODEOWNERS on the register**, so that only the owner could approve a date. Rejected in #155's
  review as redundant: the repository has a single owner, and no pull request merges without that
  owner's approval.
- **A local-day deadline.** Offered to the owner in #155 as a one-line change in `expiryProblem`
  and not taken: the UTC day does not depend on the time zone of the machine running the test.
- **Rows keyed by slug rather than by array index.** Rejected in #167's review: the index path is
  the form in which the gate names fields, so #167 added a guard that each case study's `why` names
  its current figure instead.
- **Staggered deadlines.** Raised in #167's review, since its three rows expire on one day, and
  rejected: the owner had chosen that day for all three.

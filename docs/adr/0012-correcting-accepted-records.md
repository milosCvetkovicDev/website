# 0012. Correcting factual errors in accepted records

## Status

Accepted

## Date

2026-09-10

## Context

[ADR 0001](0001-record-architecture-decisions.md) established these records and made accepted ones
immutable: "An accepted record is immutable. When a decision changes, a new record is written that
supersedes it." That protects the thing worth protecting. The reasoning that was true at the time,
including reasoning that turned out to be wrong, stays readable, and nobody quietly rewrites history
to look better than it was.

It leaves one case with no home: a record whose **decision is right** but whose **facts are wrong**.
Supersession is the only tool the rule offers and it is the wrong shape for this. A replacement
record that differs by a sentence forces a reader to follow a chain to learn nothing, and it costs
the index its clearest signal, because `Superseded` is how a reader is told a decision no longer
stands. The cheap way out is a silent edit, which is exactly what ADR 0001 forbids, or leaving the
error in place. The other routes are real but expensive, and are weighed under
**Alternatives considered** below.

This is not hypothetical. [ADR 0007](0007-dependency-build-scripts.md) was accepted on 2026-09-09
and an independent review of the merged commit showed two of its factual claims wrong within a day.
One offered a mitigation that cannot fire, in `### Trade-offs`; the other gave the wrong version
floor for a setting, inside an alternative the record explicitly rejects.

Neither claim is one a reader would act on directly: the decision selects `allowBuilds`, the three
packages are denied for the reasons given, and every install behaves as the record describes. The
damage is narrower and slower than "an agent will do the wrong thing tomorrow". A wrong figure in a
rejected alternative corrupts the next re-evaluation of that alternative, and a mitigation that
cannot fire leaves a risk documented as handled when it is not. That is worth fixing, and it is
worth fixing in a way that is cheaper than supersession and louder than an edit.

## Decision

This record supersedes [ADR 0001](0001-record-architecture-decisions.md) and restates the process.
What changed is the immutability rule: it now binds the decision rather than the file, and factual
corrections have a defined, visible mechanism. Everything else is carried over, and ADR 0001 remains
the fuller argument for why these records exist at all.

Architecturally significant decisions are recorded as numbered Markdown files in `docs/adr/`, in
Michael Nygard's original format, with a `Date` line and an `Alternatives considered` section added
so a record can be read against the commit history.

- Filenames are `NNNN-kebab-case-title.md`, numbered in the order the decisions are accepted. A
  number is allocated once and never reused, including by a record withdrawn before it is accepted.
- Every record uses the same headings: `# NNNN. Title`, `## Status`, `## Date`, `## Context`,
  `## Decision`, `## Consequences` (with `### Positive` and `### Trade-offs`, or `### Negative`),
  and `## Alternatives considered`, optionally followed by `## Corrections`.
- Status is one of `Proposed`, `Withdrawn`, `Accepted`, `Accepted (corrected YYYY-MM-DD)`,
  `Superseded by ADR-NNNN`, or `Superseded by ADR-NNNN (corrected YYYY-MM-DD)`. `Accepted` means the
  decision stands, not that it has been implemented. A `Withdrawn` record keeps its number and its
  row in the index.
- `docs/adr/README.md` indexes the records with their status, so a superseded, withdrawn or
  corrected record is visible as such before any file is opened. The status in the record and the
  status in the index must agree.

### The decision is immutable

`## Decision` is never edited after the record is accepted. When the decision changes, a new record
supersedes it: the new record names the record it replaces and says what changed, in its own
Context, and the old record's status line is updated to point at the replacement **and gains a
one-line pointer immediately beneath it** saying which rules no longer apply. A decision that is
dropped with nothing to replace it is superseded by the record that drops it.

A statement inside `## Decision` that is simply false is **annotated, never rewritten**: it gets a
`## Corrections` entry that quotes it and states what is true, and the decision text stays exactly
as accepted.

### Other sections may be corrected

`Context`, `Consequences` and `Alternatives considered` may be edited in place to fix a claim that
was **false about the world as it stood when the record was accepted**, whenever that is discovered.
A statement that was true then and has been overtaken since is never corrected; that is what
supersession, or a note in a later record, is for. A correction must satisfy all of these:

- It changes no part of `## Decision`, and does not change which option the decision selects or the
  conditions under which the decision would be revisited. If it does either, it is a new decision
  and the record is superseded instead.
- It removes or replaces a false statement and nothing else. A correction never adds guidance,
  obligations or recommendations that the record did not already carry. If the record needs to say
  something new, that is a new decision.
- The status line becomes `Accepted (corrected YYYY-MM-DD)`, carrying the date of the most recent
  correction, and the `Status` cell in the index is updated to match.
- A `## Corrections` section at the end of the record gains an entry that quotes the text as it
  stood, quotes or states what replaced it, says what was wrong, and cites the evidence that settles
  it: a URL, a commit, or a command and its output. Assertion by the same author who wrote the wrong
  claim is not evidence.
- Rewriting reasoning that was merely optimistic or incomplete is **not** a correction. Only a false
  statement qualifies. Rejected alternatives are never edited away or removed.

`## Corrections` is append-only. An entry is never edited or deleted; an error in a correction is
fixed by a further entry that quotes and withdraws the earlier one. Entries are ordered oldest
first, one `### YYYY-MM-DD` heading per correcting change, and a second correction on the same date
gets its own heading disambiguated with a letter (`### 2026-09-10b`), so that no correction is
invisible.

When it is unclear which side of the line a change falls on, supersede. The cost of an unnecessary
record is one file; the cost of an edited decision is that the history stops being trustworthy.

A decision is architecturally significant if reversing it later would touch several packages, change
how the repository is built, tested, formatted or deployed, or would surprise a reader who only sees
the resulting code. Choosing a component name or a Tailwind utility is not significant. Choosing
where formatting is configured, what fails CI, or where the site is hosted is.

The four kinds of working document under `docs/`, and the questions they answer, are unchanged from
ADR 0001 except for the ADR lifecycle:

| Directory or file        | Answers                                                 | Lifecycle                                                          |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/adr/`              | Why a standing decision was made, and what was rejected | Decision immutable; other sections correctable, dated and recorded |
| `docs/plans/*-design.md` | What one piece of work builds, and why                  | Approved before its plan is written; kept as history               |
| `docs/plans/*-plan.md`   | How that work is executed, task by task                 | Living while the work runs, then marked shipped                    |
| `docs/runbooks/`         | How to perform an operation                             | Updated whenever the procedure changes                             |

## Consequences

### Positive

- A record can be made true without pretending its decision changed, so `Superseded` keeps its one
  meaning: this decision no longer stands.
- The correction is visible in the status line, in the index, and in a dated entry that quotes both
  the text that was wrong and what replaced it, so nothing is lost and nothing is silent.
- The correction sits next to the claim it fixes, which is where a reader, or an agent loading the
  file as context, will actually encounter it.
- The immutability that mattered is stated precisely rather than weakened: the `Decision` section,
  not the file's byte content. A false claim inside a decision is annotated, so even there the
  original text survives.

### Trade-offs

- The line between "false when accepted" and "overtaken since" is a judgement, and the tempting
  cases sit on it. The rule's answer is to supersede when unsure, trading some sprawl for a history
  that can be trusted.
- A corrected record is no longer identical to what was reviewed in the pull request that accepted
  it. The `Corrections` entry, the index status and git history are the trace.
- Status now has six forms, and two of them have to be written into both the record and the index by
  hand. Nothing yet checks that they agree, and nothing in CI checks the links either. A script that
  parses each record's `## Status` and compares it with its index row would close that gap inside
  the existing `quality` job; it is the tracked follow-up to this record, not a claim of this one.
- Nothing mechanically detects that a record has become false. This adds a way to fix such a record
  once found; finding them is still the job of reviews and independent checks, which is how the two
  errors in ADR 0007 surfaced.

## Alternatives considered

**Keep ADR 0001's rule and supersede for errata.** What the rule literally requires today, and it
never loses history. Rejected because the cost is paid on every correction and falls on the reader:
a chain of near-identical records where only the last is current, and an index in which `Superseded`
stops distinguishing "this decision was replaced" from "a version number was wrong".

**Allow silent edits to accepted records.** Cheapest, and precisely what ADR 0001 was written to
prevent. Git history is the only trace, and for documentation nobody consults it. A record that can
change without saying so cannot be cited. Rejected.

**Add an `Amended by ADR-NNNN` status.** Keeps every file append-only and makes the amendment a
first-class record. Rejected for the same reason as supersession: a numbered file per correction,
and the truth assembled from two documents rather than one.

**Collect corrections in a single `docs/adr/ERRATA.md`.** One place to find everything known to be
wrong, and no accepted record is touched. Rejected because the correction ends up as far as possible
from the claim it corrects. A reader who opens ADR 0007, or an agent that loads it as context, sees
the wrong sentence and no reason to look anywhere else.

**Do nothing and accept that some records are wrong.** Rejected on the grounds ADR 0001 itself
gives: these files are loaded as context before code is changed, and a record trusted enough to be
loaded is trusted enough to mislead.

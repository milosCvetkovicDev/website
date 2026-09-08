# 0001. Record architecture decisions

## Status

Accepted

## Date

2026-09-08

## Context

This is a solo repository, and most of the work in it is done with AI assistance across sessions
that do not share memory. Each session starts from the files on disk plus whatever instructions it
is given. A decision reached by reasoning in one session leaves no trace unless it is written down,
so the next session cannot tell a deliberate choice from an accident and is free to undo it.

The cost of that is visible in the repository's own history. The review recorded in
[the repository hardening design](../plans/2026-09-08-repo-hardening-and-launch-design.md), dated
2026-09-08, found:

- `@repo/prettier-config` existed as a workspace package but no workspace referenced it. A reformat
  therefore ran with Prettier's defaults and rewrote 59 files against the intended style. The same
  is true of `@repo/eslint-config` and `@repo/typescript-config` today: neither is referenced by any
  workspace. Only the Prettier package has been wired up, in
  [ADR 0003](0003-formatting-and-linting-standards.md).
- `CLAUDE.md` documented `pnpm typecheck`, `pnpm lint:fix` and `pnpm clean`, none of which had a
  Turbo task behind them.
- Husky was installed and `prepare` ran it, but there were no hook scripts and no commitlint config,
  so the commit discipline the documentation claimed was never enforced.
- Five months of work sat uncommitted, mixing a pure reformat with real changes.

None of these were hard problems. They were decisions whose reasoning had evaporated. On a team the
substitute for that reasoning is the people who were in the room; here there is no room. Written
decision records are the substitute, and they have a second use that a team wiki does not: they are
plain files in the repository, so an agent can load them as context before it changes anything.

## Decision

Architecturally significant decisions are recorded as numbered Markdown files in `docs/adr/`, in
Michael Nygard's original format, with a `Date` line and an `Alternatives considered` section added
so a record can be read against the commit history. This record is task C2 of
[the documentation plan](../plans/2026-09-08-docs-and-deployment-plan.md).

- Filenames are `NNNN-kebab-case-title.md`, numbered in the order the decisions are accepted. This
  file is `0001`. A number is allocated once and never reused, including by a record withdrawn
  before it is accepted.
- Every record uses the same headings: `# NNNN. Title`, `## Status`, `## Date`, `## Context`,
  `## Decision`, `## Consequences` (with `### Positive` and `### Trade-offs`), and
  `## Alternatives considered`. A new record is started by copying an existing one and replacing the
  body outright, so that no record inherits another's context.
- Status is one of `Proposed`, `Accepted`, or `Superseded by ADR-NNNN`. `Accepted` means the
  decision stands, not that it has been implemented.
- An accepted record is immutable. When a decision changes, a new record is written that supersedes
  it and the old record's status line is updated to point at the replacement. The reasoning that was
  true at the time stays readable, including the reasoning that turned out to be wrong.
- A superseding record names the record it replaces, and says what changed, in its own Context. A
  decision that is dropped with nothing to replace it is superseded by the record that drops it.
- `docs/adr/README.md` indexes the records so a reader sees the whole set without opening each file.
  The index carries the status of every record, so a superseded one is visible as such before any
  file is opened.

A decision is architecturally significant if reversing it later would touch several packages, change
how the repository is built, tested, formatted or deployed, or would surprise a reader who only sees
the resulting code. Choosing a component name or a Tailwind utility is not significant. Choosing
where formatting is configured, what fails CI, or where the site is hosted is.

ADRs are one of four kinds of working document under `docs/`, and they answer different questions:

| Directory or file        | Answers                                                 | Lifecycle                                            |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| `docs/adr/`              | Why a standing decision was made, and what was rejected | Immutable once accepted; superseded, not edited      |
| `docs/plans/*-design.md` | What one piece of work builds, and why                  | Approved before its plan is written; kept as history |
| `docs/plans/*-plan.md`   | How that work is executed, task by task                 | Living while the work runs, then marked shipped      |
| `docs/runbooks/`         | How to perform an operation                             | Updated whenever the procedure changes               |

A design document and an ADR both record reasoning; the line between them is scope. A design's
decisions bind only the work it describes and lapse once that work ships. An ADR's decision binds
every later change until it is superseded. When a design makes a choice that later work must also
honour, promote it to an ADR and have the design cite it. A plan may cite an ADR for its reasoning,
and an ADR may cite the plan that carried it out, but neither replaces the other. A plan that has
shipped is history. An ADR is still binding.

## Consequences

### Positive

- A future session, human or agent, can read `docs/adr/` and know why the repository is shaped the
  way it is before changing it, instead of inferring intent from the code.
- Rejected options are recorded, so the same alternatives are not relitigated every few months.
- Superseded records make the direction of travel legible: what changed, when, and why.
- The records are ordinary files, versioned with the code they describe and reviewed in the same
  pull requests, so they cannot drift into a separate system that nobody updates.

### Trade-offs

- Every significant decision costs an extra file to write and review. Insignificant decisions must
  be kept out, or the set becomes noise and stops being read.
- Records can still go stale, since nothing mechanically checks that an ADR still matches the code.
  CI does not check the heading set or the links either. The immutability rule limits the damage but
  does not remove it; the discipline is to supersede rather than quietly diverge.
- Numbered files are awkward to reorder or merge. This is accepted, because stable numbers are what
  make cross-references such as `Superseded by ADR-0007` reliable.

## Alternatives considered

**No records.** The status quo before this change. It is free, and it is exactly what produced an
unreferenced shared config, documented commands that did not exist, and unenforced commit hooks.
Rejected.

**A single running decisions log.** One file, appended to over time. Cheaper to start, but it grows
into a document nobody reads to the end, cannot be linked to per decision, and offers no natural
place for the alternatives and consequences that are the useful half of a record. Rejected.

**GitHub issues with a `decision` label.** Keeps the discussion where the work happens, but the
reasoning then lives outside the clone. It is not available offline, not versioned with the code
that depends on it, and not loadable as context by a tool working on the checkout. Rejected.

**A wiki.** Same objection as issues, plus a separate edit history and no review step. For a solo
repository it adds a second place to look with nothing to keep it honest. Rejected.

**Tooling-backed records, such as `adr-tools` or `log4brains`.** A CLI that allocates the next
number, applies a template and regenerates the index, or a generator that publishes the set as a
site. That removes the two weaknesses conceded above: manual numbering and a hand-maintained index.
It adds a dependency and a build step to a set of six files, and neither tool checks the thing that
actually goes stale, which is whether a record still describes the code. Worth reconsidering past
roughly twenty records. Rejected for now.

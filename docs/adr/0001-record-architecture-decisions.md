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

The cost of that is visible in the repository's own history. A review on 2026-09-08 found:

- `@repo/prettier-config` existed as a workspace package but no workspace referenced it. A
  reformat therefore ran with Prettier's defaults and rewrote 59 files against the intended style.
- `CLAUDE.md` documented `pnpm typecheck`, `pnpm lint:fix` and `pnpm clean`, none of which had a
  Turbo task behind them.
- Husky was installed and `prepare` ran it, but there were no hook scripts and no commitlint
  config, so the commit discipline the documentation claimed was never enforced.
- Five months of work sat uncommitted, mixing a pure reformat with real changes.

None of these were hard problems. They were decisions whose reasoning had evaporated. On a team the
substitute for that reasoning is the people who were in the room; here there is no room. Written
decision records are the substitute, and they have a second use that a team wiki does not: they are
plain files in the repository, so an agent can load them as context before it changes anything.

## Decision

Architecturally significant decisions are recorded as numbered Markdown files in `docs/adr/`, in a
MADR-flavoured format.

- Filenames are `NNNN-kebab-case-title.md`, numbered in the order the decisions are accepted. This
  file is `0001`.
- Every record uses the same headings: `# NNNN. Title`, `## Status`, `## Date`, `## Context`,
  `## Decision`, `## Consequences` (with `### Positive` and `### Negative` or `### Trade-offs`),
  and `## Alternatives considered`.
- Status is one of `Proposed`, `Accepted`, or `Superseded by ADR-NNNN`.
- An accepted record is immutable. When a decision changes, a new record is written that supersedes
  it and the old record's status line is updated to point at the replacement. The reasoning that
  was true at the time stays readable, including the reasoning that turned out to be wrong.
- `docs/adr/README.md` indexes the records so a reader sees the whole set without opening each file.

A decision is architecturally significant if reversing it later would touch several packages,
change how the repository is built, tested, formatted or deployed, or would surprise a reader who
only sees the resulting code. Choosing a component name or a Tailwind utility is not significant.
Choosing where formatting is configured, what fails CI, or where the site is hosted is.

ADRs are one of three kinds of document in `docs/`, and they answer different questions:

| Directory        | Answers                                        | Lifecycle                                       |
| ---------------- | ---------------------------------------------- | ----------------------------------------------- |
| `docs/adr/`      | Why a decision was made, and what was rejected | Immutable once accepted; superseded, not edited |
| `docs/plans/`    | How a specific piece of work will be executed  | Living while the work runs, then marked shipped |
| `docs/runbooks/` | How to perform an operation                    | Updated whenever the procedure changes          |

A plan may cite an ADR for its reasoning, and an ADR may cite the plan that carried it out, but
neither replaces the other. A plan that has shipped is history. An ADR is still binding.

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
  The immutability rule limits the damage but does not remove it; the discipline is to supersede
  rather than quietly diverge.
- Numbered files are awkward to reorder or merge. This is accepted, because stable numbers are what
  make cross-references such as "superseded by ADR-0007" reliable.

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

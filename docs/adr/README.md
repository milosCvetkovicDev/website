# Architecture decision records

An architecture decision record (ADR) captures a single significant decision: the context that
forced it, the option chosen, and the consequences the repository now lives with. Add one when a
decision outlives the pull request that introduced it, such as the toolchain, the formatting and
linting standards, the CI gates, the hosting platform, or a cross-cutting implementation pattern
that other code is expected to follow. Files are named `NNNN-kebab-case-title.md` and numbered
sequentially from `0001`, and a number is never reused, even if the record it belongs to is later
superseded. A record is `Proposed` while the decision is still open and `Accepted` once the pull
request carrying it is ready to merge. To change a decision, add a new record and set the status of
the old one to `Superseded by ADR-NNNN`. There is no `Deprecated` status: a decision that is
dropped with nothing replacing it is superseded by the record that drops it. A record's
`## Decision` is never edited after it is accepted; its remaining sections may be corrected when
they state something that was false when the record was accepted, which sets the status to
`Accepted (corrected YYYY-MM-DD)` and adds a dated `## Corrections` entry quoting the text that was
wrong and what replaced it. A claim that was true then and has been overtaken since is not
corrected.

The process itself is a decision. [ADR 0012](0012-correcting-accepted-records.md) is the
authoritative statement of these rules, including the test for what counts as architecturally
significant and the line between correcting a record and superseding it. It supersedes [ADR
0001](0001-record-architecture-decisions.md), which remains the fuller argument for why these
records exist at all. Records here sit beside [docs/plans](../plans/README.md), which say how a
specific piece of work is executed, and [docs/runbooks](../runbooks/deploy.md), which say how to
perform an operation.

| ADR  | Title                                                                                                                       | Status                                    | Date       |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md)                                                      | Superseded by ADR-0012                    | 2026-09-08 |
| 0002 | [Monorepo toolchain and version pinning](0002-monorepo-toolchain.md)                                                        | Accepted                                  | 2026-09-08 |
| 0003 | [Formatting and linting standards](0003-formatting-and-linting-standards.md)                                                | Accepted                                  | 2026-09-08 |
| 0004 | [CI pipeline and quality gates](0004-ci-pipeline-and-quality-gates.md)                                                      | Accepted                                  | 2026-09-08 |
| 0005 | [Hosting on Vercel](0005-hosting-on-vercel.md)                                                                              | Accepted                                  | 2026-09-08 |
| 0006 | [Hydration-safe client state](0006-hydration-safe-client-state.md)                                                          | Accepted                                  | 2026-09-08 |
| 0007 | [Dependency build scripts stay disabled](0007-dependency-build-scripts.md)                                                  | Superseded by 0013 (corrected 2026-09-10) | 2026-09-09 |
| 0008 | [Accent colour roles](0008-accent-colour-roles.md)                                                                          | Superseded by 0011                        | 2026-09-09 |
| 0009 | [Animation performance rules for the home page](0009-animation-performance-rules.md)                                        | Accepted                                  | 2026-09-09 |
| 0010 | [Status colour tokens](0010-status-colour-tokens.md)                                                                        | Accepted                                  | 2026-09-09 |
| 0011 | [Colour roles, corrected for scoped surfaces and stacked tints](0011-colour-roles-on-scoped-surfaces.md)                    | Accepted                                  | 2026-09-10 |
| 0012 | [Correcting factual errors in accepted records](0012-correcting-accepted-records.md)                                        | Accepted                                  | 2026-09-10 |
| 0013 | [Dependency build scripts stay disabled, and the reviewed versions are enforced](0013-dependency-build-scripts-reviewed.md) | Accepted                                  | 2026-09-10 |
| 0014 | [Playwright starts the server it tests, on a port of its own](0014-playwright-owns-its-server.md)                           | Accepted                                  | 2026-09-10 |

`Accepted` means the decision stands, not that it is implemented. ADR 0005 records the hosting
choice; it was carried out on 2026-09-09 and the site is live, see
[docs/runbooks/deploy.md](../runbooks/deploy.md). The bodies of 0002 and 0005
still describe the state on 2026-09-08, when they were accepted. A record's decision is never
edited afterwards, and its other sections only to correct a claim that is untrue, which
[ADR 0007](0007-dependency-build-scripts.md) carries an example of.

## Writing a new ADR

1. Take the next unused number from the table above, checking open branches too, since two records
   must not claim the same number. Copy the record closest in shape to yours as the starting point,
   for example `cp docs/adr/0005-hosting-on-vercel.md docs/adr/0007-my-decision.md`.
2. Replace the body, keeping the heading set used by every record in this directory: an H1 of the
   form `# NNNN. Title`, then `## Status`, `## Date`, `## Context`, `## Decision`,
   `## Consequences` with `### Positive` and `### Trade-offs` (or `### Negative`) beneath it, and
   `## Alternatives considered`, optionally followed by `## Corrections`.
3. Under `## Status` write `Proposed` while the decision is still open, and change it to `Accepted`
   before the pull request merges. Under `## Date` write the day the decision is made, in
   `YYYY-MM-DD` form.
4. If the new record replaces an earlier one, change that record's `## Status` to
   `Superseded by ADR-NNNN`, add a one-line pointer beneath it saying which of its rules no longer
   apply, update the same record's `Status` cell in the table above to match, and leave the rest of
   its text untouched.
5. Add a row to the table above, linking the title to the new file.
6. To correct a factual error in a record that is already accepted, rather than to change its
   decision, follow [ADR 0012](0012-correcting-accepted-records.md): leave `## Decision` alone, add
   no guidance the record did not already carry, set the status to `Accepted (corrected YYYY-MM-DD)`
   in both the record and the table, and add a dated entry under `## Corrections` that quotes the
   text that was wrong, quotes what replaced it, and cites the evidence. `## Corrections` is
   append-only: an error in a correction is fixed by a further entry, never by editing one.
7. Check that the new record's link in the table resolves and that any link inside the record
   resolves, because nothing in CI checks links. Then run `pnpm format` and commit on a `docs/`
   branch with a `docs(adr): ...` message. The pre-commit hook runs lint-staged, which applies
   `prettier --write` to `*.md`, so a missed format is corrected before the commit lands.

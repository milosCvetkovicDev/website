# Architecture decision records

An architecture decision record (ADR) captures a single significant decision: the context that
forced it, the option chosen, and the consequences the repository now lives with. Add one when a
decision outlives the pull request that introduced it, such as the toolchain, the formatting and
linting standards, the CI gates, the hosting platform, or a cross-cutting implementation pattern
that other code is expected to follow. Files are named `NNNN-kebab-case-title.md` and numbered
sequentially from `0001`, and a number is never reused, even if the record it belongs to is later
superseded. A record is `Proposed` while the decision is still open and `Accepted` once the pull
request carrying it is ready to merge; after that it stays as written. To change a decision, add a
new record and set the status of the old one to `Superseded by ADR-NNNN`. There is no `Deprecated`
status: a decision that is dropped with nothing replacing it is superseded by the record that drops
it.

The process itself is a decision. [ADR 0001](0001-record-architecture-decisions.md) is the
authoritative statement of these rules, including the test for what counts as architecturally
significant. Records here sit beside [docs/plans](../plans/README.md), which say how a specific
piece of work is executed, and [docs/runbooks](../runbooks/deploy.md), which say how to perform an
operation.

| ADR  | Title                                                                                | Status   | Date       |
| ---- | ------------------------------------------------------------------------------------ | -------- | ---------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md)               | Accepted | 2026-09-08 |
| 0002 | [Monorepo toolchain and version pinning](0002-monorepo-toolchain.md)                 | Accepted | 2026-09-08 |
| 0003 | [Formatting and linting standards](0003-formatting-and-linting-standards.md)         | Accepted | 2026-09-08 |
| 0004 | [CI pipeline and quality gates](0004-ci-pipeline-and-quality-gates.md)               | Accepted | 2026-09-08 |
| 0005 | [Hosting on Vercel](0005-hosting-on-vercel.md)                                       | Accepted | 2026-09-08 |
| 0006 | [Hydration-safe client state](0006-hydration-safe-client-state.md)                   | Accepted | 2026-09-08 |
| 0008 | [Accent colour roles](0008-accent-colour-roles.md)                                   | Accepted | 2026-09-09 |
| 0009 | [Animation performance rules for the home page](0009-animation-performance-rules.md) | Accepted | 2026-09-09 |
| 0010 | [Status colour tokens](0010-status-colour-tokens.md)                                 | Accepted | 2026-09-09 |

`Accepted` means the decision stands, not that it is implemented. ADR 0005 records the hosting
choice; the site is not deployed and `miloscvetkovic.dev` still resolves to the Namecheap parking
page. The steps that would change that are in [docs/runbooks/deploy.md](../runbooks/deploy.md).

## Writing a new ADR

1. Take the next unused number from the table above, checking open branches too, since two records
   must not claim the same number. Copy the record closest in shape to yours as the starting point,
   for example `cp docs/adr/0005-hosting-on-vercel.md docs/adr/0007-my-decision.md`.
2. Replace the body, keeping the heading set used by every record in this directory: an H1 of the
   form `# NNNN. Title`, then `## Status`, `## Date`, `## Context`, `## Decision`,
   `## Consequences` with `### Positive` and `### Trade-offs` (or `### Negative`) beneath it, and
   `## Alternatives considered`.
3. Under `## Status` write `Proposed` while the decision is still open, and change it to `Accepted`
   before the pull request merges. Under `## Date` write the day the decision is made, in
   `YYYY-MM-DD` form.
4. If the new record replaces an earlier one, change that record's `## Status` to
   `Superseded by ADR-NNNN`, update the same record's `Status` cell in the table above to match,
   and leave the rest of its text untouched.
5. Add a row to the table above, linking the title to the new file.
6. Check that the new record's link in the table resolves and that any link inside the record
   resolves, because nothing in CI checks links. Then run `pnpm format` and commit on a `docs/`
   branch with a `docs(adr): ...` message. The pre-commit hook runs lint-staged, which applies
   `prettier --write` to `*.md`, so a missed format is corrected before the commit lands.

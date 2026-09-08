# Architecture decision records

An architecture decision record (ADR) captures a single significant decision: the context that
forced it, the option chosen, and the consequences the repository now lives with. Add one when a
decision outlives the pull request that introduced it, such as the toolchain, the formatting and
linting standards, the CI gates, the hosting platform, or a cross-cutting implementation pattern
that other code is expected to follow. Files are named `NNNN-kebab-title.md` and numbered
sequentially from `0001`, and a number is never reused, even if the record it belongs to is
withdrawn. A record is `Accepted` when it is merged and stays as written after that: to change a
decision, add a new record and set the status of the old one to `Superseded by NNNN`, or to
`Deprecated` when nothing replaces it.

| ADR  | Title                                                                        | Status   | Date       |
| ---- | ---------------------------------------------------------------------------- | -------- | ---------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md)       | Accepted | 2026-09-08 |
| 0002 | [Monorepo toolchain and version pinning](0002-monorepo-toolchain.md)         | Accepted | 2026-09-08 |
| 0003 | [Formatting and linting standards](0003-formatting-and-linting-standards.md) | Accepted | 2026-09-08 |
| 0004 | [CI pipeline and quality gates](0004-ci-pipeline-and-quality-gates.md)       | Accepted | 2026-09-08 |
| 0005 | [Hosting on Vercel](0005-hosting-on-vercel.md)                               | Accepted | 2026-09-08 |
| 0006 | [Hydration-safe client state](0006-hydration-safe-client-state.md)           | Accepted | 2026-09-08 |

## Writing a new ADR

1. Take the next unused number from the table above and copy an existing record as the template,
   for example
   `cp docs/adr/0001-record-architecture-decisions.md docs/adr/0007-my-decision.md`.
2. Replace the body, keeping the section order used by every record in this directory: Status,
   Date, Context, Decision, Consequences, Alternatives considered.
3. Set `Status: Accepted` and `Date` to the day the decision is made, in `YYYY-MM-DD` form.
4. If the new record replaces an earlier one, change that record's status to
   `Superseded by NNNN` and leave the rest of its text untouched.
5. Add a row to the table above, linking the title to the new file.
6. Run `pnpm format` and commit with a `docs(adr): ...` message. The pre-commit hook runs
   lint-staged, which applies `prettier --write` to `*.md`, so a missed format is corrected
   before the commit lands.

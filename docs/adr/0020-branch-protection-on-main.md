# 0020. `main` is protected, and the two required checks are CI job names

## Status

Superseded by ADR-0021

No longer applies: the protection table and both rules, now that three checks are required and
rebase merging is off. See [ADR 0021](0021-squash-only-merges-and-required-checks.md).

## Date

2026-09-12

## Context

[ADR 0004](0004-ci-pipeline-and-quality-gates.md) built the CI pipeline and closed with the
statement that "CI is not yet a merge gate". That was true on 2026-09-08. Branch protection was
switched on afterwards, during the launch recorded in
[the repo hardening design](../plans/2026-09-08-repo-hardening-and-launch-design.md) (open question
2, answered by the owner), and since then nothing in the repository has said what the protection
actually is. `docs/plans/README.md` notes in one clause that both CI checks are required, and
[docs/runbooks/deploy.md](../runbooks/deploy.md) says both jobs must be green before a merge, but
neither names the settings and neither is where a reader looks for a standing rule.

The gap is not cosmetic, because of how GitHub binds a required check. A required status check is
stored as a **context string**, and for a GitHub Actions job that string is the job's display name —
the `name:` value in the workflow, not the job's key. `.github/workflows/ci.yml` declares two jobs
whose display names are the two required contexts, character for character:

```
$ gh api repos/milosCvetkovicDev/website/branches/main/protection \
    --jq '.required_status_checks.contexts[]' | sort
End-to-end (Playwright against the production build)
Format, lint, typecheck, unit tests, build

$ grep -E '^    name: ' .github/workflows/ci.yml | sed 's/^    name: //' | sort
End-to-end (Playwright against the production build)
Format, lint, typecheck, unit tests, build
```

Renaming either job therefore does not rename the requirement. The old context stays required and
nothing ever reports it, so every pull request sits at "Expected — waiting for status to be
reported" forever, while the run that replaced it passes. The failure is silent at the point where
it is caused — editing a `name:` is an ordinary tidying edit — and it presents later as a repository
that cannot merge anything. Protection also has `enforce_admins` on, so the owner cannot merge past
it either.

Three settings beyond the checks also shape how work lands here, and all three are already assumed
by other documents: linear history is why nothing reaches `main` as a merge commit (landing each
pull request as a squash is the convention in `CLAUDE.md`; rebase merging is also enabled, so the
protection does not force it), required signatures are why a rewrite of history is not something a
contributor can simply push, and the strict up-to-date rule is why a parallel session has to bring
its branch up to date with `main`, by rebase or by merge, before its pull request can land.

## Decision

Record the protection on `main` here, as read back from the API on 2026-09-12, and treat this record
as the contract the workflow file has to keep.

| Setting                          | Value                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Required status checks           | `Format, lint, typecheck, unit tests, build` and `End-to-end (Playwright against the production build)`                             |
| Strict (branch up to date)       | Yes — a pull request must be up to date with the current `main`, by rebase or merge, before it can merge                            |
| Required signatures              | Yes — every commit on `main` is signed                                                                                              |
| Required linear history          | Yes — merge commits are refused; a pull request lands as a squash by the `CLAUDE.md` convention, and rebase merging is also enabled |
| Enforce for administrators       | Yes — the owner is subject to all of the above                                                                                      |
| Force pushes                     | Not allowed                                                                                                                         |
| Branch deletion                  | Not allowed                                                                                                                         |
| Required conversation resolution | Yes — open review threads block the merge                                                                                           |
| Required approving reviews       | 0, with stale reviews dismissed on a new push                                                                                       |

Two rules follow from it:

- **The two required contexts are the `name:` values of the two jobs in
  `.github/workflows/ci.yml`.** Changing a job's `name:` is therefore a protection change, not a
  cosmetic one. Either leave the names alone, or update the required contexts in the same change;
  doing only the first strands a required check that never reports and blocks every pull request
  until someone edits the protection settings. The check that the two agree is the pair of commands
  quoted in Context above, and their output must be identical. Each of the two `name:` lines carries
  a comment on the line above it saying it is a required-check name and pointing here. The comment
  sits on its own line rather than trailing the name, so that the `grep` above still prints the bare
  names.
- **This record is descriptive, not authoritative over the live setting.** Protection lives in
  GitHub, where only the owner can change it, so this record can go stale in a way a code-level
  decision cannot. When the two disagree, the API is what is true and this record is what needs a
  correction under [ADR 0012](0012-correcting-accepted-records.md).

[ADR 0004](0004-ci-pipeline-and-quality-gates.md) is **not** edited. Its "CI is not yet a merge
gate" was true when it was accepted and has been overtaken since, which ADR 0012 reserves for a
later record rather than a correction. This is that later record; 0004's decision about what the
pipeline runs still stands, and only its statement about enforcement is superseded, by the settings
above.

## Consequences

### Positive

- The one fact that makes a harmless-looking edit dangerous — that a required check is a display
  name — is written down where the rule it constrains is written down, instead of being rediscovered
  when the repository stops merging.
- A contributor or agent can tell before pushing why a merge will be refused: not up to date
  with `main`, an unsigned commit, an unresolved thread, or a red check.
- What the protection enforces is separated from what is only convention. Linear history refuses
  merge commits; landing each epic task as one squash-merged pull request is the `CLAUDE.md`
  convention, which the protection does not enforce because rebase merging is also enabled.
- ADR 0004 keeps its integrity. The enforcement claim is overtaken here in a new record, which is
  what ADR 0012 asks for, so 0004 still reads as what was decided on 2026-09-08.

### Trade-offs

- The table duplicates state that lives in GitHub, and nothing checks that the copy is current. The
  mitigation is weak by design: the commands are in the record so a reader can re-run them, and the
  record admits the API wins. A CI step that diffs the live protection against this table would need
  a token with `administration: read`, which the `quality` job deliberately does not have
  (`permissions: contents: read`).
- Required signatures mean a contributor without commit signing configured cannot push to `main`
  through any route, including a fix to this file. That is intended, and it is also what makes the
  history rewrite discussed under the CV removal impossible without a one-off lift of these
  settings.
- `required_approving_review_count` is 0, so the "a reviewer other than the author" rule in
  `CLAUDE.md` is a convention this protection does not enforce. Recording the 0 here makes the gap
  visible rather than implying a review gate that does not exist.

## Alternatives considered

**Correct ADR 0004 instead.** The tempting option, since 0004 is where a reader looks for the gates.
Rejected because ADR 0012:79-80 is explicit: a statement that was true when the record was accepted
and has been overtaken since is never corrected, only superseded or annotated by a later record. "CI
is not yet a merge gate" was accurate on 2026-09-08; correcting it would erase the fact that
enforcement came later and would make `Accepted (corrected …)` mean "the world moved on", which is
exactly the meaning ADR 0012 reserves for supersession.

**Record it in `CLAUDE.md` only.** A one-bullet statement there is cheaper and reaches an agent
about to change code, which is the audience most likely to rename a job. Rejected as insufficient on
its own: `CLAUDE.md` says what to do, not why, and a reader who wants to know whether the setting was
deliberate has nowhere to look. Both are done — the bullet is in `CLAUDE.md`'s Quality gates section
and points here — but the reasoning needs a record.

**Rename the CI jobs to short, stable keys** (`quality`, `e2e`) so that a display-name edit can never
strand a context. It removes the hazard at its root rather than documenting it. Rejected here only
because it is a change to `.github/workflows/ci.yml` plus a matching protection edit by the owner, in
that order, and getting the order wrong blocks every pull request in the repository — including the
one making the change. It is worth doing as its own piece of work, with the owner present, and this
record is what makes the ordering requirement legible.

**A `quality`-job step that diffs the live protection against this table.** The natural gate, and the
same shape as `pnpm check:allowbuilds`. Rejected for now: reading protection needs
`administration: read` on the token, so it would widen the workflow's permissions from
`contents: read` for a documentation check, and a fork pull request would not have the scope at all.

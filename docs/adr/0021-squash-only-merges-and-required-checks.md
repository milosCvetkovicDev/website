# 0021. Squash-only merges, and `main`'s three required checks are job names

## Status

Accepted

## Date

2026-09-13

## Context

[ADR 0020](0020-branch-protection-on-main.md) recorded the protection on `main` as the API returned
it on 2026-09-12 and made its table the contract the workflow files keep. Two of its statements were
true that day and are not true now:

- It named two required status checks, the two jobs in `.github/workflows/ci.yml`, and bound its
  rename rule to those two.
- It said rebase merging was enabled, so that the protection did not enforce the squash convention
  in `CLAUDE.md`.

Both changed on 2026-09-13, as owner actions. Pull request #72 added
`.github/workflows/commitlint.yml`, whose job `Commit messages` lints the pull request title, every
commit on the branch and each push to `main`. Under its acceptance criterion 6 it proposed three
repository settings: squash commits titled from the pull request with an empty message, rebase
merging switched off, and `Commit messages` added to the required checks. Its description records
the owner's answer, all three as proposed, to be applied once it had merged and the check's first
run on `main` was green. That run passed on b931b1c
([run 34746198309](https://github.com/milosCvetkovicDev/website/actions/runs/34746198309)), and read
back the same day the settings are:

```
$ gh api repos/milosCvetkovicDev/website \
    --jq '{allow_merge_commit, allow_rebase_merge, allow_squash_merge, squash_merge_commit_title, squash_merge_commit_message}'
{"allow_merge_commit":false,"allow_rebase_merge":false,"allow_squash_merge":true,"squash_merge_commit_message":"BLANK","squash_merge_commit_title":"PR_TITLE"}

$ gh api repos/milosCvetkovicDev/website/branches/main/protection \
    --jq '.required_status_checks.contexts[]' | sort
Commit messages
End-to-end (Playwright against the production build)
Format, lint, typecheck, unit tests, build
```

ADR 0020 cannot be corrected into agreement with this. Its second rule says that when the record and
the API disagree, the record "is what needs a correction under ADR 0012". But
[ADR 0012](0012-correcting-accepted-records.md) allows a correction only for a claim that was false
when the record was accepted, and says a statement that was true then and has been overtaken since
is never corrected. Both statements were true on 2026-09-12. ADR 0012 governs how records change, so
the change is recorded here and ADR 0020 is superseded.

It is superseded whole rather than row by row. The table is read as one contract, and leaving seven
rows in ADR 0020 while two rows and a rule move here would make a reader assemble the current
protection from two files. ADR 0012 rejected an `Amended by` status for exactly that cost. ADR 0020
was also the later record that overtook [ADR 0004](0004-ci-pipeline-and-quality-gates.md)'s "CI is
not yet a merge gate"; that role passes to this record with the rest of the table.

The hazard ADR 0020 was written to record is unchanged and now has three instances. A required check
is stored as a context string, which for a GitHub Actions job is its display name, the `name:` value
rather than the job key. Renaming any of the three jobs leaves the old context required with nothing
to report it, so every pull request waits on it indefinitely, the owner's included. ADR 0020's
Context remains the fuller account of that failure.

## Decision

Record the repository's merge settings and the protection on `main` here, as read back from the API
on 2026-09-13, and treat this record as the contract `.github/workflows/ci.yml` and
`.github/workflows/commitlint.yml` keep. It supersedes ADR 0020 in full; what ADR 0020 recorded and
has not changed is restated, so that these two tables alone are current.

Repository merge settings:

| Setting                                               | Value                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Merge commits (`allow_merge_commit`)                  | Off                                                                                                   |
| Rebase merging (`allow_rebase_merge`)                 | Off                                                                                                   |
| Squash merging (`allow_squash_merge`)                 | On, and the only merge method left                                                                    |
| Squash commit title (`squash_merge_commit_title`)     | `PR_TITLE`: the pull request title, to which GitHub appends ` (#NN)`, as every squash on `main` shows |
| Squash commit message (`squash_merge_commit_message`) | `BLANK`: the commit body starts empty                                                                 |

Protection on `main`:

| Setting                          | Value                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Required status checks           | `Format, lint, typecheck, unit tests, build`, `End-to-end (Playwright against the production build)` and `Commit messages` |
| Strict (branch up to date)       | Yes — a pull request must be up to date with the current `main`, by rebase or merge, before it can merge                   |
| Required signatures              | Yes — every commit on `main` is signed                                                                                     |
| Required linear history          | Yes — merge commits are refused; with merge commits and rebase merging also off, a pull request can only land as a squash  |
| Enforce for administrators       | Yes — the owner is subject to all of the above                                                                             |
| Force pushes                     | Not allowed                                                                                                                |
| Branch deletion                  | Not allowed                                                                                                                |
| Required conversation resolution | Yes — open review threads block the merge                                                                                  |
| Required approving reviews       | 0, with stale reviews dismissed on a new push                                                                              |

Three rules follow from it:

- **The three required contexts are the `name:` values of the jobs in `.github/workflows/ci.yml`
  and `.github/workflows/commitlint.yml`.** Changing any of those values is a protection change,
  not a cosmetic one: either leave the name alone, or have the owner update the required contexts in
  the same change. The check that the two agree is this pair of commands, whose output must be
  identical:

  ```
  $ gh api repos/milosCvetkovicDev/website/branches/main/protection \
      --jq '.required_status_checks.contexts[]' | sort
  $ grep -hE '^    name: ' .github/workflows/ci.yml .github/workflows/commitlint.yml \
      | sed 's/^    name: //' | sort
  ```

  The `grep` matches only lines indented exactly four spaces, which in these two files are the job
  names; step names and action inputs such as an artifact's `name:` sit deeper, under `steps:`.
  A job becomes required in the order #72 used: it merges and reports on `main` first, and only then
  is its context added, because a required context that no job reports blocks every pull request.

- **A pull request lands as a single squash commit, by setting rather than by convention.** Its
  subject defaults to the title that `Commit messages` linted on the pull request, plus ` (#NN)`,
  and its body defaults to empty. Both are defaults: the person merging can edit the title and type
  a body in the merge dialog, and a merge through the API can pass its own. The lint that runs on a
  push to `main` is the one that sees the commit as it actually landed.
- **This record is descriptive, not authoritative over the live settings.** They live in GitHub,
  where only the owner can change them. When they and this record disagree, the API is what is
  true. A setting changed after this record was accepted is recorded by a new record that
  supersedes this one; only a value that was already wrong on 2026-09-13 is corrected under ADR 0012.

## Consequences

### Positive

- The squash-only rule that `CLAUDE.md` and `README.md` state is now enforced by GitHub, so a
  contributor or agent can no longer land a pull request as a rebase of its branch commits.
- The commit on `main` defaults to exactly the title that was linted, so the pull request lint and
  the history agree unless someone edits the message while merging.
- The display-name hazard is written down for all three jobs, and the agreement check covers both
  workflow files in one command.
- The current protection is one record with one pair of tables, and the rule for recording the next
  settings change now agrees with ADR 0012 instead of pointing at a mechanism it forbids.

### Trade-offs

- The tables still duplicate state that lives in GitHub, and nothing checks that they are current.
  ADR 0020's reasoning stands: a CI step that diffs the live settings would need a token with
  `administration: read`, which the workflows deliberately do not have.
- A table of live settings is superseded whenever the owner changes one. ADR 0020 lasted a day. That
  is the price of ADR 0012 keeping `corrected` for claims that were wrong from the start, and it is
  paid in one file per change.
- The merge dialog can still put an unlinted title or body on `main`. The push lint reports it after
  it has landed, and because `main` is never rewritten, such a commit stays as accepted history.
- The comments above the two job names in `ci.yml` still cite ADR 0020, and the one above
  `commitlint.yml`'s job says branch protection binds its name without citing a record. Both remain
  accurate, since ADR 0020's status line points here; retargeting the citation is left to the next
  change to those workflow files rather than made in a documentation change.
- `required_approving_review_count` is still 0, so the rule in `CLAUDE.md` that someone other than
  the author reviews the diff remains a convention.

## Alternatives considered

**Correct ADR 0020, as its second rule says.** The cheapest change, and the one that record
prescribed for itself. Rejected because ADR 0012 governs corrections and rules this one out: both
statements were true on 2026-09-12, and correcting them would make `Accepted (corrected …)` mean
"the world moved on", the meaning ADR 0012 reserves for supersession.

**Supersede only the rows that changed.** A smaller record with precedent: ADR 0002 and ADR 0005 are
each superseded in part. Rejected because what they lost could be read alone, a pin table and a
single sentence. A protection table split by row cannot: the current settings would live in two
files, and ADR 0020 would keep an `Accepted`-looking contract for two checks beside a pointer saying
most of it still applies.

**Update `CLAUDE.md` only.** It reaches the agent about to rename a job. Rejected as insufficient, as
it was for ADR 0020: `CLAUDE.md` links to the record for the reasoning, and the record it links to
would still state a two-check contract with rebase merging enabled.

**Leave the settings out of the records and point at the API.** A record that never goes stale.
Rejected because the list of names has to sit next to the rule that makes renaming them dangerous;
without it, the rule tells a reader to compare against a list they have not been shown.

ADR 0020's other alternatives, renaming the jobs to short stable keys and a CI step that diffs the
live protection, are not argued again. Its reasons for deferring both still hold, with three jobs to
rename in order instead of two.

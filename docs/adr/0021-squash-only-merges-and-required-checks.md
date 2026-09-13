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

$ gh api repos/milosCvetkovicDev/website/branches/main/protection \
    --jq '{strict: .required_status_checks.strict, signatures: .required_signatures.enabled, linear_history: .required_linear_history.enabled, enforce_admins: .enforce_admins.enabled, force_pushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled, conversation_resolution: .required_conversation_resolution.enabled, approving_reviews: .required_pull_request_reviews.required_approving_review_count, dismiss_stale_reviews: .required_pull_request_reviews.dismiss_stale_reviews}'
{"approving_reviews":0,"conversation_resolution":true,"deletions":false,"dismiss_stale_reviews":true,"enforce_admins":true,"force_pushes":false,"linear_history":true,"signatures":true,"strict":true}

$ gh api repos/milosCvetkovicDev/website/rulesets
[]
```

No ruleset applies, so the classic protection above is all that governs `main`.

ADR 0020 cannot be corrected into agreement with this. Its second rule says that when the record and
the API disagree, the record "is what needs a correction under ADR 0012". But
[ADR 0012](0012-correcting-accepted-records.md) allows a correction only for a claim that was false
when the record was accepted, and says a statement that was true then and has been overtaken since
is never corrected. Both statements were true on 2026-09-12. ADR 0012 governs how records change, so
the change is recorded here and ADR 0020 is superseded.

Its whole decision is superseded, not just the rows that changed. The table is read as one contract,
and leaving seven rows in ADR 0020 while two rows and a rule move here would make a reader assemble
the current protection from two files. ADR 0012 rejected an `Amended by` status for exactly that
cost. ADR 0020's Context and Alternatives stay what they were, the reasoning of that record. ADR 0020
was also the later record that overtook [ADR 0004](0004-ci-pipeline-and-quality-gates.md)'s "CI is
not yet a merge gate"; that role passes to this record with the rest of the decision.

The hazard ADR 0020 was written to record is unchanged, now has three instances, and is wider than
a rename. A required check is stored as a context string, which for a GitHub Actions job is its
display name: the `name:` value, not the job key, while a matrix job or a call to a reusable
workflow reports under a longer name derived from it. The context is only satisfied if a job reports
under that exact name on every pull request, and GitHub's
[workflow syntax reference](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
says a workflow skipped by a branch filter, a path filter or a commit message leaves its checks
Pending and blocks a pull request that requires them. Anything that stops a required job reporting
under its name therefore blocks every pull request, the owner's included, and presents far from the
edit that caused it. ADR 0020's Context remains the fuller account of that failure.

## Decision

Record the repository's merge settings and the protection on `main` here, as read back from the API
on 2026-09-13, and treat this record as the contract `.github/workflows/ci.yml` and
`.github/workflows/commitlint.yml` keep. It supersedes ADR 0020's decision in full, its table and
both of its rules; what that decision recorded and has not changed is restated, so that these two
tables alone are current.

Repository merge settings:

| Setting                                               | Value                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Merge commits (`allow_merge_commit`)                  | Off                                                                                                            |
| Rebase merging (`allow_rebase_merge`)                 | Off                                                                                                            |
| Squash merging (`allow_squash_merge`)                 | On, and the only merge method left                                                                             |
| Squash commit title (`squash_merge_commit_title`)     | `PR_TITLE`: the pull request title, with the ` (#NN)` suffix every squash subject on `main` has carried so far |
| Squash commit message (`squash_merge_commit_message`) | `BLANK`: the commit body starts empty                                                                          |

Protection on `main`:

| Setting                          | Value                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required status checks           | `Format, lint, typecheck, unit tests, build`, `End-to-end (Playwright against the production build)` and `Commit messages`                                                                                                                                               |
| Strict (branch up to date)       | Yes — a pull request must be up to date with the current `main` before it can merge; bring it up to date with a signed local rebase or merge, because GitHub's rebase update rewrites the branch's commits without their signatures and the pull request is then blocked |
| Pull request required            | Yes — pull request reviews are configured, so changes reach `main` only through a pull request                                                                                                                                                                           |
| Required signatures              | Yes — a commit pushed to `main` must carry a verified signature; GitHub signs the squash commits it writes                                                                                                                                                               |
| Required linear history          | Yes — merge commits are refused; with merge commits and rebase merging also off, a pull request can only land as a squash                                                                                                                                                |
| Enforce for administrators       | Yes — the owner is subject to all of the above                                                                                                                                                                                                                           |
| Force pushes                     | Not allowed                                                                                                                                                                                                                                                              |
| Branch deletion                  | Not allowed                                                                                                                                                                                                                                                              |
| Required conversation resolution | Yes — open review threads block the merge                                                                                                                                                                                                                                |
| Required approving reviews       | 0, with stale reviews dismissed on a new push                                                                                                                                                                                                                            |

Three rules follow from it:

- **Each required context keeps reporting under its current name on every pull request.** The three
  contexts are the `name:` values of the jobs in `.github/workflows/ci.yml` and
  `.github/workflows/commitlint.yml`. Renaming one of those jobs, turning it into a matrix or a
  reusable-workflow call, dropping its `pull_request` trigger or adding a branch or path filter that
  can skip its workflow each strands a required check. Renaming or removing a required job therefore
  takes three steps, in order: the owner removes the old context, which leaves only the other checks
  enforced until the last step; the change merges and the job reports on `main` under its new name;
  the owner adds the new context. A new job becomes required from the second step, as
  `Commit messages` did in #72: it merges and reports first, and only then is its context added,
  because a required context that no job reports blocks every pull request.

  The check that the contexts and the job names agree exits 0 when they do. Reading protection needs
  a token with administration read access, which in practice means the owner's:

  ```
  $ diff <(gh api repos/milosCvetkovicDev/website/branches/main/protection \
        --jq '.required_status_checks.contexts[]' | sort) \
      <(grep -hE '^    name: ' .github/workflows/ci.yml .github/workflows/commitlint.yml \
        | sed 's/^    name: //' | sort)
  ```

  The `grep` matches only lines indented exactly four spaces, which in these two files are the job
  names; step names and action inputs such as an artifact's `name:` sit deeper, under `steps:`. The
  check holds only while every job in the two files is required and sets an unquoted `name:` with no
  trailing comment and no matrix. A job added to either file that is not meant to be required makes
  it fail, which is the moment that choice has to be made.

- **A pull request lands as a single squash commit, by setting rather than by convention.** Its
  subject defaults to the pull request title, and its body to empty. Every squash subject on `main`
  so far also carries a ` (#NN)` suffix, which no merge under `PR_TITLE` has yet confirmed or
  contradicted; with it, the subject on `main` is a few characters longer than the title `Commit messages` linted on
  the pull request, so a title close to the header length limit can pass there and fail on `main`.
  Both are defaults: the person merging can edit them in the merge dialog, `gh pr merge --subject`
  and `--body` override them, and a title edited just before merging can land before its re-lint has
  registered. The lint that runs on a push to `main` sees the commit as it actually landed, and
  because it runs after the merge it blocks nothing.
- **This record is descriptive, not authoritative over the live settings.** They live in GitHub,
  where only the owner can change them. When they and this record disagree, the API is what is
  true. A setting changed after this record was accepted is recorded by a new record that
  supersedes this one; only a value that was already wrong on 2026-09-13 is corrected under ADR 0012.

## Consequences

### Positive

- The squash-only rule that `CLAUDE.md` and `README.md` state is now enforced by GitHub, so a
  contributor or agent can no longer land a pull request as a rebase of its branch commits.
- The commit on `main` defaults to the linted title plus ` (#NN)`, so the pull request lint and the
  history agree unless someone overrides the message while merging or the suffix pushes the subject
  past the header length limit.
- The hazard is written down for all three jobs and for every way a job can stop reporting, with the
  order that renames one safely, and the agreement check covers both workflow files in one command.
- The current protection is one record with one pair of tables, and the rule for recording the next
  settings change now agrees with ADR 0012 instead of pointing at a mechanism it forbids.

### Trade-offs

- The tables still duplicate state that lives in GitHub, and nothing checks that they are current.
  ADR 0020's reasoning stands: a CI step that diffs the live settings would need a token with
  `administration: read`, which the workflows deliberately do not have. For the same reason only the
  owner can run the agreement check above.
- A table of live settings is superseded whenever the owner changes one. ADR 0020 lasted a day. That
  is the price of ADR 0012 keeping `corrected` for claims that were wrong from the start, and it is
  paid in one file per change.
- Renaming or removing a required job opens a window, between the owner removing its context and
  adding the new one, in which only the other checks are enforced.
- A merge can still put an unlinted title or body on `main`, and a title within a few characters of
  the header length limit fails only once suffixed. The push lint reports either after it has
  landed, and because `main` is never rewritten, such a commit stays as accepted history.
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
Rejected because the list of names has to sit next to the rule that makes changing those jobs
dangerous; without it, the rule tells a reader to compare against a list they have not been shown.

ADR 0020's other alternatives, renaming the jobs to short stable keys and a CI step that diffs the
live protection, are not argued again. Its reasons for deferring both still hold, with three jobs to
rename in order instead of two.

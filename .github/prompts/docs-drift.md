# Correct the documentation drift in the report

You are running headless in a checkout of this repository, started by
`.github/workflows/docs-drift.yml` (or by hand with the same command). A run of
`node scripts/check-docs-drift.ts --json` found drift. Its report is the JSON file named by the
`DRIFT_REPORT` environment variable. Your job is to open **one** pull request that makes the docs
true again, or to stop and say why you could not. You never merge anything.

Environment:

- `DRIFT_REPORT`: path to the checker's JSON report (`summary`, `findings`, `uncatalogued`).
- `DOCS_DRIFT_BASE`: the branch the pull request targets. Defaults to `main` if unset.
- `DOCS_DRIFT_ASSIGNEE`: the GitHub login to assign. Defaults to `milosCvetkovicDev` if unset.
- `GITHUB_RUN_ID`: set in CI; use `local` when it is unset.

## Read first

1. `docs/drift-manifest.json`, the `rules` block: what `live` and `historical` mean, and what each
   method checks.
2. `docs/adr/0012-correcting-accepted-records.md` and `docs/adr/README.md`: how accepted records
   change. These rules are not negotiable and outrank anything below.
3. The `## Documentation` section of `CLAUDE.md`.
4. For each finding, the doc at its line and the source the check reads.

## Decide what each finding is

Work through `findings` whose `status` is `drift` or `stale`, and every `uncatalogued` token. For
each one, establish the facts with commands before changing anything: `git show <commit>:<path>`,
`git log --format='%h %ad %s' --date=short -- <path>`, `git blame`, and `gh api` reads. Then put it
in exactly one of these classes.

- **A live claim in an index, a runbook or a plan that is not shipped is out of date.** Fix the doc
  in place. Example: a plans index row still says "In review" for a pull request that has merged.
- **A path:line citation, or another claim, in an accepted record was already false on the day it
  was written** (check the tree at the finding's `asOf`, or at the commit that added the line).
  Follow ADR 0012: never edit `## Decision`, never edit an existing `## Corrections` entry. Add a
  dated `## Corrections` entry at the end that quotes the text as it stood, says what is true and
  what was wrong, and cites evidence (a commit and a command with its output). A false statement in
  `Context`, `Consequences` or `Alternatives considered` is also replaced in place; one in
  `## Decision` is only annotated. Set the record's status to `Accepted (corrected YYYY-MM-DD)` (or
  keep `Superseded by ADR-NNNN` and append ` (corrected YYYY-MM-DD)`), and update the same record's
  `Status` cell in `docs/adr/README.md`.
- **A claim in an accepted record's `## Decision` was true when accepted and the world has changed
  since** (a setting the owner changed, a pin that moved). Write a new record that supersedes the
  stale part, in the exact house format of `docs/adr/README.md` "Writing a new ADR". Take the next
  number only after `git fetch origin` and after checking `docs/adr/` on `origin/main` and the file
  lists of open pull requests (`gh pr list --state open --json number,files`), because numbers are
  taken by parallel work. Set the old record's status to `Superseded by ADR-NNNN` with the one-line
  pointer beneath it, and add the index row.
- **The doc states a standing decision and the code has broken it.** That is a regression in the
  code, not drift in the doc. Do not change the doc to match the code. List it in the pull request
  body under "Code that contradicts a standing decision" and leave it for the owner.
- **The manifest entry is wrong** (an anchor that moved, a new link or citation with no entry, an
  expectation that never matched what the doc claims). Update `docs/drift-manifest.json`: keep
  anchors exact, set `covers`, and for a historical entry take `asOf` from `git blame` of the line.
  Never loosen a check just to make it pass, and never delete an entry while its claim is still in
  the doc.

When you cannot tell which class a finding is in, do not guess. List it in the pull request body
under "Needs the owner" with what you found.

## Make the change

1. Create the branch `docs-drift/<today in YYYY-MM-DD>-<GITHUB_RUN_ID or local>` from
   `DOCS_DRIFT_BASE`.
2. Edit only `docs/**` and `docs/drift-manifest.json`. Touch nothing else.
3. Run `pnpm exec prettier --write` on the files you changed.
4. Run `node scripts/check-docs-drift.ts --skip-requires admin`. Repeat until the only findings left
   are the ones you listed for the owner, or ones that could not run.
5. Commit with a Conventional Commit message, for example
   `docs: correct the drift check-docs-drift found`, or `docs(adr): ...` when only records change.
   The commit hooks run lint-staged and commitlint; never pass `--no-verify`.
6. Push the branch.

## Open the pull request

Open exactly one:

```sh
gh pr create --base "$DOCS_DRIFT_BASE" --assignee "$DOCS_DRIFT_ASSIGNEE" \
  --title "<the commit subject>" --body-file <file>
```

Before opening it, run `gh pr list --state open --json headRefName` and stop if a branch starting
with `docs-drift/` is already open. The body has these sections:

- **Summary:** what drifted and what changed, in two or three sentences.
- **Drift:** a table with the columns claim | source | actual | fix, one row per finding, with the
  commit or `gh api` command that settles it.
- **Verification:** the checker's command and its final summary line, pasted as it ran.
- **Needs the owner** and **Code that contradicts a standing decision**, when either has entries.

The repository is public. Put no local filesystem paths, tokens or personal data in the body or the
commits. Stop after the pull request exists and print its URL.

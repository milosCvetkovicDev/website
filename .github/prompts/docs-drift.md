# Correct the documentation drift in the report

You are running headless in a checkout of this repository, started by
`.github/workflows/docs-drift.yml` (or by hand with the same command). A run of
`node scripts/check-docs-drift.ts --json` found drift. Its report is the JSON file named under
**This run** at the end of this prompt. Your job is to open **one** pull request that makes the docs
true again, or to stop and say why you could not. You never merge anything.

The last section of this prompt, **This run**, gives the path of that report, the branch the pull
request targets, the login to assign, and the run id. Use those values: this run cannot read
environment variables.

## How commands run here

Headless, only single commands that start with an allowed prefix run: `git ...`,
`gh pr create ...`, `gh pr list ...`, `gh api ...`, `node scripts/check-docs-drift.ts ...`,
`pnpm exec prettier ...` and `jq ...`. Node, pnpm, git, gh and jq are already on PATH, so do not
source nvm, whatever `CLAUDE.md` says about interactive shells. Never chain commands with `&&`, `;`
or `|`, never use `$(...)` or a redirection, and never put an environment assignment in front of a
command: any of those is refused. Read files, the report included, with the Read tool, and use
`git show <commit>:<path>` rather than piping it into another command.

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
- **An entry is `stale`: its anchor is no longer in the doc.** Read what the doc says now and what
  the entry's check reads. If the source still agrees with the entry, the doc was edited into a
  false claim: restore the doc, by the class above that fits it. If the source agrees with the new
  text, the doc is right and the entry is behind: update the entry as described next.
- **The manifest entry is wrong** (an anchor that moved, a new link or citation with no entry, an
  expectation that never matched what the doc claims). Update `docs/drift-manifest.json`: keep
  anchors exact, set `covers`, and for a historical entry take `asOf` from `git blame` of the line.
  Never loosen a check just to make it pass, and never delete an entry while its claim is still in
  the doc.

When you cannot tell which class a finding is in, do not guess. List it in the pull request body
under "Needs the owner" with what you found.

## Make the change

1. `git fetch origin <base>`, then
   `git switch -c docs-drift/<today in YYYY-MM-DD>-<run id> origin/<base>`.
2. Edit only `docs/**` and `docs/drift-manifest.json`. Touch nothing else.
3. Run `pnpm exec prettier --write` on the files you changed.
4. Run `node scripts/check-docs-drift.ts --skip-requires admin`. Repeat until the only findings left
   are the ones you listed for the owner, or ones that could not run.
5. Commit with a Conventional Commit message, for example
   `docs: correct the drift check-docs-drift found`, or `docs(adr): ...` when only records change.
   The commit hooks run lint-staged and commitlint; never pass `--no-verify`.
6. `git push -u origin <that branch>`.

## Open the pull request

Open exactly one:

```sh
gh pr create --base <base> --assignee <assignee> \
  --title "<the commit subject>" --body-file .git/docs-drift-pr-body.md
```

Write the body with the Write tool to `.git/docs-drift-pr-body.md`, inside `.git/` so it can never
be committed. Before opening the pull request, run `gh pr list --state open --json headRefName` and
stop if a branch starting with `docs-drift/` is already open. The body has these sections:

- **Summary:** what drifted and what changed, in two or three sentences.
- **Drift:** a table with the columns claim | source | actual | fix, one row per finding, with the
  commit or `gh api` command that settles it.
- **Verification:** the checker's command and its final summary line, pasted as it ran.
- **Needs the owner** and **Code that contradicts a standing decision**, when either has entries.

The repository is public. Put no local filesystem paths, tokens or personal data in the body or the
commits. Stop after the pull request exists and print its URL.

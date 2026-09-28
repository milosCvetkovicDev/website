---
paths:
  - '.husky/**'
  - 'commitlint*.mjs'
  - '.github/workflows/commitlint.yml'
  - 'scripts/commitlint-config.test.mjs'
---

# Git hooks, lint-staged and commit-message linting

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Quality gates

- On commit: `.husky/pre-commit` runs `pnpm exec lint-staged`, `.husky/commit-msg` runs
  `pnpm exec commitlint --edit "$1"`. Both source `~/.nvm/nvm.sh` if pnpm is missing and abort with a
  message if it is still not on PATH.
- lint-staged has a config per package. The root one only runs `prettier --write`; `apps/web` and
  `apps/playground` run `eslint --fix --max-warnings 0` then `prettier --write` on TS/JS files.
- Commit messages are checked in CI as well as on commit, because the squash commit GitHub writes to
  `main` never passes through the local hook. `.github/workflows/commitlint.yml`, job
  `Commit messages`, lints three things. The pull request title, twice: as written and with the
  ` (#NN)` GitHub appends to the squash commit's subject (the suffix alone can break
  `header-max-length`, and it hides `subject-full-stop`). Every commit between the pull request's
  base and head, which still runs when the title fails, so one failure cannot hide another. And on a
  push to `main` every commit from the previous tip to the new one, or only the new tip when the
  push created the branch. That push lint is the only one to see a squash body typed in the merge
  dialog, which no pull request event carries. The title and the push lint use
  `commitlint.squash.config.mjs`, which sets `defaultIgnores: false`: commitlint otherwise skips,
  and passes, any message shaped like `revert …`, `Reapply …`, `fixup! …`, `Merge branch … into …`
  or a bare version, and its merge pattern matches a line anywhere in the body. Its one exception
  is a revert with nothing else in the message (no body beyond `git revert`'s own line and
  `Co-authored-by:` trailers): `Revert "<header>"` as GitHub's revert button and `git revert` write
  it, or `Reapply "<header>"`, nested or not, up to 1000 characters. `<header>` needs a type from
  `type-enum`, a subject that starts and ends with a non-space and does not start with a capital,
  no trailing full stop, no `"`, and at most `header-max-length` characters. That approximates the
  rules rather than linting the header (checked against the rules on a table of wrapped headers),
  and a revert with any other body is linted like any other message. Anything else, a revert of a
  non-conventional title included, is retitled as a conventional `revert: …` header. The branch
  commits and `.husky/commit-msg` keep `commitlint.config.mjs` with the default ignores, because
  `git commit --fixup`, `git merge` and GitHub's "Update branch" write those shapes. That split
  relies on squash being the only merge method, which the repository settings enforce, so that a
  squash merge discards the branch commits; were rebase merging turned on, the branch step would
  need the squash config too. `scripts/commitlint-config.test.mjs` pins both configs against the
  rules commitlint loads, the hook, and which workflow step uses which config. The workflow re-runs
  on every `edited` event, a body edit included, and has no
  job-level `if`: GitHub reports a job skipped by a condition as Success, which would satisfy a
  required check on a title nobody linted. Commits on `main` from before the check stay as accepted
  history, because `main` is never rewritten: 28 of them fail it, and the four since commitlint
  arrived in #3 (54b8b80, d7d058d, a8b4a91, 3e98c14) each fail `body-max-line-length`.

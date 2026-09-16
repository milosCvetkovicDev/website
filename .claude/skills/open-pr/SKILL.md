---
name: open-pr
description: Verify, commit, review and open a PR, then wait for green CI. Never merges.
---

Run every node or pnpm command after `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`.

1. **Scope the change.** Run `git status` and `git diff`. Other sessions share this checkout, so
   stage only the files this change touched, by path; never `git add -A`. Pick the Conventional
   Commit type (`feat`, `fix`, `docs`, `chore`, `test`, `ci`) and a short kebab-case slug.
2. **Branch.** On `main`, `git switch -c <type>/<slug>`: the branch prefix matches the commit type.
   On another branch, run `gh pr list --head <branch> --json number,url,baseRefName` first. If a PR
   exists, update it instead of opening a second one, and note its `baseRefName` (PRs may be
   stacked).
3. **Verify before committing.** Run every command in the Verification checklist of
   `.github/pull_request_template.md`, which lists the CI gates in order (`pnpm check:allowbuilds`,
   `pnpm test:scripts`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm build`), plus `pnpm --filter web test:e2e` when `apps/web` UI changed. Run heavy suites
   one at a time. Keep each command and its real output for the PR body. Stop on a
   failure: fix it, or report it; never skip or disable a test.
4. **Commit.** The title is `type(scope): subject`, header at most 100 characters including the
   ` (#NN)` GitHub appends to the squash commit. Main is squash-merged, so the PR title becomes the
   commit on `main` and is linted without commitlint's default ignores: title a revert
   `revert: <original title>` (GitHub's `Revert "<title>"` passes only when `<title>` is itself a
   conventional header and the message has no other body), and never `Merge …` or `fixup! …`.
   Let the hooks run; never `--no-verify`.
5. **Review.** Someone other than the author reads the diff: `ui-reviewer` for
   `apps/web/src/components`, otherwise a review agent that sees only the diff (for example a
   user-level `adversarial-reviewer`, when one is installed). Fix what is confirmed
   and record every finding as fixed, deferred with reason or rejected with reason.
6. **Open the PR.** `git push -u origin HEAD`. Write the body from
   `.github/pull_request_template.md` into the session scratchpad: Summary, Verification with the
   pasted commands and output from step 3, Review with the triage from step 5. Then
   `gh pr create --title "<title>" --body-file <file>` (with `--base` when stacked).
   On a 5xx or GraphQL "Something went wrong", check `gh pr list --head <branch>` before each
   retry, because the PR may have been created anyway. Retry at most 3 times, waiting 10, 30 and
   60 seconds. If the PR exists but the body did not land, set it over REST:
   `gh api -X PATCH repos/{owner}/{repo}/pulls/<N> -F body=@<file>`.
7. **Checkpoint now, not at the end.** Write `.agent-state/open-pr-<slug>.json` in the shape
   `scripts/agent-state.schema.json` defines: the branch in `artifacts.branches` with
   `pushed: true`, the PR number in `artifacts.prs`, the changed files in `artifacts.files`, the
   remaining steps as `plan_steps` with `current_step` and `next_action`, and the head SHA, PR URL
   and verification commands as the `note` of the steps already done. Run
   `scripts/agent-resume.sh open-pr-<slug>` to check it, and update it after each push and each
   check result.
8. **Wait for CI on the head commit.** `gh pr checks <N> --watch`, then confirm the result is for
   this push: `gh pr view <N> --json headRefOid,statusCheckRollup`, where `headRefOid` equals
   `git rev-parse HEAD`, every check run's `conclusion` is `SUCCESS`, `SKIPPED` or `NEUTRAL`, and
   every status context's `state` (Vercel's, which has no conclusion) is `SUCCESS`. `--watch`
   exits 0 on a run a later push superseded, so its exit code alone is not a pass.
   - "failed to be acquired (5 attempts)" is a runner failure: `gh run rerun <run-id> --failed`.
   - A real failure: fix it in a new commit, push, update the checkpoint and watch again. After
     three failed attempts, stop and present the situation.
   - Never `gh pr update-branch --rebase` (it strips the signatures `main` requires); rebase locally
     and `git push --force-with-lease`. Never force-push `main`.
9. **Report and stop.** Give the PR URL, the head SHA the checks passed on, and the review triage.
   Do not merge; squash-merging is the user's call.

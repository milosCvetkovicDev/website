# 0016. Dependabot branches never deploy, and commits that change nothing the site is built from never build

## Status

Accepted

## Date

2026-09-12

## Context

The Hobby plan allows
[100 deployments created per day](https://vercel.com/docs/limits#deployments-per-day-hobby), counted
in a rolling 86,400-second window across the whole account. On 2026-09-10 that ran out. About 119
deployments ran in the UTC day; 100 of them fell between 08:46:05Z and 15:52:12Z, split 81 preview
and 19 production, and 31 of those came from `dependabot/*` branches. The production builds of the
two merges that followed were refused with "Deployment rate limited - retry in 24 hours" — e8684cf at
15:56:34Z and 9189af4 at 16:01:30Z, both recorded as a `failure` on the `Vercel` commit status.
Vercel does not retry a refused deployment, and nothing in this project watches for the gap: no
analytics, no error monitoring, no uptime check. So the live site served 6e0a87a for over a day while
`main` was three commits ahead, and the keyboard and screen-reader fix for the story dots was merged
but not published.

Two classes of deployment spent that budget on output nobody reads.

The first is Dependabot. It opens up to five npm pull requests a week and every push to one of those
branches builds a preview. A reviewer of a version bump reads the CI result, not a preview URL:
`.github/workflows/ci.yml` already installs, lints, typechecks, unit-tests and builds `apps/web`, and
then runs the whole Playwright suite against that production build, including the console and
accessibility gates. The preview adds nothing and, at 31 deployments in one day, it was the single
largest consumer.

The second is commits that cannot change a single byte Vercel serves. Of 98 resolvable SHAs in that
window, 9 touched nothing under `apps/web/`, `packages/` or the root manifests and lockfile — runbook
edits, ADRs, epic task files, README changes. Three of them built with `>>> FULL TURBO`, which is
Turborepo reporting that it replayed a cached build and produced the identical output. Vercel's own
monorepo skipping does not catch these: it treats a change outside the workspace definition as a
[global change](https://vercel.com/docs/monorepos#skipping-unaffected-projects) and deploys every
project, and `docs/`, `.claude/`, `.github/` and `README.md` are all outside it.

Two Vercel mechanisms exist, and they are not interchangeable.

- **`git.deploymentEnabled`** in a configuration file
  ([docs](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled))
  takes an object of minimatch branch patterns to booleans and stops a push to a matching branch
  triggering a deployment **at all**. Nothing is created, so nothing is counted.
- **The Ignored Build Step** runs a command once the deployment has already been created and is in
  the `BUILDING` state. Exit 1 and the build continues; exit 0 and it is "immediately aborted, and
  the deployment state is set to `CANCELED`". Vercel is explicit about what that does not save:
  "Canceled builds are counted as full deployments as they execute a build command in the build step.
  This means that any canceled builds initiated using the ignore build step will still count towards
  your deployment quotas and concurrent build slots"
  ([docs](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step)).

So the mechanism that fixes the quota is the first one, and it can only match branch names. The
second one cannot fix the quota at all; what it saves is the build itself — the minutes, the single
Hobby concurrent build slot, and the risk that a queued docs build delays a real one. Both are worth
having, for different reasons, and neither substitutes for the other.

The owner approved an Ignored Build Step for Dependabot and docs-only changes on 2026-09-11, before
the counting rule above was established. This record is the reason the Dependabot half is not
implemented that way.

[ADR 0005](0005-hosting-on-vercel.md) decided that "No `vercel.json` is added", on the grounds that
the framework preset already supplies the build and output settings and that a file restating
defaults is another thing to keep in step with Next.js. `git.deploymentEnabled` is not a default
being restated and has no dashboard equivalent, so that decision has to give way. An accepted
`## Decision` is never edited ([ADR 0012](0012-correcting-accepted-records.md)), which is why this is
a new number rather than a correction to 0005.

## Decision

Add `apps/web/vercel.json` — read from the project's Root Directory, which is where Vercel looks for
it — carrying both mechanisms:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": {
      "dependabot/*": false,
      "dependabot/**": false
    }
  },
  "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs"
}
```

The `../../` hop is deliberate and is safe here for a reason that does not apply elsewhere in this
repository: Vercel documents that the Ignored Build Step "is executed within the
[Root Directory](https://vercel.com/docs/builds/configure-a-build#root-directory)", which is
`apps/web`, so the hop is a fixed two levels rather than a guess. It also avoids depending on the
command being passed through a shell, which a `$(git rev-parse --show-toplevel)` form would. The
script does **not** extend that assumption to its own git calls: it resolves the repository root with
`git rev-parse --show-toplevel` before diffing, so a future Root Directory change breaks the
invocation loudly (node cannot find the file, exits non-zero, the build runs) rather than making the
diff silently read the wrong tree.

This supersedes ADR 0005's "No `vercel.json` is added" and nothing else in that record. The rest of
0005 stands: one project, Root Directory `apps/web`, the Next.js preset, `pnpm install
--frozen-lockfile`, production from `main`, the apex primary, DNS at Namecheap, and response headers
belonging in `headers()` in `next.config.ts` rather than here. This file carries Git and build-step
configuration only, and a later header requirement does not reopen that.

**No push to a Dependabot branch creates a deployment.** Dependabot pull requests are verified by CI
and have no preview URL. To look at one in a browser, push the same tree under another branch name.
Both `dependabot/*` and `dependabot/**` are listed: Dependabot's real branch names have two or three
segments (`dependabot/npm_and_yarn/vitejs/plugin-react-6.1.1`), and listing both patterns means the
rule holds whether or not the matcher lets `*` cross a slash. Vercel resolves a branch that matches
several rules by building if any of them is `true`, so two `false` entries cannot conflict.

**A build is skipped when the commit changes nothing the site is built from.** The decision lives in
`scripts/vercel-ignore-build.mjs`, not in dashboard state: the build-input set is the
`BUILD_INPUT_DIRECTORIES` and `BUILD_INPUT_FILES` constants at the top of that file, and this record
deliberately does not restate them, so there is one place to change when they change. Its tests are
`scripts/vercel-ignore-build.test.mjs`, run by `pnpm test:scripts` in the `quality` CI job.

**The exit code is inverted relative to every other gate in this repository: `0` skips the build,
`1` builds it.** That is Vercel's contract, quoted above. It is stated in the script's header
comment, asserted by a test, and repeated here because a reader who assumes the usual convention
inverts the whole policy.

**The script never skips because it could not see.** It exits 1 — build — when the base SHA is
unset, is not an object name, is absent from Vercel's shallow clone, when the diff command fails,
when the diff is empty, and when `VERCEL_ENV` is anything other than `preview` or `production`. A
wrong skip is a merge that silently never ships, which is the failure this record exists to prevent;
a wrong build costs one deployment out of 100.

**Production always builds by default.** Only a `preview` deployment may be skipped on a docs-only
diff, so the newest production deployment's commit stays equal to `main`'s HEAD and that equality
remains a usable health check. Skipping production docs-only merges as well is available, and is what
the owner's 2026-09-11 note approved, but it is switched on deliberately by setting
`VERCEL_SKIP_DOCS_ONLY_PRODUCTION=1` in the project's **Production** environment rather than being
the default. Turning it on means the production SHA can legitimately lag `main`;
[docs/runbooks/deploy.md](../runbooks/deploy.md) carries the `git diff --quiet` command that tells a
deliberate skip from a lost deployment.

`.vercelignore` stays, and its header now says that Git-triggered builds read it too, which they
demonstrably do.

## Consequences

### Positive

- The largest consumer of the quota is removed outright, at zero cost: a `dependabot/**` push creates
  no deployment, so it cannot be counted, queued or cancelled.
- The skip policy is tracked, reviewed and tested like any other code. A dashboard-only Ignored Build
  Step is invisible in a diff, has no tests, and is lost if the project is recreated; `pnpm
test:scripts` fails on a regression in this one.
- Documentation-only pull requests stop occupying the single Hobby concurrent build slot, so a real
  build no longer queues behind a runbook edit.
- The `Vercel` commit status on `main`'s HEAD remains a true statement about the live site, because
  production still builds every merge unless the opt-in is set.

### Trade-offs

- A Dependabot pull request has no preview URL. For a dependency bump the CI build and the Playwright
  suite are the evidence, but a bump that changes rendering (a Tailwind or GSAP major) is worth
  looking at, and that now needs the branch pushed under another name.
- A build cancelled by the Ignored Build Step still counts as a deployment, so the docs-only half of
  this policy does not reduce the daily count at all. It is easy to misread the policy as fixing more
  than it does; the runbook's rate-limit row says so in the place an operator will be reading.
- A skipped build reports on the commit as cancelled. If the `Vercel` context were ever made a
  required status check on `main` or on pull requests, every docs-only change would block on a check
  that never arrives.
- One more file to keep in step with Vercel. `git.deploymentEnabled` matching is minimatch, so a
  future branch namespace that should not deploy has to be added here, and a Dependabot branch naming
  change would silently stop matching. The script's `dependabot/` namespace check is the backstop
  for that: it cannot save the deployment, but it does stop the build.
- The build-input list is a judgement, not a derivation. It says `apps/web/` and `packages/` but not
  `apps/playground/`, on the grounds that the playground is not deployed and its dependency changes
  reach `pnpm-lock.yaml` anyway. A future package that `apps/web` reads from outside those two
  directories would have to be added, and forgetting would skip a build that mattered.

## Alternatives considered

- **The Ignored Build Step alone, for both classes.** What the owner approved on 2026-09-11, and what
  this record replaces for the Dependabot half. Rejected on Vercel's own statement that a cancelled
  build counts as a full deployment: it would have left the quota exactly where it was on 2026-09-10
  and the outage would recur, with the deployments merely ending in `CANCELED` instead of `READY`.
- **Vercel's built-in monorepo skipping** (the **Skip deployment** switch under Root Directory).
  Better than the Ignored Build Step where it applies, because it occupies no build slot. Rejected as
  insufficient, not wrong: it decides from the workspace dependency graph, and a change to `docs/`,
  `.claude/` or `README.md` is outside the workspace definition and therefore a global change that
  deploys everything. It is also GitHub-only and cannot be told about a policy like "never deploy
  Dependabot". Leave it at its default; it and this record do not conflict.
- **Turning off the Vercel Git integration for Dependabot by narrowing the GitHub App's branch
  access.** No such setting exists at branch granularity; the App is installed per repository.
- **Pausing the project or deploying only from a GitHub Actions workflow.** Moves every deployment
  behind CI and would give exact control, but it replaces a working push-to-deploy integration with a
  workflow holding a production Vercel token, and the token becomes the thing to protect. Out of
  proportion to a quota problem caused by two identifiable classes of push.
- **Upgrading to Pro** (6,000 deployments a day). Solves the quota with money and solves none of the
  waste; the site is a personal portfolio that sells nothing, which is also why Hobby's terms fit it
  ([ADR 0005](0005-hosting-on-vercel.md)). Worth reopening only if the deployment budget becomes
  tight for work that matters.
- **Correcting ADR 0005 instead of superseding its `vercel.json` line.** Forbidden by
  [ADR 0012](0012-correcting-accepted-records.md): a correction fixes a claim that was false when the
  record was accepted, and 0005's reasoning was sound for the settings it was about. This is a
  changed decision, so it takes a number.

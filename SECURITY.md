# Security policy

## What this repository is

A personal portfolio site: a fully prerendered Next.js application deployed on Vercel, plus the
monorepo tooling around it. It has no accounts, no authentication, no database, no route handlers of
its own, no forms that submit anywhere, and it collects no visitor data. Its only runtime input is
the `NEXT_PUBLIC_SITE_URL` environment variable, which is a public origin. There are no secrets in
the repository and none in the deployed output.

That narrows what a vulnerability here can be. The realistic cases are a supply-chain problem in a
dependency, a misconfiguration that affects the served site (response headers, redirects, caching),
or something in the repository's own automation — a workflow, a git hook, or one of the scripts under
`scripts/`.

## Reporting a vulnerability

**Please do not open a public issue for anything exploitable.**

Use GitHub's private vulnerability reporting on this repository: the **Security** tab, then **Report
a vulnerability**. It opens a private advisory that only the maintainer can see, and it is the
preferred route because it keeps the report confidential while it is being fixed.

If private reporting is not available to you, open a regular issue that says only that you have
found a security problem and asks for a private channel. Do not include the details in it.

For anything that is not exploitable — an outdated dependency with no reachable impact here, a
missing hardening header, a documentation error — a normal issue or pull request is fine and
welcome.

## What to expect

This is one person's side project, not a funded product, so there is no paid bounty and no
guaranteed response time. In practice: an acknowledgement when the report is read, an assessment of
whether it affects the deployed site or only the repository, and a fix on `main` — which deploys
automatically — for anything that does. You will be credited in the advisory unless you ask
otherwise.

## Supported versions

Only the current `main` branch and the deployment it produces. There are no releases, no tags and no
backports; the live site is always the head of `main`.

## Scope

In scope:

- The deployed site at `https://miloscvetkovic.dev`.
- This repository: application code under `apps/`, the workspace packages under `packages/`, the
  gate scripts under `scripts/`, the GitHub Actions workflows, and the git hooks.

Out of scope:

- Reports generated wholesale by a scanner with no analysis of whether the finding is reachable in a
  static site that has no server-side request handling.
- Missing response headers on their own. The site ships with the platform defaults and adds none of
  its own, deliberately and on the record; see
  [ADR 0005](docs/adr/0005-hosting-on-vercel.md). A report that shows an actual impact is in scope,
  a header checklist is not.
- Vercel's own platform and infrastructure. Report those to Vercel.
- Denial of service through volume, and anything requiring physical or local access to the
  maintainer's machine.

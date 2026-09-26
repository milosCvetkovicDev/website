# 0026. Vercel Web Analytics loads in Vercel deployments only

## Status

Accepted

## Date

2026-09-26

## Context

Web Analytics has been enabled on the Vercel project since 2026-09-09, and
`https://miloscvetkovic.dev/_vercel/insights/script.js` answers `200`, but the site never loaded
that script, so the project's Analytics page had no data. The deploy runbook recorded the half-on
state under **Not covered** and named the two ways out: turn the toggle off, or mount the tracker.
The owner asked for the tracker.

Three things constrain how it is mounted:

- The Content-Security-Policy (ADR 0023) allows this origin only. In a production build the
  `@vercel/analytics` package loads `/_vercel/insights/script.js` and sends its page views to
  `/_vercel/insights/*`, both same-origin, so `'self'` covers them. Under `NODE_ENV` `development`
  or `test` it loads `https://va.vercel-scripts.com/v1/script.debug.js` instead, which the CSP
  refuses.
- Only Vercel's edge serves `/_vercel/insights/`. A local or CI `next start` answers it `404`, and
  Chromium logs that as a console error, which `apps/web/e2e/console-clean.spec.ts` fails on.
- `VERCEL=1` does not mean a Vercel deployment: `vercel env pull` writes it into a local
  `.env.local`, which `next dev` loads, beside `VERCEL_ENV="development"`.

## Decision

`apps/web/src/components/web-analytics.tsx` renders `<Analytics />` from `@vercel/analytics/next`
at the end of the root layout's `<body>`, and only when `process.env.VERCEL_ENV` is `production` or
`preview`, which Vercel sets in a deployment's build. Everywhere else, `next dev` (pulled env
included), CI and a local `next start`, it renders nothing, so neither the CSP nor the console gate
changes. `turbo.json` already declares `VERCEL_ENV` in the `build` task's `env` (for the CSP), so a
build made with it and one made without it never share a cache entry.

## Consequences

- Page views from production and preview deployments reach the project's Analytics page, which
  splits them by environment. Nothing records custom events; adding one is a call to `track()`.
- No automated test exercises the live script: the e2e suites run where the component renders
  nothing. The unit test in `apps/web/src/components/__tests__/web-analytics.test.tsx` pins the gate
  and the same-origin script path; after a deploy, the live `/` should request
  `/_vercel/insights/script.js` with a clean console.
- The package's client code ships in the layout's shared chunk on every build, rendered or not,
  because Next bundles a client module by import rather than by render.
- Vercel documents the tracker as cookieless: it stores no identifier on the visitor's device. It
  still sends the page URL, referrer and request metadata to Vercel. No route reads a query string
  today, so no `beforeSend` redacts one; whether the site needs a privacy notice is the owner's call
  and is not settled here.
- An ad blocker that drops `/_vercel/insights/` makes the tracker log one `console.log` line and
  count nothing; the site is unaffected.

## Alternatives considered

- **Turn the Vercel toggle off.** The runbook's smaller option, rejected because the owner wants the
  numbers.
- **Mount `<Analytics />` unconditionally and widen the development CSP** for
  `va.vercel-scripts.com`, as the runbook sketched. It still leaves the CI `next start` 404, and it
  widens a policy to serve a debug script nobody reads.
- **Self-hosted or third-party analytics** (Plausible, Umami, Google Analytics). Each adds an origin
  to the CSP or a service to run, where Vercel's is same-origin and already paid for by the project.

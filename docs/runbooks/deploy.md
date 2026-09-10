# Deployment runbook

How `miloscvetkovic.dev` goes from a parked domain to a live site on Vercel, and how it is operated
afterwards. Every command below is meant to be run as written.

The reasoning behind these choices, why Vercel, why the apex is primary, why DNS stays at Namecheap
and why there is no `vercel.json`, is in [ADR 0005](../adr/0005-hosting-on-vercel.md). The single
environment variable is documented in [`.env.example`](../../.env.example).

## Status

As of 2026-09-08 the site is **not deployed**. There is no Vercel project, no `vercel.json` in the
repository, and no deployment history. `miloscvetkovic.dev` currently serves a Namecheap parking
page: the apex `A` record points at `162.255.119.232`, `www` is a `CNAME` to
`parkingpage.namecheap.com`, and the domain uses Namecheap BasicDNS
(`dns1.registrar-servers.com`, `dns2.registrar-servers.com`). This runbook takes it from that state
to a live production deployment on the apex domain, and then covers routine deploys, rollback and
the failures worth knowing about in advance.

## Prerequisites

| Requirement       | Detail                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel account    | Hobby is sufficient. The account must be able to add a custom domain.                                                                                                                                               |
| Domain control    | Namecheap account that owns `miloscvetkovic.dev`, with access to **Domain List → Manage**.                                                                                                                          |
| GitHub repository | `github.com/milosCvetkovicDev/website`, with the Vercel GitHub app authorised for it.                                                                                                                               |
| Node 22           | Matches `.nvmrc` (`22`) and `engines.node` (`>=22`) in the root `package.json`. `nvm use`.                                                                                                                          |
| pnpm 10.33.0      | Pinned by `packageManager` in the root `package.json`. Use corepack rather than a global pnpm.                                                                                                                      |
| Vercel CLI        | `npm i -g vercel`. Needed for the CLI setup path, for `vercel rollback`, and for inspecting deployments (`vercel ls`, `vercel inspect`, `vercel logs`). Only the last has no dashboard equivalent that is as quick. |

`vercel login` opens a browser and completes an interactive email or OAuth confirmation. It cannot
be run by an agent or in a non-interactive shell. Milos must run it himself, once, before any other
CLI command in this runbook. The one exception is a personal access token from **Account Settings →
Tokens**, which works as `vercel --token "$VERCEL_TOKEN" <command>` without a browser. Creating the
token is still an interactive human step, and the token is a production credential: do not paste it
into a shared session and do not commit it.

Before the first deploy, confirm the build is green locally from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter web exec playwright install --with-deps chromium   # once per machine
pnpm --filter web test:e2e
```

These are every gate in `.github/workflows/ci.yml`. The first six commands are the `quality` job;
the last two are the `e2e` job, which on CI runs Playwright against the production build
(`next start`) while the same command locally reuses or starts the dev server. Both jobs must be
green before a pull request can merge, and merging to `main` is what deploys. Vercel runs none of
them: it runs the install command and `next build`, nothing else.

## One-time project setup

The two paths below reach the same project, but the CLI path does not necessarily connect the Git
repository. If you take it, run `vercel git connect` (or connect the repository under **Project
Settings → Git**) and confirm the connection before relying on push-to-deploy or pull request
previews. Do one path, not both. The dashboard path is recommended for the first setup because the
Node.js version, the production branch and the monorepo build setting are dashboard-only.

### Settings that matter

| Setting                              | Value                                                   |
| ------------------------------------ | ------------------------------------------------------- |
| Git repository                       | `github.com/milosCvetkovicDev/website`                  |
| Root Directory                       | `apps/web`                                              |
| Include files outside Root Directory | Enabled (required, see below)                           |
| Framework Preset                     | Next.js                                                 |
| Node.js Version                      | 22.x                                                    |
| Install Command                      | `pnpm install --frozen-lockfile` (override)             |
| Build Command                        | leave as the framework default (`next build`)           |
| Output Directory                     | leave as the framework default                          |
| Production Branch                    | `main`                                                  |
| `NEXT_PUBLIC_SITE_URL`               | `https://miloscvetkovic.dev` for Production and Preview |

Do not set a custom build command such as `turbo build`. With Root Directory `apps/web`, Vercel runs
the build inside that directory, where `pnpm build` is already `next build` (see
`apps/web/package.json`). Turborepo is the local and CI task runner, not part of the Vercel build.

**Include source files outside of the Root Directory in the Build Step** must be on. `pnpm-lock.yaml`
and `pnpm-workspace.yaml` live at the repository root, and `apps/web` declares
`"@repo/prettier-config": "workspace:*"`, so the install cannot succeed with only `apps/web`
available. Vercel often enables this automatically when it detects a workspace; confirm it under
**Project Settings → General** rather than assuming it.

`apps/web/package.json` has no `engines` field, and Vercel reads the Node version from the Root
Directory's `package.json` or from the project setting. The root `engines.node` and `.nvmrc` do not
reach it, so the Node.js Version must be set explicitly in the dashboard.

### Path A: dashboard

1. Go to <https://vercel.com/new> and import `milosCvetkovicDev/website`. Authorise the Vercel
   GitHub app for that repository if prompted.
2. On the import screen, set **Root Directory** to `apps/web`. Vercel should then detect **Next.js**
   as the framework preset; confirm it did, and confirm the option to include source files outside
   the root directory is enabled.
3. Expand **Build and Output Settings**, enable the override for **Install Command** and set it to
   `pnpm install --frozen-lockfile`. Leave **Build Command** and **Output Directory** on the
   framework defaults.
4. Expand **Environment Variables** and add `NEXT_PUBLIC_SITE_URL` = `https://miloscvetkovic.dev`,
   ticked for **Production** and **Preview**. Leave Development unticked; local `next dev` falls back
   to the same value in code.
5. Click **Deploy**. The first build produces a `*.vercel.app` URL. Before opening it, do steps 6
   and 7, and redeploy if the Node.js Version was not already 22.x; otherwise you are verifying a
   build that will not match production. Then open the URL and click through the site before
   touching DNS.
6. Go to **Project Settings → General** and set **Node.js Version** to 22.x.
7. Go to **Project Settings → Git** and confirm **Production Branch** is `main`.

### Path B: Vercel CLI

Run every command from the repository root. Do not `cd` into `apps/web`: `vercel deploy` uploads the
working directory, and from `apps/web` that upload leaves out `pnpm-lock.yaml` and
`pnpm-workspace.yaml`, so the install fails with `ERR_PNPM_NO_LOCKFILE` and the `workspace:*`
dependency on `@repo/prettier-config` cannot resolve.

```bash
vercel login                       # interactive, human-run, opens a browser
vercel link                        # answer apps/web when asked where the code is located
vercel git connect                 # attach github.com/milosCvetkovicDev/website if it is not attached
vercel env add NEXT_PUBLIC_SITE_URL production   # paste https://miloscvetkovic.dev
vercel env add NEXT_PUBLIC_SITE_URL preview      # paste https://miloscvetkovic.dev
vercel env ls                      # confirm both entries exist
vercel deploy                      # preview deployment, prints a URL
vercel deploy --prod               # production deployment
```

After linking, still open **Project Settings → General** in the dashboard to set **Node.js Version**
to 22.x, the **Install Command** override and the include-files-outside-the-root-directory option,
and **Project Settings → Git** to confirm the production branch is `main`. The CLI does not set
those.

### Notes

- `turbo.json` declares `NEXT_PUBLIC_SITE_URL` under the `build` task's `env`, so changing the value
  invalidates the local and CI Turborepo cache for `build`. That is intentional; the variable is
  inlined into the client bundle at build time.
- Because `NEXT_PUBLIC_*` values are inlined at build time, editing the variable in Vercel has no
  effect until the next deployment. Changing it always requires a redeploy.
- Turborepo **remote caching** is optional and is off. There is no `.turbo/config.json` or
  `TURBO_TOKEN` in the repository, and nothing in this runbook depends on it. Leave it off unless
  build times become a problem.

## Domain and DNS

### 1. In Vercel

1. **Project Settings → Domains → Add**. Add `miloscvetkovic.dev`.
2. Add `www.miloscvetkovic.dev` as a second domain.
3. Set `miloscvetkovic.dev` as the **primary** domain, and edit `www.miloscvetkovic.dev` so it
   **redirects to `miloscvetkovic.dev`** with status **308 Permanent Redirect**. Vercel offers 307
   and 308 here and defaults to 307, which is the wrong choice for a canonical host. Vercel will then
   show the DNS records it expects for each domain.
4. Both domains will sit in **Invalid Configuration** until the Namecheap records change. That is
   expected at this point.

### 2. At Namecheap

Namecheap → **Domain List → miloscvetkovic.dev → Manage → Advanced DNS**.

First confirm the **Nameservers** field on the Domain tab still reads **Namecheap BasicDNS**. If the
nameservers have been pointed elsewhere, the Advanced DNS tab is not authoritative and the records
must be edited wherever they point instead.

**Before deleting anything, capture the current zone.** Screenshot the Advanced DNS tab and save the
output of the following, which is the only copy of the pre-cutover state:

```bash
dig +short A miloscvetkovic.dev
dig +short www.miloscvetkovic.dev
dig +short MX miloscvetkovic.dev
dig +short TXT miloscvetkovic.dev
dig +short NS miloscvetkovic.dev
```

Remove:

| Type                | Host  | Current value                | Action            |
| ------------------- | ----- | ---------------------------- | ----------------- |
| A Record            | `@`   | `162.255.119.232`            | Delete            |
| CNAME Record        | `www` | `parkingpage.namecheap.com.` | Delete            |
| URL Redirect Record | any   | any                          | Delete if present |

Add exactly the two records Vercel lists for these domains under **Project Settings → Domains**, an
`A` record on `@` and a `CNAME` on `www`, with TTL `Automatic`:

| Type         | Host  | Value                                      | TTL       |
| ------------ | ----- | ------------------------------------------ | --------- |
| A Record     | `@`   | the apex address Vercel shows for the apex | Automatic |
| CNAME Record | `www` | the CNAME target Vercel shows for `www`    | Automatic |

Do not copy DNS values out of this runbook or any other document. Vercel has changed its apex address
(from `76.76.21.21` to `216.198.79.1`) and now issues project-specific `*.vercel-dns-NNN.com` CNAME
targets, so the dashboard is the only authority and typing a stale value leaves both domains
permanently in **Invalid Configuration**. Record the values you actually entered in the pull request
that follows the cutover, and update the `dig` expectations under **Verify** to match.

Then, back in Vercel, open **Project Settings → Domains** and use **Refresh** on each domain until
both report **Valid Configuration**. Vercel issues the TLS certificate automatically once the
records resolve; that usually takes under a minute after propagation. If a domain reaches **Valid
Configuration** but the certificate does not issue within a few minutes, check for a `CAA` record
blocking Vercel's certificate authority with `dig +short CAA miloscvetkovic.dev` (empty today, and
anything else must permit `letsencrypt.org`). `.dev` is on the HSTS preload list, so browsers refuse
plain HTTP: until the certificate issues the site is unreachable everywhere, with no HTTP fallback.
Work the certificate problem rather than changing the DNS records again.

### Cautions

- **The parking page is a separate switch.** Namecheap can re-add a parking `A` record even after
  you delete it. On the **Domain** tab, make sure **Parking page** / **Redirect** is turned off, then
  re-check Advanced DNS and delete any record Namecheap put back.
- **Lower the TTL first if you can.** If the change is planned, set the existing records' TTL to the
  lowest Namecheap offers (1 min) a few hours beforehand, then make the change. On `Automatic` you do
  not control the cached value and the old parking page may persist longer.
- **Propagation is usually minutes, but can take hours.** Resolvers and browsers cache aggressively.
  Verify with `dig` against a public resolver rather than trusting your browser, and do not start
  changing records again because it has not flipped after five minutes.
- **Do not touch the mail records.** The domain carries five `MX` records pointing at `eforward1`
  through `eforward5.registrar-servers.com` (priorities 10, 10, 10, 15, 20) and the SPF `TXT` record
  `v=spf1 include:spf.efwd.registrar-servers.com ~all`. That is Namecheap email forwarding, and
  deleting either breaks mail to the domain. Namecheap also keeps a separate **Mail Settings**
  control on the Advanced DNS tab; leave it on `Email Forwarding`. Only the apex `A`, the `www`
  `CNAME` and any URL redirect record are in scope. Re-check `dig +short MX miloscvetkovic.dev`
  after the cutover.

### Reverting the DNS change

Delete the `A` record on `@` and the `CNAME` on `www` that point at Vercel, restore
`A @ 162.255.119.232` and `CNAME www parkingpage.namecheap.com.`, then re-enable the parking page on
the Domain tab. Expect the same propagation delay as the cutover, and re-check the `MX` and `TXT`
records afterwards. Leave the Vercel project in place: a domain sitting in **Invalid Configuration**
costs nothing.

## Verify

Run these once Vercel reports Valid Configuration for both domains. The two `dig` expectations below
are whatever values Vercel gave you in **Project Settings → Domains**, not fixed constants.

```bash
# Apex resolves to the Vercel address shown in the dashboard.
dig +short miloscvetkovic.dev
# expect: the apex A record value Vercel listed, and nothing else

# www is a CNAME to Vercel (dig prints the CNAME target, then the address it resolves to).
dig +short www.miloscvetkovic.dev
# expect: the CNAME target Vercel listed, followed by an IP address

# www redirects to the apex.
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.miloscvetkovic.dev
# expect: 308 https://miloscvetkovic.dev/   (a 307 means the redirect status was left on the
#         Vercel default; a 200 means www is NOT redirecting)

# The apex is served by Vercel over TLS.
curl -sI https://miloscvetkovic.dev | grep -i 'HTTP/\|server\|x-vercel'
# expect: HTTP/2 200, server: Vercel, and x-vercel-id / x-vercel-cache headers

# The home page is the right page.
curl -sS https://miloscvetkovic.dev | grep -o '<title>[^<]*</title>'
# expect: <title>Milos Cvetkovic | Senior Full-Stack Engineer</title>

# Sitemap and robots use the apex origin, not a *.vercel.app one.
curl -sS https://miloscvetkovic.dev/sitemap.xml | head
curl -sS https://miloscvetkovic.dev/robots.txt
# expect: every <loc> begins https://miloscvetkovic.dev, and robots ends with
#         Sitemap: https://miloscvetkovic.dev/sitemap.xml
```

Then walk the site by hand. The App Router serves nine pages; `sitemap.ts` lists all nine, six
static plus one per entry in `apps/web/src/data/case-studies.ts` (three today).

- [ ] `/` loads, the hero animation runs, and scrolling does not stall
- [ ] `/about`
- [ ] `/work`
- [ ] `/work/self-healing-agent`
- [ ] `/work/enterprise-b2b-platform`
- [ ] `/work/nx-remote-cache`
- [ ] `/skills`
- [ ] `/blog`
- [ ] `/contact`
- [ ] `/sitemap.xml` lists exactly those nine URLs, all on the apex origin
- [ ] `/robots.txt` allows `/`, disallows `/api/` and `/_next/`, and points at the apex sitemap
- [ ] `/work/does-not-exist` renders the case study not-found page
      (`apps/web/src/app/work/[slug]/not-found.tsx`)
- [ ] `/no-such-page` renders the site not-found page (`apps/web/src/app/not-found.tsx`)
- [ ] JSON-LD is present: `view-source` on `/` contains two `application/ld+json` blocks (Person and
      WebSite, from `apps/web/src/components/json-ld.tsx`) and their `url` fields are the apex
- [ ] The theme toggle in the navigation switches light and dark, the choice survives a reload, and
      there is no light-to-dark flash on first paint
- [ ] Browser console is clean on every page: no errors, no hydration warnings, no 404s for assets
- [ ] Lighthouse spot check on `/` and one case study page in an incognito window; note the scores
      somewhere rather than acting on them immediately

Lighthouse baseline, recorded on 2026-09-09 with the Lighthouse 13.4.1 CLI (default mobile emulation,
simulated throttling, 4× CPU slowdown). The first run against the first production build scored `/`
at performance 24 with LCP 4.6 s, CLS 0.345 and TBT 2,160 ms, but its JSON carries a
`benchmarkIndex` near 700 and the "slower CPU than Lighthouse expects" warning: the machine was busy.
Clean runs of the same command against the same build (`environment.benchmarkIndex` above 1,500,
`runWarnings` empty) gave `/` 84 to 93 with CLS 0.034 to 0.038 and TBT 217 to 468 ms, and
`/work/self-healing-agent` 97 to 98 with TBT 58 to 65 ms. After the home page performance work
([plan](../plans/2026-09-09-home-page-performance-plan.md), [ADR 0009](../adr/0009-animation-performance-rules.md)),
five runs interleaved with that baseline on the same machine give `/` 96 in every run with LCP
2.6 s, CLS 0.034 (all of it the boot-loader artifact described below) and TBT 86 to 87 ms, and
`/work/self-healing-agent` 98 with TBT 53 to 54 ms; the case-study route also stopped loading the
27.7 KB FeaturedWork chunk. Before comparing a future run
with these, check `.environment.benchmarkIndex` and `.runWarnings` in its JSON and discard a flagged
run. A CLS of 0.03 to 0.06 attributed to the boot loader is Lighthouse re-centering it when it
changes the emulated viewport at about 0.9 s, which it counts by design within 500 ms of that event;
visitors never see it.

Accessibility on that same 2026-09-09 baseline was 96 on both pages. The points went to colour
contrast (the accent used as text, labels dimmed with opacity modifiers, and a scroll reveal that
parked the quest log at 30% opacity) and, on `/`, to Featured Work cards whose `aria-labelledby`
name did not contain their visible text. Both were fixed the same day by splitting the accent into
`--accent` and `--accent-text` and restructuring the cards
([ADR 0008](../adr/0008-accent-colour-roles.md)); re-run with the same CLI against the local
production build, both pages score accessibility 100 with `color-contrast` passing and
`label-content-name-mismatch` not applicable. The command that reproduces the accessibility run is

```bash
CHROME_PATH="$(node -e "console.log(require('@playwright/test').chromium.executablePath())")" \
  pnpm dlx lighthouse http://localhost:3000/ --only-categories=accessibility --output=json \
  --output-path=/tmp/lh-a11y-home.json --chrome-flags="--headless=new"
```

from `apps/web` with `pnpm start` serving the build. `--headless=new` follows the machine's
appearance setting for `prefers-color-scheme`, so on a Mac in dark mode this is a dark-theme audit;
the light theme is checked with Playwright and axe-core instead. The same rule set now runs in CI on
every pull request: `apps/web/e2e/accessibility.spec.ts` audits both pages in both colour schemes at
the desktop viewport, at rest, and fails the `e2e` job on any violation.

## Routine deployments

- **Production**: merging a pull request into `main` triggers a production deployment. There is no
  manual step and no approval gate. `.github/workflows/ci.yml` runs on the pull request; Vercel
  builds independently, so a green CI run does not guarantee a green Vercel build (see
  Troubleshooting).
- **Previews**: every pull request gets its own preview deployment and URL, posted by the Vercel
  GitHub app as a comment and a commit status. Preview builds use the Preview environment variables,
  which is why `NEXT_PUBLIC_SITE_URL` is set there too. Whether a preview URL opens without a Vercel
  login depends on the deployment protection setting (see Not covered).
- **Finding the deployment for a commit**: in the dashboard, **Deployments** lists each deployment
  with its branch and commit SHA; filter by branch or search the SHA. From the CLI:

  ```bash
  vercel ls                      # recent deployments, newest first
  vercel inspect <deployment-url># shows the commit, branch, environment and build state
  vercel logs <deployment-url>   # runtime logs for that deployment
  ```

- Deploying by hand (`vercel deploy --prod`) bypasses the Git flow and produces a production
  deployment with no associated commit. Avoid it except to recover from a broken Git integration.

## Rollback

A production rollback on Vercel is a promotion of an existing build, not a rebuild, so it takes
seconds and cannot fail on compilation.

**Dashboard**: **Deployments** → find the last known-good production deployment → the `...` menu →
**Promote to Production** (older projects label this **Rollback**). Confirm, then re-run the `curl`
checks from Verify.

**CLI**: `vercel rollback` needs the deployment to promote. Called with no argument it reports the
status of a rollback already in progress; it does not start one.

```bash
vercel ls                          # deployments, newest first; pick the last known-good URL
vercel rollback <deployment-url>   # promote that deployment to production
vercel rollback                    # status of the rollback just requested
vercel ls                          # confirm which deployment is now production
```

Prefer `git revert` instead when:

- the bad change must not come back on the next merge to `main` (a promotion does not change Git
  history, so the next deploy from `main` reintroduces the fault);
- the fix needs review, a CI run, or a preview URL before it goes live;
- the problem is data or content in the repository rather than a broken build.

Use a promotion to stop the bleeding immediately, then follow it with a `git revert` pull request so
the branch and the live site agree.

## Troubleshooting

| Symptom                                                                                  | Cause                                               | Fix                                                                                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Install fails, `ERR_PNPM_NO_LOCKFILE` or `@repo/prettier-config` is not in the workspace | Workspace root not available to the build           | Settings → General → enable **Include source files outside of the Root Directory in the Build Step**, redeploy    |
| Install fails, `ERR_PNPM_OUTDATED_LOCKFILE`                                              | Lockfile does not match a `package.json`            | `pnpm install` locally, commit `pnpm-lock.yaml`, push                                                             |
| Build fails, `next: command not found`                                                   | Root Directory is not `apps/web`                    | Settings → General → Root Directory: `apps/web`, redeploy                                                         |
| Build or runtime behaves as if on an older Node                                          | Node version not set; `.nvmrc` is not read          | Settings → General → Node.js Version: 22.x, redeploy                                                              |
| Domain stuck on **Invalid Configuration**                                                | Records not propagated, or parking records remain   | Delete leftover records, disable parking page, wait, Refresh                                                      |
| Domain is **Valid Configuration** but HTTPS fails and the site is unreachable            | Certificate has not issued                          | `dig +short CAA miloscvetkovic.dev`; remove or widen a `CAA` record that excludes `letsencrypt.org`, then Refresh |
| `www` returns 200 instead of a redirect                                                  | `www` added as a serving domain, not a redirect     | Settings → Domains: apex primary, `www` redirects to it with 308                                                  |
| Previews emit apex URLs in sitemap, robots and JSON-LD                                   | Expected: Preview uses the same value as Production | No fix needed. To make previews self-identify, give Preview a different `NEXT_PUBLIC_SITE_URL` and redeploy       |
| A page 404s in production but works locally                                              | Live deployment predates the new case study slug    | `vercel inspect <url>` to check the commit, then redeploy `main`                                                  |

Detail on the less obvious rows:

- **Workspace root.** With Root Directory `apps/web`, Vercel builds inside that directory, but the
  lockfile and `pnpm-workspace.yaml` are at the repository root and `apps/web` has a `workspace:*`
  dependency. The build needs the whole repository in the upload, which is exactly what the
  include-files-outside-the-root-directory setting controls.
- **Lockfile.** `--frozen-lockfile` refuses to update `pnpm-lock.yaml`, by design; CI fails the same
  way for the same reason. Never edit the lockfile by hand, and never drop the flag to get past it.
- **Root Directory.** `next` is a dependency of `apps/web`, not of the workspace root, so a build at
  the root cannot find it. The same misconfiguration also shows as "No Next.js version detected".
- **Node version.** `apps/web/package.json` has no `engines` field, and Vercel reads the Node version
  from the Root Directory's `package.json` or the project setting, so the root `engines.node`
  (`>=22`) and `.nvmrc` (`22`) never reach it. Locally, `nvm use` does read `.nvmrc`.
- **Invalid Configuration.** Check with `dig +short miloscvetkovic.dev` and
  `dig +short www.miloscvetkovic.dev` rather than a browser. Remove any leftover apex `A`, `www`
  `CNAME` or URL redirect record, turn the Namecheap parking page off on the Domain tab, wait out the
  TTL, then use **Refresh** on each domain in Vercel.
- **Environment variable.** All four readers, `apps/web/src/app/layout.tsx`, `sitemap.ts`,
  `robots.ts` and `components/json-ld.tsx`, fall back to the hard-coded `https://miloscvetkovic.dev`,
  so a missing variable is invisible everywhere, Production and Preview alike. Setting it for Preview
  to the same value changes nothing. The variable exists to make the origin explicit, not to change
  behaviour, and because the value is inlined at build time, saving it in Vercel does nothing until
  the next deploy.

## Not covered

This runbook deliberately stops short of the following. None of it exists yet; do not assume it does.

- **`apps/playground` is not deployed.** It is a local Vite sandbox (`pnpm dev:playground`) with no
  Vercel project and no public URL. Only `apps/web` ships.
- **No analytics.** Vercel Analytics and Speed Insights are not enabled and no third-party analytics
  script is in the app. Traffic numbers are not available anywhere.
- **No error monitoring.** There is no Sentry or equivalent. `apps/web/src/app/error.tsx` is a client
  component: it renders a friendly error page and calls `console.error` in the visitor's browser,
  which goes nowhere you can see. The site is fully prerendered, so there is little server runtime
  and `vercel logs` shows little beyond request-level information. In practice a client-side
  production failure is invisible until someone reports it.
- **Preview protection is left at whatever Vercel defaults to.** Vercel applies deployment protection
  to new projects (**Vercel Authentication**, under **Settings → Deployment Protection**), which
  requires a Vercel login to open a preview or a `*.vercel.app` URL. That is transparent while you
  are signed in as the project owner and a wall for anyone else. Check the setting after the first
  deploy and decide deliberately; this runbook does not change it.
- **No staging environment, no custom domains for previews, no `vercel.json`.** Redirects, headers
  and rewrites are whatever Next.js does by default.
- **No uptime monitoring or alerting.** Nothing will tell you the site is down.

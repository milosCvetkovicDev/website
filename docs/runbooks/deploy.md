# Deployment runbook

How `miloscvetkovic.dev` goes from a parked domain to a live site on Vercel, and how it is operated
afterwards. Every command below is meant to be run as written.

The reasoning behind these choices, why Vercel, why the apex is primary, why DNS stays at Namecheap
and why there is no `vercel.json`, is in [ADR 0005](../adr/0005-hosting-on-vercel.md). The single
environment variable is documented in [`.env.example`](../../.env.example).

## Status

As of 2026-09-09 the site is **deployed on Vercel and waiting for DNS**. The Vercel project is
`portfolio` in the team `cvetkovicmilosgmailcoms-projects`, linked to
`github.com/milosCvetkovicDev/website` with production branch `main`, Root Directory `apps/web`,
Node 22.x and `pnpm install --frozen-lockfile` as the install command. Its first production
deployment was built from commit `a8b4a91` and passed the `curl` checks under **Verify** that do not
need the domain. `miloscvetkovic.dev` and `www.miloscvetkovic.dev` are attached to the project, with
`www` redirecting to the apex with a 308, but both still resolve to the Namecheap parking page (apex
`A 162.255.119.232`, `www CNAME parkingpage.namecheap.com`, Namecheap BasicDNS on
`dns1.registrar-servers.com` and `dns2.registrar-servers.com`) until the records under **Domain and
DNS** are entered at Namecheap. There is still no `vercel.json`; the only Vercel-specific file in the
repository is `.vercelignore`, explained under Path B. The rest of this runbook covers the cutover,
routine deploys, rollback and the failures worth knowing about in advance.

## Prerequisites

| Requirement       | Detail                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel account    | Hobby is sufficient. The account must be able to add a custom domain.                                                                                                                                                                                                              |
| Domain control    | Namecheap account that owns `miloscvetkovic.dev`, with access to **Domain List → Manage**.                                                                                                                                                                                         |
| GitHub repository | `github.com/milosCvetkovicDev/website`, with the Vercel GitHub app authorised for it.                                                                                                                                                                                              |
| Node 22           | Matches `.nvmrc` (`22`) and `engines.node` (`>=22`) in the root `package.json`. `nvm use`.                                                                                                                                                                                         |
| pnpm 10.33.0      | Pinned by `packageManager` in the root `package.json`. Use corepack rather than a global pnpm.                                                                                                                                                                                     |
| Vercel CLI        | `npm i -g vercel`, version 59 or newer: Path B relies on `vercel project update`, `vercel api`, `vercel deploy-hooks` and `vercel curl`, which older releases lack. Also used for `vercel rollback` and for inspecting deployments (`vercel ls`, `vercel inspect`, `vercel logs`). |

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

The two paths below reach the same project. Do one path, not both. Path B is the one that was
actually used on 2026-09-09: with CLI version 59 or newer every setting in the table can be set or
read from the terminal, and the dashboard path remains as the alternative for someone without the
CLI. Whichever path you take, confirm the Git connection (the `link` field in the `vercel api` output
under Path B, or **Project Settings → Git**) before relying on push-to-deploy or pull request
previews.

### Settings that matter

| Setting                              | Value                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Git repository                       | `github.com/milosCvetkovicDev/website`                                 |
| Root Directory                       | `apps/web`                                                             |
| Include files outside Root Directory | Enabled (required, see below)                                          |
| Framework Preset                     | Next.js                                                                |
| Node.js Version                      | 22.x                                                                   |
| Install Command                      | `pnpm install --frozen-lockfile` (override)                            |
| Build Command                        | leave unset; Vercel runs `turbo run build` scoped to `web` (see below) |
| Output Directory                     | leave as the framework default                                         |
| Production Branch                    | `main`                                                                 |
| `NEXT_PUBLIC_SITE_URL`               | `https://miloscvetkovic.dev` for Production and Preview                |

Leave the build command unset. Because `turbo.json` sits at the repository root, Vercel detects
Turborepo ("Detected Turbo. Adjusting default settings" in the build log) and runs `turbo run build`
with only `web` in scope, which executes the `build` task from `turbo.json` and therefore
`next build` inside `apps/web`. The task's `env` list (`NEXT_PUBLIC_SITE_URL`) and `outputs` apply on
Vercel exactly as they do locally and in CI, and that run uses Vercel's own remote cache ("Remote
caching enabled"), which needs nothing from the repository. Setting the command to `turbo build` by
hand adds nothing and removes the framework detection.

**Include source files outside of the Root Directory in the Build Step** must be on. `pnpm-lock.yaml`
and `pnpm-workspace.yaml` live at the repository root, and `apps/web` declares
`"@repo/prettier-config": "workspace:*"`, so the install cannot succeed with only `apps/web`
available. Vercel enabled it automatically on 2026-09-09; confirm it under **Project Settings →
General**, or with `vercel api /v9/projects/<project-id> --raw | jq .sourceFilesOutsideRootDirectory`,
which must print `true`, rather than assuming it.

`apps/web/package.json` has no `engines` field, and Vercel reads the Node version from the Root
Directory's `package.json` or from the project setting. The root `engines.node` and `.nvmrc` do not
reach it, so the Node.js Version must be set explicitly, in the dashboard or with
`vercel project update portfolio --node-version 22.x`.

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

This is the path that created the project on 2026-09-09. Run every command from the repository
root. Do not `cd` into `apps/web`: `vercel deploy` uploads the working directory, and from `apps/web`
that upload leaves out `pnpm-lock.yaml` and `pnpm-workspace.yaml`, so the install fails with
`ERR_PNPM_NO_LOCKFILE` and the `workspace:*` dependency on `@repo/prettier-config` cannot resolve.

```bash
vercel login                       # interactive, human-run, opens a browser
vercel link --yes                  # creates project "portfolio" (the directory name), writes .vercel/project.json
vercel project update portfolio --root-directory apps/web --framework nextjs \
  --node-version 22.x --install-command "pnpm install --frozen-lockfile" --yes
vercel git connect https://github.com/milosCvetkovicDev/website --yes
vercel api /v9/projects/<project-id> --raw \
  | jq '{rootDirectory, nodeVersion, installCommand, sourceFilesOutsideRootDirectory, link}'
vercel env add NEXT_PUBLIC_SITE_URL production \
  --value https://miloscvetkovic.dev --no-sensitive --yes
vercel env add NEXT_PUBLIC_SITE_URL preview \
  --value https://miloscvetkovic.dev --no-sensitive --yes
vercel env ls                      # both entries, type Config
```

`<project-id>` is `projectId` in `.vercel/project.json`, which `vercel link` writes (the directory
is gitignored). The `jq` line is the check that matters: `rootDirectory`, `nodeVersion` and
`installCommand` must show the values just set, `sourceFilesOutsideRootDirectory` must be `true`,
and `link` must name the repository with `productionBranch: "main"`.

Three things about these commands are not obvious:

- `vercel link --yes` also writes a `.env.local` at the repository root holding a short-lived
  `VERCEL_OIDC_TOKEN`, and appends `.env*` to `.gitignore` even though `.env.local` is already
  listed there. The file is ignored and harmless; revert the `.gitignore` change, because `.env*`
  would also match the tracked `.env.example`.
- `vercel git connect` printed `Failed to connect milosCvetkovicDev/website to project` on
  2026-09-09 even though the link had been recorded. Trust the `link` field in the `vercel api`
  output, not the message. A missing `link` means the Vercel GitHub App is not installed for the
  `milosCvetkovicDev` account; install it from **Project Settings → Git** and run the command again.
- `vercel deploy` uploads the working tree filtered by `.vercelignore` and a short built-in list
  (`node_modules`, `.next`, `.git`), not by `.gitignore`. Without `.vercelignore` the first attempt
  uploaded 1.9 GB of `.turbo` cache and failed with `File size limit exceeded (100 MB)`. The file is
  committed for that reason; keep it aligned with `.gitignore`.

For the first production deployment, prefer a Git-triggered build over `vercel deploy --prod`: it
builds the commit on `main` inside Vercel, so the deployment carries the commit and branch, and it
proves that the Git connection can clone the repository. A deploy hook does that without a push:

```bash
vercel deploy-hooks create bootstrap-main --ref main   # prints a URL; treat it as a secret
curl -X POST "<hook url>"                              # returns {"job":{"state":"PENDING",...}}
vercel ls                                              # the new deployment: source git, Production
vercel inspect <deployment-url> --wait --timeout 5m    # blocks until READY or ERROR
vercel inspect <deployment-url> --logs                 # confirm the install command and "turbo run build"
vercel deploy-hooks remove <hook-id>                   # anyone holding the URL can start builds
```

On 2026-09-09 this built `a8b4a91` in 38 seconds. Fetch pages from the deployment with
`vercel curl <path> --deployment <deployment-url>`, which handles deployment protection (see **Not
covered**).

### Notes

- `turbo.json` declares `NEXT_PUBLIC_SITE_URL` under the `build` task's `env`, so changing the value
  invalidates the local and CI Turborepo cache for `build`. That is intentional; the variable is
  inlined into the client bundle at build time.
- Because `NEXT_PUBLIC_*` values are inlined at build time, editing the variable in Vercel has no
  effect until the next deployment. Changing it always requires a redeploy.
- Turborepo **remote caching** is off locally and in CI: there is no `.turbo/config.json` or
  `TURBO_TOKEN` in the repository, and nothing in this runbook depends on it. Vercel builds are the
  exception; they run `turbo run build` against Vercel's own remote cache automatically, without any
  configuration in the repository.

## Domain and DNS

### 1. In Vercel

Done on 2026-09-09 from the CLI; the dashboard equivalent is **Project Settings → Domains**.

```bash
vercel domains add miloscvetkovic.dev portfolio
vercel domains add www.miloscvetkovic.dev portfolio
vercel api /v9/projects/<project-id>/domains/www.miloscvetkovic.dev -X PATCH \
  -f redirect=miloscvetkovic.dev -F redirectStatusCode=308
vercel api /v9/projects/<project-id>/domains --raw \
  | jq '.domains[] | {name, redirect, redirectStatusCode}'
vercel domains verify miloscvetkovic.dev        # prints the records Vercel expects for the apex
vercel domains verify www.miloscvetkovic.dev    # and for www
```

The apex is primary and `www` redirects to it with **308 Permanent Redirect**; in the dashboard
Vercel offers 307 and 308 and defaults to 307, which is the wrong choice for a canonical host. Both
domains sit in **Invalid Configuration** until the Namecheap records change. That is expected.

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

Add the records Vercel lists for these domains (`vercel domains verify <domain>`, or **Project
Settings → Domains**), with TTL `Automatic`. On 2026-09-09 Vercel's first-ranked recommendation was
two `A` records on the apex and one project-specific `CNAME` on `www`:

| Type         | Host  | Value                                  | TTL       |
| ------------ | ----- | -------------------------------------- | --------- |
| A Record     | `@`   | `216.198.79.1`                         | Automatic |
| A Record     | `@`   | `64.29.17.1`                           | Automatic |
| CNAME Record | `www` | `30c6e6551c22e39e.vercel-dns-017.com.` | Automatic |

Confirm those values against `vercel domains verify` or the dashboard before typing them. Vercel has
changed its apex address before (`76.76.21.21` is now its second-ranked option, as is
`cname.vercel-dns.com` for `www`) and the CNAME target is issued per project, so a value copied from
an older document can leave both domains permanently in **Invalid Configuration**. If the values have
moved on, record the ones actually entered in the pull request that follows the cutover, and update
the `dig` expectations under **Verify** to match.

Then run `vercel domains verify miloscvetkovic.dev` and `vercel domains verify www.miloscvetkovic.dev`
(or use **Refresh** on each domain under **Project Settings → Domains**) until both report a valid
configuration. Vercel issues the TLS certificate automatically once the
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
are the values Vercel issued on 2026-09-09; if `vercel domains verify` shows different ones, those
win.

```bash
# Apex resolves to the Vercel addresses shown by `vercel domains verify`.
dig +short miloscvetkovic.dev @1.1.1.1
# expect: 216.198.79.1 and 64.29.17.1 in either order, and nothing else

# www is a CNAME to Vercel (dig prints the CNAME target, then the address it resolves to).
dig +short www.miloscvetkovic.dev @1.1.1.1
# expect: 30c6e6551c22e39e.vercel-dns-017.com. followed by an IP address

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

Before DNS exists, the same checks run against the production deployment itself. The production
alias `https://portfolio-theta-gold-77.vercel.app` answers plain `curl`, while the per-deployment
and branch URLs redirect to a Vercel login (see **Not covered**);
`vercel curl <path> --deployment <deployment-url>` fetches those. On 2026-09-09 the first
production build passed all of it: the `<title>`, the nine sitemap entries, `robots.txt`, both
JSON-LD `url` fields and both not-found pages were correct and emitted the apex origin; a headless
Chromium (Playwright, which `apps/web` already has) loaded all nine routes without a console error or
page error, in light and dark schemes, with reduced motion, at 800×453 and 375×812, and with a
stored theme; the toggle switched to light, persisted across a reload, and the `<html>` class was
already `light` when navigation committed, so there was no flash. Claude Code's in-app Browser
pane logs React error #418 on these pages while an unmodified Chromium does not, so use a real
browser or Playwright for the console check.

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
  deployment with no associated commit. Avoid it except to recover from a broken Git integration,
  and remember that it uploads the working tree as filtered by `.vercelignore`.
- To rebuild `main` without a commit, for example after changing `NEXT_PUBLIC_SITE_URL`, run
  `vercel redeploy <deployment-url>` against the current production deployment, or use the
  deploy-hook sequence from Path B. Both build from Git.

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

| Symptom                                                                                  | Cause                                                    | Fix                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Install fails, `ERR_PNPM_NO_LOCKFILE` or `@repo/prettier-config` is not in the workspace | Workspace root not available to the build                | Settings → General → enable **Include source files outside of the Root Directory in the Build Step**, redeploy                              |
| Install fails, `ERR_PNPM_OUTDATED_LOCKFILE`                                              | Lockfile does not match a `package.json`                 | `pnpm install` locally, commit `pnpm-lock.yaml`, push                                                                                       |
| Build fails, `next: command not found`                                                   | Root Directory is not `apps/web`                         | Settings → General → Root Directory: `apps/web`, redeploy                                                                                   |
| Build or runtime behaves as if on an older Node                                          | Node version not set; `.nvmrc` is not read               | Settings → General → Node.js Version: 22.x, redeploy                                                                                        |
| Domain stuck on **Invalid Configuration**                                                | Records not propagated, or parking records remain        | Delete leftover records, disable parking page, wait, Refresh                                                                                |
| Domain is **Valid Configuration** but HTTPS fails and the site is unreachable            | Certificate has not issued                               | `dig +short CAA miloscvetkovic.dev`; remove or widen a `CAA` record that excludes `letsencrypt.org`, then Refresh                           |
| `www` returns 200 instead of a redirect                                                  | `www` added as a serving domain, not a redirect          | Settings → Domains: apex primary, `www` redirects to it with 308                                                                            |
| Previews emit apex URLs in sitemap, robots and JSON-LD                                   | Expected: Preview uses the same value as Production      | No fix needed. To make previews self-identify, give Preview a different `NEXT_PUBLIC_SITE_URL` and redeploy                                 |
| A page 404s in production but works locally                                              | Live deployment predates the new case study slug         | `vercel inspect <url>` to check the commit, then redeploy `main`                                                                            |
| `vercel deploy` uploads gigabytes, then fails with `File size limit exceeded (100 MB)`   | `.vercelignore` missing or out of step with `.gitignore` | Restore `.vercelignore` (it must list `.turbo`), or deploy from Git instead                                                                 |
| `vercel git connect` prints `Failed to connect`                                          | Often spurious                                           | `vercel api /v9/projects/<id> --raw \| jq .link`; if `link` is set the connection exists, otherwise install the Vercel GitHub App and retry |
| Install log warns `Ignored build scripts: esbuild, sharp, unrs-resolver`                 | pnpm 10 blocks dependency scripts by default             | Harmless, the packages ship prebuilt binaries. Silence it deliberately with `pnpm approve-builds` in its own pull request                   |

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
- **Deployment protection is left at Vercel's default.** `vercel project protection portfolio`
  reports `ssoProtection.deploymentType: all_except_custom_domains`. Observed on 2026-09-09: the
  per-deployment URL (`portfolio-<hash>-<team>.vercel.app`), the branch URL
  (`portfolio-git-main-<team>.vercel.app`) and the team URL answer `302` to a Vercel login, while the
  production alias `portfolio-theta-gold-77.vercel.app` and the custom domains answer `200` to
  anyone. Pull request previews are therefore private to the project owner, which is a wall for any
  reviewer without a Vercel login. Decide deliberately under **Settings → Deployment Protection**;
  this runbook does not change it.
- **No staging environment, no custom domains for previews, no `vercel.json`.** Redirects, headers
  and rewrites are whatever Next.js does by default.
- **No uptime monitoring or alerting.** Nothing will tell you the site is down.

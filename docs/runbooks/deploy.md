# Deployment runbook

How `miloscvetkovic.dev` goes from a parked domain to a live site on Vercel, and how it is operated
afterwards. Every command below is meant to be run as written.

## Status

As of 2026-09-08 the site is **not deployed**. There is no Vercel project, no `vercel.json` in the
repository, and no deployment history. `miloscvetkovic.dev` currently serves a Namecheap parking
page: the apex `A` record points at `162.255.119.232`, `www` is a `CNAME` to
`parkingpage.namecheap.com`, and the domain uses Namecheap BasicDNS
(`dns1.registrar-servers.com`, `dns2.registrar-servers.com`). This runbook takes it from that state
to a live production deployment on the apex domain, and then covers routine deploys, rollback and
the failures worth knowing about in advance.

## Prerequisites

| Requirement           | Detail                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Vercel account        | Hobby is sufficient. The account must be able to add a custom domain.                          |
| Domain control        | Namecheap account that owns `miloscvetkovic.dev`, with access to **Domain List → Manage**.     |
| GitHub repository     | `github.com/milosCvetkovicDev/website`, with the Vercel GitHub app authorised for it.          |
| Node 22               | Matches `.nvmrc` (`22`) and `engines.node` (`>=22`) in the root `package.json`. `nvm use`.     |
| pnpm 10.33.0          | Pinned by `packageManager` in the root `package.json`. Use corepack rather than a global pnpm. |
| Vercel CLI (optional) | `npm i -g vercel`. Only needed for the CLI path and for `vercel rollback`.                     |

`vercel login` opens a browser and completes an interactive email or OAuth confirmation. It cannot
be run by an agent or in a non-interactive shell. Milos must run it himself, once, before any other
CLI command in this runbook.

Before the first deploy, confirm the build is green locally from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These are the same gates the `quality` job in `.github/workflows/ci.yml` runs, plus `pnpm
format:check`. If they fail locally they will fail on Vercel.

## One-time project setup

The two paths below are equivalent. Do one, not both. The dashboard path is recommended for the
first setup because the Node.js version and the production branch are dashboard-only settings.

### Settings that matter

| Setting                | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| Git repository         | `github.com/milosCvetkovicDev/website`                  |
| Root Directory         | `apps/web`                                              |
| Framework Preset       | Next.js                                                 |
| Node.js Version        | 22.x                                                    |
| Install Command        | `pnpm install --frozen-lockfile` (override)             |
| Build Command          | leave as the framework default (`next build`)           |
| Output Directory       | leave as the framework default                          |
| Production Branch      | `main`                                                  |
| `NEXT_PUBLIC_SITE_URL` | `https://miloscvetkovic.dev` for Production and Preview |

Do not set a custom build command such as `turbo build`. With Root Directory `apps/web`, Vercel runs
the build inside that directory, where `pnpm build` is already `next build` (see
`apps/web/package.json`). Turborepo is the local and CI task runner, not part of the Vercel build.

`apps/web/package.json` has no `engines` field, and Vercel reads the Node version from the Root
Directory's `package.json` or from the project setting. The root `engines.node` and `.nvmrc` do not
reach it, so the Node.js Version must be set explicitly in the dashboard.

### Path A: dashboard

1. Go to <https://vercel.com/new> and import `milosCvetkovicDev/website`. Authorise the Vercel
   GitHub app for that repository if prompted.
2. On the import screen, set **Root Directory** to `apps/web`. Vercel should then detect **Next.js**
   as the framework preset; confirm it did.
3. Expand **Build and Output Settings**, enable the override for **Install Command** and set it to
   `pnpm install --frozen-lockfile`. Leave **Build Command** and **Output Directory** on the
   framework defaults.
4. Expand **Environment Variables** and add `NEXT_PUBLIC_SITE_URL` = `https://miloscvetkovic.dev`,
   ticked for **Production** and **Preview**. Leave Development unticked; local `next dev` falls back
   to the same value in code.
5. Click **Deploy**. The first build produces a `*.vercel.app` URL. Open it and click through the
   site before touching DNS.
6. Go to **Project Settings → General** and set **Node.js Version** to 22.x. If it was not already
   22.x, redeploy so the change takes effect.
7. Go to **Project Settings → Git** and confirm **Production Branch** is `main`.

### Path B: Vercel CLI

Run these from the repository root unless stated otherwise.

```bash
vercel login                       # interactive, human-run, opens a browser
cd apps/web
vercel link                        # create or link the project; answer apps/web as the root
vercel env add NEXT_PUBLIC_SITE_URL production   # paste https://miloscvetkovic.dev
vercel env add NEXT_PUBLIC_SITE_URL preview      # paste https://miloscvetkovic.dev
vercel env ls                      # confirm both entries exist
vercel deploy                      # preview deployment, prints a URL
vercel deploy --prod               # production deployment
```

After linking, still open **Project Settings → General** in the dashboard to set **Node.js Version**
to 22.x and the **Install Command** override, and **Project Settings → Git** to confirm the
production branch is `main`. The CLI does not set those.

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
   **redirects to `miloscvetkovic.dev`**. Vercel will then show the DNS records it expects for each.
4. Both domains will sit in **Invalid Configuration** until the Namecheap records change. That is
   expected at this point.

### 2. At Namecheap

Namecheap → **Domain List → miloscvetkovic.dev → Manage → Advanced DNS**.

First confirm the **Nameservers** field on the Domain tab still reads **Namecheap BasicDNS**. If the
nameservers have been pointed elsewhere, the Advanced DNS tab is not authoritative and the records
must be edited wherever they point instead.

Remove:

| Type                | Host  | Current value                | Action            |
| ------------------- | ----- | ---------------------------- | ----------------- |
| A Record            | `@`   | `162.255.119.232`            | Delete            |
| CNAME Record        | `www` | `parkingpage.namecheap.com.` | Delete            |
| URL Redirect Record | any   | any                          | Delete if present |

Add:

| Type         | Host  | Value                   | TTL       |
| ------------ | ----- | ----------------------- | --------- |
| A Record     | `@`   | `76.76.21.21`           | Automatic |
| CNAME Record | `www` | `cname.vercel-dns.com.` | Automatic |

Then, back in Vercel, open **Project Settings → Domains** and use **Refresh** on each domain until
both report **Valid Configuration**. Vercel issues the TLS certificate automatically once the
records resolve; that usually takes under a minute after propagation.

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
- Do not delete unrelated records. If email or verification `TXT`/`MX` records exist on the domain,
  leave them alone; only the apex `A`, the `www` `CNAME` and any URL redirect record are in scope.

## Verify

Run these once Vercel reports Valid Configuration for both domains.

```bash
# Apex resolves to the Vercel anycast address.
dig +short miloscvetkovic.dev
# expect: 76.76.21.21

# www is a CNAME to Vercel (dig prints the CNAME target, then the address it resolves to).
dig +short www.miloscvetkovic.dev
# expect: cname.vercel-dns.com. followed by an IP address

# www redirects to the apex.
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.miloscvetkovic.dev
# expect: 308 https://miloscvetkovic.dev/   (a 307 is also fine; a 200 means www is NOT redirecting)

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
- [ ] A deliberate 404 (for example `/work/does-not-exist`) renders the custom not-found page
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
  which is why `NEXT_PUBLIC_SITE_URL` is set there too.
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

**CLI**:

```bash
vercel rollback                    # revert production to the previous deployment
vercel rollback <deployment-url>   # or promote a specific earlier deployment
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

| Symptom                                                      | Cause                                             | Fix                                                              |
| ------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| Install fails, `ERR_PNPM_OUTDATED_LOCKFILE`                  | Lockfile does not match a `package.json`          | `pnpm install` locally, commit `pnpm-lock.yaml`, push            |
| Build fails, `next: command not found`                       | Root Directory is not `apps/web`                  | Settings → General → Root Directory: `apps/web`, redeploy        |
| Build or runtime behaves as if on an older Node              | Node version not set; `.nvmrc` is not read        | Settings → General → Node.js Version: 22.x, redeploy             |
| Domain stuck on **Invalid Configuration**                    | Records not propagated, or parking records remain | Delete leftover records, disable parking page, wait, Refresh     |
| `www` returns 200 instead of a redirect                      | `www` added as a serving domain, not a redirect   | Settings → Domains: apex primary, `www` redirects to it          |
| Previews emit production URLs in sitemap, robots and JSON-LD | `NEXT_PUBLIC_SITE_URL` missing for Preview        | Add it to Production and Preview, then redeploy                  |
| A page 404s in production but works locally                  | Live deployment predates the new case study slug  | `vercel inspect <url>` to check the commit, then redeploy `main` |

Detail on the less obvious rows:

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
- **Missing environment variable.** The code falls back to the hard-coded `https://miloscvetkovic.dev`
  in `apps/web/src/app/layout.tsx`, `sitemap.ts`, `robots.ts` and `components/json-ld.tsx`, so a
  missing variable is invisible in Production and only shows up on preview deployments. The value is
  inlined at build time, so saving the variable in Vercel changes nothing until the next deploy.

## Not covered

This runbook deliberately stops short of the following. None of it exists yet; do not assume it does.

- **`apps/playground` is not deployed.** It is a local Vite sandbox (`pnpm dev:playground`) with no
  Vercel project and no public URL. Only `apps/web` ships.
- **No analytics.** Vercel Analytics and Speed Insights are not enabled and no third-party analytics
  script is in the app. Traffic numbers are not available anywhere.
- **No error monitoring.** There is no Sentry or equivalent. `apps/web/src/app/error.tsx` renders a
  friendly error page but reports nothing; production failures are only visible in
  `vercel logs`.
- **No preview protection.** Preview deployments are publicly reachable by URL to anyone who has the
  link, including from the pull request comment.
- **No staging environment, no custom domains for previews, no `vercel.json`.** Redirects, headers
  and rewrites are whatever Next.js does by default.
- **No uptime monitoring or alerting.** Nothing will tell you the site is down.

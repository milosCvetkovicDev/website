# Deployment runbook

How `miloscvetkovic.dev` goes from a parked domain to a live site on Vercel, and how it is operated
afterwards. Every command below is meant to be run as written.

The reasoning behind these choices, why Vercel, why the apex is primary and why DNS stays at
Namecheap, is in [ADR 0005](../adr/0005-hosting-on-vercel.md). Why there is now an
`apps/web/vercel.json`, which branches never deploy and which commits never build, is in
[ADR 0016](../adr/0016-vercel-deployment-budget.md). The single environment variable is documented in
[`.env.example`](../../.env.example).

## Status

As of 2026-09-09 the site is **live at `https://miloscvetkovic.dev`**. The Vercel project is
`portfolio` in the team `cvetkovicmilosgmailcoms-projects`, linked to
`github.com/milosCvetkovicDev/website` with production branch `main`, Root Directory `apps/web`,
Node 22.x and `pnpm install --frozen-lockfile` as the install command. Its first production
deployment was built from commit `a8b4a91` and passed every check under **Verify**. The Namecheap
records were switched the same day: the apex resolves to `216.198.79.1` and `64.29.17.1`, `www` is
a `CNAME` to `30c6e6551c22e39e.vercel-dns-017.com.` and redirects to the apex with a 308, Namecheap
BasicDNS (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`) stays authoritative, the mail
records were untouched, and the certificate was created with `vercel certs issue` after automatic
issuance had not happened within ten minutes. What the domain looked like
before, and how to put it back, is under **Reverting the DNS change**. Two Vercel-specific files are
tracked: `.vercelignore`, explained under Path B, and `apps/web/vercel.json`, explained under
**Which pushes deploy**. The rest of this runbook covers routine deploys, rollback and the failures
worth knowing about in advance.

## Prerequisites

| Requirement       | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel account    | Hobby is sufficient. The account must be able to add a custom domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Domain control    | Namecheap account that owns `miloscvetkovic.dev`, with access to **Domain List → Manage**. The registration **expires 2026-11-24** (`.dev` registry RDAP records `2026-11-24T19:49:58Z`). A month before that, confirm **Auto-Renew is on and the payment method on file has not itself expired**: an expiry takes the site and the mail forwarding down together and nothing here monitors uptime. Re-read the date after a renewal with `curl -sS https://pubapi.registry.google/rdap/domain/miloscvetkovic.dev \| jq -r '.events[] \| select(.eventAction == "expiration") \| .eventDate'`, which printed `2026-11-24T19:49:58.428Z` on 2026-09-12. |
| GitHub repository | `github.com/milosCvetkovicDev/website`, with the Vercel GitHub app authorised for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Node 22           | Matches `.nvmrc` (`22`) and `engines.node` (`>=22`) in the root `package.json`. `nvm use`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| pnpm 10.33.0      | Pinned by `packageManager` in the root `package.json`. Use corepack rather than a global pnpm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Vercel CLI        | `npm i -g vercel`. Path B was run with 59.13.1 and uses `vercel project update` (54.21 or newer; its `--root-directory` and `--node-version` flags are in `--help` but not yet on the docs page), `vercel api`, `vercel deploy-hooks` and `vercel curl` (48.8 or newer). Also used for `vercel rollback` and for inspecting deployments (`vercel ls`, `vercel inspect`, `vercel logs`).                                                                                                                                                                                                                                                                |

`vercel login` opens a browser and completes an interactive email or OAuth confirmation. It cannot
be run by an agent or in a non-interactive shell. Milos must run it himself, once, before any other
CLI command in this runbook. The one exception is a personal access token from **Account Settings →
Tokens**, which works as `vercel --token "$VERCEL_TOKEN" <command>` without a browser. Creating the
token is still an interactive human step, and the token is a production credential: do not paste it
into a shared session and do not commit it.

Before the first deploy, confirm the build is green locally from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm check:allowbuilds
pnpm test:scripts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter web exec playwright install --with-deps chromium   # once per machine
pnpm --filter web test:e2e
```

These are every gate in `.github/workflows/ci.yml`. The first eight commands are the `quality` job;
the last two are the `e2e` job, which on CI runs Playwright against the production build
(`next start`) on port 3000, while the same command locally starts a dev server on port 3210.
Playwright always starts the server it tests and never attaches to one that is already running, so
a local run is unaffected by whatever holds 3000 ([ADR 0014](../adr/0014-playwright-owns-its-server.md)).
Both jobs must be green before a pull request can merge, and merging to `main` is what deploys. Vercel runs none of
them: it runs the install command and `turbo run build`, which is `next build` for `web`, and
nothing else.

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
- `vercel deploy` uploads the working tree filtered by `.vercelignore` and the CLI's built-in list of
  about two dozen names (`node_modules`, `.next`, `.git` and `.env.local` among them, not `.turbo`),
  never by `.gitignore`. Without `.vercelignore` the first attempt
  uploaded 1.9 GB of `.turbo` cache and failed with `File size limit exceeded (100 MB)`. The file is
  committed for that reason; keep it aligned with `.gitignore`.

For the first production deployment, prefer a Git-triggered build over `vercel deploy --prod`: it
builds the commit on `main` inside Vercel, so the deployment carries the commit and branch, and it
proves that the Git connection can clone the repository. A deploy hook does that without a push:

```bash
vercel deploy-hooks create bootstrap-main --ref main   # prints a URL; treat it as a secret
curl -X POST "<hook url>"                              # returns {"job":{"state":"PENDING",...}}
vercel ls                                              # the new deployment, Environment: Production
vercel inspect <deployment-url> --wait --timeout 5m    # blocks until READY or ERROR
vercel inspect <deployment-url> --logs 2>&1 | grep -E 'Cloning|install|turbo run'   # log is on stderr
vercel deploy-hooks remove <hook-id> --yes             # anyone holding the URL can start builds
```

On 2026-09-09 this built `a8b4a91` in 38 seconds. Fetch pages from the deployment with
`vercel curl <path> --deployment <deployment-url>`, which gets through deployment protection by
creating a project-wide bypass secret on first use (see **Not covered**).

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

Remove. This is what the Advanced DNS tab actually showed on 2026-09-09: the parking
`A 162.255.119.232` that `dig` reports is not listed as an `A` record, Namecheap serves it from the
URL Redirect Record.

| Type                | Host  | Value                                      | Action |
| ------------------- | ----- | ------------------------------------------ | ------ |
| URL Redirect Record | `@`   | `http://www.miloscvetkovic.dev` (Unmasked) | Delete |
| CNAME Record        | `www` | `parkingpage.namecheap.com.`               | Delete |

Add the records Vercel lists for these domains (`vercel domains verify <domain>`, or **Project
Settings → Domains**), with TTL `Automatic`. On 2026-09-09 Vercel's first-ranked recommendation was
two `A` records on the apex and one project-specific `CNAME` on `www`:

| Type         | Host  | Value                                  | TTL       |
| ------------ | ----- | -------------------------------------- | --------- |
| A Record     | `@`   | `216.198.79.1`                         | Automatic |
| A Record     | `@`   | `64.29.17.1`                           | Automatic |
| CNAME Record | `www` | `30c6e6551c22e39e.vercel-dns-017.com.` | Automatic |

Confirm those values against `vercel domains verify` or the dashboard before typing them, and do not
take them from `vercel domains inspect`, which recommends the second-ranked `76.76.21.21`. Vercel
has changed its apex address before (`76.76.21.21` is now its second-ranked option, as is
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
Work the certificate problem rather than changing the DNS records again. On 2026-09-09 nothing had
been issued ten minutes after both domains verified, with `CAA` empty;
`vercel certs issue miloscvetkovic.dev www.miloscvetkovic.dev` created the certificate in 12 seconds
and the apex answered over HTTPS immediately.

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

- **DMARC is missing and is the one mail record to add.** As of 2026-09-12
  `dig +short TXT _dmarc.miloscvetkovic.dev @8.8.8.8` prints nothing and the name is `NXDOMAIN`,
  while SPF is published. That combination is the worst of both: a receiver is told which senders are
  legitimate but given no instruction for the mail that fails the check and no address to report it
  to, so the domain is cheap to spoof and nobody finds out. Add it at Namecheap under
  **Advanced DNS → Add New Record → TXT Record**, Host `_dmarc`, TTL `Automatic`, with the
  monitor-only policy, which changes nothing about delivery:

  ```text
  v=DMARC1; p=none; rua=mailto:dmarc@miloscvetkovic.dev; fo=1
  ```

  `rua` has to be a mailbox that exists, so add a `dmarc@` alias under Namecheap's **Email
  Forwarding** first, or substitute an inbox you already read. Verify with
  `dig +short TXT _dmarc.miloscvetkovic.dev @8.8.8.8`, which must print the record back. Leave it at
  `p=none` and read the aggregate reports for a few weeks before tightening to `p=quarantine`: the
  forwarding hosts are the only legitimate sender today, and a `p=reject` published before that is
  confirmed bounces real mail. The host is `_dmarc`, not the apex; a `v=DMARC1` string on the apex
  does nothing.

- **DNSSEC is deliberately left off.** The `.dev` zone is signed but not delegated — the registry
  reports `"secureDNS": {"delegationSigned": false, "zoneSigned": true}`, and
  `dig +short DS miloscvetkovic.dev @8.8.8.8` returns nothing. Publishing a `DS` record would mean
  Namecheap holds the keys for a zone whose only records are two `A`s, a `CNAME` and mail
  forwarding, and a key rollover that goes wrong takes the domain off the internet entirely rather
  than degrading. `.dev` is HSTS-preloaded, so the transport is already forced to TLS with a
  publicly-logged certificate, which is what DNSSEC would otherwise be protecting here. Revisit if
  the zone ever carries something a resolver has to be able to trust on its own. Check the state
  with `curl -sS https://pubapi.registry.google/rdap/domain/miloscvetkovic.dev | jq -c '.secureDNS'`.

### Reverting the DNS change

Delete the two `A` records on `@` and the `CNAME` on `www` that point at Vercel, then add back what
was there before 2026-09-09: a **URL Redirect Record** on `@` to `http://www.miloscvetkovic.dev`
(Unmasked; Namecheap serves it as `A 162.255.119.232`) and `CNAME www parkingpage.namecheap.com.`,
or re-enable the parking page on the Domain tab, which creates the same records. Expect the same
propagation delay as the cutover, and re-check the `MX` and `TXT` records afterwards. Leave the
Vercel project in place: a domain sitting in **Invalid Configuration** costs nothing.

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
`vercel curl <path> --deployment <deployment-url>` fetches those, with the side effect noted under
**Not covered**. On 2026-09-09 the first production build passed all of it: the `<title>`, the nine
sitemap entries, `robots.txt` and both JSON-LD `url` fields carried the apex origin and the not-found
page rendered; a headless
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
- [ ] `/work/does-not-exist` answers `404` and renders the site not-found page
      (`apps/web/src/app/not-found.tsx`), identically to `/no-such-page`. There is one not-found page,
      not two: the case-study segment has no `not-found.tsx` of its own, because
      `generateStaticParams` fixes the slug set at build time and an unknown slug never reaches the
      page component ([ADR 0015](../adr/0015-static-case-study-params.md)). Check the status, not just
      the body: `curl -s -o /dev/null -w '%{http_code}\n' https://miloscvetkovic.dev/work/does-not-exist`
      must print `404`, and the body must contain "Page not found"
- [ ] `/no-such-page` renders that same page with the same `404`
- [ ] JSON-LD is present: `view-source` on `/` contains two `application/ld+json` blocks (Person and
      WebSite, from `apps/web/src/components/json-ld.tsx`) and their `url` fields are the apex
- [ ] The theme toggle in the navigation switches light and dark, the choice survives a reload, and
      there is no light-to-dark flash on first paint
- [ ] Browser console is clean on every page. `apps/web/e2e/console-clean.spec.ts` covers this in
      CI on every pull request: it loads every route above, the two not-found URLs that render the
      one not-found page, and `/` under
      reduced motion against the production build and fails on any console error, console warning
      or page error, React hydration mismatches and 404s for assets requested on load included.
      Confirm the `e2e` job was green on the deployed commit. The spec targets `next start` on
      localhost, so anything the hosting layer injects or blocks is outside it: after a
      Vercel-side change (analytics, headers), open the live `/` once with the console open.
      Locally: `pnpm --filter web build && CI=true pnpm --filter web test:e2e`. `CI=true` selects
      the production build and the runner hardening, not the port; the run serves 3210, so it works
      while a dev server or another checkout holds 3000.
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

from `apps/web` with `pnpm start` serving the build, which listens on 3000 and is started by hand:
it is a different server from the one the e2e suite runs on 3210. `--headless=new` follows the machine's
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
  GitHub app as a comment and a commit status, **except** the two classes under **Which pushes
  deploy** below. Preview builds use the Preview environment variables,
  which is why `NEXT_PUBLIC_SITE_URL` is set there too. Whether a preview URL opens without a Vercel
  login depends on the deployment protection setting (see Not covered).
- **Finding the deployment for a commit**: in the dashboard, **Deployments** lists each deployment
  with its branch and commit SHA; filter by branch or search the SHA. From the CLI:

  ```bash
  vercel ls                      # recent deployments, newest first
  vercel inspect <deployment-url>                  # environment, build state and aliases; no commit
  vercel inspect <deployment-url> --logs 2>&1 | grep Cloning   # the branch and commit that were built
  vercel logs <deployment-url>   # runtime logs for that deployment
  ```

- Deploying by hand (`vercel deploy --prod`) bypasses the Git flow and produces a production
  deployment with no associated commit. Avoid it except to recover from a broken Git integration,
  and remember that it uploads the working tree as filtered by `.vercelignore`.
- To rebuild **the commit that is already live**, for example after changing `NEXT_PUBLIC_SITE_URL`
  (which is inlined at build time), run `vercel redeploy <deployment-url>` against the current
  production deployment. `vercel redeploy` is "Rebuild and deploy a previous deployment" (CLI
  59.13.1): it rebuilds that deployment's own commit and takes no git ref, so it **cannot move
  production forward**. If production is behind `main`, see **Catching production up** below.

### Catching production up

When production's commit is not `main`'s HEAD — because a build was refused, cancelled or never
created — `vercel redeploy` is the wrong tool, and a refused commit has no deployment to redeploy in
the first place. Production only moves forward when a new deployment is created from `main`. Three
ways, in order of preference:

1. **Push to `main`.** Merging the next pull request is one, and is usually already on its way.
2. **A deploy hook**, the Path B sequence, which needs no commit:

   ```bash
   vercel deploy-hooks create catch-up-main --ref main   # prints a URL; treat it as a secret
   curl -X POST "<hook url>"                            # returns {"job":{"state":"PENDING",...}}
   vercel ls                                            # the new deployment, Environment: Production
   vercel inspect <deployment-url> --wait --timeout 5m
   vercel deploy-hooks remove <hook-id> --yes           # anyone holding the URL can start builds
   ```

3. **The dashboard**: **Deployments → Create Deployment**, branch `main`.

Confirm with the commit that was cloned, not with the "Ready" badge:

```bash
vercel inspect <deployment-url> --logs 2>&1 | grep Cloning
gh api "repos/milosCvetkovicDev/website/deployments?environment=Production&per_page=1" --jq '.[0].sha'
git rev-parse origin/main            # must equal the SHA above
```

**Before deciding production is behind, check whether the build was skipped on purpose.**
`apps/web/vercel.json` can skip a build whose commit changes nothing the site is built from
([ADR 0016](../adr/0016-vercel-deployment-budget.md)), and a skipped merge looks exactly like a lost
one in the deployment list. This says which it was — it exits 0 when the deployed commit and `main`
build byte-identical output, so the lag is deliberate and needs no action:

```bash
git fetch origin
git diff --quiet <deployed-sha> origin/main -- \
  apps/web packages package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc .nvmrc \
  && echo 'deliberate skip: no build inputs changed' \
  || echo 'production is genuinely behind: catch it up'
```

The path list is the one in `scripts/vercel-ignore-build.mjs`; if that file's
`BUILD_INPUT_DIRECTORIES` and `BUILD_INPUT_FILES` change, this command changes with it.

## Which pushes deploy

Two tracked mechanisms keep the Hobby plan's 100 deployments a day from being spent on builds nobody
reads. Both live in `apps/web/vercel.json`, which Vercel reads from the project's Root Directory. The
reasoning, and the 2026-09-10 outage that prompted them, are in
[ADR 0016](../adr/0016-vercel-deployment-budget.md).

| Push                                      | What happens                        | Quota cost |
| ----------------------------------------- | ----------------------------------- | ---------- |
| A Dependabot branch                       | no deployment is created at all     | none       |
| Any other branch, no build inputs changed | deployment created, build cancelled | one        |
| Merge to `main`, no build inputs changed  | builds (production always builds)   | one        |
| Anything that changed a build input       | builds                              | one        |

- **`git.deploymentEnabled`** stops the deployment being created, which is the half that actually
  saves quota. It matches branch names with minimatch, and `dependabot/*` and `dependabot/**` are the
  only entries — both, so the rule holds whether or not the matcher lets `*` cross a slash.
  Dependabot pull requests therefore have **no preview URL**; CI builds and Playwright-tests them
  instead. To look at one in a browser, push the same tree under another branch name.
- **`ignoreCommand`** runs `scripts/vercel-ignore-build.mjs` once the deployment exists, and cancels
  the build when the commit changes nothing the site is built from. It does **not** save quota:
  Vercel counts a cancelled build as a full deployment. What it saves is the build minutes and the
  single Hobby concurrent build slot, so a real build no longer queues behind a runbook edit.
- **The exit code is inverted**: `0` skips the build, `1` builds it. That is Vercel's contract. The
  script's header comment says so, and a test asserts it.
- **Production always builds**, so the newest production deployment's commit stays equal to `main`'s
  HEAD. To let documentation-only merges skip as well, set `VERCEL_SKIP_DOCS_ONLY_PRODUCTION=1` in the
  project's **Production** environment; then production can legitimately lag `main` and the
  `git diff --quiet` command under **Catching production up** is how you tell that from a lost
  deployment.

The tracked file is authoritative, because `ignoreCommand` in `vercel.json` overrides the dashboard's
**Ignored Build Step**. Set the dashboard field to the same command anyway, as a fallback for a
deployment created without the file (**Settings → Build and Deployment → Ignored Build Step →
Custom**), and because the project API is where `vercel api /v9/projects/<project-id> --raw | jq
.commandForIgnoringBuildStep` looks. The exact string, which Vercel runs with the working directory
set to the Root Directory `apps/web`, so the two-level hop is fixed rather than a guess and needs no
shell:

```bash
node ../../scripts/vercel-ignore-build.mjs
```

If the Root Directory ever moves, this string has to move with it. It fails loudly if it is not
updated — node cannot find the file, exits non-zero, and the build runs — which is the safe
direction. The script resolves the repository root through `git rev-parse --show-toplevel` for its own
diff, so it never reads the wrong tree.

Before relying on skips, confirm the `Vercel` context is **not** a required status check on `main` or
on pull requests: a skipped build reports as cancelled, and a required check that never arrives blocks
every documentation-only merge.

```bash
gh api repos/milosCvetkovicDev/website/branches/main/protection \
  --jq '.required_status_checks.contexts'    # must not contain "Vercel"
```

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

| Symptom                                                                                                                     | Cause                                                                                                                                                                                                                                                                                                  | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install fails, `ERR_PNPM_NO_LOCKFILE` or `@repo/prettier-config` is not in the workspace                                    | Workspace root not available to the build                                                                                                                                                                                                                                                              | Settings → General → enable **Include source files outside of the Root Directory in the Build Step**, redeploy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Install fails, `ERR_PNPM_OUTDATED_LOCKFILE`                                                                                 | Lockfile does not match a `package.json`                                                                                                                                                                                                                                                               | `pnpm install` locally, commit `pnpm-lock.yaml`, push                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Build fails, `next: command not found`                                                                                      | Root Directory is not `apps/web`                                                                                                                                                                                                                                                                       | Settings → General → Root Directory: `apps/web`, redeploy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Build or runtime behaves as if on an older Node                                                                             | Node version not set; `.nvmrc` is not read                                                                                                                                                                                                                                                             | Settings → General → Node.js Version: 22.x, redeploy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Domain stuck on **Invalid Configuration**                                                                                   | Records not propagated, or parking records remain                                                                                                                                                                                                                                                      | Delete leftover records, disable parking page, wait, Refresh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Domain is **Valid Configuration** but HTTPS fails and the site is unreachable                                               | Certificate has not issued                                                                                                                                                                                                                                                                             | `dig +short CAA miloscvetkovic.dev`; remove or widen a `CAA` record that excludes `letsencrypt.org`, then Refresh; if `CAA` is empty, `vercel certs issue miloscvetkovic.dev www.miloscvetkovic.dev`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `www` returns 200 instead of a redirect                                                                                     | `www` added as a serving domain, not a redirect                                                                                                                                                                                                                                                        | Settings → Domains: apex primary, `www` redirects to it with 308                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Previews emit apex URLs in sitemap, robots and JSON-LD                                                                      | Expected: Preview uses the same value as Production                                                                                                                                                                                                                                                    | No fix needed. To make previews self-identify, give Preview a different `NEXT_PUBLIC_SITE_URL` and redeploy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A page 404s in production but works locally                                                                                 | Live deployment predates the new case study slug                                                                                                                                                                                                                                                       | `vercel inspect <url> --logs 2>&1 \| grep Cloning` to check the commit, then catch production up (see **Catching production up**); `vercel redeploy` rebuilds the same commit and will not help                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| The `Vercel` commit status on a `main` commit is `failure`, `Deployment rate limited - retry in 24 hours`                   | The account passed 100 deployments created in 24 hours (Hobby). Vercel **never retries**, so that merge is simply not live                                                                                                                                                                             | Read the deployed SHA with `gh api "repos/milosCvetkovicDev/website/deployments?environment=Production&per_page=1" --jq '.[0].sha'` and compare it with `git rev-parse origin/main`. If it is behind, wait for the window to clear and then create a deployment from `main` — a push, the deploy hook with `--ref main`, or the dashboard (see **Catching production up**). `vercel redeploy` cannot help: it rebuilds the commit already live, and a refused commit has no deployment to rebuild. Then check **Which pushes deploy** is in effect, because the cause is spend, not a broken build                                                                                                                                                                                                                                                                                                                                                   |
| A merge to `main` produced no deployment at all                                                                             | The build was skipped on purpose, or was never created                                                                                                                                                                                                                                                 | Run the `git diff --quiet` command under **Catching production up**. Exit 0 means no build input changed and the skip is deliberate ([ADR 0016](../adr/0016-vercel-deployment-budget.md)); exit 1 means production is genuinely behind                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `vercel deploy` uploads gigabytes, then fails with `File size limit exceeded (100 MB)`                                      | `.vercelignore` missing or out of step with `.gitignore`                                                                                                                                                                                                                                               | Restore `.vercelignore` (it must list `.turbo`), or deploy from Git instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `vercel git connect` prints `Failed to connect`                                                                             | Often spurious                                                                                                                                                                                                                                                                                         | `vercel api /v9/projects/<id> --raw \| jq .link`; if `link` is set the connection exists, otherwise install the Vercel GitHub App and retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A Vercel install log warns `Ignored build scripts: esbuild@<version>` for a package that already has an `allowBuilds` entry | Stale state, not a new decision. pnpm re-reports the builds recorded in `node_modules/.modules.yaml`, and Vercel restores that from its build cache ("Restored build cache from previous deployment"), so the record is written back after every deploy. The `main` CI install log has zero such lines | Nothing to decide; the denial in `pnpm-workspace.yaml` is already the answer ([ADR 0013](../adr/0013-dependency-build-scripts-reviewed.md)). Locally: `pnpm clean && pnpm install`. On Vercel: redeploy with the build cache off (**Deployments → … → Redeploy**, untick **Use existing Build Cache**), then `vercel inspect <url> --logs 2>&1 \| grep -c 'Ignored build scripts'` prints `0`. Do **not** run `pnpm approve-builds`: approving `esbuild` would reverse the reviewed denial at `pnpm-workspace.yaml`, and `pnpm check:allowbuilds` only verifies the reviewed version and that a script still exists, so a mistaken `true` passes CI. A warning naming a package with **no** entry is a real new decision — follow the procedure in ADR 0013 (`pnpm ignored-builds`, `pnpm why -r <name>`, read its `scripts`, add `true`/`false` with a `Reviewed at` comment), which supersedes [ADR 0007](../adr/0007-dependency-build-scripts.md) |

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

This runbook deliberately stops short of the following. None of it is in place; do not assume it is.

- **`apps/playground` is not deployed.** It is a local Vite sandbox (`pnpm dev:playground`) with no
  Vercel project and no public URL. Only `apps/web` ships.
- **No analytics reaches anyone, although the Vercel toggle is on.** These are two switches and only
  one of them is flipped. The project has Web Analytics enabled server-side (`webAnalytics.enabledAt`
  is `2026-09-09T08:20:48Z` in the project API, and
  `curl -s https://miloscvetkovic.dev/_vercel/insights/script.js` answers `200`
  `application/javascript`), but nothing loads that script: `apps/web/package.json` does not depend on
  `@vercel/analytics`, no `<Analytics />` is mounted in `apps/web/src/app/layout.tsx`, and
  `curl -s https://miloscvetkovic.dev/ | grep -c '_vercel'` prints `0`. So Speed Insights reports
  `hasData: false` and there are no traffic numbers anywhere. Pick one state rather than leaving both
  half-on:
  - **Off** (smaller change): turn Web Analytics off under **Project Settings → Analytics**, then
    `vercel api /v9/projects/<project-id> --raw | jq .webAnalytics` returns null and this bullet
    becomes simply "no analytics".
  - **On**: `pnpm --filter web add @vercel/analytics` and mount `<Analytics />` in the layout's
    provider tree. That couples to three other things — a Content-Security-Policy has to allow
    `/_vercel/insights/`, the first-load JS budget has to be re-measured, and
    `apps/web/e2e/console-clean.spec.ts` will not see the script at all because it runs against a
    local `next start`, so the live `/` has to be opened with the console open after the deploy.
- **No Speed Insights data.** See above; the toggle reports `hasData: false`.
- **No error monitoring.** There is no Sentry or equivalent. `apps/web/src/app/error.tsx` is a client
  component: it renders a friendly error page and calls `console.error` in the visitor's browser,
  which goes nowhere you can see. The site is fully prerendered, so there is little server runtime
  and `vercel logs` shows little beyond request-level information. In practice a client-side
  production failure is invisible until someone reports it.
- **Deployment protection is Vercel's default, plus one bypass secret.**
  `vercel project protection portfolio` reports `ssoProtection.deploymentType:
all_except_custom_domains`. Observed on 2026-09-09: the per-deployment URL
  (`portfolio-<hash>-<team>.vercel.app`), the branch URL (`portfolio-git-main-<team>.vercel.app`) and
  the team URL answer `302` to a Vercel login, while the production alias
  `portfolio-theta-gold-77.vercel.app` answers `200` to anyone, as the custom domains will once they
  resolve (that is what `all_except_custom_domains` means). Pull request previews are therefore
  private to the project owner, which is a wall for any reviewer without a Vercel login. The same
  command also lists `protectionBypass`. Beware that `vercel curl` **creates** an
  `automation-bypass` secret on first use, without prompting: Vercel injects it into deployments as
  `VERCEL_AUTOMATION_BYPASS_SECRET`, and anyone holding it gets past the login on every deployment
  until it is revoked. One was created that way on 2026-09-09 and revoked the same day, because
  nothing in this repository uses it and the end-to-end job runs against a local `next start`
  rather than a preview. To revoke one:

  ```bash
  vercel project protection disable portfolio --protection-bypass \
    --protection-bypass-secret "$(vercel project protection portfolio \
      | sed -n '/^{/,$p' | jq -r '.protectionBypass | keys[0]')"
  ```

  Confirm with `vercel project protection portfolio`, whose `protectionBypass` must come back empty.
  There is no `--yes` on this subcommand, and passing one is worse than useless: the CLI prints
  `unknown or unexpected option` **and still exits 0**, so a wrapper that trusts the exit code
  reports success while nothing changed. Check the state, not the exit code, after any
  `vercel project protection` call.

- **No staging environment and no custom domains for previews.** There is an
  `apps/web/vercel.json`, but it carries Git and build-step configuration only (**Which pushes
  deploy**); redirects, headers and rewrites are still whatever Next.js does by default, and a
  response header belongs in `headers()` in `next.config.ts` rather than in that file
  ([ADR 0005](../adr/0005-hosting-on-vercel.md), [ADR 0016](../adr/0016-vercel-deployment-budget.md)).
- **No uptime monitoring or alerting.** Nothing will tell you the site is down, and nothing compares
  the production deployment's commit with `main`. The 2026-09-10 rate-limit outage went unnoticed for
  over a day for exactly that reason. The check is one command —
  `gh api "repos/milosCvetkovicDev/website/deployments?environment=Production&per_page=1" --jq '.[0].sha'`
  against `git rev-parse origin/main` — and putting it on a schedule is a separate piece of work.

export interface CaseStudyMetric {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

/** Short facts shown on project cards (home page and /work). One source, so they cannot contradict. */
export interface CaseStudyHighlight {
  category: string;
  status: 'LIVE' | 'PRODUCTION';
  metric: CaseStudyMetric;
}

/**
 * Renders a metric for display. Total by construction: a value that is not a finite number has no
 * honest rendering, so it becomes an em dash rather than "NaN%", and the digit count is clamped to
 * the range toFixed accepts so a data edit cannot throw during server rendering.
 */
export function formatMetric(metric: CaseStudyMetric): string {
  if (!Number.isFinite(metric.value)) return '—';
  const decimals = Math.min(20, Math.max(0, Math.trunc(metric.decimals ?? 0)));
  return `${metric.prefix ?? ''}${metric.value.toFixed(decimals)}${metric.suffix ?? ''}`;
}

export interface CaseStudy {
  slug: string;
  title: string;
  /** What the project is in a few words, for the page title: `<title> — <tagline>`, 42 chars at most. */
  tagline: string;
  description: string;
  tags: string[];
  highlight: CaseStudyHighlight;
  challenge: string;
  approach: string;
  /** Optional: how the system works end to end, as ordered steps. */
  howItWorks?: string[];
  contributions: string[];
  impact: string[];
  /** Optional: what the project taught, one lesson per entry. */
  lessons?: string[];
  techStack: {
    category: string;
    items: string[];
  }[];
  /**
   * When the case study first went public and when its visible content last changed, as ISO dates
   * (`YYYY-MM-DD`). The sitemap's `lastmod` and the TechArticle's dates read them, so bump
   * `updatedAt` in the commit that changes what the page says, and only then.
   */
  publishedAt: string;
  updatedAt: string;
}

// TODO(milos): confirm both dates for every study. From git: acacce0 added every study on
// 2026-01-27, and PUBLISHED_AT is the date of 7d31606, "Go live: hero redesign, shared configs, and
// page improvements (#2)", 2026-02-23. But the site was undeployed until 2026-09-09
// (docs/adr/0002-monorepo-toolchain.md:170; docs/runbooks/deploy.md:14-18 puts the first
// production deployment, a8b4a91, on that day), so 2026-09-09 may be the truer publish date.
// UPDATED_AT is 2026-09-24, the day the rewrite from public sources merged. It changed every
// study's approach, and its howItWorks or its lessons; d1da60f (#116) had redrafted them on
// 2026-09-23.
const PUBLISHED_AT = '2026-02-23';
const UPDATED_AT = '2026-09-24';

export const caseStudies: CaseStudy[] = [
  // TODO(milos): copy rewritten on 2026-09-23 from public sources (the claude-code-monorepo
  // repository and this repository's docs and history). These questions are still open:
  // - Is the agent still running, or was it retired? Should the status stay LIVE? The public
  //   claude-code-monorepo names the self-healing agent helix-agent
  //   (project/.claude/agents/archived/documentation-writer.md:28), records it as decommissioned
  //   end to end in PRs #727 and #729 (global/memory/poc5-phase4-gap-tasks.md:2-3, :11, :32; all
  //   closed 2026-05-13) and lists "#1225 helix-agent removal" as merged on 2026-06-11/12
  //   (global/memory/platform-dev-stabilization-epic.md:89). The copy keeps the present tense of
  //   docs/plans/2026-01-27-portfolio-design.md; if it was retired, the status, the description, the approach,
  //   How It Works and the impact bullets all need to change.
  // - Which log queries, tables or error signals in Azure Log Analytics does the agent watch, and
  //   how does it decide that something has broken?
  // - How does an error reach the agent: does it poll Log Analytics, receive an alert, or
  //   something else, and what does the Elysia service expose (webhook, API, dashboard)?
  //   claude-code-monorepo global/memory/poc5-phase4-gap-tasks.md:32 records the agent's role
  //   assignments on the shared Log Analytics workspace, which fits querying it directly, but no
  //   public source says how errors reach it. The copy says only that it monitors production
  //   errors through Log Analytics until you confirm.
  // - What does the agent keep in Azure Table Storage: run history, learning metrics, fix
  //   patterns, something else?
  // - What are the actual values of the daily limit, the budget cap and the confidence threshold,
  //   and what does each one gate (opening a PR at all, a retry, a spend)?
  // - What does a retry do: re-run CI, or ask Claude for a revised fix? And what happens after the
  //   third failed attempt?
  // - Is the order right in How It Works: does the agent watch CI on its own pull request before a
  //   human reviews it, or at some other point?
  // - How does the kill switch work, who can pull it, and what do the emergency override controls
  //   let a person do?
  // - Which learning metrics are tracked, and what does calibration improvement look like in
  //   practice (e.g. confidence compared with merged fixes)?
  // - How is a learned fix pattern recorded and matched to a new incident?
  // - Which tools or repository access does the agent get through the Claude Agent SDK to read the
  //   codebase, and which Claude model does it use?
  // - Which product or services does it watch in production, and can the company or team context
  //   be named publicly?
  // - How long has it been running (or how long did it run), how many incidents has it diagnosed,
  //   and what share of its pull requests get merged?
  {
    slug: 'self-healing-agent',
    publishedAt: PUBLISHED_AT,
    updatedAt: UPDATED_AT,
    highlight: {
      category: 'AI AGENT',
      status: 'LIVE',
      metric: { value: 73, suffix: '%', label: 'faster resolution' },
    },
    title: 'Self-Healing Agent',
    tagline: 'autonomous bug fixing',
    description:
      'An AI agent that wakes up before you do. It monitors production, diagnoses errors, and opens PRs with fixes—all autonomously.',
    tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
    challenge:
      "Production breaks at 3am, and nobody wants that call. Errors don't wait for business hours, every minute of downtime costs money and trust, and the on-call rotation turns into the job developers dread. Before anyone can fix anything, somebody has to wake up, read the production logs, find their way around the codebase and work out what actually broke. That diagnosis is exactly the kind of grunt work a machine could do overnight, if it could be trusted with it. Handing it to an agent brings risks of its own, though: an agent can be confidently wrong, it can run up a bill, and it can keep trying long after a sensible engineer would have stopped. The question: can we fix bugs faster than humans can even wake up?",
    approach:
      'I built an autonomous agent that monitors production errors and proposes fixes through pull requests. It runs on Bun and Elysia, keeps its data in Azure Table Storage and uses Azure Log Analytics for monitoring. When something breaks, an error analysis pipeline built on the Claude Agent SDK reads the failure against the codebase, diagnoses the issue and drafts a fix, which the agent opens as a pull request through the GitHub API. It monitors the CI pipeline and retries on failure, capped at three attempts, so a stubborn failure cannot loop forever. Safety constraints keep it on a short leash: daily limits, budget caps and confidence thresholds bound what it may attempt, and it has a kill switch and emergency override controls. It tracks learning metrics to improve its calibration. Humans review and merge its pull requests through approval gates; the agent does the grunt work.',
    howItWorks: [
      'The agent runs on Bun and Elysia and monitors production errors through Azure Log Analytics.',
      'When something breaks, an error analysis pipeline built on the Claude Agent SDK reads the error against the codebase and diagnoses the issue.',
      'It drafts a fix and opens a pull request through the GitHub API, while safety constraints (daily limits, budget caps and confidence thresholds) bound what it may attempt.',
      'It also monitors the CI pipeline and retries on failure, up to three attempts.',
      'Humans review the pull request through approval gates and merge the fix, with a kill switch and emergency override controls on hand.',
      'It tracks learning metrics to improve its calibration.',
    ],
    contributions: [
      'Designed autonomous error analysis pipeline using Claude AI',
      'Implemented automatic PR creation with contextual fixes',
      'Built CI pipeline monitoring with retry logic (max 3 attempts)',
      'Added safety constraints: daily limits, budget caps, confidence thresholds',
      'Created kill switch and emergency override controls',
      'Implemented learning metrics for calibration improvement',
    ],
    impact: [
      'Production incidents get diagnosed before anyone wakes up',
      'Developers stopped dreading on-call rotations',
      'Fix patterns get learned and reused automatically',
      'Humans stay in control—agent proposes, team approves',
      'The system literally improves itself over time',
    ],
    techStack: [
      { category: 'Runtime', items: ['Bun'] },
      { category: 'Framework', items: ['Elysia'] },
      { category: 'AI', items: ['Claude Agent SDK', 'Anthropic API'] },
      { category: 'Monitoring', items: ['Azure Log Analytics'] },
      { category: 'Storage', items: ['Azure Table Storage'] },
      { category: 'VCS', items: ['GitHub API'] },
    ],
  },
  // TODO(milos): copy rewritten on 2026-09-23 from public sources (the claude-code-monorepo
  // repository and this repository's docs and history). These questions are still open:
  // - How much of the public architecture record may this page repeat? claude-code-monorepo
  //   docs/architecture/00-system-context.md and docs/architecture/legacy/01-legacy-architecture.md
  //   describe this system's domain, tenancy model, module counts, how tenant scoping is enforced,
  //   and the document and ERP flow. None of it is in the copy: it would let a reader match this
  //   page to that document, and some of it describes how the production system is secured. Say
  //   which parts, if any, belong here.
  // - How does "I didn't propose a rewrite" (the approach and the first lesson) square with the
  //   public record? The same document calls the system "the system Acme Platform is replacing"
  //   (:3), calls testability "the single most cited reason for the rebuild" (:172-175) and ends
  //   "None of these are reasons to rewrite on their own ... they are" (:666-668), and
  //   docs/architecture/legacy/02-strangler-migration.md:3-4 and :16-17 describe a strangler-fig
  //   rebuild under way. Did the rescue come before that rebuild, or run alongside it?
  // - Did SQL ever sit next to UI components, in a flat file structure? The public source shows the
  //   API and the single-page app as separate Nx projects (project/CLAUDE.md:12), and no public
  //   source describes an earlier state.
  // - The source describes the system as it stands, with no history, and calls its layering a
  //   convention enforced by review and lint (01-legacy-architecture.md:62-65). Is the layering
  //   the result of your migration?
  // - Which hosting does the case study cover? The tech stack lists Azure Container Apps only, but
  //   the API runs on an Azure Linux App Service with a staging slot, and only its sibling
  //   domain-api runs on Container Apps (01-legacy-architecture.md:4-5, :593-597;
  //   docs/architecture/devops/07-environments.md:323-324). Should App Service join the stack?
  // - Does "Security vulnerabilities caught before they reach production" hold? Only CI and
  //   Validate Terraform are required for merge; Trivy, Security Scan and Label Critical are
  //   informational (project/CLAUDE.md:88).
  // - When does the Playwright suite run: a smoke set on every pull request and the full suite on
  //   every push to main, or by hand? project/apps/legacy-web-e2e/CLAUDE.md:43 says both of the
  //   former, while project/.claude/agents/github-actions-expert.md:20 lists e2e-tests.yml as
  //   Manual. The copy says only that the suite is sharded four ways.
  // - How big was the legacy codebase when you started (modules, endpoints, lines of code or
  //   number of services)?
  // - How many people were on the team, and what was your role on it (lead, architect, solo)?
  // - How long did the move to Clean Architecture take, and how many modules had been migrated by
  //   the time you would call it done?
  // - Which async operations moved onto pg-boss (for example emails, imports, report generation),
  //   and what did they do before?
  // - How long did a CI run or a deploy take before and after, and what makes CI run only what
  //   changed (Nx affected, path filters, something else)?
  // - How far did test coverage climb and how far did the bug rate drop, and over what period?
  // - How long did a new developer take to ship a first feature before the rescue, compared with
  //   the first week now?
  // - Did the security scanning (Gitleaks, npm audit, Trivy) catch anything notable that you can
  //   describe without naming the client?
  // - How long did the Playwright suite take before and after the 4-way sharding?
  // - Were infrastructure changes really applied by hand before Terraform, or is 'not YOLO'd'
  //   contrasting with something else?
  {
    slug: 'enterprise-b2b-platform',
    publishedAt: PUBLISHED_AT,
    updatedAt: UPDATED_AT,
    highlight: {
      category: 'PLATFORM',
      status: 'PRODUCTION',
      metric: { value: 40, suffix: '%', label: 'less complexity' },
    },
    title: 'Enterprise B2B Platform',
    tagline: 'legacy rescue',
    description:
      'Took a legacy codebase everyone was afraid to touch and turned it into a system the team actually enjoys working on.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'Terraform'],
    challenge:
      'The codebase had a reputation, and it had earned it. SQL queries lived next to UI components, in a flat file structure with no layers between them. Validation was manual and happened... sometimes. Tests? What tests? Without them, every change was a guess about what else might break, and nobody wanted to be the one guessing. Deploys were no longer fast, either. None of that bought any patience from the business, which needed new features yesterday. So the real problem was never just messy code: it was how to keep shipping those features on a foundation that made every one of them risky, without stopping everything to fix it first.',
    approach:
      "I didn't propose a rewrite—that's how projects die. A rewrite stops feature work while the business is still waiting for features, so instead I introduced boundaries gradually. Clean Architecture emerged one module at a time, with controllers, services and repositories each taking one job, so data access got a layer of its own instead of a seat next to the UI. Manual validation gave way to Zod schemas, whose inferred types keep the checks and the code from drifting apart. I built a background job system on pg-boss for async operations; it keeps its queue in PostgreSQL, so there is no broker to run. The delivery path got the same treatment. CI/CD is built from reusable GitHub composite actions, and Nx's affected commands limit builds, tests and deploys to the projects a change affects. Gitleaks, npm audit and Trivy scan on pushes, pull requests and a weekly schedule. Terraform keeps one remote state file per root directory, with production in a root of its own, and gives each developer a throwaway copy of the stack under a state file of its own; it runs a plan on every pull request that touches the infrastructure and waits for an approval before it applies to production. Playwright E2E tests, written with the Page Object pattern, are sharded four ways. Every PR shipped value while improving the foundation underneath.",
    contributions: [
      'Migrated flat file structure to Clean Architecture (controllers → services → repositories)',
      'Replaced manual validation with Zod schemas and type inference',
      'Built background job system with pg-boss for async operations',
      'Architected modular CI/CD with reusable GitHub composite actions',
      'Implemented security scanning (Gitleaks, npm audit, Trivy)',
      'Designed multi-environment Terraform architecture with state isolation',
      'Established Playwright E2E testing with Page Object pattern and 4-way sharding',
    ],
    impact: [
      'New developers ship features in their first week',
      'CI runs only what changed—deploys are fast again',
      'Bug rate dropped as test coverage climbed',
      'Security vulnerabilities caught before they reach production',
      "Infrastructure changes are reviewed like code, not YOLO'd",
    ],
    lessons: [
      "Don't propose a rewrite: introduce boundaries gradually and let every PR ship value while it improves the foundation underneath.",
      'Replace manual validation with Zod schemas and infer the types from them, so the checks and the code stay in step.',
      'Tests are part of the rescue rather than a reward for finishing it.',
      'Infrastructure changes deserve the same review as code, and a multi-environment Terraform architecture with state isolation puts infrastructure in code, where it can get that review.',
    ],
    techStack: [
      {
        category: 'Frontend',
        items: ['React 18', 'Material-UI', 'Vite', 'TypeScript'],
      },
      {
        category: 'Backend',
        items: ['Express.js', 'Node.js', 'TypeORM', 'Zod'],
      },
      { category: 'Database', items: ['PostgreSQL', 'pg-boss'] },
      { category: 'Testing', items: ['Jest', 'Playwright', 'Supertest'] },
      {
        category: 'Infrastructure',
        items: ['Azure Container Apps', 'Terraform'],
      },
      { category: 'CI/CD', items: ['GitHub Actions', 'Nx'] },
    ],
  },
  // TODO(milos): copy rewritten on 2026-09-23 from public sources (the claude-code-monorepo
  // repository and this repository's docs and history). These questions are still open:
  // - How long did a typical CI run take before the cache and after it (as real durations, to
  //   replace 'coffee-break length' and 'near-instant')?
  // - How big is the monorepo (number of projects or apps) and how many developers or pipelines
  //   use the cache?
  // - Where are the two tokens stored, and how are they rotated?
  // - Does an artifact fetched from Blob Storage get promoted into the memory tier, and does a
  //   write go to both tiers at once?
  // - What cache hit rate does the server see, in memory and overall?
  // - By how much did cloud compute costs drop (the entry only says 'noticeably')?
  // - Which Nx version was the server built against? CI ran Nx 22.6.4 on 2026-06-29
  //   (claude-code-monorepo global/memory/platform-ui-test-blindfold-and-icu-casing.md:18), which
  //   does not settle it. (The API is answered: Nx's self-hosted remote cache protocol.)
  // - What happens to a CI run when it hits the 1000 req/min rate limit: does it fall back to
  //   building locally?
  // - Which company or product was this built for, and how long did building it take?
  {
    slug: 'nx-remote-cache',
    publishedAt: PUBLISHED_AT,
    updatedAt: UPDATED_AT,
    highlight: {
      category: 'DEVOPS',
      status: 'PRODUCTION',
      metric: { value: 5, suffix: '×', label: 'faster builds' },
    },
    title: 'Nx Remote Cache Server',
    tagline: 'faster CI builds',
    description:
      "Why rebuild what hasn't changed? A custom cache server that slashed CI times and gave developers their coffee breaks back.",
    tags: ['Bun', 'Elysia', 'Azure Blob Storage'],
    challenge:
      'Every CI run rebuilt the entire monorepo, however small the change that set it off. No run reused what an earlier run had already built, so code nobody had touched got compiled again, and again, and again. Pipelines ran long enough to fit a coffee break, which meant developers waited, and the full test suite took so long that running all of it felt like a luxury rather than a habit. Meanwhile the cloud bills climbed, because every one of those rebuilds ran on compute we paid for. "Works on my machine" was still something people said with a straight face. The math was simple: we were paying to compile the same unchanged code hundreds of times a day. That left one obvious question worth answering properly: why rebuild what hasn\'t changed?',
    approach:
      "I built a cache server from scratch, on Bun for raw speed, with Elysia handling the requests, and made it speak Nx's built-in self-hosted remote cache protocol. The design is two-tier caching. The hot tier is an LRU cache in memory, capped by default at 100 entries, 500MB in total and 10MB per artifact: frequently accessed artifacts up to that size stay there, and the least recently used make room when it fills. The cold tier is Azure Blob Storage, the persistent cache, so artifacts outlive any one server process. A cache that CI leans on also has to be hard to abuse, so access runs on two tokens, each checked with a timing-safe comparison so response times give nothing away about a wrong guess. The read token can only download; the write token can also upload, and only pushes to main hold it, so a pull request cannot poison the cache. A rate limit of 1000 requests a minute per IP keeps it stable, and health checks integrate it with the container orchestration on Azure Container Apps. A health probe with a 5-second timeout runs before the Nx steps, and a server that does not answer it leaves the run on its local cache. The rule underneath fits on one line: if it hasn't changed, we don't rebuild it. Period.",
    howItWorks: [
      'Before its Nx steps, a CI run probes the cache server with a 5-second timeout; if the server does not answer, the run carries on with its local cache.',
      "When the run reaches a part of the monorepo whose code hasn't changed, Nx asks the server for the stored artifact by its hash (GET /v1/cache/:hash) instead of compiling that code again.",
      'The server checks the read or write token with a timing-safe comparison and applies a rate limit of 1000 requests a minute per IP.',
      'The server looks in its in-memory LRU cache first, which by default holds frequently accessed artifacts of up to 10MB each.',
      "If memory doesn't have the artifact, the server falls back to Azure Blob Storage, the persistent cold tier.",
      'Only when neither tier has it does the run build that code. A push to main, which holds the write token, then uploads the new artifact (PUT /v1/cache/:hash); pull-request runs hold only the read token and never write.',
      'An entry never changes once written: a second upload for the same hash gets 409 Conflict, and Blob Storage deletes artifacts after 14 days.',
      'The server itself is built on Bun and Elysia and runs on Azure Container Apps, with a liveness endpoint that answers while the process is up and a readiness endpoint that also checks storage.',
    ],
    contributions: [
      'Built LRU in-memory caching for frequently accessed artifacts',
      'Implemented Azure Blob Storage backend for persistent cache',
      'Added dual-token authentication (read/write) with timing-safe comparison',
      'Configured rate limiting (1000 req/min) for stability',
      'Created health checks for container orchestration integration',
    ],
    impact: [
      'CI pipelines went from coffee-break length to near-instant',
      '"Works on my machine" became "works everywhere, identically"',
      'Cloud compute bills dropped noticeably',
      "Developers actually run the full test suite now (because it's fast)",
    ],
    techStack: [
      { category: 'Runtime', items: ['Bun'] },
      { category: 'Framework', items: ['Elysia'] },
      { category: 'Storage', items: ['Azure Blob Storage', 'LRU Cache'] },
      { category: 'Auth', items: ['Dual-token system'] },
      { category: 'Infrastructure', items: ['Azure Container Apps'] },
    ],
  },
];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return caseStudies.find((cs) => cs.slug === slug);
}

/**
 * The studies either side of `slug` in data order, wrapping around: what a case study's "More work"
 * block links to. Never the study itself, and never the same study twice.
 */
export function adjacentCaseStudies(
  slug: string,
): { direction: 'previous' | 'next'; study: CaseStudy }[] {
  const index = caseStudies.findIndex((cs) => cs.slug === slug);
  const count = caseStudies.length;
  if (index === -1 || count < 2) return [];
  const previous = caseStudies[(index - 1 + count) % count];
  const next = caseStudies[(index + 1) % count];
  return previous === next
    ? [{ direction: 'next', study: next }]
    : [
        { direction: 'previous', study: previous },
        { direction: 'next', study: next },
      ];
}

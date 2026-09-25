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
  /** `RETIRED` marks a project that no longer runs; its badge is neutral and does not pulse. */
  status: 'LIVE' | 'PRODUCTION' | 'RETIRED';
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

// Every study went public with the site's first production deployment, on 2026-09-09
// (docs/runbooks/deploy.md:14-18); acacce0 had written them on 2026-01-27. UPDATED_AT is the day
// the self-healing agent's study moved to the past tense and the enterprise study's claims were
// aligned with the public record. Every study page shows that change, in its own copy or in the
// neighbour descriptions of its "More work" block.
const PUBLISHED_AT = '2026-09-09';
const UPDATED_AT = '2026-09-25';

export const caseStudies: CaseStudy[] = [
  {
    slug: 'self-healing-agent',
    publishedAt: PUBLISHED_AT,
    updatedAt: UPDATED_AT,
    highlight: {
      category: 'AI AGENT',
      status: 'RETIRED',
      metric: { value: 73, suffix: '%', label: 'faster resolution' },
    },
    title: 'Self-Healing Agent',
    tagline: 'autonomous bug fixing',
    description:
      'An AI agent that woke up before you did. It monitored production, diagnosed errors, and opened PRs with fixes—all autonomously.',
    tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
    challenge:
      "Production breaks at 3am, and nobody wants that call. Errors don't wait for business hours, every minute of downtime costs money and trust, and the on-call rotation turns into the job developers dread. Before anyone can fix anything, somebody has to wake up, read the production logs, find their way around the codebase and work out what actually broke. That diagnosis is exactly the kind of grunt work a machine could do overnight, if it could be trusted with it. Handing it to an agent brings risks of its own, though: an agent can be confidently wrong, it can run up a bill, and it can keep trying long after a sensible engineer would have stopped. The question: can we fix bugs faster than humans can even wake up?",
    approach:
      'I built an autonomous agent that monitored production errors and proposed fixes through pull requests. It ran on Bun and Elysia, kept its data in Azure Table Storage and used Azure Log Analytics for monitoring. When something broke, an error analysis pipeline built on the Claude Agent SDK read the failure against the codebase, diagnosed the issue and drafted a fix, which the agent opened as a pull request through the GitHub API. It monitored the CI pipeline and retried on failure, capped at three attempts, so a stubborn failure could not loop forever. Safety constraints kept it on a short leash: daily limits, budget caps and confidence thresholds bounded what it could attempt, and it had a kill switch and emergency override controls. It tracked learning metrics to improve its calibration. Humans reviewed and merged its pull requests through approval gates; the agent did the grunt work. The agent has since been retired.',
    howItWorks: [
      'The agent ran on Bun and Elysia and monitored production errors through Azure Log Analytics.',
      'When something broke, an error analysis pipeline built on the Claude Agent SDK read the error against the codebase and diagnosed the issue.',
      'It drafted a fix and opened a pull request through the GitHub API, while safety constraints (daily limits, budget caps and confidence thresholds) bounded what it could attempt.',
      'It also monitored the CI pipeline and retried on failure, up to three attempts.',
      'Humans reviewed the pull request through approval gates and merged the fix, with a kill switch and emergency override controls on hand.',
      'It tracked learning metrics to improve its calibration.',
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
      'Production incidents got diagnosed before anyone woke up',
      'Developers stopped dreading on-call rotations',
      'Fix patterns got learned and reused automatically',
      'Humans stayed in control—agent proposed, team approved',
      'The system literally improved itself over time',
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
      'The codebase had a reputation, and it had earned it. Validation was manual and happened... sometimes. Tests? What tests? Without them, every change was a guess about what else might break, and nobody wanted to be the one guessing. Deploys were no longer fast, either. None of that bought any patience from the business, which needed new features yesterday. So the real problem was never just messy code: it was how to keep shipping those features on a foundation that made every one of them risky, without stopping everything to fix it first.',
    approach:
      "I introduced boundaries gradually. Clean Architecture emerged one module at a time, with controllers, services and repositories each taking one job, so data access got a layer of its own. Manual validation gave way to Zod schemas, whose inferred types keep the checks and the code from drifting apart. I built a background job system on pg-boss for async operations; it keeps its queue in PostgreSQL, so there is no broker to run. The delivery path got the same treatment. CI/CD is built from reusable GitHub composite actions, and Nx's affected commands limit builds, tests and deploys to the projects a change affects. Gitleaks, npm audit and Trivy scan on pushes, pull requests and a weekly schedule. Terraform keeps one remote state file per root directory, with production in a root of its own, and gives each developer a throwaway copy of the stack under a state file of its own; it runs a plan on every pull request that touches the infrastructure and waits for an approval before it applies to production. Playwright E2E tests, written with the Page Object pattern, are sharded four ways. Every PR shipped value while improving the foundation underneath.",
    contributions: [
      'Migrated the codebase to Clean Architecture (controllers → services → repositories)',
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
      'Security scans (Gitleaks, npm audit, Trivy) run on pushes, pull requests and a weekly schedule',
      "Infrastructure changes are reviewed like code, not YOLO'd",
    ],
    lessons: [
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
        items: ['Azure App Service', 'Azure Container Apps', 'Terraform'],
      },
      { category: 'CI/CD', items: ['GitHub Actions', 'Nx'] },
    ],
  },
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

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

// TODO(milos): confirm both dates for every study. From git: each was added in acacce0
// (2026-01-27) and "Go live (#2)", 7d31606, landed on 2026-02-23, which is the publishedAt used
// below; the apex domain has served the site since 2026-09-09, so that may be the truer answer.
// updatedAt is 2026-09-23, the SEO pull request that changed every case-study page: bump it to the
// day it merges.
const PUBLISHED_AT = '2026-02-23';
const UPDATED_AT = '2026-09-23';

export const caseStudies: CaseStudy[] = [
  // TODO(milos): draft copy (SEO pull request, 2026-09-23), written only from this entry's
  // own claims. Answers to these would add the specifics it leaves out:
  // - Which log queries, tables or error signals in Azure Log Analytics does the agent watch, and
  //   how does it decide that something has broken?
  // - How does an error reach the agent: does it poll Log Analytics, receive an alert, or
  //   something else, and what does the Elysia service expose (webhook, API, dashboard)?
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
  // - How long has it been running, how many incidents has it diagnosed, and what share of its
  //   pull requests get merged?
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
      'I built an autonomous agent that never sleeps. It runs on Bun and Elysia, keeps its data in Azure Table Storage, uses Azure Log Analytics for monitoring and watches production logs. When something breaks, an error analysis pipeline built on the Claude Agent SDK and the Anthropic API reads the failure against the codebase, diagnoses the issue and drafts a contextual fix, which it opens as a pull request through the GitHub API. It monitors the CI pipeline, with retry logic capped at three attempts, so a stubborn failure cannot loop forever. Safety constraints keep it on a short leash: daily limits, budget caps and confidence thresholds bound what it may attempt, and it has a kill switch and emergency override controls. Learning metrics are there to improve its calibration, fix patterns get learned and reused automatically, and the system improves itself over time. Humans review and merge; the agent does the grunt work.',
    howItWorks: [
      'The agent runs around the clock on Bun and Elysia, uses Azure Log Analytics for monitoring and watches production logs.',
      'When something breaks, an error analysis pipeline built on the Claude Agent SDK and the Anthropic API reads the error against the codebase and diagnoses the issue.',
      'It drafts a contextual fix and opens a pull request through the GitHub API, while safety constraints (daily limits, budget caps and confidence thresholds) bound what it may attempt.',
      'It also monitors the CI pipeline, with retry logic capped at three attempts.',
      'Humans review and merge the fix, with a kill switch and emergency override controls on hand.',
      'Learning metrics are there to improve its calibration, fix patterns get learned and reused automatically, and the system improves itself over time.',
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
  // TODO(milos): draft copy (SEO pull request, 2026-09-23), written only from this entry's
  // own claims. Answers to these would add the specifics it leaves out:
  // - What did the platform do and for whom (domain, kind of B2B customer), stated at a level you
  //   are happy to publish?
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
  // - How many Terraform environments are there, and how is state isolated between them (separate
  //   backends, workspaces, subscriptions)?
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
      "I didn't propose a rewrite—that's how projects die. A rewrite stops feature work while the business is still waiting for features, so instead I introduced boundaries gradually. Clean Architecture emerged one module at a time, with controllers, services and repositories each taking one job, so data access got a layer of its own instead of a seat next to the UI. Manual validation gave way to Zod schemas, whose inferred types keep the checks and the code from drifting apart. I built a background job system on pg-boss for async operations; it keeps its queue in PostgreSQL rather than adding another service to run. The delivery path got the same treatment: modular CI/CD from reusable GitHub composite actions, security scanning with Gitleaks, npm audit and Trivy, multi-environment Terraform with isolated state, and Playwright E2E tests written with the Page Object pattern and sharded four ways. Every PR shipped value while improving the foundation underneath.",
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
      'Tests are part of the rescue rather than a reward for finishing it: the bug rate dropped as coverage climbed.',
      'Infrastructure changes deserve the same review as code, and a multi-environment Terraform architecture with state isolation puts infrastructure in code, where it can get that review.',
      'Security scanning with Gitleaks, npm audit and Trivy is how vulnerabilities get caught before they reach production.',
      'A rescued codebase shows it when new developers ship features in their first week and the team actually enjoys working on it.',
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
  // TODO(milos): draft copy (SEO pull request, 2026-09-23), written only from this entry's
  // own claims. Answers to these would add the specifics it leaves out:
  // - How long did a typical CI run take before the cache and after it (as real durations, to
  //   replace 'coffee-break length' and 'near-instant')?
  // - How big is the monorepo (number of projects or apps) and how many developers or pipelines
  //   use the cache?
  // - What size limit or eviction settings does the in-memory LRU tier use?
  // - Who holds which token: do CI runners hold the write token and developer machines only the
  //   read token, and do local builds use the cache at all?
  // - Where are the two tokens stored, and how are they rotated?
  // - Does an artifact fetched from Blob Storage get promoted into the memory tier, and does a
  //   write go to both tiers at once?
  // - Is there an expiry or clean-up policy for old artifacts in Blob Storage?
  // - What cache hit rate does the server see, in memory and overall?
  // - By how much did cloud compute costs drop (the entry only says 'noticeably')?
  // - Which Nx version and which remote cache API does the server implement?
  // - What do the health checks actually check: the process only, or also that Blob Storage is
  //   reachable?
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
      "I built a cache server from scratch, on Bun for raw speed, with Elysia handling the requests. The design is two-tier caching. The hot tier is an LRU cache in memory: frequently accessed artifacts stay there, the least recently used make room when it fills, and a hit comes back nearly instantly. The cold tier is Azure Blob Storage, the persistent cache, so artifacts outlive any one server process. A cache that CI leans on also has to be hard to abuse, so access runs on two tokens, one that can only read and one that can write, each checked with a timing-safe comparison so response times give nothing away about a wrong guess. A rate limit of 1000 requests a minute keeps it stable, and health checks integrate it with the container orchestration on Azure Container Apps. The rule underneath fits on one line: if it hasn't changed, we don't rebuild it. Period.",
    howItWorks: [
      "When a CI run reaches a part of the monorepo whose code hasn't changed, it asks the cache server for the stored artifacts instead of compiling that code again.",
      'The server authenticates clients with two tokens, one for reading and one for writing, each checked with a timing-safe comparison, and applies a rate limit of 1000 requests a minute for stability.',
      'The server looks in its in-memory LRU cache first, where frequently accessed artifacts come back nearly instantly.',
      "If memory doesn't have the artifact, the server falls back to Azure Blob Storage, the persistent cold tier.",
      'Only when neither tier has it does the run build that code, and a client holding the write token stores the new artifacts for the next run.',
      "The server itself is built on Bun and Elysia and runs on Azure Container Apps, with health checks for the platform's container orchestration.",
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

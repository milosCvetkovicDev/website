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
  description: string;
  tags: string[];
  highlight: CaseStudyHighlight;
  challenge: string;
  approach: string;
  contributions: string[];
  impact: string[];
  techStack: {
    category: string;
    items: string[];
  }[];
}

export const caseStudies: CaseStudy[] = [
  {
    slug: 'self-healing-agent',
    highlight: {
      category: 'AI AGENT',
      status: 'LIVE',
      metric: { value: 73, suffix: '%', label: 'faster resolution' },
    },
    title: 'Self-Healing Agent',
    description:
      'An AI agent that wakes up before you do. It monitors production, diagnoses errors, and opens PRs with fixes—all autonomously.',
    tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
    challenge:
      "Production breaks at 3am. Nobody wants that call. But errors don't wait for business hours, and every minute of downtime costs money and trust. The question: can we fix bugs faster than humans can even wake up?",
    approach:
      'I built an autonomous agent that never sleeps. It watches production logs, understands the codebase, and when something breaks, it diagnoses the issue and opens a PR with a fix. Humans review and merge—the agent does the grunt work.',
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
  {
    slug: 'enterprise-b2b-platform',
    highlight: {
      category: 'PLATFORM',
      status: 'PRODUCTION',
      metric: { value: 40, suffix: '%', label: 'less complexity' },
    },
    title: 'Enterprise B2B Platform',
    description:
      'Took a legacy codebase everyone was afraid to touch and turned it into a system the team actually enjoys working on.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'Terraform'],
    challenge:
      'The codebase had a reputation. SQL queries lived next to UI components. Validation happened... sometimes. Tests? What tests? Nobody wanted to touch it, but the business needed new features yesterday.',
    approach:
      "I didn't propose a rewrite—that's how projects die. Instead, I introduced boundaries gradually. Clean Architecture emerged one module at a time. Every PR shipped value while improving the foundation underneath.",
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
  {
    slug: 'nx-remote-cache',
    highlight: {
      category: 'DEVOPS',
      status: 'PRODUCTION',
      metric: { value: 5, suffix: '×', label: 'faster builds' },
    },
    title: 'Nx Remote Cache Server',
    description:
      "Why rebuild what hasn't changed? A custom cache server that slashed CI times and gave developers their coffee breaks back.",
    tags: ['Bun', 'Elysia', 'Azure Blob Storage'],
    challenge:
      'Every CI run rebuilt the entire monorepo. Developers waited. Cloud bills climbed. The math was simple: we were paying to compile the same unchanged code hundreds of times a day.',
    approach:
      "Built a cache server from scratch using Bun for raw speed. Two-tier caching (hot in-memory, cold in blob storage) means cache hits are nearly instant. If it hasn't changed, we don't rebuild it. Period.",
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

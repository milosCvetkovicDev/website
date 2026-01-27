export interface CaseStudy {
  slug: string;
  title: string;
  description: string;
  tags: string[];
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
    title: 'Self-Healing Agent',
    description:
      'AI-powered system that monitors production errors and autonomously proposes fixes via pull requests.',
    tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
    challenge:
      'Production incidents require immediate attention, but developers cannot monitor systems 24/7. Manual error investigation and fix implementation is time-consuming and delays resolution, especially during off-hours.',
    approach:
      'Built an autonomous agent using Claude Agent SDK that integrates with Azure Log Analytics to monitor production errors in real-time. The agent analyzes error patterns, understands the codebase context, and proposes fixes through pull requests with proper validation gates.',
    contributions: [
      'Designed autonomous error analysis pipeline using Claude AI',
      'Implemented automatic PR creation with contextual fixes',
      'Built CI pipeline monitoring with retry logic (max 3 attempts)',
      'Added safety constraints: daily limits, budget caps, confidence thresholds',
      'Created kill switch and emergency override controls',
      'Implemented learning metrics for calibration improvement',
    ],
    impact: [
      'Reduced mean time to resolution (MTTR) for production incidents',
      'Enabled 24/7 automated incident response coverage',
      'Freed developers from repetitive debugging tasks',
      'Built institutional knowledge through fix pattern learning',
      'Maintained human oversight via approval gates',
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
    title: 'Enterprise B2B Platform',
    description:
      'Full-stack modernization of a legacy enterprise platform using Clean Architecture and DDD principles.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'Terraform'],
    challenge:
      'Inherited a legacy enterprise platform with mixed concerns, inconsistent validation, scattered SQL queries, and minimal test coverage. The codebase needed modernization while maintaining business continuity.',
    approach:
      'Applied incremental modernization strategy: restructured to Clean Architecture layers, introduced Zod for validation, migrated to TypeORM with proper migrations, and established comprehensive testing patterns. Built robust CI/CD with security scanning.',
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
      'Faster development cycles through comprehensive automation',
      'Significantly reduced CI time with affected-only deployments',
      'Improved code quality through comprehensive testing',
      'Secure deployments with automated vulnerability scanning',
      'Reproducible infrastructure via Terraform IaC',
    ],
    techStack: [
      { category: 'Frontend', items: ['React 18', 'Material-UI', 'Vite', 'TypeScript'] },
      { category: 'Backend', items: ['Express.js', 'Node.js', 'TypeORM', 'Zod'] },
      { category: 'Database', items: ['PostgreSQL', 'pg-boss'] },
      { category: 'Testing', items: ['Jest', 'Playwright', 'Supertest'] },
      { category: 'Infrastructure', items: ['Azure Container Apps', 'Terraform'] },
      { category: 'CI/CD', items: ['GitHub Actions', 'Nx'] },
    ],
  },
  {
    slug: 'nx-remote-cache',
    title: 'Nx Remote Cache Server',
    description:
      'High-performance build cache server dramatically reducing CI/CD build times.',
    tags: ['Bun', 'Elysia', 'Azure Blob Storage'],
    challenge:
      'Large monorepo builds were slow and expensive. Each CI run rebuilt unchanged packages, wasting compute resources and developer time. Needed a fast, reliable remote cache solution.',
    approach:
      'Built a custom remote cache server optimized for Nx monorepos using Bun for maximum performance. Implemented dual-layer caching (in-memory LRU + Azure Blob Storage) for optimal hit rates and persistence.',
    contributions: [
      'Built LRU in-memory caching for frequently accessed artifacts',
      'Implemented Azure Blob Storage backend for persistent cache',
      'Added dual-token authentication (read/write) with timing-safe comparison',
      'Configured rate limiting (1000 req/min) for stability',
      'Created health checks for container orchestration integration',
    ],
    impact: [
      'Cache hits skip rebuilds entirely, dramatically reducing CI time',
      'Consistent builds across all developer machines',
      'Reduced cloud compute costs through build artifact reuse',
      'Improved developer productivity with faster feedback loops',
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

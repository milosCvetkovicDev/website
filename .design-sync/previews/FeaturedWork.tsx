import { FeaturedWork } from 'web';

// The section's animations (the diagram's packets, the metric count-up) run on a clock, and a card
// is a still frame. The components render their settled state under prefers-reduced-motion, so this
// page reports that preference; nothing else about the component changes.
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = (query: string) =>
  query === reducedMotionQuery
    ? ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList)
    : matchMedia(query);

// The projects are inlined rather than imported from @/data/featured-projects, because this story is
// also the usage example the design agent copies, and it has no access to the repository's data.
// They are copies: apps/web/src/data/case-studies.ts stays the source of truth for the site.
export const AsOnTheSite = () => {
  const projects = [
    {
      slug: 'self-healing-agent',
      title: 'Self-Healing Agent',
      description:
        'An AI agent that wakes up before you do. It monitors production, diagnoses errors, and opens PRs with fixes—all autonomously.',
      tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
      category: 'AI AGENT',
      status: 'LIVE' as const,
      metric: { value: 73, suffix: '%', label: 'faster resolution' },
      activeNodes: ['client', 'gateway', 'worker', 'ai'] as const,
    },
    {
      slug: 'enterprise-b2b-platform',
      title: 'Enterprise B2B Platform',
      description:
        'Took a legacy codebase everyone was afraid to touch and turned it into a system the team actually enjoys working on.',
      tags: ['React', 'Node.js', 'PostgreSQL', 'Terraform'],
      category: 'PLATFORM',
      status: 'PRODUCTION' as const,
      metric: { value: 40, suffix: '%', label: 'less complexity' },
      activeNodes: ['client', 'gateway', 'backend', 'db'] as const,
    },
    {
      slug: 'nx-remote-cache',
      title: 'Nx Remote Cache Server',
      description:
        "Why rebuild what hasn't changed? A custom cache server that slashed CI times and gave developers their coffee breaks back.",
      tags: ['Bun', 'Elysia', 'Azure Blob Storage'],
      category: 'DEVOPS',
      status: 'PRODUCTION' as const,
      metric: { value: 5, suffix: '×', label: 'faster builds' },
      activeNodes: ['client', 'gateway', 'worker', 'storage'] as const,
    },
  ];
  return <FeaturedWork projects={projects} />;
};

export const DarkTheme = () => {
  const projects = [
    {
      slug: 'self-healing-agent',
      title: 'Self-Healing Agent',
      description:
        'An AI agent that wakes up before you do. It monitors production, diagnoses errors, and opens PRs with fixes—all autonomously.',
      tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
      category: 'AI AGENT',
      status: 'LIVE' as const,
      metric: { value: 73, suffix: '%', label: 'faster resolution' },
      activeNodes: ['client', 'gateway', 'worker', 'ai'] as const,
    },
  ];
  return (
    <div className="dark bg-[var(--background)] text-[var(--foreground)]">
      <FeaturedWork projects={projects} />
    </div>
  );
};

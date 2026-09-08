import type { ArchitectureNode } from './architecture-graph';
import { caseStudies } from './case-studies';

export interface FeaturedMetric {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export interface FeaturedProject {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  status: 'LIVE' | 'PRODUCTION';
  activeNodes: ArchitectureNode[];
  metric: FeaturedMetric;
}

type Highlight = Pick<FeaturedProject, 'category' | 'status' | 'activeNodes' | 'metric'>;

// Presentation extras only; copy comes from the case study so the two never drift apart.
const highlights: Record<string, Highlight> = {
  'self-healing-agent': {
    category: 'AI AGENT',
    status: 'LIVE',
    activeNodes: ['client', 'worker', 'ai'],
    metric: { value: 73, suffix: '%', label: 'faster resolution' },
  },
  'enterprise-b2b-platform': {
    category: 'PLATFORM',
    status: 'PRODUCTION',
    activeNodes: ['client', 'gateway', 'backend', 'db'],
    metric: { value: 40, suffix: '%', label: 'less complexity' },
  },
  'nx-remote-cache': {
    category: 'DEVOPS',
    status: 'PRODUCTION',
    activeNodes: ['client', 'worker', 'cache', 'storage'],
    metric: { value: 5, suffix: '×', label: 'faster builds' },
  },
};

export const featuredProjects: FeaturedProject[] = Object.entries(highlights).map(
  ([slug, highlight]) => {
    const study = caseStudies.find((candidate) => candidate.slug === slug);
    if (!study) throw new Error(`Featured project "${slug}" has no case study`);
    return {
      slug,
      title: study.title,
      description: study.description,
      tags: study.tags,
      ...highlight,
    };
  },
);

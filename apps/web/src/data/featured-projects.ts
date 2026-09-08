import type { ArchitectureNode } from './architecture-graph';
import { caseStudies, type CaseStudyHighlight } from './case-studies';

export interface FeaturedProject extends CaseStudyHighlight {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  /** Architecture nodes this project touched. Every node must sit on a lit connection (tested). */
  activeNodes: ArchitectureNode[];
}

// Only the diagram mapping lives here; everything shown on a card comes from the case study.
const activeNodesBySlug: Record<string, ArchitectureNode[]> = {
  'self-healing-agent': ['client', 'gateway', 'worker', 'ai'],
  'enterprise-b2b-platform': ['client', 'gateway', 'backend', 'db'],
  'nx-remote-cache': ['client', 'gateway', 'worker', 'storage'],
};

export const featuredProjects: FeaturedProject[] = Object.entries(activeNodesBySlug).map(
  ([slug, activeNodes]) => {
    const study = caseStudies.find((candidate) => candidate.slug === slug);
    if (!study) throw new Error(`Featured project "${slug}" has no case study`);
    return {
      slug,
      title: study.title,
      description: study.description,
      tags: study.tags,
      ...study.highlight,
      activeNodes,
    };
  },
);

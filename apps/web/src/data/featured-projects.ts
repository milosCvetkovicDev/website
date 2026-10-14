import type { ArchitectureNode } from './architecture-graph';
import { caseStudies, type CaseStudyFigure, type CaseStudyHighlight } from './case-studies';

export interface FeaturedProject extends Omit<CaseStudyHighlight, 'metric'> {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  /**
   * The figure a card prints, without the study's `basis`: `FeaturedWork` is a client component, so
   * every prop here is serialised into the home page's payload, and no card reads the basis.
   */
  metric: CaseStudyFigure;
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
    const { metric, ...highlight } = study.highlight;
    const { value, label, prefix, suffix, decimals } = metric;
    return {
      slug,
      title: study.title,
      description: study.description,
      tags: study.tags,
      ...highlight,
      // Named fields rather than a rest spread, so a field added to the metric later reaches the
      // client only when it is added here too.
      metric: {
        value,
        label,
        ...(prefix === undefined ? {} : { prefix }),
        ...(suffix === undefined ? {} : { suffix }),
        ...(decimals === undefined ? {} : { decimals }),
      },
      activeNodes,
    };
  },
);

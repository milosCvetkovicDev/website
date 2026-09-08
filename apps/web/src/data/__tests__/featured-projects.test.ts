import { describe, expect, it } from 'vitest';
import { getActiveConnections } from '../architecture-graph';
import { caseStudies } from '../case-studies';
import { featuredProjects } from '../featured-projects';

describe('featuredProjects', () => {
  it('lists three projects that all exist as case studies', () => {
    expect(featuredProjects).toHaveLength(3);
    const slugs = new Set(caseStudies.map((study) => study.slug));
    for (const project of featuredProjects) {
      expect(slugs.has(project.slug)).toBe(true);
    }
  });

  it('takes copy and highlight facts from the case study, so / and /work agree', () => {
    for (const project of featuredProjects) {
      const study = caseStudies.find((candidate) => candidate.slug === project.slug);
      expect(project.title).toBe(study?.title);
      expect(project.description).toBe(study?.description);
      expect(project.tags).toEqual(study?.tags);
      expect(project.category).toBe(study?.highlight.category);
      expect(project.status).toBe(study?.highlight.status);
      expect(project.metric).toEqual(study?.highlight.metric);
    }
  });

  it('every active node sits on a lit connection', () => {
    for (const { slug, activeNodes } of featuredProjects) {
      expect(activeNodes.length).toBeGreaterThanOrEqual(2);
      const lit = getActiveConnections(activeNodes).filter((connection) => connection.active);
      for (const node of activeNodes) {
        expect(
          lit.some((connection) => connection.source === node || connection.target === node),
          `${slug}: ${node} is not connected to any other active node`,
        ).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
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

  it('takes title, description and tags from the case study', () => {
    for (const project of featuredProjects) {
      const study = caseStudies.find((candidate) => candidate.slug === project.slug);
      expect(project.title).toBe(study?.title);
      expect(project.description).toBe(study?.description);
      expect(project.tags).toEqual(study?.tags);
    }
  });

  it('gives every project at least two architecture nodes and a positive metric', () => {
    for (const project of featuredProjects) {
      expect(project.activeNodes.length).toBeGreaterThanOrEqual(2);
      expect(project.metric.value).toBeGreaterThan(0);
    }
  });
});

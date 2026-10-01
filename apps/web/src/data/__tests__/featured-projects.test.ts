/**
 * These are pure data assertions with no DOM in them, and building a jsdom window is the most
 * expensive thing in a test file that does not need one -- importing the module alone costs about
 * two seconds in every worker.
 *
 * @vitest-environment node
 */
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
      // The figure, field for field; the basis is the one field the card does not take.
      const metric = study?.highlight.metric;
      expect({ ...project.metric, basis: metric?.basis }).toEqual(metric);
    }
  });

  it('sends the cards no metric basis, which the home page never prints (#49)', () => {
    // FeaturedWork is a client component, so every prop is serialised into `/`'s payload: the
    // basis, a sentence per card, belongs to the case-study page and its twin.
    expect(featuredProjects).not.toHaveLength(0);
    for (const { slug, metric } of featuredProjects) {
      expect(Object.keys(metric), slug).not.toContain('basis');
      // And no key with nothing in it: an absent prefix stays absent rather than `undefined`.
      expect(Object.values(metric), slug).not.toContain(undefined);
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

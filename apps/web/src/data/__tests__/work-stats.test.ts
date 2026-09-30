/**
 * @vitest-environment node
 *
 * The /work stats bar's production figure (#58 AC 10). It used to read "100% In Production" and
 * "0 Left Unfinished", two literals no record stood behind: the first was false once the
 * self-healing agent was retired, and the second had no denominator at all. The figure is now
 * counted from each study's `highlight.status`, so a status change moves it without anyone editing
 * the bar, and "Left Unfinished" is gone until the owner supplies what it would be a count of.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, type CaseStudyHighlight } from '@/data/case-studies';
import { workCopy } from '@/data/pages/work';
import { productionFigure, RUNS_IN_PRODUCTION } from '../work-stats';

type Status = CaseStudyHighlight['status'];

/** Studies reduced to the one field the figure reads. */
const withStatuses = (...statuses: Status[]) =>
  statuses.map((status) => ({ highlight: { status } }));

/** The site's studies with the status of the one at `index` replaced. */
const withStatusAt = (index: number, status: Status) =>
  caseStudies.map((study, at) =>
    at === index ? { ...study, highlight: { ...study.highlight, status } } : study,
  );

describe('productionFigure()', () => {
  it('counts LIVE and PRODUCTION as running and RETIRED as not, out of every study', () => {
    expect(RUNS_IN_PRODUCTION).toEqual({ LIVE: true, PRODUCTION: true, RETIRED: false });
    expect(productionFigure(withStatuses('PRODUCTION', 'LIVE', 'RETIRED'))).toBe('2 of 3');
    expect(productionFigure(withStatuses('RETIRED'))).toBe('0 of 1');
    expect(productionFigure(withStatuses('LIVE', 'LIVE'))).toBe('2 of 2');
  });

  it('moves when a study changes status, in either direction', () => {
    const retired = caseStudies.findIndex(({ highlight }) => highlight.status === 'RETIRED');
    const running = caseStudies.findIndex(({ highlight }) => highlight.status !== 'RETIRED');
    // The control: the site must have one of each for the two flips below to mean anything.
    expect(retired, 'a retired study to bring back').toBeGreaterThanOrEqual(0);
    expect(running, 'a running study to retire').toBeGreaterThanOrEqual(0);

    const count = (figure: string) => Number(figure.split(' of ')[0]);
    const now = count(productionFigure(caseStudies));
    expect(productionFigure(withStatusAt(retired, 'LIVE'))).toBe(
      `${now + 1} of ${caseStudies.length}`,
    );
    expect(productionFigure(withStatusAt(running, 'RETIRED'))).toBe(
      `${now - 1} of ${caseStudies.length}`,
    );
  });

  it('counts out of every study, the number the Projects figure shows', () => {
    const total = Number(productionFigure(caseStudies).split(' of ')[1]);
    expect(total).toBe(caseStudies.length);
    expect(workCopy.stats[0]).toEqual({ value: String(caseStudies.length), label: 'Projects' });
  });
});

describe('the /work stats bar', () => {
  it('shows the counted figure and no claim without a denominator', () => {
    expect(workCopy.stats.map(({ value }) => value)).toContain(productionFigure(caseStudies));
    for (const { value, label } of workCopy.stats) {
      expect(value, label).not.toMatch(/%/);
      expect(label).not.toMatch(/unfinished/i);
    }
  });

  describe('when a status changes in the data', () => {
    afterEach(() => {
      vi.doUnmock('@/data/case-studies');
      vi.resetModules();
    });

    // What AC 10 asks for: the bar is not a copy of the figure made once, it follows the statuses.
    it('shows the new figure without an edit to the bar', async () => {
      vi.resetModules();
      vi.doMock('@/data/case-studies', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@/data/case-studies')>();
        return {
          ...actual,
          caseStudies: actual.caseStudies.map((study) => ({
            ...study,
            highlight: { ...study.highlight, status: 'RETIRED' as const },
          })),
        };
      });
      const { workCopy: moved } = await import('@/data/pages/work');
      expect(moved.stats.map(({ value }) => value)).toContain(`0 of ${caseStudies.length}`);
      expect(moved.stats.map(({ value }) => value)).not.toContain(productionFigure(caseStudies));
    });
  });
});

/**
 * @vitest-environment node
 *
 * The case-study page refuses to prerender with dates it cannot show. Its TechArticle marks up
 * `publishedAt` and `updatedAt` as stored, so a page that quietly dropped its visible
 * Published / Updated line on a bad date would ship marked-up dates with no visible counterpart;
 * throwing fails `next build` instead. The line itself is checked in the served HTML by
 * `e2e/seo-surface.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, type CaseStudy } from '@/data/case-studies';
import CaseStudyPage from '../work/[slug]/page';

const override = vi.hoisted(() => ({ dates: null as null | Partial<CaseStudy> }));

vi.mock('@/data/case-studies', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/data/case-studies')>();
  return {
    ...original,
    getCaseStudy: (slug: string) => {
      const study = original.getCaseStudy(slug);
      return study && override.dates ? { ...study, ...override.dates } : study;
    },
  };
});

const slug = caseStudies[0].slug;
const render = () => CaseStudyPage({ params: Promise.resolve({ slug }) });

describe('CaseStudyPage dates', () => {
  afterEach(() => {
    override.dates = null;
  });

  it('renders with the stored dates', async () => {
    await expect(render()).resolves.toBeTruthy();
  });

  it('throws, naming the page, when a date cannot be shown', async () => {
    override.dates = { updatedAt: '2026-09-31' };
    await expect(render()).rejects.toThrow(
      `/work/${slug}: content dates must be real YYYY-MM-DD days from 2000 on`,
    );
  });

  it('throws when the page was updated before it was published', async () => {
    override.dates = { publishedAt: '2026-09-25', updatedAt: '2026-09-09' };
    await expect(render()).rejects.toThrow(
      `/work/${slug}: updatedAt 2026-09-09 is before publishedAt 2026-09-25`,
    );
  });
});

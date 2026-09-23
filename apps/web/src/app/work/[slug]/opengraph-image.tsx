import { caseStudies, getCaseStudy } from '@/data/case-studies';
import { OG_CONTENT_TYPE, OG_SIZE, socialCard } from '@/lib/og-image';

export const alt = 'Case study by Milos Cvetkovic';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// A route handler does not inherit the page's params: without its own list this card would render
// per request instead of at build time, and an unknown slug would reach the handler (ADR 0015).
export const dynamicParams = false;

export function generateStaticParams() {
  return caseStudies.map(({ slug }) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const study = getCaseStudy((await params).slug);
  if (!study) throw new Error('opengraph-image: unknown case study');
  return socialCard({
    eyebrow: 'Case study',
    title: study.title,
    description: study.description,
    tags: study.tags,
  });
}

import { caseStudies, getCaseStudy } from '@/data/case-studies';
import { caseStudyToMarkdown, markdownResponse } from '@/lib/serialise';

export const dynamic = 'force-static';

// Its own list, as the page has one: a route handler does not inherit the page's params, and an
// unknown slug stays a routing-level 404 in both representations (ADR 0015).
export const dynamicParams = false;

export function generateStaticParams() {
  return caseStudies.map(({ slug }) => ({ slug }));
}

export async function GET(_request: Request, { params }: RouteContext<'/work/[slug]/index.md'>) {
  const study = getCaseStudy((await params).slug);
  if (!study) throw new Error('index.md: unknown case study');
  return markdownResponse(caseStudyToMarkdown(study));
}

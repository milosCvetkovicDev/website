import { caseStudies, getCaseStudy } from '@/data/case-studies';
import { caseStudyToJson, jsonResponse } from '@/lib/serialise';

export const dynamic = 'force-static';

// Its own list, as the page and the twin have one: a route handler does not inherit the page's
// params, and an unknown slug stays a routing-level 404 in every representation (ADR 0015).
export const dynamicParams = false;

export function generateStaticParams() {
  return caseStudies.map(({ slug }) => ({ slug }));
}

export async function GET(_request: Request, { params }: RouteContext<'/work/[slug]/index.json'>) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  // Unreachable while `generateStaticParams` and `getCaseStudy` read one list: `dynamicParams` 404s
  // any other slug before this runs. If they ever drift, the prerender fails naming the slug,
  // rather than shipping a document that answers 404 while its page answers 200.
  if (!study) throw new Error(`index.json: unknown case study ${JSON.stringify(slug)}`);
  return jsonResponse(caseStudyToJson(study));
}

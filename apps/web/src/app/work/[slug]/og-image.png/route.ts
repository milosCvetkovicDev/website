import { caseStudies, getCaseStudy } from '@/data/case-studies';
import { socialCard } from '@/lib/og-image';

// The case-study card, as a route handler rather than an `opengraph-image.tsx`, so that its alt text
// can name the study. A metadata image file exports one static `alt` for every slug. Its per-params
// form, `generateImageMetadata`, moves the card under an id segment whose static params are
// generated without the slug, so on Next 16.3.5 no card was prerendered and each would render on
// its first request. `generateMetadata` in `../page.tsx` points og:image here, with the alt.
export const dynamic = 'force-static';

// Its own list, as the page has one: a route handler does not inherit the page's params, and an
// unknown slug stays a 404 (ADR 0015).
export const dynamicParams = false;

export function generateStaticParams() {
  return caseStudies.map(({ slug }) => ({ slug }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<'/work/[slug]/og-image.png'>,
) {
  const study = getCaseStudy((await params).slug);
  if (!study) throw new Error('og-image.png: unknown case study');
  return socialCard({
    eyebrow: 'Case study',
    title: study.title,
    description: study.description,
    tags: study.tags,
  });
}

import { getPost, publishedPosts } from '@/data/posts';
import { socialCard } from '@/lib/og-image';

// The post card, as a route handler, as the case studies' is (`work/[slug]/og-image.png`): its alt
// text names the post, which an `opengraph-image` file's one static `alt` cannot, and a per-post
// `opengraph-image.tsx` built as a function when measured for #61. `generateMetadata` in
// `../page.tsx` points og:image here, with the alt.
export const dynamic = 'force-static';

// Its own list, as the page has one: a route handler does not inherit the page's params, and an
// unknown slug, a draft's included, stays a 404 (ADR 0015).
export const dynamicParams = false;

export function generateStaticParams() {
  return publishedPosts.map(({ slug }) => ({ slug }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<'/blog/[slug]/og-image.png'>,
) {
  const { slug } = await params;
  const post = getPost(slug);
  // Unreachable while `generateStaticParams` and `getPost` read one index: `dynamicParams` 404s any
  // other slug first. If they ever drift, the prerender fails naming the slug.
  if (!post) throw new Error(`og-image.png: unknown post ${JSON.stringify(slug)}`);
  return socialCard({
    eyebrow: 'Writing',
    title: post.title,
    description: post.summary,
    tags: post.tags,
  });
}

import { getPost, publishedPosts } from '@/data/posts';
import { postStaticParams } from '@/lib/post-static-params';
import { markdownResponse, postToMarkdown } from '@/lib/serialise';

/**
 * A post's Markdown twin (#59, 61e), prerendered for each published post like its page and its
 * card. `dynamicParams = false` makes any other slug, a draft's included, a routing-level 404.
 */
export const dynamic = 'force-static';

export const dynamicParams = false;

export function generateStaticParams() {
  return postStaticParams(publishedPosts);
}

export async function GET(_request: Request, { params }: RouteContext<'/blog/[slug]/index.md'>) {
  const { slug } = await params;
  const post = getPost(slug);
  // Unreachable while `generateStaticParams` and `getPost` read one index: `dynamicParams` 404s any
  // other slug first. If they ever drift, the prerender fails naming the slug.
  if (!post) throw new Error(`index.md: unknown post ${JSON.stringify(slug)}`);
  return markdownResponse(postToMarkdown(post));
}

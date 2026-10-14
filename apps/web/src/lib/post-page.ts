// A type alone: it compiles away, so this module never carries the posts' values (`posts.test.ts`),
// and `components/json-ld.tsx` can read it as the post page does.
import type { PublishedPost } from '@/data/posts';

/**
 * The route of a post's page, `/blog/<slug>`: its head, its visible dates and its three JSON-LD
 * nodes all build from this one path, so the WebPage's `@id`, the article's `mainEntityOfPage` and
 * the trail's last step cannot drift apart. `posts.test.ts` holds every slug to lowercase words
 * joined by hyphens, so it needs no encoding.
 */
export function postPath(post: Pick<PublishedPost, 'slug'>): string {
  return `/blog/${post.slug}`;
}

/**
 * The title a post's head carries and its WebPage node is named with, as `caseStudyPageTitle` is
 * for a case study: the shorter `metaTitle` when the post sets one (`posts.test.ts` refuses a blank
 * one), otherwise the title.
 */
export function postPageTitle(post: Pick<PublishedPost, 'title' | 'metaTitle'>): string {
  return post.metaTitle ?? post.title;
}

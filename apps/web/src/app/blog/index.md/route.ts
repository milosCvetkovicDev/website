import { pages } from '@/data/pages';
import { publishedPosts } from '@/data/posts';
import { blogToMarkdown, markdownResponse } from '@/lib/serialise';

export const dynamic = 'force-static';

export function GET() {
  return markdownResponse(blogToMarkdown(pages['/blog'], publishedPosts));
}

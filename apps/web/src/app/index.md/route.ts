import { pages } from '@/data/pages';
import { markdownResponse, pageToMarkdown } from '@/lib/serialise';

export const dynamic = 'force-static';

export function GET() {
  return markdownResponse(pageToMarkdown(pages['/']));
}

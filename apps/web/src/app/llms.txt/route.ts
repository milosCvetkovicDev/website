import { llmsTxtResponse, siteIndexToLlmsTxt } from '@/lib/serialise';

// A GET handler is dynamic unless it says otherwise, and would build as a server function;
// `pnpm check:build-output` fails the build if this line goes.
export const dynamic = 'force-static';

// The site's llmstxt.org index (#60): who this is, and where the Markdown twins and the case-study
// JSON live. Every page's head points here with `rel="describedby"` (the root layout).
export function GET() {
  return llmsTxtResponse(siteIndexToLlmsTxt());
}

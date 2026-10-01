import { caseStudiesToJson, jsonResponse } from '@/lib/serialise';

// A GET handler is dynamic unless it says otherwise, and would build as a server function;
// `pnpm check:build-output` fails the build if this line goes.
export const dynamic = 'force-static';

// Every case study as one JSON array (#60), outside `/api/` on purpose: a machine-readable
// endpoint should never sit under a prefix a robots.txt might one day tell crawlers to skip.
export function GET() {
  return jsonResponse(caseStudiesToJson());
}

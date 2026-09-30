import { createMcpHandler } from 'mcp-handler';
import { absoluteUrl } from '@/lib/serialise';
import { registerTools, SERVER_INFO } from './tools';

/**
 * A read-only MCP server (#62), stateless on protocol revision 2026-07-28 and served over
 * streamable HTTP alone: every JSON-RPC request is one POST, answered by a server `mcp-handler`
 * builds for it and discards, so there is no `initialize`, no session header and no session
 * store. The SDK answers `server/discover`, checks that the `MCP-Protocol-Version`, `Mcp-Method`
 * and `Mcp-Name` headers match the body (400, `-32020`) and turns a tool's failure into an error
 * result. The record is the ADR on the read-only MCP server in `docs/adr`.
 *
 * `POST` is the only export, so Next answers any other method with 405, as the transport asks of a
 * GET. The route is this folder alone, with no catch-all beside it, so the paths of the deprecated
 * HTTP+SSE transport are router 404s. It is the site's one server function:
 * `pnpm check:build-output` fails a build with any other.
 */

/**
 * How long a client may reuse the tool list and the server's description. Both change only with a
 * deployment, and neither differs per caller, so a shared cache may hold them.
 */
const LIST_CACHE = { ttlMs: 60 * 60 * 1000, cacheScope: 'public' } as const;

const handler = createMcpHandler(registerTools, {
  serverInfo: SERVER_INFO,
  // The tool set is fixed at build time: nothing to announce and nothing to subscribe to.
  capabilities: { tools: { listChanged: false } },
  cacheHints: { 'tools/list': LIST_CACHE, 'server/discover': LIST_CACHE },
  maxSubscriptions: 0,
});

/**
 * The transport requires the `Origin` header to be checked and a present but invalid one refused
 * with 403, against DNS rebinding; the SDK leaves the check to its host. An absent `Origin` passes:
 * a CLI or a server-side client sends none. The site's canonical origin passes, and so does the
 * origin the request was addressed to, which on Vercel is one of the deployment's own domains and
 * locally the server Playwright started. Anything else, `null` included, is refused before the SDK
 * reads the body. The comparison is of whole serialised origins (scheme, host and port), not host
 * names. No `Access-Control-Allow-Origin` is ever sent, so a page on another origin cannot read an
 * answer either way. The refusal logs nothing: the e2e job fails on any line of server output.
 */
function refusal(request: Request): Response | undefined {
  const origin = request.headers.get('origin');
  if (origin === null || origin === '') return undefined;
  if (origin === absoluteUrl('/') || origin === new URL(request.url).origin) return undefined;
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Forbidden: requests from this Origin are not accepted' },
      id: null,
    },
    { status: 403 },
  );
}

export async function POST(request: Request): Promise<Response> {
  return refusal(request) ?? handler(request);
}

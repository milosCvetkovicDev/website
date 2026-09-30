import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';
import { SERVER_INFO } from '../src/app/mcp/tools';
import { MCP, SITE_ORIGIN } from './endpoints';

/**
 * The read-only MCP server at `/mcp` (#62, AC 1 to 7), over the served bytes: `request` only, so
 * no page opens and neither the console gate nor axe is involved. `/mcp` is deliberately not in
 * `routes.ts`, whose walks GET every route: this endpoint answers a GET with 405.
 *
 * Every request is shaped as protocol revision 2026-07-28 asks: one POST per JSON-RPC request, the
 * protocol fields in `params._meta`, and the version, the method and (for `tools/call`) the tool
 * name mirrored into `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name`
 * (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http). The
 * tool payloads themselves are `src/app/mcp/__tests__/tools.test.ts`'s to check; here the question
 * is what the deployed route answers.
 */

const PROTOCOL_VERSION = '2026-07-28';

interface JsonRpcReply {
  jsonrpc: string;
  id: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface McpRequest {
  method: string;
  params?: Record<string, unknown>;
  /** `Mcp-Name`, for `tools/call`. */
  name?: string;
  /** The protocol version the body's `_meta` names, when it should disagree with the header. */
  bodyVersion?: string;
  /** Headers to add or override. */
  headers?: Record<string, string>;
}

let nextId = 1;

function post(request: APIRequestContext, path: string, call: McpRequest): Promise<APIResponse> {
  const { method, params = {}, name, bodyVersion = PROTOCOL_VERSION, headers = {} } = call;
  return request.post(path, {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
      'mcp-method': method,
      ...(name === undefined ? {} : { 'mcp-name': name }),
      ...headers,
    },
    data: {
      jsonrpc: '2.0',
      id: nextId++,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': bodyVersion,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'mcp.spec', version: '1' },
        },
      },
    },
  });
}

/** The reply's one JSON-RPC message: nothing this server does streams, so it answers JSON. */
async function reply(response: APIResponse): Promise<JsonRpcReply> {
  expect(response.headers()['content-type'] ?? '').toMatch(/^application\/json\b/);
  const message = (await response.json()) as JsonRpcReply;
  expect(message.jsonrpc).toBe('2.0');
  return message;
}

/** A response no page on another origin may read: no CORS grant of any kind. */
function expectNoCorsGrant(response: APIResponse): void {
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
}

test(`AC 1: POST ${MCP} answers server/discover for ${PROTOCOL_VERSION}, naming the server`, async ({
  request,
}) => {
  const response = await post(request, MCP, { method: 'server/discover' });
  expect(response.status()).toBe(200);
  const { result, error } = await reply(response);
  expect(error).toBeUndefined();
  expect(result?.supportedVersions).toContain(PROTOCOL_VERSION);
  const meta = result?._meta as Record<string, unknown> | undefined;
  expect(meta?.['io.modelcontextprotocol/serverInfo']).toEqual(SERVER_INFO);
  // Nothing to announce and nothing to subscribe to: the tool set is fixed at build time.
  expect(result?.capabilities).toEqual({ tools: { listChanged: false } });
  expectNoCorsGrant(response);
});

test(`AC 2 and 3: tools/list names three read-only tools, cacheably, and hands out no session`, async ({
  request,
}) => {
  const response = await post(request, MCP, { method: 'tools/list' });
  expect(response.status()).toBe(200);
  expect(
    response.headers()['mcp-session-id'],
    'a stateless server hands out no session',
  ).toBeUndefined();

  const { result, error } = await reply(response);
  expect(error).toBeUndefined();
  const tools = result?.tools as { name: string; title?: string; annotations?: object }[];
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    'get_case_study',
    'get_tech_stack',
    'search_case_studies',
  ]);
  for (const tool of tools) {
    expect(tool.title, `${tool.name} has a title`).toMatch(/\S/);
    expect(tool.annotations, `${tool.name} is read-only`).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  }
  // The 2026-07-28 revision requires both on a list result.
  expect(result?.ttlMs).toEqual(expect.any(Number));
  expect(['public', 'private']).toContain(result?.cacheScope);
});

test('AC 4: tools/call get_case_study returns the case study from the data module', async ({
  request,
}) => {
  const [study] = caseStudies;
  const response = await post(request, MCP, {
    method: 'tools/call',
    name: 'get_case_study',
    params: { name: 'get_case_study', arguments: { slug: study.slug } },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['mcp-session-id']).toBeUndefined();
  const { result, error } = await reply(response);
  expect(error).toBeUndefined();
  expect(result?.isError ?? false).toBe(false);
  expect(result?.structuredContent).toMatchObject({ slug: study.slug, title: study.title });
  const text = (result?.content as { type: string; text?: string }[])
    .map((block) => block.text ?? '')
    .join('\n');
  expect(text).toContain(study.title);
});

test(`AC 5: GET ${MCP} is 405, and the deprecated HTTP+SSE paths are not served`, async ({
  request,
}) => {
  const get = await request.get(MCP);
  expect(get.status()).toBe(405);
  expect(get.headers()['mcp-session-id']).toBeUndefined();

  for (const path of ['/sse', '/message']) {
    const response = await post(request, path, { method: 'tools/list' });
    expect(response.status(), `POST ${path}`).toBe(404);
  }
});

test.describe('AC 6: the Origin check', () => {
  test('refuses another site with 403 and a JSON-RPC error', async ({ request }) => {
    const response = await post(request, MCP, {
      method: 'tools/list',
      headers: { origin: 'https://example.invalid' },
    });
    expect(response.status()).toBe(403);
    const { error, result } = await reply(response);
    expect(result).toBeUndefined();
    expect(error?.code).toBe(-32000);
    expectNoCorsGrant(response);
  });

  test("accepts the site's own origin", async ({ request, baseURL }) => {
    const response = await post(request, MCP, {
      method: 'tools/list',
      headers: { origin: new URL(baseURL!).origin },
    });
    expect(response.status()).toBe(200);
    expect((await reply(response)).error).toBeUndefined();
    expectNoCorsGrant(response);
  });

  test('accepts the canonical origin', async ({ request }) => {
    const response = await post(request, MCP, {
      method: 'tools/list',
      headers: { origin: SITE_ORIGIN },
    });
    expect(response.status()).toBe(200);
  });
});

test.describe('AC 7: headers that disagree with the body are refused with -32020', () => {
  test('an MCP-Protocol-Version other than the body _meta names', async ({ request }) => {
    const response = await post(request, MCP, { method: 'tools/list', bodyVersion: '2025-11-25' });
    expect(response.status()).toBe(400);
    expect((await reply(response)).error?.code).toBe(-32020);
  });

  test('an Mcp-Name other than the tool the body calls', async ({ request }) => {
    const response = await post(request, MCP, {
      method: 'tools/call',
      name: 'get_tech_stack',
      params: { name: 'get_case_study', arguments: { slug: caseStudies[0].slug } },
    });
    expect(response.status()).toBe(400);
    expect((await reply(response)).error?.code).toBe(-32020);
  });
});

/**
 * @vitest-environment node
 *
 * The `Origin` policy in front of the MCP server at `/mcp` (#62). The 2026-07-28 transport makes
 * the check a MUST, with 403 for a present but invalid value, and the SDK performs none itself.
 * An absent `Origin` (a CLI, a server-side client) passes; so does the site's canonical origin, and
 * the origin the request itself was addressed to where its host name cannot be an attacker's (a
 * loopback name, or any host on Vercel, which routes only the project's domains here); any other
 * value is refused before the SDK sees the body. A refusal writes nothing to the server's output, because `check-webserver-log.mjs`
 * fails the e2e job on any line there, and carries no CORS header.
 *
 * Below it, what the SDK answers for the requests a hostile or confused client sends, pinned
 * because the route relies on it: a malformed body is a JSON-RPC error rather than a thrown one
 * (which Next would turn into a logged 500), an earlier revision's `initialize` gets no session,
 * `subscriptions/listen` is refused, and the list results carry the cache hints the route sets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

const PROTOCOL_VERSION = '2026-07-28';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  vi.stubEnv('VERCEL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function discover(url: string, origin?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': 'server/discover',
      ...(origin === undefined ? {} : { Origin: origin }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'route.test', version: '0.0.0' },
        },
      },
    }),
  });
}

describe('POST /mcp Origin policy', () => {
  it.each([
    ['no Origin', 'http://localhost:3210/mcp', undefined],
    ['the canonical origin', 'http://localhost:3210/mcp', 'https://miloscvetkovic.dev'],
    ['the request’s own loopback origin', 'http://localhost:3210/mcp', 'http://localhost:3210'],
    [
      'the request’s own IPv4 loopback origin',
      'http://127.0.0.1:3210/mcp',
      'http://127.0.0.1:3210',
    ],
    ['the request’s own IPv6 loopback origin', 'http://[::1]:3210/mcp', 'http://[::1]:3210'],
  ])('accepts %s', async (_label, url, origin) => {
    const response = await POST(discover(url, origin));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it.each([
    ['as written', 'https://preview.example.test'],
    ['with a trailing slash', 'https://preview.example.test/'],
    ['in upper case', 'https://Preview.Example.TEST'],
    ['with the default port', 'https://preview.example.test:443'],
  ])(
    'accepts the configured site origin when NEXT_PUBLIC_SITE_URL sets one %s',
    async (_label, env) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', env);
      const response = await POST(
        discover('http://localhost:3210/mcp', 'https://preview.example.test'),
      );
      expect(response.status).toBe(200);
    },
  );

  it('accepts the request’s own origin on Vercel, which routes only the project’s domains', async () => {
    vi.stubEnv('VERCEL', '1');
    const response = await POST(
      discover('https://example.vercel.app/mcp', 'https://example.vercel.app'),
    );
    expect(response.status).toBe(200);
  });

  it.each([
    ['another site', 'https://example.invalid'],
    ['the canonical host over http', 'http://miloscvetkovic.dev'],
    ['the canonical host on another port', 'https://miloscvetkovic.dev:8443'],
    ['a subdomain of the canonical host', 'https://evil.miloscvetkovic.dev'],
    ['the request’s host on another port', 'http://localhost:3000'],
    ['an opaque origin', 'null'],
    ['a value that is not an origin', 'not a url'],
  ])('refuses %s with 403 and a JSON-RPC error, silently', async (_label, origin) => {
    await expectRefused(discover('http://localhost:3210/mcp', origin));
  });

  // After a DNS rebinding the browser addresses the request to the attacker's own name, so the
  // Host the URL is built from and the Origin agree: only the host name can tell it apart.
  it.each([
    ['a rebound host name', 'http://rebind.example:3210/mcp', 'http://rebind.example:3210'],
    ['a rebound host name over https', 'https://rebind.example/mcp', 'https://rebind.example'],
    [
      'a Vercel host name off Vercel',
      'https://example.vercel.app/mcp',
      'https://example.vercel.app',
    ],
  ])('refuses the request’s own origin for %s', async (_label, url, origin) => {
    await expectRefused(discover(url, origin));
  });
});

async function expectRefused(request: Request): Promise<void> {
  const writes = [
    vi.spyOn(console, 'error').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'log').mockImplementation(() => {}),
  ];
  const response = await POST(request);
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('content-type')).toMatch(/^application\/json/);
  const body = (await response.json()) as { jsonrpc: string; error: { code: number } };
  expect(body.jsonrpc).toBe('2.0');
  expect(body.error.code).toBe(-32000);
  for (const write of writes) expect(write).not.toHaveBeenCalled();
}

const META = {
  'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'route.test', version: '0.0.0' },
};

function raw(body: string | undefined, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3210/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': 'tools/list',
      ...headers,
    },
    body,
  });
}

/** Answers `request` and returns the reply, failing on any console output on the way. */
async function answer(request: Request): Promise<Response> {
  const writes = [
    vi.spyOn(console, 'error').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'log').mockImplementation(() => {}),
  ];
  const response = await POST(request);
  for (const write of writes) expect(write).not.toHaveBeenCalled();
  return response;
}

describe('POST /mcp protocol edges', () => {
  const listBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: { _meta: META },
  });

  it.each([
    ['a body that is not JSON', raw('{not json'), 400, -32700],
    ['an empty body', raw(''), 400, -32700],
    ['no body', raw(undefined), 400, -32700],
    ['JSON that is not JSON-RPC', raw(JSON.stringify({ hello: 1 })), 400, -32600],
    ['a batch of invalid messages', raw(JSON.stringify([1, 2])), 400, -32600],
    [
      'a Content-Type other than JSON',
      raw(listBody, { 'Content-Type': 'text/plain' }),
      415,
      -32000,
    ],
  ])(
    'answers %s with a JSON-RPC error, not a thrown one',
    async (_label, request, status, code) => {
      const response = await answer(request);
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toMatch(/^application\/json/);
      const body = (await response.json()) as {
        jsonrpc: string;
        error: { code: number };
        id: null;
      };
      expect(body).toMatchObject({ jsonrpc: '2.0', error: { code }, id: null });
    },
  );

  it('answers an earlier revision’s initialize without minting a session', async () => {
    const response = await answer(
      new Request('http://localhost:3210/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'route.test', version: '0.0.0' },
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    // No session header, nor any other `Mcp-` header: there is nothing for a client to echo back.
    expect([...response.headers.keys()].filter((name) => name.startsWith('mcp-'))).toEqual([]);
    const text = await response.text();
    expect(text).toContain('"serverInfo":{"name":"miloscvetkovic.dev"');
  });

  it('refuses subscriptions/listen, since nothing can be subscribed to', async () => {
    const response = await answer(
      raw(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'subscriptions/listen',
          params: { _meta: META },
        }),
        { 'Mcp-Method': 'subscriptions/listen' },
      ),
    );
    const body = (await response.json()) as { result?: unknown; error?: { code: number } };
    expect(body.result).toBeUndefined();
    expect(body.error?.code).toBe(-32603);
  });

  it.each(['tools/list', 'server/discover'])(
    'marks %s cacheable for an hour by any cache',
    async (method) => {
      const response = await answer(
        raw(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { _meta: META } }), {
          'Mcp-Method': method,
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { result: { ttlMs?: number; cacheScope?: string } };
      expect(body.result.ttlMs).toBe(60 * 60 * 1000);
      expect(body.result.cacheScope).toBe('public');
    },
  );
});

/**
 * @vitest-environment node
 *
 * The `Origin` policy in front of the MCP server at `/mcp` (#62). The 2026-07-28 transport makes
 * the check a MUST, with 403 for a present but invalid value, and the SDK performs none itself.
 * An absent `Origin` (a CLI, a server-side client) passes; so do the site's canonical origin and
 * the origin the request itself was addressed to; any other value is refused before the SDK sees
 * the body. A refusal writes nothing to the server's output, because `check-webserver-log.mjs`
 * fails the e2e job on any line there, and carries no CORS header.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

const PROTOCOL_VERSION = '2026-07-28';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
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
    ['the request’s own origin', 'http://localhost:3210/mcp', 'http://localhost:3210'],
    [
      'the request’s own origin, deployed',
      'https://example.vercel.app/mcp',
      'https://example.vercel.app',
    ],
  ])('accepts %s', async (_label, url, origin) => {
    const response = await POST(discover(url, origin));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accepts the configured site origin when NEXT_PUBLIC_SITE_URL sets one', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.test');
    const response = await POST(
      discover('http://localhost:3210/mcp', 'https://preview.example.test'),
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
    const writes = [
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
    ];
    const response = await POST(discover('http://localhost:3210/mcp', origin));
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    const body = (await response.json()) as { jsonrpc: string; error: { code: number } };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.code).toBe(-32000);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
});

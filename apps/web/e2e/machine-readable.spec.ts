import { expect, test, type APIResponse } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';
import {
  CASE_STUDIES_JSON,
  FEED,
  LLMS_TXT,
  MARKDOWN_TWINS,
  MCP,
  caseStudyJsonPath,
  markdownTwinPath,
} from './endpoints';

/**
 * The machine-readable endpoints, as declared failures until each one ships (#55 AC 10).
 *
 * Every path comes from `endpoints.ts`. Each test is a `test.fail()` whose title and `fixed-by`
 * annotation name the task that ships its endpoint: #59 the Markdown twins, #60 `/llms.txt` and the
 * JSON representation, #61 the Atom feed, #62 the MCP server. None of them exists today, so every
 * test fails, and each asserts the response status before anything else so that the failure it
 * records is the endpoint's 404 rather than some later assertion. An expected failure that starts
 * passing fails the run: the change that ships an endpoint deletes its two annotation lines, and the
 * rest of the test is then that endpoint's contract.
 *
 * Everything here goes through `request`, the served bytes, because that is all an agent's fetch
 * tool reads. `retries: 0`, as for every spec that carries an expected failure (`e2e-tests.md`): a
 * retry would report a row that has started passing as flaky instead of failing it.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

/** The site's origin, only to resolve an absolute `href` to its path. */
const ORIGIN = 'https://miloscvetkovic.dev';

/** The MCP protocol revision #62 targets. */
const MCP_PROTOCOL_VERSION = '2026-07-28';

const contentType = (response: APIResponse) => response.headers()['content-type'] ?? '';

/**
 * The `href` of every `<link rel="alternate" type="text/markdown">` in the served `<head>`. Only the
 * head: Next repeats the head's tags, JSON-escaped, in the flight payload further down the document,
 * and that copy must not answer for a tag that is not in the markup (`seo-surface.spec.ts`).
 */
function markdownAlternates(html: string): string[] {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  return (head.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => /\brel=["']alternate["']/i.test(tag))
    .filter((tag) => /\btype=["']text\/markdown["']/i.test(tag))
    .map((tag) => tag.match(/\bhref=["']([^"']*)["']/i)?.[1] ?? '');
}

for (const { route, twin } of MARKDOWN_TWINS) {
  test(`#59: ${twin} is served as text/markdown and ${route} links to it`, async ({ request }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: '#59' });

    const response = await request.get(twin);
    expect(response.status(), `${twin} is not served`).toBe(200);
    expect(contentType(response)).toMatch(/^text\/markdown\b/);

    const page = await request.get(route);
    expect(page.status()).toBe(200);
    const hrefs = markdownAlternates(await page.text());
    expect(hrefs, `${route} should advertise exactly one Markdown twin`).toHaveLength(1);
    expect(new URL(hrefs[0], ORIGIN).pathname).toBe(twin);
  });
}

test(`#60: ${LLMS_TXT} opens with one H1 and a blockquote and links every case study`, async ({
  request,
}) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: '#60' });

  const response = await request.get(LLMS_TXT);
  expect(response.status(), `${LLMS_TXT} is not served`).toBe(200);
  expect(contentType(response)).toMatch(/^text\/plain\b/);

  const body = await response.text();
  const lines = body.split('\n').filter((line) => line.trim() !== '');
  expect(lines[0], 'llmstxt.org: the file opens with the H1').toMatch(/^# \S/);
  expect(
    lines.filter((line) => /^# /.test(line)),
    'and has only the one H1',
  ).toHaveLength(1);
  expect(lines[1], 'followed by the blockquote').toMatch(/^> \S/);
  for (const { slug } of caseStudies) {
    expect(body).toContain(markdownTwinPath(`/work/${slug}`));
  }
});

test(`#60: ${CASE_STUDIES_JSON} is a JSON array of every case study`, async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: '#60' });

  const response = await request.get(CASE_STUDIES_JSON);
  expect(response.status(), `${CASE_STUDIES_JSON} is not served`).toBe(200);
  expect(contentType(response)).toMatch(/^application\/json\b/);

  const entries: unknown = await response.json();
  expect(Array.isArray(entries)).toBe(true);
  const slugs = (entries as { slug?: unknown }[]).map((entry) => entry.slug);
  expect([...slugs].sort()).toEqual(caseStudies.map(({ slug }) => slug).sort());
});

for (const { slug } of caseStudies) {
  const path = caseStudyJsonPath(slug);
  test(`#60: ${path} is the case study as JSON`, async ({ request }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: '#60' });

    const response = await request.get(path);
    expect(response.status(), `${path} is not served`).toBe(200);
    expect(contentType(response)).toMatch(/^application\/json\b/);
    expect(await response.json()).toMatchObject({ slug });
  });
}

test(`#61: ${FEED} is an Atom feed`, async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: '#61' });

  const response = await request.get(FEED);
  expect(response.status(), `${FEED} is not served`).toBe(200);
  expect(contentType(response)).toMatch(/^application\/atom\+xml\b/);
  expect(await response.text()).toMatch(
    /<feed\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/,
  );
});

test(`#62: POST ${MCP} answers tools/list without a session`, async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: '#62' });

  // #62's documented smoke call, header for header. The task that ships the server owns this
  // request's shape and corrects it here if the protocol revision asks for another.
  const response = await request.post(MCP, {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'mcp-method': 'tools/list',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
      _meta: { 'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION },
    },
  });
  expect(response.status(), `POST ${MCP} is not served`).toBe(200);
  expect(response.headers()['mcp-session-id'], 'a stateless server hands out no session').toBe(
    undefined,
  );

  // Streamable HTTP may answer with JSON or with a one-event stream; either carries one message.
  const text = await response.text();
  const json = contentType(response).startsWith('text/event-stream')
    ? (text.match(/^data: ?(.*)$/m)?.[1] ?? '')
    : text;
  const message = JSON.parse(json) as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: { tools?: unknown };
  };
  expect(message).toMatchObject({ jsonrpc: '2.0', id: 1 });
  expect(Array.isArray(message.result?.tools)).toBe(true);
  expect((message.result?.tools as unknown[]).length).toBeGreaterThan(0);
});

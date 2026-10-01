import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { OWNER_TODO } from '../src/data/owner-todo';
import {
  CASE_STUDIES_JSON,
  CASE_STUDY_ENDPOINTS,
  FEED,
  LLMS_TXT,
  MARKDOWN_TWINS,
  MCP,
  SITE_ORIGIN,
  caseStudyJsonPath,
} from './endpoints';

/**
 * The machine-readable endpoints, as declared failures until each one ships (#55 AC 10).
 *
 * Every path comes from `endpoints.ts`. Each test's title and `fixed-by` annotation name the task
 * that ships its endpoint: #59 the Markdown twins, #60 `/llms.txt` and the JSON representation, #61
 * the Atom feed, #62 the MCP server. The twins (#59) and the case-study JSON (#60) are served, so
 * their rows run the contract alone; for each endpoint not yet served, `expectNotServedYet` makes
 * its test an expected failure for that one reason only. It first requires the status to be the 404
 * of an endpoint that is not there, outside the declared failure, so a 5xx, a timeout or a server
 * that never started fails the run; only then does it call `test.fail()` and fail on the status. A
 * 200 fails the run too, so the change that ships an endpoint must delete that one call, and the
 * rest of the test is then that endpoint's contract.
 *
 * Everything here goes through `request`, the served bytes, because that is all an agent's fetch
 * tool reads. `retries: 0`, as for every spec that carries an expected failure (`e2e-tests.md`): a
 * retry would report a row that has started passing as flaky instead of failing it.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

/** A slug no case study has, for the 404 of its JSON document (#60 AC 7). */
const UNKNOWN_SLUG = 'no-such-case-study';

/** The MCP protocol revision #62 targets. */
const MCP_PROTOCOL_VERSION = '2026-07-28';

const contentType = (response: APIResponse) => response.headers()['content-type'] ?? '';

/**
 * Declares the test an expected failure because `path` is not served yet, and only for that: the
 * status must be 404 before `test.fail()` is called, so every other outcome fails the run.
 */
function expectNotServedYet(response: APIResponse, path: string, issue: string): void {
  test.info().annotations.push({ type: 'fixed-by', description: issue });
  expect(
    response.status(),
    `${path} answers ${response.status()}. While ${issue} is open it must be a 404; once ${issue} ` +
      'serves it, delete this expectNotServedYet call so the contract below runs',
  ).toBe(404);
  test.fail();
  expect(response.status(), `${path} is not served`).toBe(200);
}

/**
 * A JSON endpoint's document, after its status, its content type and the owner-placeholder rule
 * (`src/data/owner-todo.ts`: a marker never reaches served output) have been checked on the bytes,
 * each failure naming the path.
 */
async function servedJson(request: APIRequestContext, path: string): Promise<unknown> {
  const response = await request.get(path);
  expect(response.status(), `${path} is served`).toBe(200);
  expect(contentType(response), `${path} is JSON`).toMatch(/^application\/json\b/);
  const body = await response.text();
  expect(body, `${path} serves no owner placeholder`).not.toContain(OWNER_TODO);
  return JSON.parse(body) as unknown;
}

/** Whether `href` points at `path` on this site: root-relative, or absolute on `SITE_ORIGIN`. */
function isSitePath(href: string, path: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//'))
    return new URL(href, SITE_ORIGIN).pathname === path;
  try {
    const url = new URL(href);
    return url.origin === SITE_ORIGIN && url.pathname === path && url.search === '';
  } catch {
    return false;
  }
}

/** The value of attribute `name` in one start tag, quoted either way or unquoted. */
function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'),
  );
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/**
 * The `href` of every `<link>` in the served `<head>` whose `rel` includes `alternate` and whose
 * `type` is `text/markdown`. Only the head (`<head>` itself, never `<header>`): Next repeats the
 * head's tags, JSON-escaped, in the flight payload further down the document, and that copy must not
 * answer for a tag that is not in the markup (`seo-surface.spec.ts`).
 */
function markdownAlternates(html: string): string[] {
  const head = html.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  return (head.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('alternate'))
    .filter((tag) => /^text\/markdown\b/i.test(attribute(tag, 'type') ?? ''))
    .map((tag) => attribute(tag, 'href') ?? '');
}

/** The lines of a Markdown document outside fenced code blocks. */
function linesOutsideFences(markdown: string): string[] {
  let fenced = false;
  return markdown.split('\n').filter((line) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
}

/** Whether `markdown` has a Markdown link, `[text](target)`, whose target is `path` on this site. */
function linksTo(markdown: string, path: string): boolean {
  return [...markdown.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].some(([, target]) =>
    isSitePath(target, path),
  );
}

/**
 * The JSON-RPC messages of a streamable-HTTP reply. A JSON body is one message. An SSE body is a
 * series of events separated by blank lines, each carrying its message in one or more `data:` lines
 * that join with a newline; an event with no data (a priming event that only sets an id) carries
 * none, and the server may send notifications before the response (MCP 2026-07-28, Streamable HTTP,
 * "Receiving Messages").
 */
function jsonRpcMessages(response: APIResponse, text: string): unknown[] {
  if (!contentType(response).startsWith('text/event-stream')) return [JSON.parse(text)];
  return text
    .split(/\r?\n\r?\n/)
    .map((event) =>
      event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).replace(/^ /, ''))
        .join('\n'),
    )
    .filter((data) => data.trim() !== '')
    .map((data) => JSON.parse(data));
}

for (const { route, twin } of MARKDOWN_TWINS) {
  test(`#59: ${twin} is served as text/markdown and ${route} links to it`, async ({ request }) => {
    const response = await request.get(twin);
    expect(response.status()).toBe(200);
    expect(contentType(response)).toMatch(/^text\/markdown\b/);

    const page = await request.get(route);
    expect(page.status()).toBe(200);
    const hrefs = markdownAlternates(await page.text());
    expect(hrefs, `${route} should advertise exactly one Markdown twin`).toHaveLength(1);
    expect(
      isSitePath(hrefs[0], twin),
      `${route}'s twin link ${hrefs[0]} should be ${twin}, root-relative or on ${SITE_ORIGIN}`,
    ).toBe(true);
  });
}

// The shape is #60's "exact v2 shape": one `# ` H1 first (the only section llmstxt.org requires),
// then one `> ` blockquote, which #60 requires of this site; then link lists pointing at the twins.
test(`#60: ${LLMS_TXT} opens with one H1 and a blockquote and links every case study`, async ({
  request,
}) => {
  const response = await request.get(LLMS_TXT);
  expectNotServedYet(response, LLMS_TXT, '#60');
  expect(response.status()).toBe(200);
  expect(contentType(response)).toMatch(/^text\/plain\b/);

  const body = await response.text();
  const lines = linesOutsideFences(body).filter((line) => line.trim() !== '');
  expect(lines[0], 'llmstxt.org: the file opens with the H1').toMatch(/^# \S/);
  expect(
    lines.filter((line) => /^# /.test(line)),
    'and has only the one H1',
  ).toHaveLength(1);
  expect(lines[1], '#60: followed by the blockquote').toMatch(/^> \S/);
  for (const { twin } of CASE_STUDY_ENDPOINTS) {
    expect(linksTo(body, twin), `${LLMS_TXT} should link ${twin}`).toBe(true);
  }
});

test(`#60: ${CASE_STUDIES_JSON} is a JSON array of every case study`, async ({ request }) => {
  const entries = await servedJson(request, CASE_STUDIES_JSON);
  expect(Array.isArray(entries), 'the body is an array').toBe(true);
  for (const entry of entries as unknown[]) {
    // #60: each entry is a case study's fields plus its absolute `url` and `markdown` twin URL, its
    // metric with the rendering the cards show, and its metric definition or null, never a marker.
    expect(entry, 'every entry is a case study').toEqual(
      expect.objectContaining({
        slug: expect.any(String),
        title: expect.any(String),
        highlight: expect.objectContaining({
          metric: expect.objectContaining({
            value: expect.any(Number),
            formatted: expect.any(String),
          }),
        }),
        url: expect.any(String),
        markdown: expect.any(String),
      }),
    );
    const { metricDefinition } = entry as { metricDefinition: unknown };
    expect(
      metricDefinition === null ||
        (typeof metricDefinition === 'object' && !Array.isArray(metricDefinition)),
      `metricDefinition is null or an object, not ${JSON.stringify(metricDefinition)}`,
    ).toBe(true);
  }
  const typed = entries as { slug: string; url: string; markdown: string }[];
  expect(typed.map(({ slug }) => slug).sort()).toEqual(
    CASE_STUDY_ENDPOINTS.map(({ slug }) => slug).sort(),
  );

  // The derived URLs are absolute on this site and name what it serves: the study's page and twin.
  const linked: string[] = [];
  for (const { slug, route, twin } of CASE_STUDY_ENDPOINTS) {
    const entry = typed.find((study) => study.slug === slug);
    if (!entry) throw new Error(`${CASE_STUDIES_JSON} has no entry for ${slug}`);
    for (const [key, href, path] of [
      ['url', entry.url, route],
      ['markdown', entry.markdown, twin],
    ] as const) {
      const said = `${slug}'s ${key} ${href}`;
      expect(href.startsWith(`${SITE_ORIGIN}/`), `${said} is absolute on ${SITE_ORIGIN}`).toBe(
        true,
      );
      expect(isSitePath(href, path), `${said} should be ${path}`).toBe(true);
      linked.push(path);
    }
  }
  const statuses = await Promise.all(
    linked.map(async (path) => [path, (await request.get(path)).status()] as const),
  );
  expect(statuses, 'every linked page and twin is served').toEqual(
    linked.map((path) => [path, 200]),
  );
});

for (const { slug, json } of CASE_STUDY_ENDPOINTS) {
  test(`#60: ${json} is the case study as JSON`, async ({ request }) => {
    const entry = await servedJson(request, json);
    expect(entry).toMatchObject({ slug });

    // One study, one representation: the document is the array's entry for the same slug.
    const list = (await servedJson(request, CASE_STUDIES_JSON)) as { slug: string }[];
    expect(entry).toEqual(list.find((study) => study.slug === slug));
  });
}

// ADR 0015: the params are fixed at build time, so a slug with no study is a routing-level 404, as
// the page's and the twin's are, rather than a document rendered on demand. Slugs are
// case-sensitive, so a study's slug in capitals is unknown too. Neither 404 is served as JSON.
const [{ slug: KNOWN_SLUG }] = CASE_STUDY_ENDPOINTS;
for (const slug of [UNKNOWN_SLUG, KNOWN_SLUG.toUpperCase()]) {
  test(`#60: ${caseStudyJsonPath(slug)} is a 404`, async ({ request }) => {
    expect(CASE_STUDY_ENDPOINTS.map((endpoint) => endpoint.slug)).not.toContain(slug);
    const response = await request.get(caseStudyJsonPath(slug));
    expect(response.status()).toBe(404);
    expect(contentType(response)).not.toMatch(/^application\/json\b/);
  });
}

test(`#61: ${FEED} is an Atom feed`, async ({ request }) => {
  const response = await request.get(FEED);
  expectNotServedYet(response, FEED, '#61');
  expect(response.status()).toBe(200);
  expect(contentType(response)).toMatch(/^application\/atom\+xml\b/);
  expect(await response.text()).toMatch(
    /<feed\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/,
  );
});

test(`#62: POST ${MCP} answers tools/list without a session`, async ({ request }) => {
  // A request as MCP 2026-07-28 shapes it. The protocol fields travel in `params._meta`, where
  // `protocolVersion` and `clientCapabilities` are required and a request without them is a 400
  // (Base Protocol, "_meta", per-request protocol fields:
  // https://modelcontextprotocol.io/specification/2026-07-28/basic). Streamable HTTP mirrors the
  // version and the method into `MCP-Protocol-Version` and `Mcp-Method`, and wants both types in
  // `Accept` (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
  // #62's smoke curl puts `_meta` beside `params` and leaves out `clientCapabilities`; the task that
  // ships the server owns this request's shape and corrects either copy against the revision.
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
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'machine-readable.spec', version: '1' },
        },
      },
    },
  });
  expectNotServedYet(response, `POST ${MCP}`, '#62');
  expect(response.status()).toBe(200);
  expect(response.headers()['mcp-session-id'], 'a stateless server hands out no session').toBe(
    undefined,
  );

  // Streamable HTTP answers with one JSON message or an SSE stream that ends with the response.
  const messages = jsonRpcMessages(response, await response.text());
  const reply = messages.find(
    (message): message is { jsonrpc?: unknown; id?: unknown; result?: { tools?: unknown } } =>
      typeof message === 'object' && message !== null && (message as { id?: unknown }).id === 1,
  );
  expect(reply, 'the reply carries the response to id 1').toMatchObject({ jsonrpc: '2.0', id: 1 });
  expect(Array.isArray(reply?.result?.tools)).toBe(true);
  expect((reply?.result?.tools as unknown[]).length).toBeGreaterThan(0);
});

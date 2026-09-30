/**
 * @vitest-environment node
 *
 * The three read-only tools the MCP server at `/mcp` answers (#62), called the way a client calls
 * them: a JSON-RPC POST on protocol revision 2026-07-28 handed to the route's own `POST`, so the
 * SDK's argument validation, error mapping and result encoding are under test too, without booting
 * a server. Every payload is compared with the serialiser call the JSON representation makes
 * (#60), so the tools cannot state a fact differently from `/case-studies.json` or leave it behind
 * when the data changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { caseStudiesToJson, caseStudyToJson, type CaseStudyJson } from '@/lib/serialise';
import { POST } from '../route';

const PROTOCOL_VERSION = '2026-07-28';
const ENDPOINT = 'http://localhost/mcp';

beforeEach(() => {
  // Empty, as an unset variable is: the payload URLs fall back to production, as #60's do.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface ToolResult {
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface ListedTool {
  name: string;
  title?: string;
  annotations?: Record<string, unknown>;
}

let nextId = 1;

/** One JSON-RPC request as a 2026-07-28 client sends it: headers mirroring the body. */
async function rpc(method: string, params: Record<string, unknown> = {}, name?: string) {
  const id = nextId++;
  const response = await POST(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
        'Mcp-Method': method,
        ...(name === undefined ? {} : { 'Mcp-Name': name }),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': { name: 'tools.test', version: '0.0.0' },
          },
        },
      }),
    }),
  );
  expect(response.status, `${method} status`).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/^application\/json/);
  const message = (await response.json()) as { id: number; result?: unknown; error?: unknown };
  expect(message.error, `${method} answered a JSON-RPC error`).toBeUndefined();
  expect(message.id).toBe(id);
  return message.result;
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await rpc('tools/call', { name, arguments: args }, name)) as ToolResult;
}

/** A successful result: the structured payload, which its text block repeats as JSON. */
function payloadOf(result: ToolResult): Record<string, unknown> {
  expect(result.isError ?? false, JSON.stringify(result.content)).toBe(false);
  expect(result.structuredContent).toBeDefined();
  const text = result.content.find((block) => block.type === 'text')?.text;
  expect(JSON.parse(text ?? 'null')).toEqual(result.structuredContent);
  return result.structuredContent!;
}

async function search(query: string): Promise<CaseStudyJson[]> {
  const payload = payloadOf(await callTool('search_case_studies', { query }));
  return payload.caseStudies as CaseStudyJson[];
}

describe('tools/list', () => {
  it('lists exactly the three read-only tools, each with a title', async () => {
    const result = (await rpc('tools/list')) as { tools: ListedTool[] };
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      'get_case_study',
      'get_tech_stack',
      'search_case_studies',
    ]);
    for (const tool of result.tools) {
      expect(tool.title, tool.name).toMatch(/\S/);
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
    }
  });
});

describe('get_case_study', () => {
  it.each(caseStudies.map((study) => [study.slug, study] as const))(
    'serves %s as the JSON representation does',
    async (slug, study) => {
      const payload = payloadOf(await callTool('get_case_study', { slug }));
      expect(payload).toEqual(caseStudyToJson(study));
    },
  );

  it('answers an unknown slug with an error result, not a thrown error', async () => {
    const result = await callTool('get_case_study', { slug: 'no-such-study' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = result.content.map((block) => block.text ?? '').join('\n');
    // The error names the slugs that exist, so a client can correct itself in one step.
    for (const study of caseStudies) expect(text).toContain(study.slug);
  });
});

describe('search_case_studies', () => {
  it.each(caseStudies.map((study) => [study.title, study.slug] as const))(
    'finds %s by its title',
    async (title, slug) => {
      expect((await search(title)).map((entry) => entry.slug)).toContain(slug);
    },
  );

  const tagged = caseStudies.flatMap((study) =>
    study.tags.map((tag) => [tag, study.slug] as const),
  );
  it.each(tagged)('finds by the tag %s the study %s', async (tag, slug) => {
    expect((await search(tag)).map((entry) => entry.slug)).toContain(slug);
  });

  it('matches without regard to case, and needs every word of the query', async () => {
    const [study] = caseStudies;
    const lower = await search(study.title.toLowerCase());
    expect(lower.map((entry) => entry.slug)).toContain(study.slug);
    expect(await search(`${study.title} zzz-matches-nothing`)).toEqual([]);
  });

  it('returns every match as the JSON representation serves it, in data order', async () => {
    // A word that sits in more than one study's tech stack, taken from the data rather than typed.
    const counts = new Map<string, number>();
    for (const study of caseStudies) {
      for (const item of new Set(study.techStack.flatMap((group) => group.items))) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    const shared = [...counts].find(([, count]) => count > 1)?.[0];
    expect(shared, 'no tech-stack item is shared by two studies').toBeDefined();
    const found = await search(shared!);
    expect(found.length).toBeGreaterThan(1);
    const expected = caseStudiesToJson().filter((entry) =>
      found.some((match) => match.slug === entry.slug),
    );
    expect(found).toEqual(expected);
  });

  it('returns an empty list, not an error, when nothing matches', async () => {
    expect(await search('zzz-matches-nothing')).toEqual([]);
  });

  it('refuses a blank query with an error result', async () => {
    const result = await callTool('search_case_studies', { query: '   ' });
    expect(result.isError).toBe(true);
  });
});

describe('get_tech_stack', () => {
  interface TechStackPayload {
    categories: { category: string; items: { name: string; slugs: string[] }[] }[];
  }

  it('is the union of every study tech stack, with the slugs each item appears in', async () => {
    const payload = payloadOf(await callTool('get_tech_stack')) as unknown as TechStackPayload;

    // Rebuilt from the JSON representation, the same source the tool reads.
    const expected = new Map<string, Map<string, string[]>>();
    for (const entry of caseStudiesToJson()) {
      for (const group of entry.techStack) {
        const items = expected.get(group.category) ?? new Map<string, string[]>();
        expected.set(group.category, items);
        for (const item of group.items) {
          const slugs = items.get(item) ?? [];
          if (!slugs.includes(entry.slug)) slugs.push(entry.slug);
          items.set(item, slugs);
        }
      }
    }

    expect(payload.categories.map((group) => group.category)).toEqual([...expected.keys()]);
    for (const group of payload.categories) {
      const items = expected.get(group.category)!;
      expect(group.items, group.category).toEqual(
        [...items].map(([name, slugs]) => ({ name, slugs })),
      );
    }
  });
});

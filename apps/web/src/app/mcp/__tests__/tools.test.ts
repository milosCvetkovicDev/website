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

/** The words of a study the search reads, split independently of `tools.ts`. */
function searchWords(entry: CaseStudyJson): string[] {
  return [
    entry.title,
    ...entry.tags,
    entry.highlight.category,
    entry.highlight.status,
    entry.highlight.metric.label,
    entry.highlight.metric.formatted,
    ...entry.techStack.flatMap((group) => [group.category, ...group.items]),
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
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

  it('lists the slugs in its input schema, so a client can pick one without a failed call', async () => {
    const result = (await rpc('tools/list')) as {
      tools: { name: string; inputSchema: { properties: { slug?: { enum?: string[] } } } }[];
    };
    const tool = result.tools.find((entry) => entry.name === 'get_case_study');
    expect(tool?.inputSchema.properties.slug?.enum).toEqual(caseStudies.map((study) => study.slug));
  });

  // The enum refuses these during input validation, before the tool runs: the SDK answers with an
  // error result, not a JSON-RPC error, and names the slugs that exist so a client can correct
  // itself in one step.
  it.each([
    ['an unknown slug', { slug: 'no-such-study' }],
    ['a slug that is not a string', { slug: 42 }],
    ['no slug', {}],
  ])('answers %s with an input validation error naming the slugs', async (_label, args) => {
    const result = await callTool('get_case_study', args);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = result.content.map((block) => block.text ?? '').join('\n');
    expect(text).toMatch(
      /^Input validation error: Invalid arguments for tool get_case_study: slug:/,
    );
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

  it('matches a query word from the start of a word only', async () => {
    // Taken from the data: a word of some study, and the tail of it that begins no word anywhere.
    const all = caseStudiesToJson().flatMap((entry) => searchWords(entry));
    const word = all.find((candidate) => {
      const tail = candidate.slice(2);
      return tail.length >= 3 && !all.some((other) => other.startsWith(tail));
    });
    expect(word, 'no word in the data has a tail that begins no word').toBeDefined();
    expect(await search(word!.slice(2))).toEqual([]);
    const owners = caseStudiesToJson().filter((entry) => searchWords(entry).includes(word!));
    expect(await search(word!.slice(0, 3))).toEqual(expect.arrayContaining(owners));
  });

  it('ignores accents, compatibility forms and invisible characters in the query', async () => {
    const [study] = caseStudies;
    const [first] = study.title.split(/\s+/);
    const fullWidth = [...first].map((char) =>
      /[A-Za-z0-9]/.test(char) ? String.fromCodePoint(char.codePointAt(0)! + 0xfee0) : char,
    );
    const slugs = async (query: string) => (await search(query)).map((entry) => entry.slug);
    expect(await slugs(fullWidth.join(''))).toContain(study.slug);
    expect(await slugs(`${first.slice(0, 2)}\u200b${first.slice(2)}`)).toContain(study.slug);
    expect(await slugs(`${first[0]}\u0301${first.slice(1)}`)).toContain(study.slug);
  });

  it('refuses a blank query with an error result', async () => {
    const result = await callTool('search_case_studies', { query: '   ' });
    expect(result.isError).toBe(true);
  });

  it('accepts a query of 200 characters and refuses one of 201', async () => {
    expect(await search('a'.repeat(200))).toEqual([]);
    const result = await callTool('search_case_studies', { query: 'a'.repeat(201) });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/^Input validation error: .*<=200 characters/);
  });

  it.each([
    ['no query', {}],
    ['a query that is not a string', { query: 42 }],
    ['a query that is a list', { query: ['nx'] }],
  ])('answers %s with an input validation error', async (_label, args) => {
    const result = await callTool('search_case_studies', args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/^Input validation error: .* query: /);
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
    // Items merge by their exact spelling, so the data must spell one technology one way.
    for (const group of payload.categories) {
      const folded = group.items.map((item) => item.name.trim().toLowerCase());
      expect(new Set(folded).size, `${group.category} spells an item two ways`).toBe(folded.length);
    }
    for (const group of payload.categories) {
      const items = expected.get(group.category)!;
      expect(group.items, group.category).toEqual(
        [...items].map(([name, slugs]) => ({ name, slugs })),
      );
    }
  });
});

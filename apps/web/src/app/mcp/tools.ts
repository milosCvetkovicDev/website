import type { CallToolResult, McpServer, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { caseStudies, getCaseStudy } from '@/data/case-studies';
import { caseStudiesToJson, caseStudyToJson, type CaseStudyJson } from '@/lib/serialise';

/**
 * The tools of the read-only MCP server at `/mcp` (#62), registered by `route.ts` on the server
 * `mcp-handler` builds for each request. Every payload is built from the case-study JSON
 * serialiser (#60), `caseStudyToJson()` and `caseStudiesToJson()`, the same calls that
 * `/case-studies.json` and `/work/<slug>/index.json` make, so a tool states no fact the site does
 * not already serve, and states it the same way. There is no write tool: nothing here changes
 * state, and each tool says so in its annotations.
 *
 * The descriptions are drafts for the owner to edit: they are what a client's model reads when it
 * decides whether to call a tool.
 */

/**
 * The server's identity in `server/discover`. The version is this tool contract's: raise the minor
 * when a tool is added and the major when a tool's input or payload changes shape.
 */
export const SERVER_INFO = { name: 'miloscvetkovic.dev', version: '1.0.0' } as const;

/** Every tool reads compiled-in data: it changes nothing, and it reaches nothing outside the site. */
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** The longest query `search_case_studies` accepts, far above any title, tag or item it matches. */
const MAX_QUERY_LENGTH = 200;

const SLUGS = caseStudies.map((study) => study.slug);

/** One tech-stack item across the studies: its name as the data writes it, and where it was used. */
export interface TechStackItemJson {
  name: string;
  slugs: string[];
}

/** The payload of `get_tech_stack`: every category of every study's tech stack, merged by name. */
export interface TechStackJson {
  categories: { category: string; items: TechStackItemJson[] }[];
}

/**
 * The words of `text`, for search: decomposed (NFKD) so a ligature or a full-width letter reads as
 * its plain form, lower-cased, stripped of combining marks and invisible format characters (so
 * `é` is `e` and a zero-width space is no break), then split on every run of characters that is
 * neither a letter nor a digit, so `Node.js` is `node` and `js` and `event-driven` is two words.
 */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The words `search_case_studies` matches against: the title, the tags, the highlight (category,
 * status, metric label and rendered figure) and the tech stack (categories and items).
 */
function searchableWords(entry: CaseStudyJson): string[] {
  const { title, tags, highlight, techStack } = entry;
  return [
    title,
    ...tags,
    highlight.category,
    highlight.status,
    highlight.metric.label,
    highlight.metric.formatted,
    ...techStack.flatMap((group) => [group.category, ...group.items]),
  ].flatMap(words);
}

/**
 * The studies in which every word of `query` begins a word of the searchable text, compared as
 * `words()` folds them, in the data module's order and each as the JSON representation serves it.
 * A query word matches from the start of a word only, so `postgres` finds `PostgreSQL` but
 * `script` does not find `TypeScript`, nor `go` a word that merely contains it.
 */
export function searchCaseStudies(query: string): CaseStudyJson[] {
  const wanted = words(query);
  if (wanted.length === 0) return [];
  return caseStudiesToJson().filter((entry) => {
    const text = searchableWords(entry);
    return wanted.every((word) => text.some((candidate) => candidate.startsWith(word)));
  });
}

/**
 * Every tech-stack category across the studies, in order of first appearance, each with its items
 * in order of first appearance and, for each item, the slugs of the studies that list it there.
 */
export function techStack(): TechStackJson {
  const categories = new Map<string, Map<string, string[]>>();
  for (const entry of caseStudiesToJson()) {
    for (const group of entry.techStack) {
      let items = categories.get(group.category);
      if (!items) {
        items = new Map();
        categories.set(group.category, items);
      }
      for (const name of group.items) {
        const slugs = items.get(name) ?? [];
        if (!slugs.includes(entry.slug)) slugs.push(entry.slug);
        items.set(name, slugs);
      }
    }
  }
  return {
    categories: [...categories].map(([category, items]) => ({
      category,
      items: [...items].map(([name, slugs]) => ({ name, slugs })),
    })),
  };
}

/**
 * A payload as a tool result: structured, for clients that read `structuredContent`, and repeated as
 * JSON text, for those that read only `content`.
 */
function structured(payload: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
}

/** Registers the three read-only tools on `server`. */
export function registerTools(server: McpServer): void {
  server.registerTool(
    'search_case_studies',
    {
      title: 'Search case studies',
      description:
        "Find Milos Cvetkovic's case studies whose title, tags, headline metric or tech stack " +
        'have a word starting with each word of the query, ignoring case and accents. Returns ' +
        'each match in full, as /case-studies.json serves it.',
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .max(MAX_QUERY_LENGTH)
          .describe('Words to look for, such as a technology ("Azure") or a title.'),
      }),
      annotations: { title: 'Search case studies', ...READ_ONLY },
    },
    ({ query }) => structured({ query, caseStudies: searchCaseStudies(query) }),
  );

  server.registerTool(
    'get_case_study',
    {
      title: 'Get a case study',
      description:
        'One case study in full, by its slug: the challenge, approach, contributions, impact, ' +
        'lessons, tech stack and headline metric its page states, with the absolute URLs of the ' +
        'page and of its Markdown version.',
      inputSchema: z.object({
        slug: z
          .enum(SLUGS)
          .describe('The case study, as the last segment of its /work/<slug> URL.'),
      }),
      annotations: { title: 'Get a case study', ...READ_ONLY },
    },
    ({ slug }) => {
      // The enum has already refused any other slug, with an error result that lists the slugs.
      const study = getCaseStudy(slug);
      if (!study) throw new Error(`get_case_study: no case study has the slug "${slug}"`);
      return structured(caseStudyToJson(study));
    },
  );

  server.registerTool(
    'get_tech_stack',
    {
      title: 'Get the tech stack',
      description:
        'Every technology the case studies name, grouped by category, with the slugs of the ' +
        'case studies that used each one.',
      annotations: { title: 'Get the tech stack', ...READ_ONLY },
    },
    () => structured({ ...techStack() }),
  );
}

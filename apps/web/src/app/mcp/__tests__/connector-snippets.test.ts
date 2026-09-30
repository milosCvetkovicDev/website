/**
 * @vitest-environment node
 *
 * The copy-paste connector snippets (#62 AC 9): the Claude Code command, the Cursor `mcp.json` entry
 * and the VS Code `mcp.json` entry that `/contact` and the README publish. Nothing discovers an MCP
 * server by itself, so these snippets are how anyone attaches one, and each has to work unedited.
 *
 * Three things are pinned. Every snippet is rendered from `MCP_SERVER_URL`, the one constant
 * `data/mcp-server.ts` builds from the site origin, so a changed origin reaches all three and no
 * snippet can name another endpoint. Each snippet has the shape its client documents (checked
 * 2026-09-30 against code.claude.com/docs/en/mcp, cursor.com/docs/context/mcp and
 * code.visualstudio.com/docs/copilot/reference/mcp-configuration). And the README's block, between
 * its two markers, is exactly what the module renders, read from disk, so the published copy cannot
 * drift from the endpoint.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const README = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../README.md');

const PRODUCTION = 'https://miloscvetkovic.dev/mcp';

/** The snippet module as a build with this `NEXT_PUBLIC_SITE_URL` would evaluate it. */
async function snippetsFor(siteUrl: string) {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl);
  vi.resetModules();
  return import('@/data/mcp-server');
}

/** Every absolute URL in a snippet, without the JSON string's closing quote. */
const urlsIn = (code: string) => [...code.matchAll(/https?:\/\/[^\s"']+/g)].map(([url]) => url);

// The README's generated block sits between these two lines; everything else there is prose.
const START = '<!-- connector-snippets:start -->';
const END = '<!-- connector-snippets:end -->';

/**
 * The README block the snippets render to: each client's caption, then its snippet in a fence.
 * Built here rather than in `src`, because `lib/serialise.ts` is the one module there that writes
 * Markdown and the README is not something the site serves.
 */
function readmeBlock(
  snippets: readonly { client: string; files: readonly string[]; language: string; code: string }[],
): string {
  return snippets
    .map(({ client, files, language, code }) => {
      const where = files.length ? `, in ${files.map((file) => `\`${file}\``).join(' or ')}` : '';
      return `${client}${where}:\n\n\`\`\`${language}\n${code}\n\`\`\``;
    })
    .join('\n\n');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the connector snippets', () => {
  it('build the endpoint from the site origin and the one path', async () => {
    const { MCP_PATH, MCP_SERVER_URL } = await snippetsFor('');
    expect(MCP_PATH).toBe('/mcp');
    expect(MCP_SERVER_URL).toBe(PRODUCTION);
  });

  it('render all three clients, each naming the endpoint once and no other URL', async () => {
    const { MCP_SERVER_URL, connectorSnippets } = await snippetsFor('');
    expect(connectorSnippets.map(({ client }) => client)).toEqual([
      'Claude Code',
      'Cursor',
      'VS Code',
    ]);
    for (const { client, code } of connectorSnippets) {
      expect(urlsIn(code), client).toEqual([MCP_SERVER_URL]);
    }
  });

  it('follow a changed origin into every snippet, so all three read the one constant', async () => {
    const { MCP_SERVER_URL, connectorSnippets } = await snippetsFor('https://staging.example.dev/');
    expect(MCP_SERVER_URL).toBe('https://staging.example.dev/mcp');
    for (const { client, code } of connectorSnippets) {
      expect(urlsIn(code), client).toEqual(['https://staging.example.dev/mcp']);
      expect(code, client).not.toContain('miloscvetkovic.dev');
    }
  });

  it('take the shape each client documents', async () => {
    const { MCP_SERVER_URL: url, connectorSnippets } = await snippetsFor('');
    const [claude, cursor, vscode] = connectorSnippets;

    expect(claude.language).toBe('bash');
    expect(claude.files).toEqual([]);
    expect(claude.code).toBe(`claude mcp add --transport http portfolio ${url}`);

    // Cursor tells a remote server from a local one by its `url`, and takes no `type` for it.
    expect(cursor.language).toBe('json');
    expect(cursor.files).toEqual(['.cursor/mcp.json', '~/.cursor/mcp.json']);
    expect(JSON.parse(cursor.code)).toEqual({ mcpServers: { portfolio: { url } } });

    // VS Code keys its servers by `servers` and names the streamable HTTP transport `http`.
    expect(vscode.language).toBe('json');
    expect(vscode.files).toEqual(['.vscode/mcp.json']);
    expect(JSON.parse(vscode.code)).toEqual({ servers: { portfolio: { type: 'http', url } } });
  });

  it('appear in the README exactly as the module renders them for production', async () => {
    const { connectorSnippets } = await snippetsFor('');
    const readme = readFileSync(README, 'utf8');

    expect(readme.split(START), 'the README should hold one start marker').toHaveLength(2);
    expect(readme.split(END), 'the README should hold one end marker').toHaveLength(2);
    const headings = readme.slice(0, readme.indexOf(START)).match(/^#{1,6} .*$/gm) ?? [];
    expect(headings.at(-1), 'the block sits under its own heading').toBe('## Connect an agent');
    const block = readme.slice(readme.indexOf(START) + START.length, readme.indexOf(END)).trim();

    expect(block).toBe(readmeBlock(connectorSnippets));
  });
});

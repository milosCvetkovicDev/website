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
import { contactCopy } from '@/data/pages/contact';
import { MCP } from '../../../../e2e/endpoints';

const README = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../README.md');

const PRODUCTION = 'https://miloscvetkovic.dev/mcp';

/**
 * The snippet module as a build with this `NEXT_PUBLIC_SITE_URL` would evaluate it: `undefined` is
 * the variable unset, as in production, and `''` is it set but blank.
 */
async function snippetsFor(siteUrl: string | undefined) {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl);
  vi.resetModules();
  return import('@/data/mcp-server');
}

/** Every absolute URL in a snippet, without the JSON string's closing quote. */
const urlsIn = (code: string) => [...code.matchAll(/https?:\/\/[^\s"']+/g)].map(([url]) => url);

// The README's generated block sits between these two lines; everything else there is prose.
const START = '<!-- connector-snippets:start -->';
const END = '<!-- connector-snippets:end -->';

/** A bare origin and the path: nothing a shell would split, expand or glob. */
const SHELL_SAFE_URL = /^https?:\/\/[A-Za-z0-9.:-]+\/mcp$/;

/**
 * The README block the snippets render to: the paste line from `/contact`, then each client's
 * caption and its snippet in a fence.
 * Built here rather than in `src`, because `lib/serialise.ts` is the one module there that writes
 * Markdown and the README is not something the site serves.
 */
function readmeBlock(
  snippets: readonly { client: string; files: readonly string[]; language: string; code: string }[],
  runInTerminal: string,
): string {
  const captioned = snippets.map(({ client, files, language, code }) => {
    const where = files.length
      ? `in ${files.map((file) => `\`${file}\``).join(' or ')}`
      : runInTerminal;
    return `${client}, ${where}:\n\n\`\`\`${language}\n${code}\n\`\`\``;
  });
  return [contactCopy.agents.paste, ...captioned].join('\n\n');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the connector snippets', () => {
  it.each([
    ['unset', undefined],
    ['blank', ''],
  ])('build the production endpoint when NEXT_PUBLIC_SITE_URL is %s', async (_, siteUrl) => {
    const { MCP_PATH, MCP_SERVER_URL } = await snippetsFor(siteUrl);
    expect(MCP_PATH).toBe('/mcp');
    expect(MCP_SERVER_URL).toBe(PRODUCTION);
    expect(MCP_SERVER_URL).toMatch(SHELL_SAFE_URL);
  });

  // `e2e/endpoints.ts` is the manifest of machine-readable paths, and `machine-readable.spec.ts`
  // holds an expected failure on POST to its `MCP` until a route answers there. The published path
  // is that path, so the snippets cannot name an endpoint the suite does not probe.
  it('publish the path the e2e endpoint manifest probes', async () => {
    const { MCP_PATH } = await snippetsFor(undefined);
    expect(MCP_PATH).toBe(MCP);
  });

  it('render all three clients, each naming the endpoint once and no other URL', async () => {
    const { MCP_SERVER_URL, connectorSnippets } = await snippetsFor(undefined);
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
    expect(MCP_SERVER_URL).toMatch(SHELL_SAFE_URL);
    for (const { client, code } of connectorSnippets) {
      expect(urlsIn(code), client).toEqual(['https://staging.example.dev/mcp']);
      expect(code, client).not.toContain('miloscvetkovic.dev');
    }
  });

  it('take the shape each client documents', async () => {
    const { MCP_SERVER_URL: url, connectorSnippets } = await snippetsFor(undefined);
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
    const { RUN_IN_TERMINAL, connectorSnippets } = await snippetsFor(undefined);
    // A checkout that converts line endings still holds the same block.
    const readme = readFileSync(README, 'utf8').replace(/\r\n/g, '\n');

    expect(readme.split(START), 'the README should hold one start marker').toHaveLength(2);
    expect(readme.split(END), 'the README should hold one end marker').toHaveLength(2);
    expect(readme.indexOf(START), 'the start marker comes first').toBeLessThan(readme.indexOf(END));
    // A `#` line inside a fence above the block is code, not a heading.
    const before = readme.slice(0, readme.indexOf(START)).replace(/^```[\s\S]*?^```/gm, '');
    const headings = before.match(/^#{1,6} .*$/gm) ?? [];
    expect(headings.at(-1), 'the block sits under its own heading').toBe('## Connect an agent');
    const block = readme.slice(readme.indexOf(START) + START.length, readme.indexOf(END)).trim();

    expect(block).toBe(readmeBlock(connectorSnippets, RUN_IN_TERMINAL));
  });
});

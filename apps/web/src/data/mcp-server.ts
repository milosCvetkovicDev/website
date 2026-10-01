/**
 * Where the site's read-only MCP server answers (#62), and the copy-paste snippets that attach a
 * client to it. Nothing discovers a remote MCP server by itself, so a person pasting one of these
 * into a config file is the whole way in, and each has to work unedited.
 *
 * Every snippet is rendered from `MCP_SERVER_URL`, which is `MCP_PATH` on the origin
 * `absoluteUrl()` in `lib/serialise.ts` reads (`NEXT_PUBLIC_SITE_URL`, else production), so there
 * is one endpoint and one origin in the repository. A preview build without the variable therefore
 * advertises the production server, as its sitemap and canonical URLs name production, and that
 * helper refuses anything but a bare http(s) origin, so the URL needs no shell quoting in the
 * Claude Code command. `MCP_PATH` is also the path `e2e/endpoints.ts` probes, whose expected
 * failure in `machine-readable.spec.ts` stands until a route answers there. `/contact` renders the
 * snippets, and the README carries them between two markers;
 * `app/mcp/__tests__/connector-snippets.test.ts` fails when that copy differs from what this module
 * renders for production. Change a snippet here, then paste the test's expected block into the
 * README.
 *
 * Each shape follows its client's own documentation, checked on 2026-09-30: `claude mcp add
 * --transport http <name> <url>` (code.claude.com/docs/en/mcp), a `mcpServers` entry holding only a
 * `url` (cursor.com/docs/context/mcp), and a `servers` entry of `type: "http"`, VS Code's name for
 * the streamable HTTP transport (code.visualstudio.com/docs/copilot/reference/mcp-configuration).
 */
import { absoluteUrl } from '@/lib/serialise';

/** The server's path on this site. */
export const MCP_PATH = '/mcp';

/** The name each client lists the server under. */
const SERVER_NAME = 'portfolio';

/** The server's absolute URL: the one value every snippet is rendered from. */
export const MCP_SERVER_URL = absoluteUrl(MCP_PATH);

/** Where a snippet with no config file goes: the Claude Code command's caption. */
export const RUN_IN_TERMINAL = 'run in a terminal';

export interface ConnectorSnippet {
  /** The client the snippet is for, as its caption names it. */
  readonly client: 'Claude Code' | 'Cursor' | 'VS Code';
  /** The config files the snippet goes into, or none for a command run in a terminal. */
  readonly files: readonly string[];
  /** What the snippet is written in: the fence's info string in the README. */
  readonly language: 'bash' | 'json';
  readonly code: string;
}

/** A config file's contents, as its client's documentation formats it. */
const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The three snippets, each naming `url` once. */
function renderConnectorSnippets(url: string): readonly ConnectorSnippet[] {
  return [
    {
      client: 'Claude Code',
      files: [],
      language: 'bash',
      code: `claude mcp add --transport http ${SERVER_NAME} ${url}`,
    },
    {
      client: 'Cursor',
      files: ['.cursor/mcp.json', '~/.cursor/mcp.json'],
      language: 'json',
      code: json({ mcpServers: { [SERVER_NAME]: { url } } }),
    },
    {
      client: 'VS Code',
      files: ['.vscode/mcp.json'],
      language: 'json',
      code: json({ servers: { [SERVER_NAME]: { type: 'http', url } } }),
    },
  ];
}

export const connectorSnippets = renderConnectorSnippets(MCP_SERVER_URL);

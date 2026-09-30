# 0029. A read-only, unauthenticated MCP server at /mcp is the site's one server function

## Status

Proposed

## Date

2026-09-30

## Context

[ADR 0017](0017-ai-discoverability-policy.md) lists a read-only MCP server at `/mcp` (#62) among
the measures of the AI-discoverability work, and gives demonstration as its reason. Until now
nothing on this site ran per request. [ADR 0005](0005-hosting-on-vercel.md) was accepted when the
only route handlers were the ones Next generates, and since #55 the build-output gate,
`pnpm check:build-output`, has failed any route that needs a server function, against an allowlist
that was empty. An MCP endpoint cannot be prerendered: every call is a `POST` whose answer depends
on the body.

The Model Context Protocol's revision 2026-07-28 (the changelog and the Streamable HTTP transport,
read on 2026-09-30) makes such a server small:

- It is stateless. The `initialize` handshake and protocol-level sessions are gone, and with them
  the `Mcp-Session-Id` header, so a server needs no session store. Every request carries its
  protocol version, client capabilities and client identity in `params._meta`, and the new
  `server/discover` method, which every server must implement, states the versions, capabilities
  and identity a server supports.
- Streamable HTTP is one endpoint that accepts `POST`. The GET stream was removed, the older
  HTTP+SSE transport is Deprecated, and a server that supports only this revision should answer a
  GET with 405. Each POST mirrors the version, the method and, for `tools/call`, the tool name into
  the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, and a header that disagrees with
  the body is a 400 with the JSON-RPC error `-32020`.
- List results must carry `ttlMs` and `cacheScope`, since they no longer vary per connection.

The transport's security section says servers "MUST validate the `Origin` header on all incoming
connections", answering a present and invalid one with 403, and "SHOULD implement proper
authentication for all connections". The authorization section says "Authorization is
**OPTIONAL** for MCP implementations."

The audience is small, and this record says so. Nothing discovers an MCP server on its own. When
#62 was written, on 2026-09-12, server cards (SEP-2127) were an open pull request, the IETF draft
for an `mcp://` scheme and a `/.well-known/mcp-server` path had no standing in the IETF process,
the official registry said it is not meant to be read by host applications directly, and
Anthropic's Connectors Directory accepted submissions only from Team or Enterprise organisations,
which the owner does not have. In practice a person pastes the URL into a client's configuration:
Claude Code, a Claude custom connector in "No sign-in" mode, Cursor or VS Code. The data the server
answers with is already public, in the pages, their Markdown versions and `/case-studies.json`
(#60). The case for building it is that it demonstrates the owner's engineering: a correct, tested,
stateless server on the owner's own domain.

## Decision

`/mcp` serves a read-only MCP server on protocol revision 2026-07-28, over streamable HTTP only,
without authentication, and it is the one route on this site that runs per request.

- **The route.** `apps/web/src/app/mcp/route.ts` exports `POST` and nothing else, so Next answers
  every other method with 405. It is a fixed folder with no catch-all segment, so `/sse` and
  `/message` are 404s from the router. It is built on `mcp-handler` 2,
  `@modelcontextprotocol/server` 2 and `zod` 4, the first runtime dependencies of `apps/web` that
  run on the server. The SDK answers `server/discover`, validates the headers against the body and
  maps a failing tool to an error result; `mcp-handler` builds a server for each request and
  discards it, and logs nothing unless asked to. Its WebMCP bridge is not enabled.
- **Stateless.** No session is read, minted or stored, and there is no Redis. A client of an
  earlier revision (an `initialize` without the 2026-07-28 envelope) is answered by the SDK's
  stateless fallback, which mints no session either.
- **Read-only.** Three tools, in `apps/web/src/app/mcp/tools.ts`: `search_case_studies({ query })`
  over the titles, tags, highlights and tech stacks, where each query word must begin a word there
  (so `go` does not match a word that merely contains it), ignoring case and accents;
  `get_case_study({ slug })`, which answers an unknown slug with an error result naming the known
  ones; and `get_tech_stack()`, every
  tech-stack category with the slugs each item appears in. Each has a title and the annotations
  `readOnlyHint: true` and `destructiveHint: false`. Their payloads are `caseStudyToJson()` and
  `caseStudiesToJson()`, the serialiser `/case-studies.json` uses, so no fact is written twice.
  There is no write tool, no resource and no prompt. The tool list is fixed at build time, so the
  server advertises `listChanged: false` and refuses `subscriptions/listen`. `tools/list` and
  `server/discover` carry `ttlMs` of one hour and `cacheScope: 'public'`.
- **Unauthenticated, knowingly.** The server does not follow the transport's "SHOULD implement
  proper authentication". Everything it returns is already served statically to anyone, nothing it
  does changes state, and authorization is optional in the specification, so authentication would
  protect nothing and would shut out the clients that attach a no-sign-in server. There is no OAuth,
  no `withMcpAuth` and no `/.well-known/oauth-protected-resource`.
- **Origin.** An absent `Origin` passes, since a CLI or a server-side client sends none. So does the
  site's canonical origin (`NEXT_PUBLIC_SITE_URL`, falling back to `https://miloscvetkovic.dev`).
  The origin the request itself was addressed to passes only where its host name cannot be an
  attacker's: on Vercel (`VERCEL=1`), which routes a request to this deployment only through the
  project's own domains, and elsewhere only for a loopback name (`localhost`, `127.0.0.1`,
  `[::1]`). The request's URL is built from its `Host` header, and after a DNS rebinding a browser
  sends the attacker's host name as both `Host` and `Origin`, so accepting the request's own origin
  everywhere would accept exactly the requests the check exists to refuse. Any other value, `null`
  included, gets 403 with `Cache-Control: no-store` and a JSON-RPC error in the
  implementation-defined range (`-32000`) before the SDK reads the body. Whole origins are compared,
  scheme, host and port, rather than host names. No `Access-Control-Allow-Origin` header is sent,
  and a refusal writes nothing to the server's output. Off Vercel, behind a proxy that rewrites
  `Host`, a same-origin page on a public name other than the canonical one is refused.
- **The gate.** `ALLOWED_FUNCTIONS` in `scripts/check-build-output.mjs` is exactly `['/mcp']`. A
  second function fails the build, and so does a page route that became one or a `/mcp` that went
  missing or static.
- **Out of the page surfaces.** `/mcp` is not in the sitemap, `robots.txt`, any `alternates` block
  or `apps/web/e2e/routes.ts`, whose walks GET every route.

### Deliberately not built, as of 2026-09-30

- An MCP Apps widget (`io.modelcontextprotocol/ui`): the owner's decision on 2026-09-12. It would be
  a second rendering surface that the console and axe gates cannot see, for the same small audience.
- WebMCP (`document.modelContext`): refused by ADR 0017, and still gated by
  `scripts/ai-refusals.test.mjs`.
- `/.well-known/mcp.json`, `/.well-known/mcp/server-cards.json`, `/.well-known/mcp-server` and a
  `_mcp` DNS record: nothing reads any of them. The shipped in-protocol discovery is
  `server/discover`, which presupposes the URL.
- OAuth and its metadata endpoints: see the deviation above.
- `/sse`, `/message`, `Mcp-Session-Id` handling and any session store: the HTTP+SSE transport is
  Deprecated and sessions were removed from the revision.
- A write tool, such as a contact form over MCP: an unauthenticated endpoint has no audit trail, so
  it would be a spam channel.
- `listChanged` and `subscriptions/listen`: the tool list changes only with a deployment, and a
  cacheable list is what the revision asks for.
- A submission to Anthropic's Connectors Directory or OpenAI's app directory, and publication to the
  official MCP Registry: the first needs an organisation plan, the second an identity verification
  and a domain proof, and the third is in preview. Publishing to the registry stays an optional
  owner follow-up.
- A `portfolio` entry in this repository's `.mcp.json`, which would prompt every collaborator's
  session to approve it: an owner decision, not taken here.
- A `vercel.json` or a `maxDuration`: on the Hobby plan the default duration is also the maximum.

## Consequences

- The build is no longer function-free. Every call to `/mcp` is a function invocation on Vercel's
  Hobby plan, from anyone, since the endpoint is public and unauthenticated. Its answers come from
  data compiled into the function, with no I/O. Whether the plan's invocation allowance and its
  non-commercial clause suit this site, whether to add a Firewall rate-limit rule on `/mcp`, and
  checking that no bot challenge matches it (a JavaScript challenge breaks every MCP client) are
  dashboard decisions for the owner, outside this repository.
- `apps/web` carries three more runtime dependencies, which Dependabot updates like the others. They
  added no build script, so `allowBuilds` is unchanged.
- A change to a case study reaches the tools with no second edit.
  `apps/web/src/app/mcp/__tests__/tools.test.ts` calls the route and deep-equals every payload
  against the serialiser, and `apps/web/e2e/mcp.spec.ts` checks the served route against the
  revision's rules.
- The e2e job now calls a function, and its server log gate fails on any line the function writes,
  so the refusals must stay silent.
- The wire format belongs to the SDK, which implements `server/discover`, the header validation and
  the error codes. A later revision of the protocol arrives as an SDK update, and the e2e spec says
  whether the served route still speaks 2026-07-28.
- The tool descriptions are drafts for the owner to rewrite: they are what a client's model reads.
- To reverse this, delete the route and its dependencies, empty `ALLOWED_FUNCTIONS`, and supersede
  this record.

## Alternatives considered

- **`/api/mcp`.** `robots.txt` disallows `/api/`, and the machine-readable endpoints of #60 stay
  outside it on purpose. MCP clients ignore `robots.txt`, so it would work, but `/mcp` is the path
  client documentation expects.
- **Vercel's documented sample.** Its code is shaped for version 1 of the handler: a `basePath`,
  and the same handler exported as `GET`, `POST` and `DELETE`. It would ship a 2025-era server with
  a session header and a GET stream.
- **A catch-all `[transport]` segment.** It would hand every path under it to the handler, so the
  set of served paths would be the handler's to decide rather than the router's.
- **The SDK's own Origin helper, `originValidationResponse`.** It compares host names only, so the
  canonical host over plain HTTP or on another port would pass.
- **OAuth.** It would add an authorization server in front of data that is already public, and the
  no-sign-in connectors could not attach.
- **No server at all.** `/case-studies.json` already serves the same data. The server adds the calls
  an agent can make once a person has attached it, and it is the demonstration ADR 0017 names as
  the reason.

This record may be amended only as [ADR 0012](0012-correcting-accepted-records.md) allows.

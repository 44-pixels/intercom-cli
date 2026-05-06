# intercom-mcp

A Model Context Protocol (MCP) server that exposes the Intercom REST API as
tools. Built on the official [`@modelcontextprotocol/sdk`][sdk] using the
**Streamable HTTP** transport, designed to sit behind an MCP gateway
(Gatana, Cloudflare AI Gateway, etc.) that brokers OAuth on the user's
behalf.

[sdk]: https://github.com/modelcontextprotocol/typescript-sdk

## Authorization model

This server is a pure **OAuth 2.1 resource server** — it does **not** run an
OAuth flow itself. Instead it advertises the upstream authorization server
(by default `https://app.intercom.com/oauth`) via [RFC 9728 Protected
Resource Metadata][rfc9728] and expects every MCP request to carry an
Intercom access token in `Authorization: Bearer …`. The gateway is
responsible for the user-facing OAuth dance, refresh-token handling, and
token forwarding.

[rfc9728]: https://datatracker.ietf.org/doc/html/rfc9728

```
┌────────┐  user-facing OAuth   ┌─────────┐   bearer token    ┌──────────┐
│ Client │  ───────────────►    │ Gateway │  ───────────────► │ MCP (us) │ ─► Intercom API
└────────┘                      └─────────┘                   └──────────┘
                  ▲                                ▲
                  │      Protected Resource        │
                  └─── Metadata discovery ─────────┘
```

### Discovery

| URL                                                     | Purpose                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /mcp`                                             | MCP Streamable HTTP transport (stateless mode).            |
| `GET  /.well-known/oauth-protected-resource`            | RFC 9728 Protected Resource Metadata.                      |
| `GET  /.well-known/oauth-protected-resource/mcp`        | Same metadata, served at the path-bound URL per RFC 9728.  |
| `GET  /`                                                | Public health/info JSON.                                   |

A request to `/mcp` without a valid Bearer token returns:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_request",
                  error_description="No access token was provided in this request",
                  resource_metadata="https://your-host/.well-known/oauth-protected-resource/mcp"
```

The PRM JSON looks like:

```json
{
  "resource": "https://your-host/mcp",
  "authorization_servers": ["https://app.intercom.com/oauth"],
  "scopes_supported": ["read", "write", "read_conversations", "..."],
  "bearer_methods_supported": ["header"],
  "resource_name": "Intercom MCP Server"
}
```

This matches the shape served by reference implementations like the
[GitHub Copilot MCP server][copilot-prm].

[copilot-prm]: https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp

## Quick start

### Run from GitHub via `npx`

```bash
npx -y github:<your-user>/<this-repo>
```

This is enough for most deployments — the server boots, exposes
`/.well-known/oauth-protected-resource`, and listens for authenticated MCP
requests on `/mcp`. No secrets in the process environment.

### Plug it into a gateway

Point the gateway at:

- **MCP endpoint**: `https://<host>/mcp`
- **Authorization server**: whatever the PRM advertises (default
  `https://app.intercom.com/oauth`)

The gateway performs the OAuth flow with Intercom (or with itself, on
behalf of Intercom) and forwards the access token to `/mcp` as a Bearer
header on every request.

## Configuration

All configuration is via environment variables. **None are required** for a
standard Intercom-backed deployment.

| Variable                       | Default                                          | Notes                                                                            |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `PORT`                         | `3000`                                           | HTTP port.                                                                       |
| `PUBLIC_URL`                   | `http://localhost:${PORT}`                       | Used to derive `resourceUrl` and the PRM URL when not overridden.                |
| `MCP_RESOURCE_URL`             | `${PUBLIC_URL}/mcp`                              | Canonical RFC 8707 resource identifier; advertised in PRM and validated by AS.   |
| `MCP_RESOURCE_NAME`            | `Intercom MCP Server`                            | Human-readable name advertised in PRM.                                           |
| `MCP_AUTHORIZATION_SERVERS`    | `https://app.intercom.com/oauth`                 | Comma-separated AS URLs. Override when fronting with a gateway-issued AS.        |
| `MCP_SCOPES_SUPPORTED`         | a sensible Intercom default set                  | Comma-separated OAuth scopes.                                                    |
| `INTERCOM_REGION`              | `us`                                             | One of `us`, `eu`, `au`. Selects `api.intercom.io` / `.eu.` / `.au.`.            |
| `INTERCOM_API_VERSION`         | `2.13`                                           | Sent as the `Intercom-Version` header on every upstream call.                    |

### Pointing at a gateway-issued AS

If your gateway (e.g. Gatana) issues its own OAuth tokens that map to
Intercom internally:

```bash
MCP_AUTHORIZATION_SERVERS=https://gatana.example.com/oauth \
PUBLIC_URL=https://intercom.mcp.example.com \
  npx -y github:<your-user>/<this-repo>
```

## Tools

The server registers 27 tools, all prefixed with `intercom_`. Highlights:

- **Identity** — `intercom_me`
- **Admins** — `intercom_list_admins`, `intercom_get_admin`
- **Contacts** — `list`, `get`, `search`, `create`, `update`, `delete`,
  `archive`, `add_note`, `tag`
- **Conversations** — `list`, `get`, `search`, `create`, `reply`, `assign`, `close`
- **Companies** — `list`, `get`, `create_or_update`
- **Articles** — `list`, `get`
- **Tags** — `list_tags`
- **Outbound** — `intercom_send_message`
- **Escape hatch** — `intercom_request` (raw method/path/query/body)

Use `intercom_request` for any endpoint that does not have a dedicated
wrapper (segments, data attributes, ticket types, etc.).

## Development

```bash
npm install
npm run build      # tsc → dist/
npm run dev        # tsx src/index.ts
npm start          # node dist/index.js
```

The build emits a CLI entry at `dist/index.js` with a `#!/usr/bin/env node`
shebang and a `bin` mapping in `package.json`, so `npx intercom-mcp`
launches the server.

## Notes on transport choice

This server uses the SDK's **stateless Streamable HTTP** transport
(`sessionIdGenerator: undefined`). Each POST to `/mcp` is fully
independent: the server reads the Bearer token, builds an `IntercomClient`
bound to that token, registers tools, and tears everything down when the
response closes. This makes the server safe to run behind any HTTP load
balancer and trivial to deploy serverless.

## License

MIT

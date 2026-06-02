# Authenticating to a Deployed MCP Server

A deployed Neo.mjs MCP server (Knowledge Base or Memory Core) supports two authorization modes for its SSE / HTTP transport. This guide covers the **GitLab Personal Access Token (PAT)** mode — the path for real users *and* headless agents that authenticate with a long-lived token from an environment variable, with no cookie and no interactive OAuth dance.

> For the OIDC / OAuth 2.1 (Keycloak, Google, browser) mode, see [MCP Server Authorization](../tooling/Authorization.md). OIDC remains the production default; PAT mode is opt-in via `NEO_AUTH_MODE`.

## When to use PAT mode

- **Headless agents** (CI, cron, frontier-model harnesses) that cannot complete a browser OAuth flow.
- **Real users** who want a stable, scriptable credential (curl, `mcp-remote`, Claude Code) rather than a session cookie.
- Deployments whose identity provider is a **GitLab instance** (gitlab.com or self-managed).

## The auth model

```
client → Authorization: Bearer <GitLab PAT> → MCP server
                                                  │
                                                  ├─ GET {gitlabApiBaseUrl}/api/v4/user   (validate)
                                                  │     200 → identity (username) → request authorized
                                                  └─ 401/403 → bare 401 (WWW-Authenticate: Bearer, no OAuth metadata)
```

- The bearer token is a GitLab PAT with the **`read_user`** scope — nothing more is required.
- The server validates it against the GitLab API's `/api/v4/user`. The returned `username` becomes the tenant identity (tagging Memory Core writes / filtering reads per user).
- **No `aud` claim, no token introspection, no OAuth Protected-Resource-Metadata.** An unauthenticated request receives a *bare* `401` (`WWW-Authenticate: Bearer`) — deliberately *without* a `resource_metadata` pointer, so OAuth-aware clients do not attempt Dynamic Client Registration against an identity provider that has none.

## Server configuration

Set these on the MCP server (Knowledge Base and/or Memory Core):

| Env var | Value | Notes |
| :-- | :-- | :-- |
| `NEO_AUTH_MODE` | `gitlab-pat` | Opt in to PAT mode (the default is `oidc`). |
| `NEO_AUTH_GITLAB_API_BASE_URL` | `https://gitlab.com` | Your GitLab base URL — set to your self-managed host for a private instance. |
| `NEO_AUTH_PAT_CACHE_TTL_SECONDS` | `300` | Validation cache TTL (seconds). A revoked PAT stops working within this window. |

> **Existing deployments:** these `auth` leaves live in the tracked `ai/config.template.mjs`. After upgrading, run `npm run prepare -- --migrate-config` so your gitignored `config.mjs` overlay picks them up — the bootstrap warns you when a template leaf is missing. A freshly generated deployment gets them automatically.

## Minting a PAT

1. In GitLab, open **User Settings → Access Tokens**.
2. Create a token with the **`read_user`** scope — that is all the MCP server needs; it only reads your profile to resolve identity.
3. Copy the token value immediately (GitLab will not show it again).

## Where the token lives

Keep the PAT in an environment variable — never hard-code it into a config file or a committed script. For an interactive shell, add it to your shell profile (e.g. `~/.zshenv`):

```bash
export NEO_MCP_TOKEN="<your-gitlab-pat>"
```

For a headless agent, inject it the way your platform injects any secret (env var, secret mount). The only requirement is that the token is present in the process environment when the client starts.

## Client recipes

These assume `NEO_MCP_TOKEN` holds your PAT and the server is reachable at `https://mcp.<your-host>/mc/mcp` (Memory Core) or `https://mcp.<your-host>/kb/mcp` (Knowledge Base).

### mcp-remote (stdio ↔ HTTP bridge — e.g. for Claude Desktop)

```bash
npx -y mcp-remote https://mcp.<your-host>/mc/mcp \
  --header "Authorization: Bearer ${NEO_MCP_TOKEN}"
```

### Claude Code (remote HTTP transport)

```bash
claude mcp add --transport http neo-mc https://mcp.<your-host>/mc/mcp \
  --header "Authorization: Bearer ${NEO_MCP_TOKEN}"
```

### MCP Inspector

> **Pending.** The exact MCP Inspector recipe depends on the supported-version verdict from the Inspector-compatibility investigation (a sibling sub-issue of the cloud-auth epic). It will be filled in here once that lands; until then, the `mcp-remote` and Claude Code recipes above are the supported paths.

## Verify from outside (curl)

You do not need an MCP client to confirm a deployment is reachable and your token works — a single `curl` does it. A successful `initialize` returns `HTTP 200`, an `Mcp-Session-Id` header, and the server's `serverInfo`:

```bash
curl -sS -i -X POST https://mcp.<your-host>/mc/mcp \
  -H "Authorization: Bearer ${NEO_MCP_TOKEN}" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

- **Authorized:** `HTTP/2 200`, an `mcp-session-id` response header, and a body containing `"serverInfo"`.
- **Missing or invalid token:** a bare `HTTP/2 401` with `WWW-Authenticate: Bearer` and **no** `resource_metadata` — confirming PAT mode advertises no OAuth discovery.

> The `Accept: application/json, text/event-stream` header is required — the Streamable-HTTP transport rejects requests that omit it.

## Test profile vs production auth profile

Keep the two distinct:

- **Production auth profile** — `NEO_AUTH_MODE=gitlab-pat` (this guide) or `oidc`: every request carries a validated bearer token and the server resolves a real per-user identity.
- **Bring-up / test profile** — some deployments temporarily front the server with a reverse proxy that injects a static identity header (no per-user token) to verify ingress wiring before real auth is enabled. That is a bring-up convenience, not an auth model; do not run it as production.

## See also

- [MCP Server Authorization](../tooling/Authorization.md) — the OIDC / OAuth 2.1 default mode.
- [Security](Security.md) — the deployment's broader security posture.
- [Day-0 Tutorial](Day0Tutorial.md) — the first-deployment walkthrough.

# Cloud Deployment Troubleshooting

A first real deployment of the Agent OS behind a reverse proxy crosses several layers — the MCP SDK's Host validation, the proxy's `Accept` / auth handling, the identity-header contract, and the MCP handshake itself. Each layer fails with its *own* error, and the fix differs per layer. This guide is the **connect-error ladder**: each error → which layer you just cleared → the fix.

> Complements the [Day-0 Tutorial](Day0Tutorial.md) (the happy path) and [Client Authentication](ClientAuthentication.md) (the PAT login). Reach for this when a connection does not work.

## The connect-error ladder

Work top-to-bottom — each error means you cleared the layer above it.

### `-32000 Invalid Host: <your-host>`

**Layer:** the MCP SDK's DNS-rebinding protection, which defaults to a **localhost-only** Host allowlist. Behind a reverse proxy the public `Host` header reaches the server unchanged and is rejected before any MCP handling — for *every* client, not just browsers.

**Fix (either):**
- Configure the server's Host allowlist to include your public hostname: set `NEO_PUBLIC_URL=https://mcp.<your-host>` (its hostname is auto-allowed) and/or `NEO_MCP_ALLOWED_HOSTS=<comma-separated hostnames>`. (localhost stays allowed — the container healthcheck needs it.)
- Or rewrite the upstream Host to localhost at the proxy (Caddy: `header_up Host localhost` on the `reverse_proxy` block). This is the no-rebuild interim fix; the allowlist config is the durable one.

### `Not Acceptable: Client must accept text/event-stream`

**Layer:** you reached the MCP endpoint — it is a Streamable-HTTP / SSE endpoint, not a web page; the client omitted the required `Accept` header.

**Fix:** send `Accept: application/json, text/event-stream` on every request.

### `HTTP 302 → /oauth2/sign_in`

**Layer:** a reverse-proxy auth gate (e.g. oauth2-proxy) sits in front of the MCP server; your request has no valid session, so it redirects to sign-in.

**Fix:** authenticate past the proxy. For the durable headless path see [Client Authentication](ClientAuthentication.md) (GitLab-PAT Bearer); for first bring-up you can open the test path (see *Test vs production profile*).

### `-32000 Unauthorized: Missing proxy identity header`

**Layer:** you cleared the proxy, and the server is in `trustProxyIdentity` mode — it expects the proxy to inject a validated identity header (e.g. `X-PREFERRED-USERNAME`) and strips any *client-supplied* identity header (anti-spoof). No injected identity → rejected.

**Fix:** have the proxy inject the identity header for authenticated requests (oauth2-proxy forwards the upstream identity; Caddy via `forward_auth` + `header_up`). For a no-auth test path, set `NEO_AUTH_TRUST_PROXY_IDENTITY=false` *and* inject a static identity at the proxy, or run the open test profile.

### `-32000 Bad Request: Server not initialized`

**Layer:** you are authenticated and talking to the MCP server — but called a tool (e.g. `tools/list`) before the MCP **`initialize` handshake**.

**Fix:** do the handshake first — `initialize` → capture the `Mcp-Session-Id` response header → `notifications/initialized` → then tool calls (carrying the session id). See *Verify from outside* below.

### A body of `event: message` / `data: {…}`

**Not an error.** That is the normal Streamable-HTTP / SSE framing — a successful `initialize` returns `event: message` plus a `data:` line carrying the JSON-RPC result (including `serverInfo`).

## Deployment gotchas

### The Caddyfile is baked into the image

A Caddyfile (or any config copied in at image-build time) is **not** picked up by a container restart. After editing it, rebuild:

```bash
docker compose -p <project> up -d --build caddy
```

A plain `restart` re-runs the *old* baked config.

### Container ports are network-internal

In a typical compose deployment only the ingress (Caddy) publishes a host port; the MCP servers listen on the internal compose network. A host-side `curl http://127.0.0.1:<port>` therefore finds nothing — expected, not a failure. Test from *inside* the network instead:

```bash
docker compose -p <project> exec <server> node ./ai/scripts/diagnostics/mcpHealthcheck.mjs --url http://127.0.0.1:<port>
```

…or go through the ingress on the public URL.

### Two auth layers — do not fight the wrong one

A proxied deployment commonly has **two** auth layers, and an error at one is easily mistaken for the other:

1. **The reverse-proxy gate** (e.g. oauth2-proxy cookie / OAuth) — decides whether a request reaches the MCP server at all (error: `302 → sign_in`).
2. **The MCP server's identity** (`trustProxyIdentity` header *or* a Bearer token) — decides *who* the authenticated request is (errors: `Missing proxy identity header`, `401`).

Identify which layer an error came from (via the ladder) before changing any config.

## Test profile vs production auth profile

Verify the wiring *before* real auth is enabled, but keep the two profiles distinct:

- **Test / bring-up profile:** open the Caddy path (no oauth2-proxy gate) and either `NEO_AUTH_TRUST_PROXY_IDENTITY=false` or a static identity injected at the proxy. Proves ingress + handshake without per-user auth. **Not for production.**
- **Production profile:** proxy gate on + a real per-user credential — `trustProxyIdentity` with an injected identity, or `NEO_AUTH_MODE=gitlab-pat` Bearer (see [Client Authentication](ClientAuthentication.md)).

## Verify from outside (the handshake)

Confirm a deployment end-to-end with `curl` — no MCP client needed. MCP `initialize` is a short sequence:

```bash
URL="https://mcp.<your-host>/mc/mcp"
AUTH=(-H "Authorization: Bearer ${NEO_MCP_TOKEN}")   # or your proxy's auth, per profile

# 1. initialize → expect HTTP 200 + an `mcp-session-id` response header + serverInfo
curl -sS -i -X POST "$URL" "${AUTH[@]}" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# 2. read the Mcp-Session-Id header from step 1, then:
SID="<mcp-session-id from step 1>"

# 3. notifications/initialized (carry the session id)
curl -sS -X POST "$URL" "${AUTH[@]}" \
  -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: ${SID}" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

# 4. tool calls now work, e.g. tools/list
curl -sS -X POST "$URL" "${AUTH[@]}" \
  -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: ${SID}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

A healthy server returns `event: message` SSE framing carrying the JSON-RPC results. A `Server not initialized` error means step 1's handshake was skipped.

> There is no auth-free `GET /health` liveness endpoint today — the server exposes only the authenticated `/mcp` route — so external liveness checks run the `initialize` handshake above (or rely on the container's internal healthcheck).

## First query returns nothing — the empty-KB gap

A freshly deployed Knowledge Base is **healthy but empty**: `healthcheck` reports `count: 0` and queries return nothing until an ingest runs. In the cloud-safe profile the continuous ingestion lane is off by design, so the first ingest is a deliberate step — trigger the deployment's ingestion entry point once, then queries return results. A `count: 0` immediately after deploy is expected, not a failure.

## See also

- [Day-0 Tutorial](Day0Tutorial.md) — the first-deployment happy path.
- [Client Authentication](ClientAuthentication.md) — the GitLab-PAT login.
- [Configuration](Configuration.md) · [Security](Security.md)

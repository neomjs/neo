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

### `dependency <svc> failed to start` after enabling `NEO_AUTH_MODE=gitlab-pat`

**Symptom:** after switching a compose deployment to `NEO_AUTH_MODE=gitlab-pat`,
`docker compose up` leaves `kb-server` or `mc-server` unhealthy, and dependent
services report `dependency <svc> failed to start`.

**Confirm it is the bearer healthcheck case, not a boot crash:** send a
tokenless `initialize` request through the public ingress. A clean `401` with
`WWW-Authenticate: Bearer` means the MCP server is up and enforcing auth; a
`502`, timeout, or connection-refused result points at a process/proxy boot
failure instead.

**Cause:** the in-container healthcheck runs `mcpHealthcheck.mjs` against the
same authenticated `/mcp` route. In `gitlab-pat` mode that self-probe must also
send a bearer token. If `NEO_MCP_HEALTHCHECK_TOKEN` is unset or empty, the
healthcheck gets `401`, the container never reaches `service_healthy`, and
compose dependency waits abort.

**Fix:** set `NEO_MCP_HEALTHCHECK_TOKEN=<read_user bearer>` in the deployment
`.env` (a GitLab PAT or OAuth access token with the same `read_user` validation
surface as other MCP clients), then recreate the affected services so the
environment is reloaded:

```bash
docker compose -p <project> up -d --force-recreate kb-server mc-server orchestrator
```

This is an environment-only repair; no image rebuild is required.

### `inspect_deployment` says `No Docker container found for compose service ...`

**Layer:** the MCP server is reachable and the deployment-state bridge snapshot
is fresh, but the orchestrator's runtime-access holder cannot resolve one or
more allowlisted Compose services through Docker labels.

Read `snapshot.bridgeDiagnostics` before changing service code:

- `runtimeAccess.enabled: false` means the bridge is intentionally not using a
  runtime handle. Set `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED=true` only when
  B1 runtime diagnostics/recovery are intended.
- `reason: broad-service-lookup-failure` means most or all configured services
  failed at the observation layer. Treat this as bridge configuration first,
  not as four independent service outages.
- `compose-service-no-match` means Docker returned no container for the label
  filter shown in the error details. Align
  `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES` and
  `NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES` with Docker
  `com.docker.compose.service` labels, not container names.
- `compose-service-ambiguous` means more than one container matched a service
  label. Set `NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT=<project>` to the
  Compose project label.
- `docker-socket-unavailable` or `docker-socket-forbidden` means the
  orchestrator cannot read the runtime socket. Mount `/var/run/docker.sock`
  into the orchestrator with suitable permissions, or disable runtime access
  explicitly when that deployment should not expose B1 diagnostics.
- The default diagnostic set observes sibling services, not the orchestrator
  container itself. When orchestrator logs/state are needed for a cloud
  incident, add the Compose service label to both
  `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES` and
  `NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES` (for the bundled compose file,
  use `orchestrator`).

The diagnostic intentionally exposes only non-secret config, service keys, and
the label filter shape. It does not enumerate arbitrary containers or expose
Docker, shell, restart, or daemon-control routes through public MCP tools.

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

A freshly deployed Knowledge Base can be **healthy but empty**: `healthcheck` reports `count: 0` and queries return nothing until an ingest writes chunks. Treat that as an ingestion-state question, not a Chroma readiness question.

For push-mode deployments, trigger the deployment's ingestion entry point once, then query again.

For pull-mode deployments with configured `tenantRepos[]`, call `inspect_deployment` or `get_deployment_state_snapshot` and inspect the `tenantRepoSync` section before taking manual action. It distinguishes disabled, true no-configured-repos, not-due, running, completed, failed, and degraded/unreadable state without exposing credentials or raw logs. A degraded config-read error means the graph/YAML/default config resolver could not prove the effective `tenantRepos`; treat that differently from a real empty config. If the task is configured but has not advanced, use the stable reason code and per-repo hashed state there to decide whether to wait for the next due sweep, fix credentials/config, or run `node ./ai/scripts/maintenance/syncTenantRepos.mjs` inside the orchestrator container. When `lastErrorCode` is `KB_TENANT_REPO_SYNC_SYNC_FAILED`, check `lastSourceErrorCode`: `KB_GITMIRROR_CREDENTIAL_REF_INVALID`, `KB_GITMIRROR_CLONE_FAILED`, or `KB_GITMIRROR_FETCH_FAILED` points to the credential/ref/upstream access path before generic ingestion debugging.

If the deployment snapshot is fresh but the tool returns `status: degraded` with
`reason: snapshot-section-missing` or `snapshot-producer-metadata-missing`, fix
the bridge producer before debugging repo credentials or embeddings. Those
reasons mean the public KB/MC server can read the snapshot file, but the
orchestrator bridge that wrote it is older than the current diagnostic contract
or omitted a required top-level section such as `tenantRepoSync`. Recreate the
orchestrator with the current image/config, then re-run the public tool and only
continue pull-mode ingestion debugging once `schemaDiagnostics.status` is
`available`.

## See also

- [Day-0 Tutorial](Day0Tutorial.md) — the first-deployment happy path.
- [Client Authentication](ClientAuthentication.md) — the GitLab-PAT login.
- [Configuration](Configuration.md) · [Security](Security.md)

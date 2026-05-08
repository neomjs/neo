# Deployment Cookbook: Shared Topology Walkthrough

This cookbook is a concrete, ordered, end-to-end deployment guide for standing up the Neo.mjs Knowledge Base (KB) and Memory Core (MC) servers against a shared cloud-hosted Chroma instance, protected by an identity-aware reverse proxy.

For theoretical background, threat models, and architectural reference, see [Shared Deployment MVP](SharedDeployment.md).

## Section 1: Prerequisites & Architecture Picture

Before deploying, ensure you understand the target topology.

### Architecture Topology
1. **Agent Harnesses (Clients):** Local agent runners (e.g., Anthropic Claude Desktop, Gemini) sending MCP JSON-RPC over Server-Sent Events (SSE) or HTTP.
2. **Reverse Proxy:** The public gateway that terminates TLS, enforces OAuth/OIDC authentication, and injects trusted identity headers.
3. **MCP Servers:** The Node.js processes running `knowledge-base` and `memory-core`. These must be configured with a canonical `publicUrl` to support correct SSE advertisement and OAuth callbacks behind the proxy.
4. **Data Layer:** A shared Chroma vector database and isolated SQLite graph databases for each server.

### Identity Flow
External Identity Provider (IdP) → Reverse Proxy (OIDC verify) → Reverse Proxy injects `X-PREFERRED-USERNAME` → MCP Server (Proxy-header-trusted auth).

### Provisioning Obligations
The Neo.mjs repository provides the MCP server applications. The external operator is responsible for provisioning:
- The container runtime (e.g., Docker, Kubernetes).
- The OAuth 2.1 / OIDC provider.
- The reverse proxy.
- The ChromaDB instance.

### Operator Config Bootstrap

The MCP servers boot from per-server `config.mjs` files (gitignored). On first clone, `npm prepare` clones each server's `config.template.mjs` into the matching `config.mjs`. After `git pull` runs that introduce **structural template evolution** — new top-level `import ... from '...'` lines, new named specifiers within existing import blocks, or new `export { ... }` blocks — re-run `npm run prepare` to surface stale-config warnings. The detector covers the import + named-export surface only; value-level changes inside `defaultConfig` (e.g., new env-binding entries, default-value adjustments) are not yet inspected and require operator awareness from release notes / PR descriptions. To refresh a stale gitignored `config.mjs` from the canonical template, run `npm run prepare -- --migrate-config` — idempotent, safe on already-current files. (See [#10815](https://github.com/neomjs/neo/issues/10815) for the drift-detection substrate.)

## Section 2: Container Packaging

When containerizing the MCP servers, you must choose between packaging both servers in one image or building two separate images. 

### Recommended Pattern: Two Images (Sidecar Pattern)
We recommend building two distinct images (or running the same image with different entrypoints).
- **Isolation:** Process crashes in the Knowledge Base do not take down the Memory Core.
- **Resource Limits:** KB is read-heavy; MC is write-heavy. They can be scaled or constrained independently.
- **Shared Chroma:** Both containers connect to a single unified Chroma instance via internal container networking.

*(Note: Reference `Dockerfile` and `docker-compose.yml` artifacts are provided in the [`ai/deploy/`](../../ai/deploy/) directory, shipped under [#10801](https://github.com/neomjs/neo/issues/10801)).*

## Section 3: Reverse Proxy Configuration

The reverse proxy is the security boundary for the shared deployment.

### Routing Strategy
You must map a single public hostname to two distinct upstream services. We recommend **pathname-based routing** to avoid managing multiple TLS certificates:
- `/kb/*` routes to the Knowledge Base MCP server container (e.g., port 3001).
- `/mc/*` routes to the Memory Core MCP server container (e.g., port 3002).

### Header Stripping (Security)
To prevent spoofing attacks, the reverse proxy **MUST** strip any incoming `X-PREFERRED-USERNAME` headers provided by the client before injecting its own trusted value.

See the [Reference Nginx and Caddy Configurations](../../ai/mcp/deploy/proxy/) for concrete examples of how to implement this header stripping securely.

## Section 4: Identity Provider Setup

You must register an OAuth application with your Identity Provider (e.g., Google, Okta, Auth0).

### Client Registration
1. Create a new Web Application client.
2. Store the `clientId` and `clientSecret` securely.
3. Configure the Redirect URIs. If your proxy does not handle the OAuth flow and terminates it at the MCP server, you MUST configure the `NEO_PUBLIC_URL` environment variable so the MCP server can construct correct canonical callbacks.

### Authentication Modes
You must configure the MCP servers to trust the proxy:
- Set `NEO_AUTH_TRUST_PROXY_IDENTITY=true` on both servers.
- The proxy handles the OIDC flow, sets a session cookie, and injects the verified email or username into the `X-PREFERRED-USERNAME` header on all proxied requests.
- See the [Authentication Threat Model](SharedDeployment.md#authentication) for details.

## Section 5: Shared Chroma Topology

Both MCP servers must share a single Chroma instance to enable cross-domain semantic awareness.

1. Ensure the Chroma container/service is accessible to both MCP containers.
2. Set `NEO_CHROMA_UNIFIED=true` on both MCP servers.
3. Configure the Chroma host and port:
   - `NEO_CHROMA_HOST=http://chroma` (or your internal DNS name).
   - `NEO_CHROMA_PORT=8000`.

## Section 6: Environment Variable Inventory

When provisioning your containers, supply the following minimal environment variables:

| Variable | Target | Purpose |
|---|---|---|
| `MCP_HTTP_PORT` | Both | The port the HTTP/SSE server listens on (e.g., `3001` for KB, `3002` for MC). |
| `NEO_CHROMA_UNIFIED` | Both | Set to `true` to enable shared Chroma architecture. |
| `NEO_CHROMA_HOST` | Both | Internal URL of the Chroma instance. |
| `NEO_CHROMA_PORT` | Both | Port of the Chroma instance. |
| `NEO_PUBLIC_URL` | Both | The canonical public URL for this MCP server (e.g., `https://api.example.com/mc`). Required for SSE advertisement and OAuth `redirect_uri` generation behind reverse proxies. |
| `NEO_AUTH_TRUST_PROXY_IDENTITY` | Both | Set to `true` if your reverse proxy handles authentication. |
| `GEMINI_API_KEY` | Both | Required for Gemini integration. |
| `NEO_AUTO_SUMMARIZE` | MC | Set to `true` to enable startup + disconnect-driven session summarization. The lifecycle is now handled by the `bridge-daemon`, which acts as a host-level singleton via a `PID_FILE` lock. The daemon uses an in-process mutex to guarantee single-writer semantics across multiple local harness instances on that host. |
| `NEO_MC_PRIMARY` | MC | *(Deprecated)* Previously used for single-writer enforcement. Replaced by daemon-enforced singleton locks for local multi-harness clusters. Remote multi-user Memory Core deployments instead rely on request-scoped identity context to partition write visibility. |
| `NEO_SUMMARIZATION_SWEEP_INTERVAL_MS` | MC | The interval in milliseconds for the bridge-daemon to poll SQLite for un-summarized sessions (default: `600000` = 10 mins). Set to `0` to disable periodic sweeping. |

*(Notes: Public URL advertising is tracked under [#10802](https://github.com/neomjs/neo/issues/10802). Provider consolidation shipped in [PR #10810](https://github.com/neomjs/neo/pull/10810) — `embeddingProvider` is now the canonical selector. Env-var ergonomics shipped in [#10808](https://github.com/neomjs/neo/issues/10808): `MCP_HTTP_PORT` is the canonical operator-facing env var (`SSE_PORT` remains readable during the deprecation window with a warning); `NEO_CHROMA_HOST` / `NEO_CHROMA_PORT` are now env-overridable on both KB + MC. Session-summary single-writer flag `NEO_MC_PRIMARY` has been deprecated in favor of daemon-owned locks per Piece B/C migration [#10956](https://github.com/neomjs/neo/issues/10956).)*

## Section 7: Healthcheck Verification

Once deployed, verify the stack by invoking each server's MCP `healthcheck` tool over its `/mcp` endpoint. The MCP servers do not expose a direct `/healthcheck` HTTP route; use JSON-RPC `tools/call` with `name: "healthcheck"` against the KB and MC MCP URLs.

Expected JSON block (excerpt):
```json
{
  "status": "healthy",
  "identity": {
    "source": "proxy-header",
    "bound": true,
    "nodeId": "@your-username"
  },
  "database": {
    "topology": {
      "mode": "unified",
      "coordinates": { "host": "http://chroma", "port": 8000 },
      "resolvedVia": "engines.kb.chroma"
    }
  },
  "providers": {
    "embedding": {
      "active": "openAiCompatible",
      "host": "http://127.0.0.1:8000",
      "model": "text-embedding-qwen3-embedding-1.5b",
      "dimensions": 4096
    },
    "summary": {
      "active": "openAiCompatible",
      "host": "http://127.0.0.1:11434",
      "model": "qwen3-8b",
      "endpoint": "http://127.0.0.1:11434/v1/chat/completions",
      "local": true,
      "credential": {
        "env": "NEO_OPENAI_COMPATIBLE_API_KEY",
        "configured": false,
        "required": false
      }
    },
    "auth": {
      "configured": "proxy-header",
      "oidc": {
        "host": null,
        "issuerUrl": null,
        "realm": null,
        "configured": false
      },
      "proxyHeader": {
        "trusted": true,
        "headersChecked": ["x-preferred-username", "x-auth-request-preferred-username"]
      }
    }
  }
}
```
Operator verification anchors:
- `identity.source === "proxy-header"` confirms the reverse proxy is injecting the `X-PREFERRED-USERNAME` header and the MC server is reading it.
- `database.topology.mode === "unified"` confirms shared Chroma topology is active.
- `providers.embedding.active` reflects the configured embedding provider per [#10804](https://github.com/neomjs/neo/issues/10804) consolidation — `'gemini'` (cloud), `'openAiCompatible'` (local Qwen3 / MLX), or `'ollama'`.
- `providers.summary.active` mirrors the same shape for the session-summary provider.
- `providers.auth.configured === "proxy-header"` confirms the deployment is using the trust-proxy-identity path; for OIDC mode it would be `'oidc'` (with the `oidc.{host, issuerUrl, realm, configured: true}` block populated). `providers.auth.proxyHeader.headersChecked` is the canonical + `oauth2-proxy`-variant header pair the server reads.

See [Memory Core Healthcheck](MemoryCore.md) for the full schema contract (including the `clientSecret`-non-leak invariant per [#10770](https://github.com/neomjs/neo/issues/10770)).

## Section 8: First-Connection Smoke Test

For the local Dockerized fixture, run `npm run test-integration-unified`. The Playwright integration harness builds `ai/deploy/docker-compose.test.yml`, waits for Chroma + KB + MC readiness, then calls the KB and MC `healthcheck` tools over `/mcp`. The same harness also drives the proxy-identity path with `test/playwright/integration/fixtures/mcpClient.mjs`, including the `401 Unauthorized` rejection check in `AuthRejection.integration.spec.mjs` and the cross-tenant memory-read isolation check in `CrossTenantIsolation.integration.spec.mjs`.

1. Configure your local agent harness (e.g., `claude_desktop_config.json`) to point the `sse` transport URL to your public proxy endpoint.
2. Ensure you have authenticated with the proxy (e.g., logging in via browser to obtain the session cookie, or injecting a proxy-issued bearer token).
3. Ask the agent: *"Call the `healthcheck` tool on the remote Memory Core server."*
4. Verify the agent successfully completes the turn and receives the healthy response.

## Section 9: Known Gaps & Follow-Up Tickets

This cookbook surfaces the following architectural gaps between "substrate complete" and "operator ready," which are actively tracked for remediation:

- **[#10801](https://github.com/neomjs/neo/issues/10801):** (Shipped) Create reference Docker and docker-compose artifacts for shared KB/MC deployment.
- **[#10802](https://github.com/neomjs/neo/issues/10802):** Expose public canonical URL configuration to MCP servers for SSE and OAuth callbacks.
- **[#10804](https://github.com/neomjs/neo/issues/10804):** Consolidate `neoEmbeddingProvider` and `chromaEmbeddingProvider` configurations.
- **[#10805](https://github.com/neomjs/neo/issues/10805):** Build staged-stack integration test harness for shared cloud deployment.
- **[#10808](https://github.com/neomjs/neo/issues/10808):** Operator-facing env var ergonomics — descriptive names (`MCP_HTTP_PORT`, `NEO_PUBLIC_URL`, etc.) + `NEO_CHROMA_HOST` / `NEO_CHROMA_PORT` overridability. Cross-cuts Section 6 (env var inventory) where the forward-looking names are documented ahead of substrate-side wiring.

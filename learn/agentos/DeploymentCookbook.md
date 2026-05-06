# Deployment Cookbook: Shared Topology Walkthrough

This cookbook is a concrete, ordered, end-to-end deployment guide for standing up the Neo.mjs Knowledge Base (KB) and Memory Core (MC) servers against a shared cloud-hosted Chroma instance, protected by an identity-aware reverse proxy.

For theoretical background, threat models, and architectural reference, see [Shared Deployment MVP](SharedDeployment.md).

## Section 1: Prerequisites & Architecture Picture

Before deploying, ensure you understand the target topology.

### Architecture Topology
1. **Agent Harnesses (Clients):** Local agent runners (e.g., Anthropic Claude Desktop, Gemini) sending MCP JSON-RPC over Server-Sent Events (SSE) or HTTP.
2. **Reverse Proxy:** The public gateway that terminates TLS, enforces OAuth/OIDC authentication, and injects trusted identity headers.
3. **MCP Servers:** The Node.js processes running `knowledge-base` and `memory-core`.
4. **Data Layer:** A shared Chroma vector database and isolated SQLite graph databases for each server.

### Identity Flow
External Identity Provider (IdP) → Reverse Proxy (OIDC verify) → Reverse Proxy injects `X-PREFERRED-USERNAME` → MCP Server (Proxy-header-trusted auth).

### Provisioning Obligations
The Neo.mjs repository provides the MCP server applications. The external operator is responsible for provisioning:
- The container runtime (e.g., Docker, Kubernetes).
- The OAuth 2.1 / OIDC provider.
- The reverse proxy.
- The ChromaDB instance.

## Section 2: Container Packaging

When containerizing the MCP servers, you must choose between packaging both servers in one image or building two separate images. 

### Recommended Pattern: Two Images (Sidecar Pattern)
We recommend building two distinct images (or running the same image with different entrypoints).
- **Isolation:** Process crashes in the Knowledge Base do not take down the Memory Core.
- **Resource Limits:** KB is read-heavy; MC is write-heavy. They can be scaled or constrained independently.
- **Shared Chroma:** Both containers connect to a single unified Chroma instance via internal container networking.

*(Note: Reference `Dockerfile` and `docker-compose.yml` artifacts are pending under [#10801](https://github.com/neomjs/neo/issues/10801)).*

## Section 3: Reverse Proxy Configuration

The reverse proxy is the security boundary for the shared deployment.

### Routing Strategy
You must map a single public hostname to two distinct upstream services. We recommend **pathname-based routing** to avoid managing multiple TLS certificates:
- `/kb/*` routes to the Knowledge Base MCP server container (e.g., port 3001).
- `/mc/*` routes to the Memory Core MCP server container (e.g., port 3002).

### Header Stripping (Security)
To prevent spoofing attacks, the reverse proxy **MUST** strip any incoming `X-PREFERRED-USERNAME` headers provided by the client before injecting its own trusted value.

*(Note: Canonical Nginx/Caddy configurations are tracked under [#10803](https://github.com/neomjs/neo/issues/10803)).*

## Section 4: Identity Provider Setup

You must register an OAuth application with your Identity Provider (e.g., Google, Okta, Auth0).

### Client Registration
1. Create a new Web Application client.
2. Store the `clientId` and `clientSecret` securely.
3. Configure the Redirect URIs.

### Authentication Modes
You must configure the MCP servers to trust the proxy:
- Set `AUTH_TRUST_PROXY_IDENTITY=true` on both servers.
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
| `AUTH_TRUST_PROXY_IDENTITY` | Both | Set to `true` if your reverse proxy handles authentication. |
| `GEMINI_API_KEY` | Both | Required for Gemini integration. |

*(Note: Full config unification and public URL advertising are tracked under [#10802](https://github.com/neomjs/neo/issues/10802) and [#10804](https://github.com/neomjs/neo/issues/10804). Environment mapping and legacy variable unification are tracked under [#10808](https://github.com/neomjs/neo/issues/10808)).*

## Section 7: Healthcheck Verification

Once deployed, verify the stack by querying the healthcheck endpoints (e.g., `https://my-proxy.example.com/mc/health`).

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

1. Configure your local agent harness (e.g., `claude_desktop_config.json`) to point the `sse` transport URL to your public proxy endpoint.
2. Ensure you have authenticated with the proxy (e.g., logging in via browser to obtain the session cookie, or injecting a proxy-issued bearer token).
3. Ask the agent: *"Call the `healthcheck` tool on the remote Memory Core server."*
4. Verify the agent successfully completes the turn and receives the healthy response.

## Section 9: Known Gaps & Follow-Up Tickets

This cookbook surfaces the following architectural gaps between "substrate complete" and "operator ready," which are actively tracked for remediation:

- **[#10801](https://github.com/neomjs/neo/issues/10801):** Create reference Docker and docker-compose artifacts for shared KB/MC deployment.
- **[#10802](https://github.com/neomjs/neo/issues/10802):** Expose public canonical URL configuration to MCP servers for SSE and OAuth callbacks.
- **[#10803](https://github.com/neomjs/neo/issues/10803):** Publish reference reverse proxy config for shared topology.
- **[#10804](https://github.com/neomjs/neo/issues/10804):** Consolidate `neoEmbeddingProvider` and `chromaEmbeddingProvider` configurations.
- **[#10805](https://github.com/neomjs/neo/issues/10805):** Build staged-stack integration test harness for shared cloud deployment.
- **[#10808](https://github.com/neomjs/neo/issues/10808):** Operator-facing env var ergonomics — descriptive names (`MCP_HTTP_PORT`, `NEO_PUBLIC_URL`, etc.) + `NEO_CHROMA_HOST` / `NEO_CHROMA_PORT` overridability. Cross-cuts Section 6 (env var inventory) where the forward-looking names are documented ahead of substrate-side wiring.

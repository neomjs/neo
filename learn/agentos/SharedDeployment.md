# Shared KB/MC Team Deployment

The supported MVP topology for teams pooling a single Knowledge Base and Memory Core across multiple developers and their agents.

## Purpose

The default per-developer local setup gives each developer's agents an isolated, private Knowledge Base and Memory Core. That works for solo development but breaks down when a team wants to share institutional memory: agent A's session summaries, raw memories, and concept-graph evolutions are invisible to agent B unless every developer manually syncs.

Shared deployment removes that staleness by giving the team **one Chroma process** backing both KB and MC, while preserving the existing **collection boundaries**, **MCP server surfaces**, and **per-agent identity provenance**. The result: any agent in the team can discover any other agent's summaries and raw memories on first query, without per-developer sync rituals.

This document is the single source of truth for the shared-deployment MVP profile. It deliberately does not cover full multi-tenant data privacy isolation — that work continues under [#10011](https://github.com/neomjs/neo/issues/10011) and is out of MVP scope.

For the current Agent OS cloud deployment authority and reference topology handoffs, see the [Deployment Cookbook](DeploymentCookbook.md) and the [`ai/deploy/`](../../ai/deploy/) directory.

## Architecture: One Process, Many Collections, Two Servers

The shared MVP topology preserves three independent boundaries:

| Boundary | Shared mode | Local mode (default) |
|---|---|---|
| **Chroma process** | **One** shared process | Per-developer local |
| **Chroma collections** | Separate (`neo-knowledge-base`, `neo-agent-memory`, `neo-agent-sessions`) | Same — collection boundary is independent of process boundary |
| **MCP servers** | Two — KB and MC remain distinct MCP tool surfaces | Same — server boundary is independent of process boundary |
| **Agent identity** | Per-agent (`@neo-opus-ada`, `@neo-gemini-pro`, `@neo-gpt`, ...) | Same — identity boundary is independent |

**One Chroma process does NOT mean one Chroma collection.** Collection boundaries preserve query semantics (KB hybrid search vs MC vector summaries), migration safety, and future retention policy. Collapsing to a single collection would dilute KB results with raw agent thoughts and break inheritance-boost scoring.

**KB and MC remain separate MCP servers.** Each exposes its own tool surface (`query_documents`, `ask_knowledge_base` vs `add_memory`, `query_summaries`, etc.). Server consolidation is a future-direction concern under the broader thin-MCP-server trajectory; the MVP keeps them distinct.

## Configuration

### Topology mode

The system uses a **permanently unified** topology. The Memory Core and Knowledge Base always share a single underlying ChromaDB process.

**Connection contract:** the shared Chroma instance MUST be reachable from every developer's machine — typically a team-managed cloud service (e.g., a managed Chroma cluster) or a shared internal host. The `engines.chroma.{host, port}` config is where operators point at the team's shared instance.

### Embedding provider

Embedding generation is provider-pluggable. The active provider is controlled by `NEO_EMBEDDING_PROVIDER`; supported values are `'openAiCompatible'` (default local OpenAI-format route, including MLX-served Qwen3 models, llama.cpp, LM Studio, etc.), `'gemini'` (cloud), and `'ollama'` (local). The selector drives ChromaDB retrieval operations.

```bash
# Default: local OpenAI-compatible Qwen3 embedding, matching the 4096-dim collection invariant:
unset NEO_EMBEDDING_PROVIDER
export NEO_EMBEDDING_PROVIDER=openAiCompatible
export NEO_OPENAI_COMPATIBLE_HOST=http://127.0.0.1:8000              # MLX server endpoint
export NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL=text-embedding-qwen3-embedding-8b  # Qwen3-8B default
# OR for the smaller 1.5B variant:
# export NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL=text-embedding-qwen3-embedding-1.5b
export NEO_OPENAI_COMPATIBLE_API_KEY=                                # leave empty for local servers

# Optional Google Gemini cloud embedding (gemini-embedding-001, 3072 dims):
export NEO_EMBEDDING_PROVIDER=gemini
export NEO_VECTOR_DIMENSION=3072

# Local Ollama embedding:
export NEO_EMBEDDING_PROVIDER=ollama
export NEO_OLLAMA_HOST=http://127.0.0.1:11434
export NEO_OLLAMA_EMBEDDING_MODEL=qwen3-embedding
```

**Vector dimension is independently pinned** via `NEO_VECTOR_DIMENSION` (default 4096 = 4k dims, matching Qwen3 family). ChromaDB collections are created with this dimension; mismatch between the embedding model's actual output dimension and `vectorDimension` causes silent insert failures or shape errors. Operators MUST match the dimension to the active embedding model:

```bash
# Qwen3 family default 4k (matches text-embedding-qwen3-embedding-1.5b/8b output):
export NEO_VECTOR_DIMENSION=4096
# Gemini gemini-embedding-001:
export NEO_VECTOR_DIMENSION=3072
# Smaller models (768/1024):
export NEO_VECTOR_DIMENSION=768
```

`NEO_CHROMA_EMBEDDING_PROVIDER` remains readable during the #10804 deprecation window and feeds the unified selector with a warning. New deployments should use `NEO_EMBEDDING_PROVIDER` only.

**Substrate observation (#10723):** the OpenAI-compatible embedding path is implemented inside `ai/services/memory-core/TextEmbeddingService.mjs#embedText[s]` (POST to `${host}/v1/embeddings` with `{model, input}` payload, parsing `result.data[*].embedding`). It is NOT routed through the `Neo.ai.provider.OpenAiCompatible` class — that class currently exposes `generate` / `stream` (chat completions) but no `embed` method. This means the embedding-provider abstraction is functional but not yet symmetric with the chat-provider abstraction. Future hardening should consolidate the embedding path into the provider class hierarchy; out of scope for #10723 itself.

### Summary provider

Session summarization is controlled by `NEO_MODEL_PROVIDER`; supported values are `'openAiCompatible'` (**default** — local OpenAI-format chat-completions servers such as MLX-served Qwen3-8b, llama.cpp, or LM Studio) and `'gemini'` (cloud, explicit opt-in). The local route is the default, so summarization never hits a billed remote API unless an operator explicitly sets `NEO_MODEL_PROVIDER=gemini`.

```bash
# Default (unset): local OpenAI-compatible chat summarization — configure the host/model below:
unset NEO_MODEL_PROVIDER
# or make it explicit:
export NEO_MODEL_PROVIDER=openAiCompatible
export NEO_OPENAI_COMPATIBLE_HOST=http://127.0.0.1:11434
export NEO_OPENAI_COMPATIBLE_MODEL=qwen3-8b
export NEO_OPENAI_COMPATIBLE_KEEP_ALIVE=-1
export NEO_OPENAI_COMPATIBLE_API_KEY=  # leave empty for local servers

# Cloud Google Gemini summarization (explicit opt-in — billed remote API):
export NEO_MODEL_PROVIDER=gemini
```

This path uses the existing `Neo.ai.provider.OpenAiCompatible` chat-completions abstraction. Do not add a model-specific Qwen provider class for shared-deployment installs; local-model selection is an operator config concern.
`NEO_OPENAI_COMPATIBLE_KEEP_ALIVE` and `NEO_OLLAMA_KEEP_ALIVE` default to `-1` so local providers keep the selected model resident across Agent OS calls unless operators explicitly choose a shorter retention window or `0` unload control.
The optional `local-model` Docker profile mirrors that service primitive at the provider-runtime boundary: `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_CONTEXT_LENGTH=262144`, and a 32g default memory envelope for dual-resident chat + embedding deployments unless overridden by `NEO_LOCAL_MODEL_*` deployment variables.

### Local-provider model residency

REM and Sandman alternate between a chat model and an embedding model. Local
providers therefore need both models resident at the same time; otherwise each
chat-to-embedding switch can evict the previous model and reintroduce cold-load
latency despite `keep_alive=-1`.

Neo declares this requirement with provider-level config:

```bash
export NEO_OLLAMA_REQUIRE_PARALLEL_MODELS=2
export NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS=2
```

The defaults are `2` because the standard local setup uses one chat model and
one embedding model. The boot-time provider-readiness check warns, but does not
block startup, when the selected provider cannot observe both configured model
names as loaded/available. Native Ollama deployments must satisfy the warning by
starting `ollama serve` with `OLLAMA_MAX_LOADED_MODELS` set to at least the same
count; OpenAI-compatible servers must use their provider-specific loaded-model
cap or pre-load setting so the chat and embedding model stay resident together.

## Authentication

Shared deployments need to know **which agent originated each request** so memories, summaries, and graph edges are attributed correctly. The Memory Core supports two authentication paths:

1. **OIDC (default for production deployments)** — the operator deploys an OIDC identity provider (e.g. Keycloak, GitLab) and the MC server validates each SSE request's `Authorization: Bearer <token>` against it via `AuthService.verifyAccessToken`. The verified `userId` becomes the `req.auth` block consumed by `Server.mjs#buildRequestContext`. Source provenance: `source: 'oidc'`.

2. **Proxy identity injection (for deployments fronted by an identity-aware proxy)** — when an `oauth2-proxy`-style reverse proxy already terminates OIDC and injects `X-PREFERRED-USERNAME` (or the oauth2-proxy-specific `X-Auth-Request-Preferred-Username`) into the upstream request, the MC server can read that header instead of running its own OIDC verification. Gated by `auth.trustProxyIdentity`. Source provenance: `source: 'proxy-header'`.

The two paths are NOT mutually exclusive — `req.auth` (OIDC) takes precedence over the proxy header by design. The proxy path only fires when `req.auth` is absent (OIDC unconfigured or token missing) AND `trustProxyIdentity` is explicitly enabled. **If `trustProxyIdentity` is enabled and no valid proxy identity header is found, the request is actively rejected with a `401 Unauthorized` error.** This strict "Verify-Before-Assert" gate prevents requests from silently falling through to an unauthenticated single-tenant context in a shared deployment. The local proof for this runtime gate is `test/playwright/integration/AuthRejection.integration.spec.mjs`, which connects without an identity header and expects the rejection before verifying an identity-bearing client can still call `healthcheck`.

### Configuration: Canonical `publicUrl` (PR #10802)

When deploying behind a reverse proxy that uses a public domain (e.g., `https://mcp.neo.mjs.com`), the MCP server MUST know its public canonical URL to advertise correct Server-Sent Events (SSE) endpoints and validate OAuth audience claims.

```bash
# Set the canonical public URL for the server
export NEO_PUBLIC_URL=https://mcp.neo.mjs.com/mc
```

The `publicUrl` property decouples the public-facing URL from the internal `HOST` and `PORT` bindings, fixing SSE callback and OIDC redirect mismatches behind proxies.

### Configuration: `trustProxyIdentity` (PR #10768 / #10727)

```bash
# Default — proxy header is IGNORED. OIDC-only operation:
unset NEO_AUTH_TRUST_PROXY_IDENTITY
# or
export NEO_AUTH_TRUST_PROXY_IDENTITY=false

# Enable proxy-identity injection (required for oauth2-proxy fronting deployments):
export NEO_AUTH_TRUST_PROXY_IDENTITY=true
```

The flag lives in both `ai/mcp/server/knowledge-base/config.template.mjs` and `ai/mcp/server/memory-core/config.template.mjs` under the `auth` block, so both servers stay symmetric.

### Threat model — load-bearing operational prerequisite

**`trustProxyIdentity=true` shifts the trust anchor from the MC's own OIDC introspection to the proxy in front of the MC.** That trust shift is correct ONLY when the proxy:

1. **Strips client-set values of `X-PREFERRED-USERNAME` and `X-Auth-Request-Preferred-Username` from incoming requests before forwarding upstream.** Without this, any client can set the header to any value and gain that identity. This is THE deployment prerequisite. See the [Reference Proxy Configurations](../../ai/mcp/deploy/proxy/) for implementation examples.
2. **Sets the header itself based on its own validated authentication state.** Typically the proxy completes its own OIDC flow (against Keycloak, GitLab, or the team's IdP), and forwards the verified `preferred_username` claim as the upstream header.
3. **Is positioned so the MC server is NEVER reachable from outside the proxy** — direct network access to the MC server bypasses the proxy and bypasses the trust boundary entirely. Typical deployment: MC bound to internal network only; proxy bound to public network; reverse-proxy hop is the only ingress.

If any of the three is uncertain, **leave `trustProxyIdentity=false`** and stick with OIDC mode. The fallback is operational, not catastrophic — it just requires the MC server to do its own OIDC introspection per request.

### Header conventions checked

The proxy-identity reader checks two header names (in order):

1. `x-preferred-username` — the canonical OIDC claim name forwarded as a header by most identity-aware proxies
2. `x-auth-request-preferred-username` — the `oauth2-proxy`-specific convention (used when oauth2-proxy is configured with `--set-xauthrequest`)

Either header satisfies the gate; the first non-empty value wins. Header-name matching is case-insensitive (Node.js HTTP semantics).

### Source-tag observability

Every authenticated request carries a `source` tag through `Server.mjs#buildRequestContext` so downstream services and log lines can distinguish the auth path empirically:

| Path | `source` value | Trust anchor |
|---|---|---|
| OIDC introspection | `'oidc'` | MC's `AuthService.verifyAccessToken` |
| Proxy header injection | `'proxy-header'` | The fronting proxy's deployment configuration |
| Single-tenant fallthrough (no auth) | (empty) | None — local dev only |

The source tag is graph-ingested into agent-identity memory writes; an audit query against memories can verify the proportion of `'oidc'` vs `'proxy-header'` writes against operator expectations.

A symmetric healthcheck `providers.auth` block is shipped under [#10770](https://github.com/neomjs/neo/issues/10770) — see [Healthcheck Verification](#healthcheck-verification) below. The block provides static-config observability of the active auth path (OIDC vs proxy-header vs unconfigured) at boot; per-request source-tag observability remains via memory-write audit.

## Healthcheck Verification

The Memory Core's `healthcheck` MCP tool exposes the effective topology so operators can verify shared mode took effect without inspecting logs or re-running config through `node -e`:

```json
"database": {
    "topology": {
        "mode": "unified",
        "coordinates": { "host": "team-chroma.example.com", "port": 8000 },
        "resolvedVia": "engines.chroma"
    }
}
```

Three diagnostic fields:
- `mode`: Always `'unified'`. Memory Core shares the underlying ChromaDB instance with the KB.
- `coordinates`: the actual `{host, port}` the Memory Core's client is targeting. In shared mode this should match the team's Chroma service. `null` indicates a misconfiguration (`engines.chroma` not populated).
- `resolvedVia`: `'engines.chroma'`. Direct pointer to the config key path the resolver consulted.

See [`MemoryCore.md` §Healthcheck Response Shape](./MemoryCore.md) for the full healthcheck payload contract.

The Knowledge Base's healthcheck mirrors the connectivity assertion (collection counts, embedding status). When both servers report `connected: true` against the same shared `{host, port}`, the topology is verified.

The local staged-stack fixture verifies this deployed shape with `npm run test-integration-unified`: Playwright starts `ai/deploy/docker-compose.test.yml`, then calls both servers' MCP `healthcheck` tools over `/mcp` (see [HeartbeatPropagation.integration.spec.mjs](../../test/playwright/integration/HeartbeatPropagation.integration.spec.mjs)). This is the canonical local smoke path for KB + MC + shared Chroma healthcheck validation. It also writes and queries same-session memories as different proxy identities in `test/playwright/integration/CrossTenantIsolation.integration.spec.mjs`, proving tenant-scoped memory reads do not leak across the trusted proxy-identity boundary.

The Memory Core's healthcheck additionally surfaces active provider observability under `providers.*` (#10723, #10724, #10770):

```json
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
        "configured": "oidc",
        "oidc": {
            "host": "http://127.0.0.1:8180",
            "issuerUrl": "http://127.0.0.1:8180/realms/master",
            "realm": "master",
            "configured": true
        },
        "proxyHeader": {
            "trusted": false,
            "headersChecked": ["x-preferred-username", "x-auth-request-preferred-username"]
        }
    }
}
```

Embedding diagnostic fields:
- `active`: the provider key selected for embedding generation (`'gemini'` | `'openAiCompatible'` | `'ollama'`). Mismatch between operator intent (e.g. expected local Qwen3) and observed value (e.g. silent fallback to `'gemini'` because `NEO_EMBEDDING_PROVIDER` was unset) is the load-bearing diagnostic.
- `host`: provider endpoint URL when applicable (`null` for cloud `gemini`).
- `model`: resolved embedding model name. Operators verify this matches the model running on the local server.
- `dimensions`: configured `vectorDimension`. Must match the embedding model's actual output dimension; mismatch is silent in collection writes but breaks retrieval. This is intentionally config-only: a live `actualDimensions` smoke requires calling the provider, which may load local models or need cloud credentials. Golden Path now logs the observed `actualEmbeddingDimension` when it already has a generated frontier embedding and refuses the Chroma query before a raw shape error.

If the embedding provider key resolves to an unrecognized value, the block additionally surfaces an `error` field naming the misconfig directly without making healthcheck throw.

Summary diagnostic fields:
- `active`: the provider key currently selected for session summarization (`'gemini'` | `'openAiCompatible'` | string).
- `host`: chat provider host when applicable (`null` for cloud `gemini`).
- `model`: resolved summary-generation model. Operators verify this matches the model running on the local server.
- `endpoint`: chat-completions endpoint for OpenAI-compatible providers.
- `local`: whether the endpoint is loopback / localhost.
- `credential`: env var name plus `configured` / `required` booleans; secret values are never exposed.

For disconnect-triggered summarization, keep `NEO_AUTO_SUMMARIZE=true` only after the local model is reachable and healthcheck shows the intended provider/model. If the local chat API is unavailable, Memory Core logs the summarization failure and keeps raw memories intact so the operator can retry.

Auth diagnostic fields:
- `configured`: which auth path is primary at boot — `'oidc'`, `'proxy-header'`, or `'unconfigured'`. OIDC takes precedence when both are configured (matches `Server.mjs#buildRequestContext` runtime semantics — `req.auth` wins over the proxy header by design).
- `oidc.{host, issuerUrl, realm}`: introspection-relevant config visibility (never the `clientSecret`).
- `oidc.configured`: `true` only when both `host` AND `issuerUrl` are populated.
- `proxyHeader.trusted`: whether `auth.trustProxyIdentity` is enabled in config.
- `proxyHeader.headersChecked`: the canonical (`x-preferred-username`) and `oauth2-proxy`-specific (`x-auth-request-preferred-username`) header keys the server reads in proxy-header mode.

Use `configured` as the at-a-glance indicator. A misconfigured `NEO_AUTH_TRUST_PROXY_IDENTITY=true` without OIDC and without a fronting proxy actually deployed will surface here as `'proxy-header'`; if requests then fail with `401`, that's the runtime gate ([PR #10785](https://github.com/neomjs/neo/pull/10785)) rejecting missing proxy headers per the [Authentication](#authentication) threat model. The healthcheck shows the *configured* posture; the 401 confirms the gate fires when the prerequisite is absent.

Dream background daemon diagnostic fields (`features.dream`):
- `autoDream`: whether the background Dream daemon is permitted to run.
- `autoGoldenPath`: whether the background Golden Path pipeline is enabled.
- `realTimeMemoryParsing`: whether the real-time continuous memory parsing worker is enabled.
- `autoIngestFileSystem`: whether the file-system ingest watcher is enabled.
- `lastDreamRun`: placeholder for the timestamp of the last Dream pipeline execution.
- `lastGoldenPathRun`: placeholder for the timestamp of the last Golden Path pipeline execution.

## Asynchronous Session Summarization (Disconnect Trigger)

In a shared deployment, multiple agents connect and disconnect dynamically. To ensure session summaries are automatically available to the team without requiring manual API calls or external cron jobs, the Memory Core leverages a **disconnect-triggered summarization** primitive.

When an MCP client (agent) disconnects from the Server-Sent Events (SSE) transport, the `TransportService` intercepts the termination and signals the Memory Core. The server immediately queues a `pending` summarization marker in its `SummarizationJobs` SQLite coordinator table. This behavior is gated by the `autoSummarize` feature flag. For local multi-harness duplication, single-writer enforcement is guaranteed by the `wake-daemon`. The daemon acts as a host-level singleton via a `PID_FILE` lock, and uses an in-process mutex to prevent summarization races across instances sharing the same Chroma collection. For remote multi-user Memory Core deployments, write visibility and isolation are maintained through request-scoped identity context.

This allows the heavy LLM summarization process to run asynchronously in the background. Because it relies on the unified `SummarizationJobs` table and the daemon's singleton lease, it naturally handles concurrent agent disconnects and server clustering without duplicating summaries. Team members can query the Memory Core and instantly access the completed session context once the background job finishes.

## Migration: Per-Developer Local → Shared Team Mode

Teams adopting shared mode from per-developer local should follow this migration path:

1. **Stand up the shared Chroma instance.** Either deploy a managed Chroma service (cloud), or designate a shared internal host. The instance must be reachable from every developer's machine.

2. **Decide on data carry-over.** Two paths:
   - **Fresh start (recommended for MVP):** new shared instance, no historical KB/MC data carried over. Each agent's first session against shared mode rebuilds its local concept of "team context" through normal interaction.
   - **Migrate existing local data:** export per-developer collections via `export_database` (Memory Core MCP tool), reconcile (multiple developers may have summarized the same session), and import into the shared instance via `import_database`. This is operator-intensive and out of MVP scope; document case-by-case if pursued.

3. **Update each developer's config.** Each developer points their `engines.chroma.{host, port}` config at the shared instance. The setting can live in the developer's environment or in a shared `.env` template.

4. **Verify via healthcheck.** Each developer runs `healthcheck` against both servers, but the proof shape differs per server:
   - **Memory Core** surfaces the effective topology in its `database.topology` block — expect `mode === 'unified'`, matching `coordinates`, and `resolvedVia === 'engines.chroma'`. This is the canonical topology proof.
   - **Knowledge Base** proves connectivity to the shared Chroma instance and reports collection availability/counts (the KB healthcheck does not surface a topology block; that diagnostic is MC-side per #10127).
   - Cross-server consistency: when both servers report `connected: true` against matching `{host, port}`, the shared topology is verified end-to-end. Connection failures surface as structured `error` fields, not 500s.

5. **First-session smoke test.** Have each developer's agent run a `query_summaries` query against Memory Core — this is the canonical cross-agent **memory visibility** proof. The first agent populates baseline; subsequent agents should see each other's summaries on subsequent queries. Optionally also run an `ask_knowledge_base` query against the Knowledge Base to validate **KB sharing** through the same Chroma instance — it's a separate retrieval surface, not a memory-visibility proof.

6. **Resume validation (when reconnecting agents).** Before an agent reconnects with a previously-used session ID, call `resume_session({session_id})` on Memory Core to verify the session is safe to resume. The tool returns a structured payload: `status: 'resumable'` (with `memoryCount`, `lastActivityAt`, `summarizationStatus`) confirms the agent can keep using that session ID via the `Mcp-Session-Id` header; `SESSION_FINALIZED` (already summarized) or `SESSION_BUSY` (concurrent summarization mid-flight, lease active) signal the agent should start fresh or retry. The validation is read-only — it does not modify server-side session state; the actual session-id binding still happens at the transport layer.

## Validation

Validation tests for the unified topology are tracked separately under [#10008](https://github.com/neomjs/neo/issues/10008) ("Playwright Test Coverage: Unified Monolithic Topology"). That ticket is the canonical validation path for the contract this profile documents — when it closes, the test substrate empirically proves shared-mode KB/MC read/write correctness against a single Chroma process without collection collision.

This documentation profile and the test work are complementary:
- This doc establishes the **contract** operators and agents can rely on.
- [#10008](https://github.com/neomjs/neo/issues/10008) establishes the **executable proof** that the contract holds.

### Topology Matrix Audit (#10950)

This deployment topology explicitly reconciles the outstanding matrix coverage tickets:
- **[#10015](https://github.com/neomjs/neo/issues/10015)** (Dynamic Topology): The unified deployment mode documented here is the default product-path for team environments.
- **[#10008](https://github.com/neomjs/neo/issues/10008)** (Unified Coverage): Playwright integration tests (`test-integration-unified`) empirically prove the unified product-path behavior.
- **[#10009](https://github.com/neomjs/neo/issues/10009)** (Federated Coverage): Federated topology integration tests are demoted to a non-default diagnostic track, explicitly deferring product claims.

## Federated Mode Retirement

The earlier "federated cloud" topology — separate Chroma processes for KB and MC — has been **permanently retired**. The unified topology is now the exclusive product path.

[#10009](https://github.com/neomjs/neo/issues/10009) ("Playwright Test Coverage: Federated Cloud Topology") is the reference ticket, resolving the removal of federated topology code paths across the substrate.

## Related

- Parent sub-epic: [#10691](https://github.com/neomjs/neo/issues/10691) — Shared KB/MC Team Deployment MVP
- Parent cloud epic: [#9999](https://github.com/neomjs/neo/issues/9999) — Cloud-Native Knowledge & Multi-Tenant Memory Core
- Topology routing pillar: [#10001](https://github.com/neomjs/neo/issues/10001) (closed), [#10007](https://github.com/neomjs/neo/issues/10007) (closed)
- Topology observability: [#10127](https://github.com/neomjs/neo/issues/10127) (closed) — healthcheck topology block
- Validation: [#10008](https://github.com/neomjs/neo/issues/10008) (open) — unified-mode test coverage
- Demoted: [#10009](https://github.com/neomjs/neo/issues/10009) (open) — federated-mode test coverage, see Federated Mode Disposition above
- Sibling concern: [#10010](https://github.com/neomjs/neo/issues/10010) (open) — Team vs Private Context Retrieval policy layer
- Future direction: [#10011](https://github.com/neomjs/neo/issues/10011) (open) — Native Edge Graph tenant isolation (out of MVP scope)

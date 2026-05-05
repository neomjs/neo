# Shared KB/MC Team Deployment

The supported MVP topology for teams pooling a single Knowledge Base and Memory Core across multiple developers and their agents.

## Purpose

The default per-developer local setup gives each developer's agents an isolated, private Knowledge Base and Memory Core. That works for solo development but breaks down when a team wants to share institutional memory: agent A's session summaries, raw memories, and concept-graph evolutions are invisible to agent B unless every developer manually syncs.

Shared deployment removes that staleness by giving the team **one Chroma process** backing both KB and MC, while preserving the existing **collection boundaries**, **MCP server surfaces**, and **per-agent identity provenance**. The result: any agent in the team can discover any other agent's summaries and raw memories on first query, without per-developer sync rituals.

This document is the single source of truth for the shared-deployment MVP profile. It deliberately does not cover full multi-tenant data privacy isolation — that work continues under [#10011](https://github.com/neomjs/neo/issues/10011) and is out of MVP scope.

## Architecture: One Process, Many Collections, Two Servers

The shared MVP topology preserves three independent boundaries:

| Boundary | Shared mode | Local mode (default) |
|---|---|---|
| **Chroma process** | **One** shared process | Per-developer local |
| **Chroma collections** | Separate (`neo-knowledge-base`, `neo-agent-memory`, `neo-agent-sessions`) | Same — collection boundary is independent of process boundary |
| **MCP servers** | Two — KB and MC remain distinct MCP tool surfaces | Same — server boundary is independent of process boundary |
| **Agent identity** | Per-agent (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@neo-gpt`, ...) | Same — identity boundary is independent |

**One Chroma process does NOT mean one Chroma collection.** Collection boundaries preserve query semantics (KB hybrid search vs MC vector summaries), migration safety, and future retention policy. Collapsing to a single collection would dilute KB results with raw agent thoughts and break inheritance-boost scoring.

**KB and MC remain separate MCP servers.** Each exposes its own tool surface (`query_documents`, `ask_knowledge_base` vs `add_memory`, `query_summaries`, etc.). Server consolidation is a future-direction concern under the broader thin-MCP-server trajectory; the MVP keeps them distinct.

## Configuration

The single operator-facing flag is `NEO_CHROMA_UNIFIED`:

```bash
# Per-developer local mode (default — each MCP server runs its own Chroma process):
unset NEO_CHROMA_UNIFIED
# or
export NEO_CHROMA_UNIFIED=false

# Shared team deployment mode (KB and MC both target the same Chroma process):
export NEO_CHROMA_UNIFIED=true
```

The flag is read by both `ai/mcp/server/knowledge-base/config.template.mjs` and `ai/mcp/server/memory-core/config.template.mjs` at boot. Each config exposes a `chromaUnified: process.env.NEO_CHROMA_UNIFIED === 'true'` flag derived from the same env var, so both servers stay in sync without coordinated config edits.

In unified mode, the Memory Core's `ChromaClient` targets the Knowledge Base's Chroma coordinates (`engines.kb.chroma.{host, port}`) instead of its own (`engines.chroma.{host, port}`). The KB's local config defines the canonical shared coordinates; MC reads through them.

**Connection contract:** the shared Chroma instance MUST be reachable from every developer's machine — typically a team-managed cloud service (e.g., a managed Chroma cluster) or a shared internal host. The `engines.kb.chroma.{host, port}` config in the KB's `config.mjs` is where operators point at the team's shared instance.

## Authentication

Shared deployments need to know **which agent originated each request** so memories, summaries, and graph edges are attributed correctly. The Memory Core supports two authentication paths:

1. **OIDC (default for production deployments)** — the operator deploys an OIDC identity provider (e.g. Keycloak, GitLab) and the MC server validates each SSE request's `Authorization: Bearer <token>` against it via `AuthService.verifyAccessToken`. The verified `userId` becomes the `req.auth` block consumed by `Server.mjs#buildRequestContext`. Source provenance: `source: 'oidc'`.

2. **Proxy identity injection (for deployments fronted by an identity-aware proxy)** — when an `oauth2-proxy`-style reverse proxy already terminates OIDC and injects `X-PREFERRED-USERNAME` (or the oauth2-proxy-specific `X-Auth-Request-Preferred-Username`) into the upstream request, the MC server can read that header instead of running its own OIDC verification. Gated by `auth.trustProxyIdentity`. Source provenance: `source: 'proxy-header'`.

The two paths are NOT mutually exclusive — `req.auth` (OIDC) takes precedence over the proxy header by design. The proxy path only fires when `req.auth` is absent (OIDC unconfigured or token missing) AND `trustProxyIdentity` is explicitly enabled.

### Configuration: `trustProxyIdentity` (PR #10768 / #10727)

```bash
# Default — proxy header is IGNORED. OIDC-only operation:
unset AUTH_TRUST_PROXY_IDENTITY
# or
export AUTH_TRUST_PROXY_IDENTITY=false

# Enable proxy-identity injection (required for oauth2-proxy fronting deployments):
export AUTH_TRUST_PROXY_IDENTITY=true
```

The flag lives in both `ai/mcp/server/knowledge-base/config.template.mjs` and `ai/mcp/server/memory-core/config.template.mjs` under the `auth` block, so both servers stay symmetric.

### Threat model — load-bearing operational prerequisite

**`trustProxyIdentity=true` shifts the trust anchor from the MC's own OIDC introspection to the proxy in front of the MC.** That trust shift is correct ONLY when the proxy:

1. **Strips client-set values of `X-PREFERRED-USERNAME` and `X-Auth-Request-Preferred-Username` from incoming requests before forwarding upstream.** Without this, any client can set the header to any value and gain that identity. This is THE deployment prerequisite.
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

A symmetric healthcheck `providers.auth` block is a recommended follow-up; tracked separately. Until then, source-tag observability is via memory-write audit only.

## Healthcheck Verification

The Memory Core's `healthcheck` MCP tool exposes the effective topology so operators can verify shared mode took effect without inspecting logs or re-running config through `node -e`:

```json
"database": {
    "topology": {
        "mode": "unified",
        "coordinates": { "host": "team-chroma.example.com", "port": 8000 },
        "resolvedVia": "engines.kb.chroma"
    }
}
```

Three diagnostic fields:
- `mode`: `'unified'` confirms shared mode is active. `'federated'` means the flag did not take effect (or was unset).
- `coordinates`: the actual `{host, port}` the Memory Core's client is targeting. In shared mode this should match the team's Chroma service. `null` indicates a misconfiguration (`chromaUnified=true` but `engines.kb.chroma` not populated).
- `resolvedVia`: `'engines.kb.chroma'` in unified mode, `'engines.chroma'` in federated. Direct pointer to the config key path the resolver consulted.

See [`MemoryCore.md` §Healthcheck Response Shape](./MemoryCore.md) for the full healthcheck payload contract.

The Knowledge Base's healthcheck mirrors the connectivity assertion (collection counts, embedding status). When both servers report `connected: true` against the same shared `{host, port}`, the topology is verified.

## Asynchronous Session Summarization (Disconnect Trigger)

In a shared deployment, multiple agents connect and disconnect dynamically. To ensure session summaries are automatically available to the team without requiring manual API calls or external cron jobs, the Memory Core leverages a **disconnect-triggered summarization** primitive.

When an MCP client (agent) disconnects from the Server-Sent Events (SSE) transport, the `TransportService` intercepts the termination and signals the Memory Core. The server immediately queues a `pending` summarization marker in its `SummarizationJobs` SQLite coordinator table. This behavior is gated by the `autoSummarize` feature flag, making it a conditional feature rather than an unconditional contract.

This allows the heavy LLM summarization process to run asynchronously in the background. Because it relies on the unified `SummarizationJobs` table, it naturally handles concurrent agent disconnects and server clustering without duplicating summaries. Team members can query the Memory Core and instantly access the completed session context once the background job finishes.

## Migration: Per-Developer Local → Shared Team Mode

Teams adopting shared mode from per-developer local should follow this migration path:

1. **Stand up the shared Chroma instance.** Either deploy a managed Chroma service (cloud), or designate a shared internal host. The instance must be reachable from every developer's machine.

2. **Decide on data carry-over.** Two paths:
   - **Fresh start (recommended for MVP):** new shared instance, no historical KB/MC data carried over. Each agent's first session against shared mode rebuilds its local concept of "team context" through normal interaction.
   - **Migrate existing local data:** export per-developer collections via `export_database` (Memory Core MCP tool), reconcile (multiple developers may have summarized the same session), and import into the shared instance via `import_database`. This is operator-intensive and out of MVP scope; document case-by-case if pursued.

3. **Update each developer's config.** Each developer sets `NEO_CHROMA_UNIFIED=true` and points their KB's `engines.kb.chroma.{host, port}` config at the shared instance. The setting can live in the developer's environment or in a shared `.env` template.

4. **Verify via healthcheck.** Each developer runs `healthcheck` against both servers, but the proof shape differs per server:
   - **Memory Core** surfaces the effective topology in its `database.topology` block — expect `mode === 'unified'`, matching `coordinates`, and `resolvedVia === 'engines.kb.chroma'`. This is the canonical topology proof.
   - **Knowledge Base** proves connectivity to the shared Chroma instance and reports collection availability/counts (the KB healthcheck does not surface a topology block; that diagnostic is MC-side per #10127).
   - Cross-server consistency: when both servers report `connected: true` against matching `{host, port}`, the shared topology is verified end-to-end. Connection failures surface as structured `error` fields, not 500s.

5. **First-session smoke test.** Have each developer's agent run a `query_summaries` query against Memory Core — this is the canonical cross-agent **memory visibility** proof. The first agent populates baseline; subsequent agents should see each other's summaries on subsequent queries. Optionally also run an `ask_knowledge_base` query against the Knowledge Base to validate **KB sharing** through the same Chroma instance — it's a separate retrieval surface, not a memory-visibility proof.

6. **Resume validation (when reconnecting agents).** Before an agent reconnects with a previously-used session ID, call `resume_session({session_id})` on Memory Core to verify the session is safe to resume. The tool returns a structured payload: `status: 'resumable'` (with `memoryCount`, `lastActivityAt`, `summarizationStatus`) confirms the agent can keep using that session ID via the `Mcp-Session-Id` header; `SESSION_FINALIZED` (already summarized) or `SESSION_BUSY` (concurrent summarization mid-flight, lease active) signal the agent should start fresh or retry. The validation is read-only — it does not modify server-side session state; the actual session-id binding still happens at the transport layer.

## Validation

Validation tests for the unified topology are tracked separately under [#10008](https://github.com/neomjs/neo/issues/10008) ("Playwright Test Coverage: Unified Monolithic Topology"). That ticket is the canonical validation path for the contract this profile documents — when it closes, the test substrate empirically proves shared-mode KB/MC read/write correctness against a single Chroma process without collection collision.

This documentation profile and the test work are complementary:
- This doc establishes the **contract** operators and agents can rely on.
- [#10008](https://github.com/neomjs/neo/issues/10008) establishes the **executable proof** that the contract holds.

## Federated Mode Disposition (Non-MVP Diagnostic Path)

The earlier "federated cloud" topology — separate Chroma processes for KB and MC, both deployed remotely — is **demoted from first-class product mode to non-default diagnostic coverage** for the MVP. Rationale:

- The shared-team need is **shared institutional memory**, which a federated topology fragments by default (each service owns its own Chroma).
- Operating a federated topology is more complex (two Chroma services to manage) without serving the immediate MVP need.
- The federated code paths (`chromaUnified=false`) remain functional and tested for the per-developer local default; demotion affects the *cloud* federated case specifically.

[#10009](https://github.com/neomjs/neo/issues/10009) ("Playwright Test Coverage: Federated Cloud Topology") is the reference ticket. Recommended disposition: **demote to non-default diagnostic / future cloud-isolation track**, keep the test coverage but flag as non-MVP. The ticket itself can document the demotion decision in a comment; this doc captures the architectural rationale.

## Related

- Parent sub-epic: [#10691](https://github.com/neomjs/neo/issues/10691) — Shared KB/MC Team Deployment MVP
- Parent cloud epic: [#9999](https://github.com/neomjs/neo/issues/9999) — Cloud-Native Knowledge & Multi-Tenant Memory Core
- Topology routing pillar: [#10001](https://github.com/neomjs/neo/issues/10001) (closed), [#10007](https://github.com/neomjs/neo/issues/10007) (closed)
- Topology observability: [#10127](https://github.com/neomjs/neo/issues/10127) (closed) — healthcheck topology block
- Validation: [#10008](https://github.com/neomjs/neo/issues/10008) (open) — unified-mode test coverage
- Demoted: [#10009](https://github.com/neomjs/neo/issues/10009) (open) — federated-mode test coverage, see Federated Mode Disposition above
- Sibling concern: [#10010](https://github.com/neomjs/neo/issues/10010) (open) — Team vs Private Context Retrieval policy layer
- Future direction: [#10011](https://github.com/neomjs/neo/issues/10011) (open) — Native Edge Graph tenant isolation (out of MVP scope)

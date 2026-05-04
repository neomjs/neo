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

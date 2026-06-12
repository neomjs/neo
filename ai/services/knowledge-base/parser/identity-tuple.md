# Path-Identity Tuple

The path-identity tuple `{tenantId, repoSlug, rootKind, sourcePath}` is the cross-tenant chunk-identity contract introduced by Phase 0/1A of Epic [#11624](https://github.com/neomjs/neo/issues/11624) (Cloud-Native KB Ingestion for External Workspaces). It replaces the implicit single-`neoRootDir` source-path assumption baked into Neo's pre-v13 KB substrate (see [`ApiSource.mjs:101-105`](../source/ApiSource.mjs), [`SearchService.mjs:118-120`](../SearchService.mjs)).

## Topology anchor

Per [ADR 0003 — Chroma Topology Unified Only](../../../../learn/agentos/decisions/0003-chroma-topology-unified-only.md): one ChromaDB daemon, two MCP servers (KB + Memory Core), three collections (`knowledge-base`, `neo-agent-memory`, `neo-agent-sessions`). The path-identity tuple lives in `chunk.metadata` for records in the `knowledge-base` collection ONLY. Memory Core's `neo-agent-memory` + `neo-agent-sessions` collections use the existing `userId`/`memorySharing` provenance shape; this tuple does NOT extend cross-collection.

## Tuple semantics

| Field | Type | Meaning |
|---|---|---|
| `tenantId` | string (lowercase kebab; `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$` or single char) | Authoritative tenant identifier. Server-stamped per Phase 0/1C ([#11631](https://github.com/neomjs/neo/issues/11631)) from authenticated AgentIdentity context; client-supplied values are OVERWRITTEN or REJECTED per `aiConfig.knowledgeBase.spoofRejectionMode`. The reserved team-namespace value `'neo-shared'` tags Neo's curated content (visible across tenants via `memorySharing: 'team'` semantics). |
| `repoSlug` | string (non-empty) | Tenant-owned repo identifier within their workspace. Examples: `'client-org/main-app'`, `'internal/docs'`, `'core'` (for a tenant with a single primary repo). Disambiguates same `sourcePath` under different repos for the same tenant. |
| `rootKind` | enum: `neo-workspace`, `bare-repo`, `external-source` | Repository topology hint. `neo-workspace` = `npx neo app`-created workspace where `neo` is a `node_module` dependency. `bare-repo` = plain git repo (any language, may be non-JS). `external-source` = non-VCS source (e.g., live API mirror, generated docs). Hint for hydration mode selection (Phase 2D Q12). |
| `sourcePath` | string (forward-slash normalized, no leading slash) | Path relative to the `repoSlug` root. NOT resolved against KB server's `neoRootDir`. |

## Tenant-aware chunkId derivation

The server-side `chunkId` hash (`chunk.hash` per [`VectorService.mjs:188-194`](../VectorService.mjs)) is derived from the `hashInputs` field-list (parser-controlled) PLUS an implicit prepend of `tenantId` + `repoSlug` (server-controlled). The implicit prepend is what makes "same source content under two tenants" produce distinct ids — no cross-tenant chunk shadow attack.

This is implemented in Phase 0/1B ([#11630](https://github.com/neomjs/neo/issues/11630)) registry extraction work and Phase 0/1C ([#11631](https://github.com/neomjs/neo/issues/11631)) write-side stamping work. Phase 0/1A (this sub) defines the contract; Phase 0/1B + 0/1C implement it.

## Backward-compat for Neo's own content

Neo's curated content (10 default sources: `AdrSource`, `ApiSource`, `ConceptSource`, etc.) is reformulated with:
- `tenantId: 'neo-shared'`
- `repoSlug: 'neo'`
- `rootKind: 'neo-workspace'`
- `sourcePath`: existing `neoRootDir`-relative path

The Phase 0/1B byte-equivalence fixture validates that adding `tenantId` + `repoSlug` + `rootKind` to chunk metadata does NOT perturb the chunk-hash semantics for existing content (the hash-derivation function is backward-compatible for the `'neo-shared'` + `'neo'` constants).

## Hydration

`SearchService` hydration (current single-`neoRootDir` resolution at [`SearchService.mjs:118-120`](../SearchService.mjs)) is tenant-aware after Phase 2D ([#11636](https://github.com/neomjs/neo/issues/11636)) resolves Q12 (chunk-metadata-embedded vs server-mirror vs hybrid). Phase 0/1A defines the tuple shape; Phase 2D picks the hydration mode.

## Out of scope

- `tenantId` enforcement at storage layer (Chroma-layer RLS) — Phase 0/1D ([#11632](https://github.com/neomjs/neo/issues/11632)) ships application-layer enforcement (Q13b Option A); Chroma-layer is V2 if leak class manifests.
- Cross-collection cross-tenant queries (joins between `knowledge-base` and `neo-agent-memory`) — out of scope for v13.
- Per-tenant `repoSlug` namespace conflict resolution (two tenants both claiming `'client-org/main-app'`) — not a real conflict since `tenantId` namespaces `repoSlug`.

## Related

- Parent ticket: [#11629 Phase 0/1A](https://github.com/neomjs/neo/issues/11629)
- Schema: [`parsed-chunk-v1.schema.json`](parsed-chunk-v1.schema.json)
- Companion contract: [`deletion-signaling-contract.md`](deletion-signaling-contract.md)
- ADR 0003 Chroma Topology Unified Only
- Discussion [#11623](https://github.com/neomjs/neo/discussions/11623) §4 Q12 + §6 sweep point 3 + Cycle 2.5/2.6 absorption

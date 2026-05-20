# Cloud-Native KB Ingestion — Security

> **Status — Phase 3A invariant scaffold.** This guide describes the *shipped, invariant* security model of cloud-native KB ingestion (Epic #11624). Parser-execution sandboxing details depend on Phase 2/3 runtime wiring and are framed conceptually only — marked `[Phase 2/3 — pending]`.

## The threat the substrate defends against

A cloud-native KB deployment indexes content from mutually-untrusting tenants in one shared Chroma collection. The security model must guarantee:

1. **No cross-tenant read leakage** — a tenant's `private` content is never returned to another tenant's query.
2. **No identity spoofing on write** — a tenant cannot stamp its chunks with another tenant's `tenantId` to poison or impersonate.
3. **No chunk-ID collision** — byte-identical content ingested by two tenants must not overwrite each other in the index.
4. **No untrusted-code execution escape** — a tenant-supplied Parser must not be able to read or mutate another tenant's substrate.

Invariants 2 and 3 are **shipped** (Phase 0/1C-α, PR #11662). Invariant 1's read-side enforcement is `[Phase 0/1D — pending]` (#11632). Invariant 4's runtime sandbox is `[Phase 2/3 — pending]`; its boundary *policy* is shipped-stable and documented below.

## Write-side tenant stamping (shipped — #11662)

Every chunk entering the index is stamped with a **server-derived** identity tuple before it reaches Chroma. The authoritative tuple is `{tenantId, repoSlug, visibility, originAgentIdentity}`, resolved from the authenticated ingestion context — never from client-supplied chunk metadata.

`VectorService.embed` applies the stamp in `applyTenantStamp` before the content-hash delta and before the Chroma upsert. The invariant: **client-supplied identity fields are not authoritative.** Two policies are configurable via `aiConfig.spoofRejectionMode`:

- `'overwrite'` (default) — a client-supplied `tenantId` / `repoSlug` / `visibility` / `originAgentIdentity` that conflicts with the server-derived value is replaced, and a structured warning is logged.
- `'reject'` — a conflict fails the embedding call with `KB_TENANT_SPOOF_REJECTED` *before* any Chroma read or write.

A cloud-deployment operator running mutually-untrusting tenants should consider `'reject'` — it fails closed and surfaces spoof attempts as hard errors rather than silently-corrected warnings. The ingestion service (`[Phase 2 — pending]`, #11626) should additionally pass the authoritative tenant context *explicitly* rather than relying on the spoof-guard as the primary path; the guard is defense-in-depth, not the front door.

## Tenant-aware chunk IDs (shipped — #11662)

`chunk.hash` remains the content fingerprint. The **Chroma storage ID** is derived from `{tenantId, repoSlug, hash, type, name, source}` — the content fingerprint *bound to* the authoritative tenant tuple. Consequence: two tenants ingesting a byte-identical file produce **distinct** 64-character Chroma IDs and cannot collide. The content-hash itself (`DatabaseService.createContentHash`) also folds `tenantId` + `repoSlug` into its input, so change-detection deltas are tenant-scoped.

## Read-side tenant filter `[Phase 0/1D — pending]`

Write-side stamping puts the `tenantId` / `visibility` fields *into* the index. Read-side enforcement — injecting a `where: {tenantId: {$in: [<requester>, 'neo-shared']}}` clause into every `collection.query()` from the authenticated requester identity — is tracked in #11632 and is **not yet shipped**. Until #11632 lands, the index is *stampable* but not *filtered*: do not run a multi-tenant cloud deployment as security-complete before #11632 merges. The fail-closed test suite that validates "tenant A cannot see tenant B's `private` content" is part of that ticket.

## Parser-execution boundary `[Phase 2/3 — pending]`

A tenant-supplied Parser is untrusted code. The shipped-stable *policy* (the boundary will not change even though the runtime is pending):

- **Server-side parsers** — run in the cloud deployment's process. Permitted only when operator-installed, Neo-shipped, or a signed package. A tenant cannot register a server-side Parser through `aiConfig.customParsers` on a cloud deployment without operator review — the registry API exists, but the cloud-deployment operator gates which Parser classes are present in the process.
- **Client-side parsers** — run in the tenant's own environment, before content is pushed. Anything the tenant wants to run against its own files runs tenant-side; the cloud deployment receives only the resulting `parsed-chunk-v1` records.

The boundary rule: **untrusted parsing happens tenant-side; server-side parser execution is operator-gated.** The runtime sandbox that enforces this for any future in-process tenant-parser case (WASM / tree-sitter isolation) is out of scope until the feature exists — a separate Discussion graduates it when needed.

## KB-as-cache vs MC-as-store — the recovery model

A security guide must be honest about data-loss blast radius. The two AI substrates have **structurally different** recovery properties:

- **The Knowledge Base is a cache + index over external sources.** Neo's curated KB content regenerates from the Neo repo (`npm run ai:sync-kb`). A cloud tenant's content regenerates from the tenant's own repo via re-push. **A KB wipe is always recoverable** — worst case is orchestrating N tenant re-syncs. The operational cost scales with tenant count; the data-loss risk does not.
- **The Memory Core is a primary store.** Conversations, agent-thoughts, session-summaries are unique runtime artifacts with no external source-of-truth. **An MC wipe between backups is amnesia** — the daily backup daemon minimizes the window but cannot eliminate it.

This asymmetry drives retention policy (see Phase 4 #11628): KB backup is cost-optimization for re-sync orchestration; MC backup is genuine data-loss prevention. A security incident response treats a KB-wipe alert as "orchestrate re-syncs" and an MC-wipe alert as "amnesia event — recover from last backup." Per-substrate alert severity follows from this distinction.

## Auth flow `[Phase 2 — pending]`

The authenticated-ingestion-context resolution — how a tenant's push is authenticated and mapped to its `tenantId` / `originAgentIdentity` — depends on the Phase 2 ingestion service + the v12.1 OIDC substrate. The invariant that holds regardless of the transport: **the tenant tuple is server-derived from the authenticated identity, never trusted from the payload.** The endpoint-exact auth handshake is documented when Phase 2 lands.

## Related

- [Overview](./Overview.md) — the contract split + topology anchor.
- [Migration Path](./MigrationPath.md) — zero-config upgrade for existing deployments.
- [ADR 0003](../decisions/0003-chroma-topology-unified-only.md) — unified Chroma topology.
- Phase 4 #11628 — retention + observability; the per-substrate retention asymmetry follows from the cache-vs-store model above.

# Cloud-Native KB Ingestion — Security

> **Status — Phase 3B operational security model.** This guide describes the security model of cloud-native KB ingestion (Epic #11624): server-derived tenant identity, tenant-aware chunk IDs, read-side filtering, and the parser-execution boundary.

## The threat the substrate defends against

A cloud-native KB deployment indexes content from mutually-untrusting tenants in one shared Chroma collection. The security model must guarantee:

1. **No cross-tenant read leakage** — a tenant's `private` content is never returned to another tenant's query.
2. **No identity spoofing on write** — a tenant cannot stamp its chunks with another tenant's `tenantId` to poison or impersonate.
3. **No chunk-ID collision** — byte-identical content ingested by two tenants must not overwrite each other in the index.
4. **No untrusted-code execution escape** — a tenant-supplied Parser must not be able to read or mutate another tenant's substrate.

Invariants 1, 2, and 3 are implemented by the Phase 0/1 read/write isolation work (#11632 and PR #11662). Invariant 4's boundary policy is stable and documented below; a runtime sandbox for future in-process untrusted parsers remains separate future work if that feature is introduced.

## Write-side tenant stamping

Every chunk entering the index is stamped with a **server-derived** identity tuple before it reaches Chroma. The authoritative tuple is `{tenantId, repoSlug, visibility, originAgentIdentity}`, resolved from the authenticated ingestion context — never from client-supplied chunk metadata.

`VectorService.embed` applies the stamp in `applyTenantStamp` before the content-hash delta and before the Chroma upsert. The invariant: **client-supplied identity fields are not authoritative.** Two policies are configurable via `aiConfig.spoofRejectionMode`:

- `'overwrite'` (default) — a client-supplied `tenantId` / `repoSlug` / `visibility` / `originAgentIdentity` that conflicts with the server-derived value is replaced, and a structured warning is logged.
- `'reject'` — a conflict fails the embedding call with `KB_TENANT_SPOOF_REJECTED` *before* any Chroma read or write.

A cloud-deployment operator running mutually-untrusting tenants should consider `'reject'` — it fails closed and surfaces spoof attempts as hard errors rather than silently-corrected warnings. The ingestion service (#11626) passes the authoritative tenant context explicitly; the spoof guard remains defense-in-depth, not the front door.

## Tenant-aware chunk IDs

`chunk.hash` remains the content fingerprint. The **Chroma storage ID** is derived from `{tenantId, repoSlug, hash, type, name, source}` — the content fingerprint *bound to* the authoritative tenant tuple. Consequence: two tenants ingesting a byte-identical file produce **distinct** 64-character Chroma IDs and cannot collide. The content-hash itself (`DatabaseService.createContentHash`) also folds `tenantId` + `repoSlug` into its input, so change-detection deltas are tenant-scoped.

## Read-side tenant filter

Write-side stamping puts the `tenantId` / `visibility` fields *into* the index. Read-side enforcement injects tenant-aware Chroma `where` clauses into query paths from the authenticated requester identity. A tenant can see its own content plus `neo-shared`; another tenant's `private` content is filtered out. The fail-closed test suite for "tenant A cannot see tenant B's private content" is part of #11632.

## Parser-execution boundary

A tenant-supplied Parser is untrusted code. The stable *policy* (the boundary will not change even though the runtime is pending):

- **Server-side parsers** — run in the cloud deployment's process. Permitted only when operator-installed, Neo-shipped, or a signed package. A tenant cannot register a server-side Parser through `aiConfig.customParsers` on a cloud deployment without operator review — the registry API exists, but the cloud-deployment operator gates which Parser classes are present in the process.
- **Client-side parsers** — run in the tenant's own environment, before content is pushed. Anything the tenant wants to run against its own files runs tenant-side; the cloud deployment receives only the resulting `parsed-chunk-v1` records.

The boundary rule: **untrusted parsing happens tenant-side; server-side parser execution is operator-gated.** The runtime sandbox that enforces this for any future in-process tenant-parser case (WASM / tree-sitter isolation) is out of scope until the feature exists — a separate Discussion graduates it when needed.

## KB-as-cache vs MC-as-store — the recovery model

A security guide must be honest about data-loss blast radius. The two AI substrates have **structurally different** recovery properties:

- **The Knowledge Base is a cache + index over external sources.** Neo's curated KB content regenerates from the Neo repo (`npm run ai:sync-kb`). A cloud tenant's content regenerates from the tenant's own repo via re-push. **A KB wipe is always recoverable** — worst case is orchestrating N tenant re-syncs. The operational cost scales with tenant count; the data-loss risk does not.
- **The Memory Core is a primary store.** Conversations, agent-thoughts, session-summaries are unique runtime artifacts with no external source-of-truth. **An MC wipe between backups is amnesia** — the daily backup daemon minimizes the window but cannot eliminate it.

This asymmetry drives retention policy (see Phase 4 #11628): KB backup is cost-optimization for re-sync orchestration; MC backup is genuine data-loss prevention. A security incident response treats a KB-wipe alert as "orchestrate re-syncs" and an MC-wipe alert as "amnesia event — recover from last backup." Per-substrate alert severity follows from this distinction.

## Auth flow and tenant context

The authenticated-ingestion-context resolution maps a tenant's push to its `tenantId` / `originAgentIdentity` before the ingestion service reaches Chroma. The invariant that holds regardless of the transport: **the tenant tuple is server-derived from the authenticated identity, never trusted from the payload.** Endpoint-exact auth wiring depends on the deployment's proxy/OIDC mode; see [Deployment Cookbook](../DeploymentCookbook.md) for the MCP deployment boundary and [Hook Wiring](./HookWiring.md) for ingestion facades.

## Post-MVP hardening review (#11736)

The #11720 MVP proves the deployable baseline: separate MCP containers, unified
Chroma, cloud-safe orchestrator lanes, reference ingress, trusted proxy identity
stripping, and MCP healthcheck readiness. The broader hardening pass below is
post-MVP by design; it records which findings are already covered by the guide
tree and which remain deferred to tracked residual work.

| Hardening area | Current documented baseline | Disposition |
|---|---|---|
| Reverse proxy identity boundary | `ai/deploy/Caddyfile` strips spoofable identity headers before optional auth injection, and [Deployment Cookbook](../DeploymentCookbook.md) Section 4 names the same invariant. | Actioned for the reference ingress. Production deployments must enable an OIDC/proxy-auth layer or direct OIDC before serving mutually-untrusting tenants. |
| Repo-push automation token | [Tenant Ingestion Model](./TenantIngestionModel.md) and [Hook Wiring](./HookWiring.md) define `NEO_KB_INGEST_TOKEN` as a tenant-scoped MCP authorization credential, never a Git credential and never part of `repoSlug`, logs, manifests, or graph-visible config. | Actioned for the push-based MVP path. Server-side Git credential transport remains deferred to [#11731](https://github.com/neomjs/neo/issues/11731). |
| Secret storage | The guide tree consistently routes tokens through tenant hook/CI secret stores and deployment auth/provider config, not committed files. | Actioned at runbook level. Platform-specific secret-manager/KMS wiring belongs to downstream deployment-pipeline work ([#11733](https://github.com/neomjs/neo/issues/11733)) once a concrete platform is selected. |
| Network policy | The reference compose profile keeps KB and MC internal behind Caddy (`expose`, public path routing through `/kb/*` and `/mc/*`). | Actioned for compose. Kubernetes network policies, managed ingress rules, and service-mesh variants are deferred platform work, tracked under [#11733](https://github.com/neomjs/neo/issues/11733) if adopted. |
| Container image hardening | The MVP compose baseline provides per-service resource envelopes and readiness gates. | Deferred. Non-root users, read-only root filesystems, image signing, SBOMs, and vulnerability scanning are production-platform controls, not required for the MVP reference compose. File a focused follow-up when the target registry/runtime is chosen. |
| Data recovery severity | This guide documents KB-as-cache vs MC-as-store, and the cookbook requires a durable backup volume or object-store target for backup bundles. | Actioned conceptually. Managed SQL/object-storage hardening and retention tuning belong to [#11732](https://github.com/neomjs/neo/issues/11732) / Phase 4 retention work when the deployment leaves the single-node MVP shape. |
| Parser execution | Server-side parser execution is operator-gated; untrusted tenant parser logic runs tenant-side and submits `parsed-chunk-v1`. | Actioned as policy. Runtime sandboxing for future in-process untrusted parsers is explicitly out of scope until such a feature graduates. |

This scoped pass realigns the stale #11720 owner-map wording in the deployment
cookbook and records the broader hardening review here. Future guide drift
should be handled as focused follow-ups rather than silent expansion inside this
ticket.

## Related

- [Overview](./Overview.md) — the contract split + topology anchor.
- [Migration Path](./MigrationPath.md) — zero-config upgrade for existing deployments.
- [ADR 0017](../decisions/0017-chroma-single-flat-unified-store.md) — one flat `unified` Chroma store, identical local + cloud (amends [ADR 0003](../decisions/0003-chroma-topology-unified-only.md)).
- Phase 4 #11628 — retention + observability; the per-substrate retention asymmetry follows from the cache-vs-store model above.

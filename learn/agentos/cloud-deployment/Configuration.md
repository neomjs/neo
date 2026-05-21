# Cloud-Native KB Ingestion — Configuration

> **Status — Phase 3B.** This guide documents the configuration surface a cloud deployment uses to control Knowledge Base ingestion — the deployment-wide `aiConfig` keys (Phase 0/1) and the per-tenant `KnowledgeBaseTenantConfig` graph-node storage (Phase 2E, [#11637](https://github.com/neomjs/neo/issues/11637)). It fulfils the `[Phase 3B — pending]` Configuration placeholder noted in [Migration Path](./MigrationPath.md).

## Two configuration layers

Cloud KB ingestion is configured at two layers:

| Layer | Scope | Storage | Lifecycle |
|---|---|---|---|
| **`aiConfig`** — deployment config | One KB server process | [`ai/mcp/server/knowledge-base/config.mjs`](../../../ai/mcp/server/knowledge-base/config.mjs) — gitignored, cloned from `config.template.mjs` | Loaded once at boot; a harness restart picks up changes |
| **`KnowledgeBaseTenantConfig`** — per-tenant config | One tenant | A graph node in the Native Edge Graph (`memory-core-graph.sqlite`) | Mutated at runtime via `setTenantConfig`; versioned |

`aiConfig` carries the deployment's defaults — the single-tenant case is fully described by it. `KnowledgeBaseTenantConfig` is the multi-tenant layer: each tenant's source/parser config stored durably, per-tenant, versioned.

## The deployment config — `aiConfig`

A deployment's `config.mjs` is gitignored and copied from `config.template.mjs`. A zero-config deployment edits nothing — every key carries a default matching the pre-substrate single-repo behaviour. The cloud-ingestion-relevant keys:

### Source / parser registry

| Key | Default | Meaning |
|---|---|---|
| `useDefaultSources` | `true` | Auto-register Neo's 10 curated Source classes. A deployment ingesting only tenant content sets `false`. |
| `useDefaultParsers` | `true` | Auto-register Neo's built-in Parser classes (`SourceParser`, `DocumentationParser`, `TestParser`). |
| `customSources` | `[]` | Declarative tenant Source registration — `[{SourceClass, sourceName?}]`. See [Custom Sources](./CustomSources.md). |
| `customParsers` | `[]` | Declarative tenant Parser registration — `[{ParserClass, parserId?}]`. See [Custom Parsers](./CustomParsers.md). |
| `sourcePaths` | Neo's layout map | Per-source path overrides keyed by Source-class registry name. Each Source class interprets its own entry shape (string / string-array / object); a tenant whose layout differs overrides only the keys it needs, the rest fall through to the Neo defaults. |

### Tenant identity + write-side policy

| Key | Default | Meaning |
|---|---|---|
| `defaultTenantId` | `'neo-shared'` | The tenant id stamped on chunks ingested without an authenticated context — the team namespace visible to every tenant. |
| `defaultRepoSlug` | `'neo'` | Default repo slug; folded into content hashing + Chroma IDs so cross-tenant byte-identical chunks never collide. |
| `defaultVisibility` | `'team'` | Default read visibility for embedded chunks. |
| `spoofRejectionMode` | `'overwrite'` | Policy for conflicting client-supplied tenant metadata. `'overwrite'` logs + replaces with server-derived values; `'reject'` fails the call with `KB_TENANT_SPOOF_REJECTED`. A multi-tenant cloud deployment should consider `'reject'` (fail-closed) — see [Security](./Security.md). |
| `mcpSyncMaxChunks` | `50` | The [#10572](https://github.com/neomjs/neo/issues/10572) work-volume gate threshold — an MCP-callable sync/ingest batch over this count is refused (the bulk CLI bypasses it). See [Hook Wiring](./HookWiring.md). |

### Transport + auth (cloud / SSE)

| Key | Default | Meaning |
|---|---|---|
| `transport` | `'stdio'` | `'stdio'` (local single-repo) or `'sse'` (StreamableHTTP — a cloud deployment serving remote tenants). |
| `mcpHttpPort` | `3000` | The port the SSE transport listens on (only when `transport === 'sse'`). |
| `publicUrl` | `null` | Canonical public URL — required behind a reverse proxy for OAuth 2.1 / OIDC audience claims + SSE callback advertising. |
| `auth` | OIDC block | OAuth 2.1 / OIDC config (`host`, `port`, `realm`, `issuerUrl`, `clientId`, `clientSecret`, `trustProxyIdentity`) — used only when `transport === 'sse'`. |

Each key is also bindable via an environment variable (`NEO_KB_DEFAULT_TENANT_ID`, `NEO_TRANSPORT`, `MCP_HTTP_PORT`, …) — see `config.template.mjs`'s `envBindings` map for the full set.

## Per-tenant config storage — `KnowledgeBaseTenantConfig` (#11637)

A multi-tenant deployment cannot express every tenant's source/parser config as static `aiConfig` keys — each tenant needs its own, mutable at runtime, durable across restarts. Phase 2E ([#11637](https://github.com/neomjs/neo/issues/11637)) stores it as a graph node.

**The node.** One `KnowledgeBaseTenantConfig` node per tenant, id `kb-config:<tenantId>`, in the Native Edge Graph. Its `properties` carry the tenant's config payload — `{useDefaultSources, useDefaultParsers, customSources, customParsers, sourcePaths, version, userId}`. `version` increments on every mutation; `userId` is the [#10011](https://github.com/neomjs/neo/issues/10011) RLS ownership stamp — a tenant cannot read or mutate another tenant's config node.

**Resolution.** `KnowledgeBaseIngestionService.getTenantConfig({tenantId})` resolves a tenant's effective config through three tiers, first hit wins:

1. The `kb-config:<tenantId>` graph node — the canonical, runtime-mutable state.
2. `kb-config.yaml` — a deployment-root bootstrap file (below).
3. The deployment's default registry (`aiConfig`) — always resolves.

**Mutation.** `KnowledgeBaseIngestionService.setTenantConfig({tenantId, config})` upserts the node, incrementing `version`. It is RLS-gated: a cross-tenant write is rejected with `KB_INGEST_TENANT_MISMATCH`.

**Bootstrap — `kb-config.yaml`.** A deployment seeds initial per-tenant config with a `kb-config.yaml` at `<neoRootDir>/kb-config.yaml`:

```yaml
tenants:
  client-org:
    useDefaultSources: false
    customParsers: [...]
    sourcePaths: {...}
```

The YAML is bootstrap-only — the graph node is canonical once written. A malformed or absent file is fail-soft (logged, treated as absent → tier 3).

**Config versioning.** Every ingested chunk is stamped with the `tenantConfigVersion` active at ingest time (server-stamped chunk metadata). A tier-3 (default-registry) resolution stamps `tenantConfigVersion: 0`. The stamp lets a future config change drive retroactive invalidation of chunks ingested under a now-stale config.

## Zero-config inheritance

The default-resolved tier means a single-repo deployment needs no tenant config at all: `getTenantConfig` falls through to tier 3 (`aiConfig`), which carries Neo's defaults. Divergence is opt-in and granular — a tenant overrides only the keys its topology requires. See [Migration Path](./MigrationPath.md) for the full zero-config upgrade story.

## Related

- [Overview](./Overview.md) — the contract split + default-source inheritance.
- [Custom Sources](./CustomSources.md) / [Custom Parsers](./CustomParsers.md) — authoring the classes `customSources` / `customParsers` register.
- [Hook Wiring](./HookWiring.md) — `mcpSyncMaxChunks` and the ingestion facades.
- [Security](./Security.md) — `spoofRejectionMode` and the fail-closed posture.
- [Migration Path](./MigrationPath.md) — zero-config upgrade for existing deployments.
- [#11637](https://github.com/neomjs/neo/issues/11637) Phase 2E tenant config storage · [#11658](https://github.com/neomjs/neo/issues/11658) Phase 0/1B registry · [#10572](https://github.com/neomjs/neo/issues/10572) work-volume gate.

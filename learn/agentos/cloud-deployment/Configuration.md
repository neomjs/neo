# Cloud-Native KB Ingestion — Configuration

> **Status — Phase 3B.** This guide documents the configuration surface a cloud deployment uses to control Knowledge Base ingestion — the deployment-wide `aiConfig` keys (Phase 0/1) and the per-tenant `KnowledgeBaseTenantConfig` graph-node storage (Phase 2E, [#11637](https://github.com/neomjs/neo/issues/11637)).

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
| `rawRepoSource` | `false` | Explicitly registers `RawRepoSource`, a raw-text fallback that walks one configured repository root for tenants whose repo shape is unknown. |
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
| `auth.mode` | `'oidc'` | Server-side bearer strategy for HTTP/SSE: `'oidc'` uses OIDC introspection + audience enforcement; `'gitlab-pat'` validates a GitLab OAuth token or PAT against `/api/v4/user` and returns a bare bearer challenge on failure. |
| `auth.issuerUrl` / `auth.host` / `auth.realm` | `null` / `null` / `'master'` | OIDC authority inputs for the default server mode. `issuerUrl` is preferred when the provider publishes discovery metadata directly. |
| `auth.clientId` / `auth.clientSecret` | `null` / `''` | OIDC introspection client credentials for deployments that require them. |
| `auth.trustProxyIdentity` | `false` | Accept identity from a trusted reverse-proxy header after the ingress strips spoofable client-supplied headers. |
| `auth.gitlabApiBaseUrl` | `'https://gitlab.com'` | GitLab API root used only by `auth.mode === 'gitlab-pat'`; set to a self-managed GitLab host when needed. |
| `auth.allowedClientIds` / `auth.allowedUsers` | `[]` / `[]` | Optional hardening gates for GitLab bearer mode. Empty means any token that resolves to a valid GitLab user is accepted. |

Compose healthchecks use `ai/scripts/diagnostics/mcpHealthcheck.mjs` against the
same `/mcp` route as external callers. When a deployment sets
`NEO_AUTH_MODE=gitlab-pat`, also set `NEO_MCP_HEALTHCHECK_TOKEN` (or
`NEO_MCP_HEALTHCHECK_TOKEN_ENV`) to a GitLab bearer with `read_user`; otherwise
the server can answer correctly while Compose keeps it unhealthy.

Each key is also bindable via an environment variable (`NEO_KB_DEFAULT_TENANT_ID`, `NEO_TRANSPORT`, `MCP_HTTP_PORT`, …) — see `config.template.mjs`'s `envBindings` map for the full set.

## Tenant push-client environment

`npm run ai:kb-push-client` runs in the tenant workspace or CI job, not inside the KB server process. It therefore has its own small environment surface:

| Variable | Required | Meaning |
|---|---|---|
| `NEO_KB_MCP_URL` | Yes unless `--url` is passed | Remote KB MCP endpoint URL, for example `https://agent-os.example.com/kb/mcp`. |
| `NEO_KB_MCP_TRANSPORT` | No | MCP client transport; defaults to `streamable-http`, accepts `sse` for older endpoint wiring. |
| `NEO_KB_INGEST_TOKEN` | Yes for production | Bearer token for the repo-push automation identity. In OIDC mode it is an access token whose audience matches the KB public URL; in GitLab bearer mode it is a GitLab OAuth access token or PAT accepted by `/api/v4/user`. |
| `NEO_KB_TOKEN_ENV` | No | Name of the environment variable that holds the bearer token when the deployment does not use `NEO_KB_INGEST_TOKEN`. |
| `NEO_KB_TENANT_ID` | No | Envelope default for tenant id; authenticated server context remains authoritative. |
| `NEO_KB_REPO_SLUG` | No | Envelope default for repo slug; use a deterministic, secret-free value such as `neomjs/create-app`. |

The token is a KB MCP authorization credential, not a Git credential. Store it
in the tenant hook/CI secret store and rotate it using the deployment's normal
OIDC, GitLab OAuth, or PAT-rotation policy.

## Per-tenant config storage — `KnowledgeBaseTenantConfig` (#11637)

A multi-tenant deployment cannot express every tenant's source/parser config as static `aiConfig` keys — each tenant needs its own, mutable at runtime, durable across restarts. Phase 2E ([#11637](https://github.com/neomjs/neo/issues/11637)) stores it as a graph node.

**The node.** One `KnowledgeBaseTenantConfig` node per tenant, id `kb-config:<tenantId>`, in the Native Edge Graph. Its `properties` carry the tenant's config payload — `{useDefaultSources, rawRepoSource, useDefaultParsers, customSources, customParsers, sourcePaths, tenantRepos, version, userId}`. `version` increments on every mutation; `userId` is the [#10011](https://github.com/neomjs/neo/issues/10011) RLS ownership stamp — a tenant cannot read or mutate another tenant's config node.

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
    rawRepoSource: true
    customParsers: [...]
    sourcePaths: {...}
    tenantRepos:
      - cloneUrl: https://github.com/neomjs/create-app.git  # clean URL; no userinfo@
        credentialRef: env:GIT_TOKEN                          # reference-only pointer; token lives outside the repo
        branchRef: dev                                        # optional; defaults to 'HEAD' = remote default branch
```

The `tenantRepos:` block is the bootstrap tier for the pull-mode polling config — `listConfiguredTenantRepos()` resolves it under the graph node → `kb-config.yaml` → `aiConfig` tiering. Graph-only tenant config nodes are included through the graph service's RLS-aware tenant-config enumeration surface; an unreadable graph tier degrades deployment diagnostics instead of silently behaving like an empty pull-mode config.

The YAML is bootstrap-only — the graph node is canonical once written. A malformed or absent file is fail-soft (logged, treated as absent → tier 3).

**Config versioning.** Every ingested chunk is stamped with the `tenantConfigVersion` active at ingest time (server-stamped chunk metadata). A tier-3 (default-registry) resolution stamps `tenantConfigVersion: 0`. The stamp lets a future config change drive retroactive invalidation of chunks ingested under a now-stale config.

## Zero-config inheritance

The default-resolved tier means a single-repo deployment needs no tenant config at all: `getTenantConfig` falls through to tier 3 (`aiConfig`), which carries Neo's defaults. Divergence is opt-in and granular — a tenant overrides only the keys its topology requires. See [Migration Path](./MigrationPath.md) for the full zero-config upgrade story.

## Model-provider runtime + orchestrator-readiness

Beyond KB ingestion, a cloud deployment chooses where model calls run. External
provider endpoints remain the default operational posture; the optional
`local-model` compose profile is a self-hosted OpenAI-compatible provider that
operators opt into explicitly.

### Provider selection

| Variable | Default | Meaning |
|---|---|---|
| `NEO_MODEL_PROVIDER` | `openAiCompatible` | Chat / summary / dream provider selector for Memory Core and the Orchestrator. Set `gemini` for the cloud API route. |
| `NEO_EMBEDDING_PROVIDER` | `openAiCompatible` | Embedding provider selector for Knowledge Base and Memory Core. Set `gemini` for cloud embeddings. |
| `NEO_OPENAI_COMPATIBLE_HOST` | deployment-specific | Base URL for a local or hosted OpenAI-compatible endpoint, for example `http://local-model:11434` when the compose profile is enabled. |
| `NEO_OPENAI_COMPATIBLE_MODEL` | deployment-specific | Chat model id already resident or pullable on the selected OpenAI-compatible provider. |
| `NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL` | deployment-specific | Embedding model id for the same provider; local deployments must keep chat + embedding roles available together. |
| `NEO_OPENAI_COMPATIBLE_API_KEY` | optional | Bearer token for OpenAI-compatible providers that require one; normally empty for the internal `local-model` service. |

The request behaviour and orchestrator-readiness probe below carry
resident-friendly defaults — when a local provider profile is selected, Neo keeps
the configured chat and embedding roles warm across REM/Sandman cycles and
probes patiently on cold start.

### Provider request `keep_alive`

| Variable | Default | Meaning |
|---|---|---|
| `NEO_OLLAMA_KEEP_ALIVE` | `-1` (resident) | Per-request `keep_alive` value Neo sends on every Ollama generation/stream call. `-1` keeps the model resident across cycles; a duration string (e.g. `5m`) or `0` (unload after request) overrides it. |
| `NEO_OPENAI_COMPATIBLE_KEEP_ALIVE` | `-1` (resident) | Per-request `keep_alive` field for OpenAI-compatible servers that honour the Ollama extension (e.g. LM Studio, Ollama's `/v1/...` surface). Same `-1` / duration / `0` semantics. |

**Native server var vs Neo per-request override.** A self-hosted Ollama server also reads a *native* `OLLAMA_KEEP_ALIVE` env var that controls the server's default cache retention for requests arriving *without* a per-request `keep_alive`. These are distinct surfaces, and the interaction matters:

- Native `OLLAMA_KEEP_ALIVE` is the server default for requests that omit `keep_alive`.
- Neo's `NEO_OLLAMA_KEEP_ALIVE` (default `-1`) is sent on *every* Neo-issued request and **overrides** the server default for that request.
- So with Neo's `-1` default, the model stays resident regardless of the native `OLLAMA_KEEP_ALIVE` value.
- An operator who shortens native `OLLAMA_KEEP_ALIVE` to reclaim host memory must **also** set `NEO_OLLAMA_KEEP_ALIVE` to a matching shorter window — otherwise Neo's per-request `-1` keeps the model pinned and the native shortening has no effect on Neo traffic.

### Orchestrator provider-readiness probe

Before the orchestrator runs a model-dependent task (e.g. the REM/Sandman dream cycle), it probes the configured provider until the provider answers or the retry budget is exhausted. Tuning is useful on cold-start-slow or capacity-constrained hosts.

| Variable | Default | Meaning |
|---|---|---|
| `NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS` | `30` | Maximum readiness-probe attempts before the orchestrator gives up on the provider for that cycle. |
| `NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS` | `1000` | Wait between probe attempts (ms). |
| `NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS` | `3000` | Per-probe HTTP timeout (ms). |

These three are orchestrator-config-scoped (`ai/config.template.mjs` `orchestrator.providerReadiness`) and are not read by the MCP server processes, so — unlike the two `keep_alive` vars above — they are scoped to the orchestrator, not the MCP server env surface.

For llama.cpp deployments, keep the provider selector as `openAiCompatible` and
follow the dedicated [llama.cpp profile](./LlamaCppProfile.md). It documents the
extra operator proof required before handoff: `/v1/models` must expose both the
configured chat and embedding model ids, both role routes must pass, and the
deployment must not depend on switching hosts or rebuilding model context
between role calls.

## Related

- [Overview](./Overview.md) — the contract split + default-source inheritance.
- [llama.cpp Profile](./LlamaCppProfile.md) — OpenAI-compatible llama.cpp provider profile and dual-residency smoke.
- [Custom Sources](./CustomSources.md) / [Custom Parsers](./CustomParsers.md) — authoring the classes `customSources` / `customParsers` register.
- [Hook Wiring](./HookWiring.md) — `mcpSyncMaxChunks` and the ingestion facades.
- [Security](./Security.md) — `spoofRejectionMode` and the fail-closed posture.
- [Migration Path](./MigrationPath.md) — zero-config upgrade for existing deployments.
- [#11637](https://github.com/neomjs/neo/issues/11637) Phase 2E tenant config storage · [#11658](https://github.com/neomjs/neo/issues/11658) Phase 0/1B registry · [#10572](https://github.com/neomjs/neo/issues/10572) work-volume gate.

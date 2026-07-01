# Knowledge Base MCP API

This reference documents the current Knowledge Base MCP surface. The conceptual
guide lives in [Knowledge Base](../KnowledgeBase.md); this page keeps the tool
catalog, sync routes, and config boundaries precise.

## Source Of Truth

The MCP tool contract is generated from
`ai/mcp/server/knowledge-base/openapi.yaml`. The OpenAPI document defines
operation ids, request schemas, response schemas, read/admin tiers, and tool
handbook metadata.

The server name is `neo-knowledge-base`. Its Chroma collection is
`neo-knowledge-base`.

## Read Tools

| Tool | Use |
| :--- | :--- |
| `healthcheck` | Verify Knowledge Base dependencies and readiness. |
| `get_mcp_tool_handbook` | Inspect the handbook entry for one operation id. |
| `query_documents` | Return ranked source references for a semantic query. |
| `ask_knowledge_base` | Retrieve relevant documents and synthesize an answer with citations. |
| `get_class_hierarchy` | Read the generated inheritance map for class navigation. |
| `list_documents` | Inspect indexed documents with pagination. |
| `get_document_by_id` | Retrieve one indexed document chunk by id. |

Use `ask_knowledge_base` for synthesized "how/why" questions. Use
`query_documents` when you need raw source paths and will inspect the files
yourself. Use `get_class_hierarchy` when inheritance determines the real
implementation surface.

## Extended Introspection

| Tool | Use |
| :--- | :--- |
| `get_ingestion_progress` | Inspect active or most recent ingestion progress. |
| `get_deployment_state_snapshot` | Read the bounded deployment-state bridge snapshot. |
| `inspect_deployment` | Inspect allowlisted cloud deployment state, bounded logs, diagnoses, and recovery ledger entries. |
| `list_agent_faqs` | List indexed agent-facing FAQ entries. |

The deployment tools expose read-only bridge data. They do not expose Docker,
shell, restart, or daemon control routes.

Deployment snapshots include a bounded `tenantRepoSync` section for pull-mode
cloud ingestion. Use it when a KB is healthy but empty and tenant repositories
are expected: it reports the orchestrator enablement gate, scheduler cadence,
task state, effective repo-config counts/tiers, redacted per-repo due state, and
stable failure reason codes without exposing clone URLs, credentials, or raw
logs.

`inspect_deployment` and `get_deployment_state_snapshot` include a
`bridgeDiagnostics` envelope when the orchestrator's deployment-state bridge
can explain its own observation layer. That envelope reports non-secret
runtime-access config such as the runtime mechanism, whether runtime access is
enabled, the configured Compose project, allowlisted service keys, read
operations, the bridge's effective service keys, and whether bounded logs are
included. Per-service lookup failures also carry stable `reason` values and the
Compose label filter used for the lookup, for example
`compose-service-no-match` with
`com.docker.compose.service=<service>`. This is diagnosis only: callers still
receive no Docker socket, shell, restart, or arbitrary container enumeration.

## Admin Tools

| Tool | Use |
| :--- | :--- |
| `manage_knowledge_base` | Run `sync`, `create`, `embed`, or guarded `delete` for local KB data. |
| `ingest_source_files` | Ingest tenant-provided parsed chunks or raw source files. |

`manage_knowledge_base(action: "sync")` runs the local create + embed path. It
has a synchronous volume gate: when the post-delta diff is larger than
`mcpSyncMaxChunks`, use `npm run ai:sync-kb` for bulk re-embedding.

`ingest_source_files` is the cloud-facing push route. It validates tenant and
repo context, accepts parsed chunks or raw source, applies server-owned tenant
stamps, records deletion signals, and writes progress diagnostics.

## Storage Boundary

Knowledge Base and Memory Core share one Chroma daemon and one unified persist
directory from `AiConfig.engines.chroma`. The local default persist path is the
unified Chroma directory under `.neo-ai-data/chroma/unified`; cloud deployments
mount the same shape in the container volume.

Separation happens by collection:

| Collection | Purpose |
| :--- | :--- |
| `neo-knowledge-base` | Codebase, docs, tickets, releases, and source-derived knowledge. |
| `neo-agent-memory` | Raw Memory Core interactions. |
| `neo-agent-sessions` | Memory Core session summaries. |

The Knowledge Base collection uses a dummy embedding function because vectors
are supplied explicitly by Neo's embedding service before Chroma upsert.

## Embedding Providers

The Knowledge Base uses `TextEmbeddingService` with the resolved
`embeddingProvider` setting. That setting is the same provider selector used by
Memory Core.

| Provider | Role |
| :--- | :--- |
| `openAiCompatible` | Local-by-default template provider, using the configured OpenAI-compatible endpoint and embedding model. |
| `ollama` | Local provider option using the configured Ollama embedding model. |
| `gemini` | Remote provider option; this is the case that needs `GEMINI_API_KEY`. |

Do not document the Knowledge Base as tied to one remote provider. Local
providers serve embeddings from their own host; `GEMINI_API_KEY` is not a general KB
requirement.

## Embedding Budget Guardrails

Local embedding providers have an input-size guardrail before provider
invocation:

- `VectorService` estimates each final embedding input, splits recoverable
  oversized chunks, and skips chunks that remain over the safe processing band.
- `IngestionService` repeats the precheck for tenant ingestion so callers get a
  durable diagnostic even when the offending source cannot be written as a graph
  row.
- Oversized skips record bounded metadata such as tenant, repo, source path,
  provider, model, input size, and safe limit. Raw source content is not emitted.

This turns embedding overflow into inspectable substrate friction instead of an
unbounded provider failure.

## Common Operations

### Ask A Grounded Question

```json
{
  "query": "How does ViewModel binding propagate updates?",
  "type": "src",
  "limit": 5
}
```

Call `ask_knowledge_base` when you want a concise answer with citations.

### Retrieve Raw References

```json
{
  "query": "grid keyboard navigation",
  "type": "all",
  "limit": 10
}
```

Call `query_documents` when the next step is reading the returned files directly.

### Sync Local Changes

For small deltas:

```json
{
  "action": "sync"
}
```

For large deltas, use the bulk script named by the volume gate:

```bash readonly
npm run ai:sync-kb
```

## Related Guides

- [Knowledge Base](../KnowledgeBase.md)
- [Knowledge Base Enhancement Strategy](../KnowledgeBaseEnhancement.md)
- [Tenant Ingestion Model](../cloud-deployment/TenantIngestionModel.md)
- [Deployment Configuration](../cloud-deployment/Configuration.md)

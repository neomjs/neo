# Config Substrate Dead-Config Audit

This audit satisfies [#10825](https://github.com/neomjs/neo/issues/10825), the Phase 1 AC4 cleanup ticket for [#10822](https://github.com/neomjs/neo/issues/10822).

## Scope

The scan covers config keys, public package scripts, build-script documentation, and Memory Core / Knowledge Base consumers on `dev` after the Phase 1.5 config refactor landed.

Commands:

```bash
rg -n "ai:migrate-memory|migrateMemoryCore|syncMemoryChromaToNeo|migrate-memory" package.json buildScripts ai learn resources --glob '!resources/content/issue-archive/**'
rg -n "aiConfig\\.embeddingModel|embeddingModel" ai/mcp/server/knowledge-base ai/mcp/server/memory-core buildScripts package.json learn/agentos test/playwright/unit/ai
rg -n "aiConfig\\.(engine|architecture)|\\bengine: 'hybrid'|aiConfig\\.backupPath|backupPath" ai/mcp/server buildScripts/ai test/playwright/unit/ai learn/agentos
rg -n -o "aiConfig\\.[A-Za-z0-9_]+" ai/mcp/server buildScripts/ai test/playwright/unit/ai
```

Verdict shorthand:

| Verdict | Meaning |
|---|---|
| `live` | Current runtime, test, or operator consumer exists. |
| `dead-remove` | Current reader evidence proves the surface is stale or unused; this PR removes it. |
| `defer-to-Phase-1.5` | The surface is real but belongs to the shared/per-server config split, not AC4 deletion. |
| `needs-design` | The scan found drift, but removal would cross a broader contract boundary. |

## Audit Table

| candidate | defining surface | current readers | verdict | action |
|---|---|---|---|---|
| `ai:migrate-memory` npm script | `package.json` | Exact scan found only the package entry, `buildScripts/README.md`, active ticket text, and historical archived issue references. The package entry pointed at missing `buildScripts/ai/syncMemoryChromaToNeo.mjs`. | `dead-remove` | Removed the package script and public build-script docs. |
| `buildScripts/ai/migrateMemoryCore.mjs` direct script | Build script file | No imports or package script remain. Active issue #10556 still cites it as precedent for re-embedding scope, and `Memory_DatabaseService.importDatabase({reEmbed:true})` remains the real API. | `needs-design` | Left the direct file in place; a follow-up can retire or replace it with an operator-approved one-shot migration artifact. |
| KB `embeddingModel` config key | `ai/mcp/server/knowledge-base/config.template.mjs` | The only KB runtime reader was `SearchService` construction. Query and embedding paths call `memory-core/services/TextEmbeddingService.mjs` with `mcConfig.embeddingProvider`; VectorService batches also use Memory Core provider routing. | `dead-remove` | Removed the KB template key and the unused `SearchService.embeddingModel` client. |
| MC `embeddingModel` config key | `ai/mcp/server/memory-core/config.template.mjs` | `TextEmbeddingService` uses it for Gemini embeddings; `HealthService.buildEmbeddingProviderBlock()` surfaces it in healthcheck output. | `live` | Kept. |
| Provider-specific `openAiCompatible.embeddingModel` / `ollama.embeddingModel` | `ai/mcp/server/memory-core/config.template.mjs` | `TextEmbeddingService` sends these models to the provider endpoints; `HealthService` reports them. | `live` | Kept. Phase 1.5 may move defaults into Tier 1, but they are not dead. |
| MC `engine` storage selector | `ai/mcp/server/memory-core/config.template.mjs` | `CollectionProxy` routes Chroma access with `aiConfig.engine`. | `live` | Kept and made HealthService / ChromaLifecycleService use the same key. |
| MC `architecture` storage selector | No config template definition | Only unbacked reads existed in `HealthService`, `ChromaLifecycleService`, and an old `StorageRouter` comment; the shipped config defines `engine`, not `architecture`. | `dead-remove` | Replaced the unbacked reads/comments with `engine`. |
| KB `backupPath` default | No KB config template definition | `knowledge-base/services/DatabaseService.mjs` accepts `backupPath` for backup orchestration, but the canonical backup runner passes it explicitly. | `needs-design` | Left unchanged; this is a shared-backup default-shape question, not a safe AC4 deletion. |
| MC `backupPath` default | `ai/mcp/server/memory-core/config.template.mjs` | `Memory_DatabaseService.exportDatabase()` uses it as the default backup output path. | `live` | Kept. |
| `chromaUnified` topology flag | KB and MC config templates | Chroma routing, lifecycle, and healthcheck topology still read it. #10822 Phase 2 owns removal after operator migration. | `defer-to-Phase-1.5` | Kept. |

## Count Summary

| Bucket | Count | Notes |
|---|---:|---|
| `dead-remove` | 3 | `ai:migrate-memory`, KB `embeddingModel`, and unbacked MC `architecture` reads. |
| `live` | 4 | MC embedding keys, provider-specific embedding model keys, MC `engine`, MC `backupPath`. |
| `defer-to-Phase-1.5` | 1 | `chromaUnified` is scheduled later by #10822 sequencing. |
| `needs-design` | 2 | Direct migration script retirement and KB backup default shape need separate contract decisions. |

## Removal Summary

- Public stale migration command removed: `npm run ai:migrate-memory`.
- Public build-script documentation no longer advertises the stale migration command.
- Knowledge Base no longer exposes an embedding model config key that its runtime does not use.
- Memory Core health/lifecycle code now reads the shipped `engine` key instead of an unbacked `architecture` key.

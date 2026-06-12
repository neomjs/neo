# Knowledge Base Unit Coverage Audit (#11646)

## Baseline

Current branch baseline (`origin/dev` at branch creation):

| Scope | Spec count |
|---|---:|
| `test/playwright/unit/ai/services/memory-core/**/*.spec.mjs` | 27 |
| `test/playwright/unit/ai/services/knowledge-base/**/*.spec.mjs` | 14 |

This branch adds 6 Knowledge Base service specs, moving the path-scoped count to 20.

## Prioritization

| Service | Existing coverage | Gap | Action |
|---|---|---|---|
| `DocumentService` | none | MCP-facing document list/get helpers lacked unit coverage | Added `DocumentService.spec.mjs` |
| `ChromaManager` | canonical delete guard covered from MC manager suite | KB connection, cached collection, and connectivity projection lacked local KB coverage | Added `ChromaManager.spec.mjs` |
| `DatabaseLifecycleService` | none | Unified-topology lifecycle facade lacked status/action coverage | Added `DatabaseLifecycleService.spec.mjs` |
| `QueryService` | no direct KB query unit spec on `origin/dev` | Class hierarchy file behavior and query option construction are Phase 0/1D-sensitive surfaces | Added `QueryService.classHierarchy.spec.mjs` and `QueryService.queryDocuments.spec.mjs` |
| `SearchService` | relative/absolute context hydration covered | API-key/model guard branch lacked explicit coverage | Added `SearchService.noModel.spec.mjs` |

## Deferred

- `VectorService` is actively covered by PR #11662 and avoided here to prevent branch coupling.
- `source/*` path-config coverage is actively covered by PR #11661 and avoided here to prevent duplicate work.
- Tenant read-side filter coverage belongs to #11632 / #11645 and should land with that implementation.

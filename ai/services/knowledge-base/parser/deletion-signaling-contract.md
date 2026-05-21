# Deletion-Signaling Contract

The deletion-signaling contract is the incremental-push deletion-detection contract introduced by Phase 0/1A of Epic [#11624](https://github.com/neomjs/neo/issues/11624). It complements (does NOT replace) the existing content-hash full-corpus delete logic in [`VectorService.mjs:198-207`](../VectorService.mjs).

## The gap this closes

Today's KB delete logic ([`VectorService.mjs:198-207`](../VectorService.mjs)) computes `allIds = Set(every chunk hash in the FULL corpus)` and deletes existing Chroma ids not in that set. This works under FULL-corpus sync only — when the entire knowledge base is regenerated on disk and embedded fresh.

For Phase 2 incremental cloud push (where a client tenant sends only changed files via `ingestSourceFiles`), the server has NO global view of the tenant's claimed state. Without explicit deletion-signaling, deleted-on-client files would persist as orphaned chunks in Chroma forever.

## Three mutually-supporting mechanisms

A push payload (Phase 2A [`KnowledgeBaseIngestionService.ingestSourceFiles`](../../../../ai/services/knowledge-base/) once shipped) MAY include any combination of:

### 1. Explicit tombstones

```jsonc
{
  "tenantId": "...",
  "files": [/* changed files */],
  "deleted": [
    { "sourcePath": "src/old-module.mjs", "repoSlug": "main-app" },
    { "sourcePath": "src/another-removed.mjs", "repoSlug": "main-app" }
  ]
}
```

Fast, light, single-record-granular. Requires the client (typically a git hook) to track deletes — usable when the client wraps `git diff --diff-filter=D` or equivalent.

### 2. Manifest snapshot

```jsonc
{
  "tenantId": "...",
  "files": [/* changed files */],
  "manifestSnapshot": {
    "repoSlug": "main-app",
    "pathsAfterPush": [
      "src/index.mjs",
      "src/foo.mjs",
      "docs/README.md"
    ]
  }
}
```

Robust against missed-delete-signaling (e.g., a hook that skipped tracking deletes). The ingest request applies the manifest to the current payload, and Phase 4B persists the latest claimed-state manifest on `kb-manifest:<tenantId>` for later daemon reconciliation. A daemon-classified manifest orphan must satisfy `metadata.repoSlug == manifest.repoSlug`, `metadata.sourcePath` absent from `pathsAfterPush`, and a freshness guard: finite `metadata.ingestedAt <= manifest.updatedAt`. Rows missing `ingestedAt`, or rows ingested after the manifest was written, are outside that manifest's deletion authority and are skipped. Higher payload cost — O(N) per push where N = post-push file count.

### 3. Revision boundary

```jsonc
{
  "tenantId": "...",
  "files": [/* changed files */],
  "baseRevision": "<last-pushed-SHA>",
  "headRevision": "<current-SHA>"
}
```

Server compares against tenant's last-known revision (tracked in `KnowledgeBaseTenantConfig` Phase 2E [`#11637`](https://github.com/neomjs/neo/issues/11637)) to derive the deletion set without explicit client signaling. Best for repos with linear history; force-push history rewrites need Phase 4B reconciliation daemon ([`#11640`](https://github.com/neomjs/neo/issues/11640)) to detect the rewrite and trigger full reconciliation.

## Client-side hook patterns

Clients pick the mechanism that fits their workflow:

| Workflow | Recommended primary | Fallback |
|---|---|---|
| Small repos (< 1k files), git-hook-triggered | Manifest snapshot (cheap to enumerate; robust) | Tombstones |
| Large repos (1k+ files), git-hook-triggered | Tombstones + revision-boundary | Periodic manifest-carrying pushes advance the Phase 4B daemon baseline |
| Rapid hooks (post-commit fires on every commit) | Revision-boundary only | Periodic manifest-carrying pushes advance the Phase 4B daemon baseline |

Phase 3 ([`#11627`](https://github.com/neomjs/neo/issues/11627)) `HookWiring.md` guide documents reference patterns. Phase 3's pre-push hook example demonstrates tombstone + revision-boundary combined.

## Multi-mechanism precedence

When a single push payload includes multiple mechanisms, the server applies them in order:

1. **Revision-boundary** computes the expected change set
2. **Tombstones** add explicit deletes (extends the expected set)
3. **Manifest snapshot** reconciles against the resulting set; surplus chunks → orphans

This precedence means richer payloads override sparser ones — clients that send all three get the most precise deletion handling. Clients that send fewer fields trade precision for payload size.

## Out of scope

- Bulk import deletion-signaling (CLI `npm run ai:ingest-tenant`) — bulk imports are typically initial-load OR full-resync; deletion signaling on bulk-paths is operator-config-driven, not per-push.
- Tombstone TTL / grace period — Phase 4C ([`#11641`](https://github.com/neomjs/neo/issues/11641)) garbage-collection daemon owns retention semantics.
- Restore-from-backup semantics — `backup-record-v1` restore preserves chunk ids verbatim including ids of since-deleted chunks; Phase 4B reconciliation daemon can detect this drift on a configurable schedule.

## Related

- Parent ticket: [#11629 Phase 0/1A](https://github.com/neomjs/neo/issues/11629)
- Companion contract: [`identity-tuple.md`](identity-tuple.md)
- Schema: [`parsed-chunk-v1.schema.json`](parsed-chunk-v1.schema.json)
- VectorService full-corpus delete logic: [`VectorService.mjs:198-207`](../VectorService.mjs)
- Phase 2A KnowledgeBaseIngestionService: [`#11633`](https://github.com/neomjs/neo/issues/11633)
- Phase 2E tenant config storage (revision tracking): [`#11637`](https://github.com/neomjs/neo/issues/11637)
- Phase 4B reconciliation daemon: [`#11640`](https://github.com/neomjs/neo/issues/11640)
- Phase 4C garbage-collection daemon: [`#11641`](https://github.com/neomjs/neo/issues/11641)
- Discussion [#11623](https://github.com/neomjs/neo/discussions/11623) §4 Q11 + §6 sweep point 4 + §11 Avoided Trap "Content-hash delta as sole deletion mechanism"

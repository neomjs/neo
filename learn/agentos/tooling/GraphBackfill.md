# Graph Back-Fill: Memory & Session Node Lifecycle

The Native Edge Graph's `MEMORY` and `SESSION` node types are materialized from Chroma row-level data by two complementary pipelines: the **live ingestion** path (`DreamService` → `MemorySessionIngestor.syncSessionToGraph`) runs during the REM cycle, and the **lazy back-fill** path (ticket #10153) materializes individual nodes on-demand when an edge references a missing target. This guide describes the back-fill substrate shipped in ticket #10153 — when it triggers, what it produces, and how to invoke it.

## Why Back-Fill Exists

Live ingestion handles sessions going forward from its deployment — every REM cycle processes newly-summarized sessions and materializes their Memory + Session graph nodes. But the Memory Core has a long history: ~9,040 pre-migration Chroma rows (8,246 memories + 794 summaries at filing) pre-date the live ingestion contract. Edges from extracted provenance (`MENTIONED_IN`, `DISCUSSED_IN`, `REFERENCED_BY` per #10152) and future mailbox threading (`IN_REPLY_TO` per #10147) reference these historical rows — if the target graph node doesn't yet exist, the edge would silently cull, leaving permanent asymmetry.

Back-fill closes this asymmetry **lazily** (reactive — only materialize what's actually referenced) with an **eager CLI** opt-in for operators who need pre-warmed throughput before mass operations.

## Entry Points

| Trigger | Path | When |
|---|---|---|
| `GraphService.linkNodesAsync(source, target, ...)` | Per-edge lazy resolution | On any edge-creation attempt with a missing `memory:` / `session:` endpoint |
| `LazyEdgeDrainer.drainQueue()` | JSONL queue consumer | Once per REM cycle (or on-demand), drains `.neo-ai-data/memory-core/lazy-edges.jsonl` written by #10165's `SemanticGraphExtractor` |
| `node ai/scripts/priorityBackfill.mjs` | Eager batch CLI | Operator-triggered before workloads that span many historical sessions |

All three converge on the same primitive: `MemorySessionIngestor.ingestSingleRow(graphNodeId)`.

## Primitive: `ingestSingleRow`

The per-row analog of `syncSessionToGraph`'s batch-per-session behavior. Given a graph node ID with the canonical `memory:` or `session:` prefix, it fetches the corresponding Chroma row and upserts a graph node tagged `backfilled: true`. Uppercase `MEMORY:` / `SESSION:` inputs remain accepted as compatibility forms and normalize to the canonical lowercase target before lookup.

**Recursion:** a Memory's `sessionId` metadata points at its parent Session. If the Session node is absent when a Memory is back-filled, `ingestSingleRow` recursively back-fills the parent first so the `ORIGINATES_IN` edge doesn't dangle.

**Minimal-session fallback:** if a Session back-fill is requested but no summary row exists in the Chroma summary collection (possible for sessions that never reached summarization), a minimal node is created with `{backfilled: true, minimal: true, sessionId}`. Link targets resolve; a future live summarization upgrades the payload via `syncSessionToGraph`.

**Result contract:** `{success, reason, graphNodeId?, error?}` where `reason` is one of:
`unrecognized-prefix`, `already-exists`, `backfilled`, `backfilled-minimal`, `no-collection`, `chroma-fetch-failed`, `chroma-row-not-found`, `error`.

## The Async Edge Path: `linkNodesAsync`

Existing sync `GraphService.linkNodes` silently culls edges with missing endpoints (log + return, preserving the foreign-key contract with SQLite). `linkNodesAsync` adds an awaitable back-fill pre-step:

```js
// Legacy — cull-on-missing. Keep existing callers unchanged.
GraphService.linkNodes(source, target, relationship, weight);

// New — back-fill-then-link. Returns boolean success.
const ok = await GraphService.linkNodesAsync(source, target, relationship, weight);
```

**Why two methods rather than making `linkNodes` async:** sync `linkNodes` is called from many synchronous code paths where adding an `await` would propagate through wide call chains. Net-new back-fill-aware callers (the `LazyEdgeDrainer`, future mailbox/identity edge creators that traverse historical references) use `linkNodesAsync`; everything else remains unaffected.

**Prefix normalization:** both endpoints are routed through `normalizeGraphNodeId` before the lookup. The edge lands on the canonical lowercase form regardless of input case. An edge passed as `MEMORY:xyz` lands in SQLite with `target = 'memory:xyz'`.

## JSONL Lazy Queue (Producer/Consumer Contract with #10165 / #10172)

Gemini 3.1 Pro's [PR #10165](https://github.com/neomjs/neo/pull/10165) (ticket #10152) shipped the **producer** side: `SemanticGraphExtractor` writes provenance edges whose `memory:` / `session:` targets aren't yet in the graph to `aiConfig.lazyEdgesQueuePath` (default `.neo-ai-data/memory-core/lazy-edges.jsonl`) as one JSON object per line. Pre-#10172 queue entries may still contain `MEMORY:` / `SESSION:` targets; the consumer path treats those as compatibility inputs and normalizes them before back-fill/linking.

This ticket (#10153) ships the **consumer** side: `LazyEdgeDrainer.drainQueue()` reads the queue, retries each edge via `linkNodesAsync` (which triggers `ingestSingleRow` for missing endpoints), writes failures back for the next cycle, and deletes the queue when fully drained.

**Atomicity via rename-then-drain:** the queue file is renamed to a `.draining` suffix at the start of a drain cycle. Concurrent producer appends create a fresh queue file rather than racing the read. After processing, failures append to the (potentially fresh) queue for the next cycle. Standard log-rotation pattern.

**Malformed-line policy:** lines that fail JSON parsing or lack the required `{source, target, relationship}` fields are counted and **discarded** — they would never succeed on retry and retaining them would bloat the queue.

## Provenance Markers

Every Memory and Session graph node carries exactly one of two mutually-exclusive provenance markers:

| Marker | Source | Meaning |
|---|---|---|
| `liveIngested: true` | `MemorySessionIngestor.syncSessionToGraph` (REM cycle) | Node was materialized during a live DreamService pass over a summarized session |
| `backfilled: true` | `MemorySessionIngestor.ingestSingleRow` (#10153) | Node was lazy-materialized from a historical Chroma row, typically in response to an edge reference |

Queries discriminating between the two sources use these flags directly:

```js
// All live-ingested memories in the last week
GraphService.db.nodes.values().filter(n =>
    n.label === 'MEMORY' && n.properties.liveIngested === true &&
    n.properties.createdAt >= oneWeekAgoIso
);

// All back-filled sessions (proxy for pre-migration historical reach)
GraphService.db.nodes.values().filter(n =>
    n.label === 'SESSION' && n.properties.backfilled === true
);
```

Nodes that exist in the graph WITHOUT either marker are pre-#10153 legacy — treat them as live-ingested for historical reasoning; they'll receive the `liveIngested` tag on next payload-hash mismatch upsert.

## Operator: `priorityBackfill.mjs`

```
node ai/scripts/priorityBackfill.mjs [--days N] [--dry-run] [--skip-drain]
```

- `--days N` — window in days (default 30). Sessions with `metadata.createdAt >= (now - N)` are ingested via `syncSessionToGraph`.
- `--dry-run` — count what would be back-filled without mutating graph or queue.
- `--skip-drain` — skip the post-ingest `LazyEdgeDrainer.drainQueue` pass.

Use before mass cross-tenant operations (e.g. post-#10146 permission grant rollouts, or #10139 Mailbox traffic demonstrations across historical sessions) to avoid per-request latency spikes from lazy back-fills during the workload.

## Node-ID Canonical Format (Coordination Note)

Canonical row-backed Memory and Session graph IDs use lowercase prefixes:

- `memory:<chromaId>`
- `session:<sessionId>`

This convention applies only to row-backed Memory/Session nodes. Semantic and identity prefixes such as `CONCEPT:`, `CLASS:`, and `AGENT:` remain outside this contract and are not recased by #10172.

Uppercase `MEMORY:<chromaId>` and `SESSION:<sessionId>` remain compatibility input forms for historical lazy-queue lines, review artifacts, and manual operator probes. `GraphService.normalizeGraphNodeId`, `ingestSingleRow`, and `linkNodesAsync` normalize those inputs to the lowercase canonical form before storage/linking. New producer output should emit the lowercase canonical form directly.

## Chroma Collection Mapping

| Graph prefix | Chroma collection | Lookup key |
|---|---|---|
| `memory:<chromaId>` | `neo-agent-memory` (via `StorageRouter.getMemoryCollection()`) | Direct Chroma row ID |
| `session:<sessionId>` | `neo-agent-sessions` (via `StorageRouter.getSummaryCollection()`) | Filter by `where.sessionId` — summary Chroma IDs are opaque |

Tests inject stubs conforming to the same `collection.get({ids} | {where})` contract; no module-level monkey-patching required.

## See Also

- `ai/services/ingestion/MemorySessionIngestor.mjs` — `ingestSingleRow` + `syncSessionToGraph`
- `ai/services/graph/LazyEdgeDrainer.mjs` — JSONL queue consumer
- `ai/services/memory-core/GraphService.mjs` — `linkNodesAsync`, `ensureNodeExists`, `normalizeGraphNodeId`
- `ai/scripts/priorityBackfill.mjs` — operator CLI
- `learn/agentos/tooling/MemoryCoreMcpAuth.md` — identity propagation (orthogonal; user-tenant tagging happens at write time regardless of back-fill source)
- `learn/agentos/DreamPipeline.md` — the REM cycle where live ingestion runs

## Related Tickets

- #10143 — Graph-first Memory artifacts (parent sub-epic)
- #10151 — Live ingestion of Memory + Session nodes (shipped via #10161)
- #10152 — `SemanticGraphExtractor` provenance edges (shipped via #10165, producer of the lazy queue)
- #10153 — This ticket (back-fill consumer + on-demand lazy back-fill)
- #10158 — Post-ship telemetry + retention policy (follow-up)
- #9999 — Grand-parent epic: Cloud-Native Knowledge & Multi-Tenant Memory Core

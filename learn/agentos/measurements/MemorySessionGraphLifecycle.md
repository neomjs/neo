# Memory/Session Graph Lifecycle

`MEMORY` and `SESSION` graph nodes are durable provenance anchors. They connect
raw agent turns, session summaries, mailbox threads, authorship edges, and
future recovery queries back to the Native Edge Graph. Their lifecycle policy is
therefore stricter than ordinary extracted concept nodes.

## Lifecycle Telemetry (on-demand)

Memory/Session graph storage-growth observability is exposed by
`GraphService.getLifecycleCensus()` and run on demand via the maintenance
script:

```bash
npm run ai:graph-lifecycle-report            # cheap: node counts + SQLite file sizes
npm run ai:graph-lifecycle-report -- --edges # also the O(edges) incident-edge counts
npm run ai:graph-lifecycle-report -- --json  # raw census JSON
```

The census payload:

```json
{
  "available": true,
  "memoryNodes": 3,
  "sessionNodes": 2,
  "sqliteBytes": 4096,
  "sqliteWalBytes": 512,
  "sqliteShmBytes": 0,
  "measuredAt": "2026-06-05T20:00:00.000Z",
  "memoryIncidentEdges": 7,
  "sessionIncidentEdges": 5
}
```

`memoryNodes` / `sessionNodes` count SQLite `Nodes` rows whose JSON label is
`MEMORY` / `SESSION`. The SQLite byte fields report the configured graph
database file and its `-wal` / `-shm` siblings (`0` for missing siblings). The
`memoryIncidentEdges` / `sessionIncidentEdges` fields appear only with `--edges`.
If the graph store is not mounted, the census returns `available:false` with
zero counts and an `error` string instead of throwing.

### Why on-demand, not healthcheck / MCP tool

This census is deliberately **not** a `HealthService.healthcheck()` field and
**not** an MCP tool. The incident-edge count is an `O(edges)` scan — benchmarked
at ~5.3s for 2.5M edges and growing linearly — so it cannot sit on the
healthcheck hot path. And an MCP-tool response schema loads into every agent's
tool surface unconditionally (a permanent per-agent context tax), independent of
graph size or whether the tool is ever called. Keeping the census in a
`GraphService` method behind an on-demand script means nothing pays the runtime
or context cost unless an operator explicitly asks for the report.

## Retention Policy

`MEMORY` and `SESSION` nodes remain protected from
`GraphService.getOrphanedNodes()` and vector apoptosis by default. This is
intentional even when a node is temporarily edgeless:

- Freshly ingested memories and sessions can be created before all downstream
  provenance edges are attached.
- Empty sessions still need stable anchors for later summary, handoff, and
  recovery edges.
- Mailbox, identity, and authorship edges may be created after the original
  memory/session row exists.

`GraphMaintenanceService.runGarbageCollection()` must continue to delete only
the node IDs returned by `GraphService.getOrphanedNodes()`. Broadening apoptosis
to include `MEMORY` or `SESSION` requires a separate ticket with a Contract
Ledger and explicit evidence that memory recovery, mailbox threading, provenance
queries, and agent identity edge creation remain safe.

## Future Archival Gate

This guide does not introduce archival, default-query exclusion, or hard
deletion. Future retention pressure must first be proven by sustained lifecycle
census evidence. A follow-up archival proposal must define:

- exact marker names and reversible semantics;
- include-archived query behavior;
- tenant/user visibility effects;
- migration behavior for existing nodes without the marker;
- recovery evidence for memory search, session summaries, mailbox threads, and
  identity/provenance edge creation.

Hard deletion of `MEMORY` or `SESSION` graph nodes remains out of scope unless a
future ticket proves safety across all of those recovery paths.

## Initial Baseline

Capture the baseline by running `npm run ai:graph-lifecycle-report -- --json`
against the target Memory Core graph store after deployment, and record the
payload here. Until a live baseline is captured, the unit-pinned reference shape
is `memoryNodes: 3 / sessionNodes: 2 / sqliteBytes: 4096` (from
`GraphService — getLifecycleCensus` fixtures); live counts replace it.

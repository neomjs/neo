# Memory/Session Graph Lifecycle

`MEMORY` and `SESSION` graph nodes are durable provenance anchors. They connect
raw agent turns, session summaries, mailbox threads, authorship edges, and
future recovery queries back to the Native Edge Graph. Their lifecycle policy is
therefore stricter than ordinary extracted concept nodes.

## Health Telemetry

`HealthService.healthcheck()` exposes a top-level `graphLifecycle` block for
cheap operator visibility into this anchor layer:

```json
{
  "available": true,
  "memoryNodes": 3,
  "sessionNodes": 2,
  "memoryIncidentEdges": 7,
  "sessionIncidentEdges": 5,
  "sqliteBytes": 4096,
  "sqliteWalBytes": 512,
  "sqliteShmBytes": 0,
  "measuredAt": "2026-06-05T20:00:00.000Z"
}
```

The counts are deployment-wide. `memoryNodes` and `sessionNodes` count SQLite
`Nodes` rows whose JSON label is `MEMORY` or `SESSION`. Incident-edge counts
count SQLite `Edges` rows whose `source` or `target` is one of those labeled
nodes. The SQLite byte fields report the configured graph database file and its
`-wal` / `-shm` siblings, returning `0` for missing siblings.

If the graph store is not mounted, healthcheck returns `available:false` with
zero counts and an `error` string instead of throwing. The rest of the
healthcheck payload remains readable.

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
deletion. Future retention pressure must first be proven by sustained
`graphLifecycle` telemetry. A follow-up archival proposal must define:

- exact marker names and reversible semantics;
- include-archived query behavior;
- tenant/user visibility effects;
- migration behavior for existing nodes without the marker;
- recovery evidence for memory search, session summaries, mailbox threads, and
  identity/provenance edge creation.

Hard deletion of `MEMORY` or `SESSION` graph nodes remains out of scope unless a
future ticket proves safety across all of those recovery paths.

## Initial Baseline

The #10158 implementation baseline is unit-equivalent telemetry from
`HealthService #10158 - buildGraphLifecycleBlock`:

```json
{
  "available": true,
  "memoryNodes": 3,
  "sessionNodes": 2,
  "memoryIncidentEdges": 7,
  "sessionIncidentEdges": 5,
  "sqliteBytes": 4096,
  "sqliteWalBytes": 512,
  "sqliteShmBytes": 0,
  "measuredAt": "2026-06-05T20:00:00.000Z"
}
```

Live deployment baselines should replace fixture counts only after running a
post-merge healthcheck against the target Memory Core graph store.

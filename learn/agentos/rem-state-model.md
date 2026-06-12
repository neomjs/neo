# REM State Model

## 5-Axis Snapshot

The REM pipeline exposes a read-only Memory Core MCP tool, `get_rem_pipeline_state`,
for operator-visible pipeline health. Phase 1b is a projection layer over the
Phase 1a helpers; it does not write graph nodes or mutate Sandman state.

```js
{
    undigested       : Number, // Chroma summaries without graphDigested true
    digested         : Number, // Chroma summaries with graphDigested true
    sessionNodes     : Number, // SQLite SESSION nodes
    topologyConflicts: Number, // handoff conflict entries
    recentCycles     : [{
        runId              : String,
        wallClockMs        : Number,
        cycleOverflowSignal: Boolean,
        cycleOverflowRatio : Number,
        outcome            : String
    }],
    perSession       : {
        sessionId  : String,
        entityCount: Number // inbound graph entity/provenance edges
    }
}
```

The key diagnostic is divergence between `digested` and `sessionNodes`. A healthy
REM digest path keeps those counts close within a batch window; a wide gap means
Chroma believes sessions were digested while the Native Edge Graph did not receive
matching SESSION nodes. This is the failure class surfaced by the 76x divergence
anchor from Epic #12065 Sub 2.

## Source Anchors

PR #12081 shipped the Phase 1a helper JSDocs that define the current axis
contracts in `ChromaManager`, `GraphService`, and `TopologyInferenceEngine`.
This MCP projection intentionally composes those helpers instead of redefining
their semantics at the server layer.

PR #12077 shipped the Sub 1 Sandman silent-failure forensics runbook. Use that
runbook when the axis snapshot indicates drift; this page only explains how to
read the snapshot and where Phase 2 state will attach.

## MCP Usage

Use the deployment-wide snapshot first:

```js
await callTool('get_rem_pipeline_state', {});
```

When a specific session looks suspicious, pass `sessionId` to include Axis C:

```js
await callTool('get_rem_pipeline_state', {
    sessionId: '550e8400-e29b-41d4-a716-446655440000'
});
```

## Operator Cookbook

Check `undigested` to confirm the queue is actually draining. If it remains high
across multiple REM cycles, the graph extraction arm is not catching up or the
provider is not completing enough sessions per cycle.

Compare `digested` with `sessionNodes`. If `digested` rises but `sessionNodes`
does not, the pipeline is setting `graphDigested` without durable SESSION-node
growth. That is a silent-failure signal and should be investigated before trusting
the Sandman handoff.

Use `topologyConflicts` as the handoff-conflict count only. A zero value does not
prove topology extraction succeeded; it can also mean the provider/error path
returned no durable conflict entries. Use `recentCycles` for the cycle-level
outcome and overflow signal before treating zero conflicts as a clean run.

Use `perSession.entityCount` to inspect extraction yield for a single session. A
digested session with zero inbound entity/provenance edges is suspicious when the
payload clearly contained entities.

## Durable Cycle State

`DreamService.executeRemCycle()` writes one append-only JSONL artifact per run
under the gitignored `NEO_REM_RUN_STATE_DIR` directory
(`.neo-ai-data/rem-runs` by default). The file name is the sanitized `runId`, and
each line is a complete cycle snapshot:

```js
{
    runId,
    reason,
    startedAt,
    completedAt,
    wallClockMs,
    configuredCadenceMs,
    cycleOverflowSignal,
    cycleOverflowRatio,
    outcome,
    reasonCode,
    failurePhase,
    failureReason,
    lastSuccessfulPhase,
    cycleScopePhases,
    perPhaseStates,
    perSessionStates
}
```

The JSONL store is deliberately off-graph. A broken REM run can diagnose itself
without mutating the Native Edge Graph control plane. `get_rem_pipeline_state`
projects only the recent cycle summary fields so operator dashboards stay small;
inspect the JSONL artifact directly when phase-level or per-session failure
reasons are needed.

## Retention

Each REM cycle appends one new `<runId>.jsonl` artifact, so the directory would grow
without bound across a deployment's lifetime (~24 files/day at the default 1h dream
cadence). `appendRemRunState` applies a **write-side retention cap** on every append:
after writing, it prunes the oldest artifacts beyond `remRunRetentionLimit`
(`NEO_REM_RUN_RETENTION_LIMIT`, default `200`). Retention sorts by `mtime`, removing the
oldest and never the recent window.

Bounding the artifact count on the write side also bounds the **read path**:
`readRecentRemRunStates` — and therefore every `get_rem_pipeline_state` / healthcheck call
— `readdir`s + `stat`s the directory, so its cost is capped by the retention bound rather
than growing with the total number of cycles ever run.

A write-side cap is preferred over an orchestrator cleanup lane: the JSONL store stays
self-contained and filesystem-durable, with no cross-service boundary and no graph
mutation during a REM run.

**Disabled mode:** a non-positive or non-finite `remRunRetentionLimit` disables pruning —
`appendRemRunState` then keeps every artifact (unbounded). Use this only for short-lived
forensic captures where you want the full history and will clean the directory yourself.

Set `NEO_ORCHESTRATOR_DREAM_OVERFLOW_THRESHOLD` to tune the overflow warning
ratio against the configured dream cadence. The default is `0.8`, meaning a
cycle that consumes more than 80% of its cadence is flagged as an overlap risk.

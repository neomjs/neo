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
returned no durable conflict entries. Phase 2 will add per-cycle stage outcomes to
disambiguate no-conflict from extraction-failed.

Use `perSession.entityCount` to inspect extraction yield for a single session. A
digested session with zero inbound entity/provenance edges is suspicious when the
payload clearly contained entities.

## Phase 2 Pointer

Phase 2 extends this scaffold with append-only JSONL cycle state, per-phase
wall-clock timings, and cadence-overflow detection. That state belongs off-graph
so a broken REM run does not mutate the active control plane while diagnosing
itself.

# Sandman Silent-Failure Forensics

This runbook is the Sub 1 output for Epic #12065. It inventories the
thirteen REM/Sandman silent-failure hypotheses from Discussion #12062 and
converts them into falsifiable checks, source anchors, and implementation
preconditions for the unified orchestrator-owned REM cycle.

The local evidence pass was run on 2026-05-27 after the graph hard reset and
after the graph-provider selector fix was present in the checkout. It did not
run `npm run ai:run-sandman`, because live REM mutates Memory Core graph state
and remains operator-gated.

## Source Map

Primary source anchors:

- `ai/daemons/orchestrator/Orchestrator.mjs` owns periodic task scheduling,
  task-state transitions, and the in-process `dream` task executor.
- `ai/daemons/orchestrator/services/DreamService.mjs` owns the REM session
  digest body.
- `ai/scripts/runners/runSandman.mjs` is the manual CLI path; it is transitional
  while the orchestrator becomes the source of truth.
- `ai/services/graph/SemanticGraphExtractor.mjs` owns Tri-Vector extraction,
  guardrail invocation, graph upserts, and provenance edge queuing.
- `ai/services/graph/TopologyInferenceEngine.mjs` owns topological conflict
  extraction into `sandman_handoff.md`.
- `ai/services/memory-core/helpers/ConsumerFrictionHelper.mjs` owns upstream
  context-size prechecks and downstream invocation-failure classification.
- `ai/services/graph/LazyEdgeDrainer.mjs` owns lazy provenance-edge queue
  draining, but current `DreamService` does not import or invoke it.
- `ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs` and
  `HeavyMaintenanceLeaseService.mjs` own heavy-maintenance deferral and lease
  coordination.
- `ai/daemons/orchestrator/services/TaskStateService.mjs` persists task state.

Useful live-state checks:

```bash
git status --short --branch
rg -n "DreamService|SemanticGraphExtractor|TopologyInferenceEngine|GraphMaintenanceService|LazyEdgeDrainer|graphDigested|size-precheck|unsupported modelProvider" .neo-ai-data/logs/mc-server-$(date +%F).log
find .neo-ai-data/orchestrator-daemon-canonical -maxdepth 2 -type f -print
test -f .neo-ai-data/memory-core/lazy-edges.jsonl && wc -l .neo-ai-data/memory-core/lazy-edges.jsonl
```

In non-canonical worktrees, `.neo-ai-data/orchestrator-daemon/` is clone-local process-control state. Use the `orchestrator-daemon-canonical/` read alias after `bootstrapWorktree.mjs --link-data --canonical-root <canonical-checkout>` when validating the root daemon's task state or log.

## Intake Verdict

Ticket #12067 is valid-as-written with positive ROI.

Evidence:

- The parent Epic #12065 has a GPT epic-review comment and explicitly
  greenlights #12067 before unified REM implementation work.
- Live duplicate search found no better active owner for this exact
  thirteen-hypothesis forensic inventory. Related issues are the parent epic,
  #12063/#12064 for the context-cap hotfix, and #12075 for downstream
  regression coverage.
- Source reads confirm that several silent-success shapes are real, not just
  ticket prose: `DreamService.processUndigestedSessions()` can return without a
  structured outcome, `Orchestrator` marks `dream` completed after any
  non-throwing return, `TopologyInferenceEngine.extractTopology()` catches and
  returns `undefined`, and the lazy-edge drainer is not wired into the REM loop.

## Hypothesis Matrix

| # | Hypothesis | Current verdict | Evidence | Mitigation handoff |
|---|---|---|---|---|
| 1 | `DreamService.isProcessing` stuck flag | Inconclusive locally; structurally possible | `DreamService` skips immediately when `isProcessing` is true and only logs at debug level. `finally` resets the flag for ordinary throws, and the provider-unreachable early return manually resets it. | Sub 2/Sub 3 should expose `skippedAlreadyProcessing` as a stage outcome, not a debug-only line. |
| 2 | Provider probe gate skipped for gemini/ollama | Active residual in daemon path | `DreamService` only probes when `aiConfig.modelProvider === 'openAiCompatible'`. Graph generation now resolves through `graphProvider`, so `modelProvider: gemini` plus `graphProvider: openAiCompatible` skips the daemon-side readiness probe. Manual `runSandman` has its own graph-provider readiness gate. | Sub 3 should probe the resolved graph provider, not generic `modelProvider`. Sub 2 should record provider probe skipped/failed as a first-class stage. |
| 3 | Cadence silent-loop marks periodic task successful without work | Active | `Orchestrator` awaits `dreamService.processUndigestedSessions()` and then calls `markCompleted()` / `recordTaskOutcome(..., 'completed')` for any non-throwing return. `DreamService` has non-throwing no-op paths. | `executeRemCycle()` must return a typed cycle outcome; orchestrator should map no-op/deferral/provider-unavailable to skipped or failed, not completed. |
| 4 | `MaintenanceBackpressureService` indefinite deferral | Partially observable; still needs runbook-grade state | MBS records skipped outcomes with `reasonCode` for backpressure or lease-held states, but `CadenceEngine.runIfDue()` does not consume the `false` result and `TaskStateService.lastRunAt` is not advanced by a deferral. | Sub 2 should expose deferral counters and last blocker owner. Sub 3 should preserve skip semantics without retry-spam. |
| 5 | Lease held by orphan | Inactive in this local pass; covered by existing stale-recovery primitive | No `.neo-ai-data/orchestrator-daemon` lease file was present in this checkout during the read-only pass. `HeavyMaintenanceLeaseService` has a 6-hour TTL, stale detection, and stale/malformed replacement. | Sub 2 should surface active lease owner, pid, acquiredAt, expiresAt, and stale status. Sub 9 should cover held, stale, and malformed lease cases. |
| 6 | `DreamService.initAsync` hung on dependency | Inconclusive; high-value readiness check | `DreamService.ready()` depends on `StorageRouter.ready()`, `getSummaryCollection()`, and `LifecycleService.ready()`. Manual `runSandman` waits on `DreamService.ready()` with no local timeout. | Add readiness timeout telemetry around DreamService init and expose the dependency name that did not become ready. |
| 7 | `autoDream` config flip | Inactive as the main failure path | Memory Core default is `autoDream: false`; `runSandman` explicitly sets `autoDream`, `autoSummarize`, and `autoGoldenPath` false. Orchestrator periodic `dream` does not use `autoDream`. | Keep boot-time auto-dream out of the unified path. Health should still expose effective config for forensic checks. |
| 8 | Pre-PR #11966 OpenAiCompatible hardwire | Inactive in current source for graph generation | `SemanticGraphExtractor`, `TopologyInferenceEngine`, and `runSandman` route through `resolveGraphModelProvider()` / `buildGraphProvider()` in the current checkout. | Preserve provider-dispatch tests in Sub 9; do not reintroduce direct provider construction in graph-generation services. |
| 9 | `invokeWithGuardrail` context-size precheck | Active until cap hotfix plus local overlays land | `ConsumerFrictionHelper` skips invocation when estimated tokens exceed `safeProcessingLimitTokens`; local ignored `ai/config.mjs` can still pin `openAiCompatible.contextLimitTokens` to `32768` even when tracked template PRs raise it. | Sub 3 must read the effective runtime cap and emit it in REM telemetry. Operators must sync ignored `ai/config.mjs` overlays before validating the cap fix. |
| 10 | `TopologyInferenceEngine.extractTopology()` returns void | Active | It returns `undefined` on no conflicts and catches provider errors internally. `DreamService` logs elapsed time but does not inspect a result. | Make topology extraction return `{status, conflicts, error}` and include it in cycle outcome. |
| 11 | Three-retry JSON parse exhaustion | Active | `SemanticGraphExtractor` retries malformed Tri-Vector payloads three times, logs a final raw dump, then returns `null`. `DreamService` avoids `graphDigested` but the orchestrator still marks the task completed. | Return structured extraction failure with attempt count and parse-failure reason. Sub 9 should cover exhausted repair-loop behavior. |
| 12 | Provenance edge culling | Partially mitigated; still active for non-lazyable edges | Provenance edges targeting `SESSION:` / `MEMORY:` are queued to `lazyEdgesQueuePath`; other unresolved edges are culled with only a warning. Logs also show GraphService culling hallucinated message tag edges. | Count culled edges by class and include the count in REM stage telemetry. Consider queueing all source-grounded provenance edges or documenting why non-session/memory culls are safe. |
| 13 | Lazy edge queue overflow | Active wiring gap | `LazyEdgeDrainer` exists and has tests, but source search shows current `DreamService` does not import or call it. The docs/history say REM-cycle draining was intended or previously discussed, but current code only invokes it through `ai/scripts/migrations/priorityBackfill.mjs`. | Sub 3 should decide and implement the REM-cycle drain phase, or explicitly declare lazy-edge draining out of cycle and assign a separate coordinator. Sub 9 should cover queue present, drained, retained-failure, and orphan `.draining` recovery cases. |

## Per-Hypothesis Forensic Protocol

### 1. `DreamService.isProcessing` Stuck Flag

Detection:

1. Search the current Memory Core log for `REM pipeline is already running`.
2. Compare the frequency of that debug line with `REM pipeline completed`,
   `Failed to process undigested sessions`, and provider-readiness errors.
3. If Neural Link or a local debug shell is attached to the same process,
   inspect the live singleton's `isProcessing` property.

Evidence anchors:

- `DreamService.mjs`: early skip when `isProcessing` is true.
- `DreamService.mjs`: `finally` resets `isProcessing` after normal pipeline
  execution.

Mitigation spec:

- `executeRemCycle()` should return `status: 'skipped'` with
  `reasonCode: 'already-processing'`.
- Orchestrator should record skipped, not completed.

### 2. Provider Probe Gate Skipped

Detection:

1. Inspect effective config:
   - `modelProvider`
   - `graphProvider`
   - `openAiCompatible.host`
   - `ollama.host`
2. Probe the resolved graph provider:
   - OpenAI-compatible: `GET <host>/v1/models`
   - Ollama: `GET <host>/api/tags`
3. Search logs for `unsupported modelProvider`, `API provider service is
   unreachable`, `Skipping extraction (API provider offline)`, and
   `provider readiness timeout`.

Evidence anchors:

- `DreamService.mjs`: readiness probe is conditional on generic
  `modelProvider`.
- `providerDispatch.mjs`: graph-generation provider selector is
  `graphProvider`, defaulting to OpenAI-compatible unless generic provider is
  explicitly Ollama.
- `runSandman.mjs`: manual path already probes the resolved graph provider.

Mitigation spec:

- Move provider readiness into the shared REM cycle and key it to
  `resolveGraphModelProvider(aiConfig)`.
- The provider stage should return `ready`, `unreachable`, or `unsupported`
  with endpoint diagnostics.

### 3. Cadence Silent-Loop

Detection:

1. Inspect the orchestrator task-state file when present:
   `.neo-ai-data/orchestrator-daemon/task-state.json`.
2. Compare `dream.lastSuccessAt` against Memory Core logs for actual REM
   stages: `Found ... undigested`, `Graph entities committed`, `marked as
   graphDigested`, and `REM pipeline completed`.
3. Treat `dream` completed with zero stage evidence as suspect.

Evidence anchors:

- `Orchestrator.mjs`: dream executor marks completed after any non-throwing
  `processUndigestedSessions()` return.
- `TaskStateService.mjs`: completed writes `lastExitCode: 0` and
  `lastSuccessAt`.

Mitigation spec:

- `DreamService` must stop returning `undefined` for materially different
  outcomes.
- Orchestrator must map the returned outcome to completed, skipped, or failed.

### 4. Maintenance Backpressure Deferral

Detection:

1. Search logs for `heavy-maintenance-backpressure` and
   `heavy-maintenance-lease-held`.
2. Inspect task outcomes through Memory Core health if available.
3. Inspect the heavy-maintenance lease file and identify `owner`, `pid`, and
   `expiresAt`.

Evidence anchors:

- `MaintenanceBackpressureService.mjs`: records skipped outcomes and
  deduplicated logs for backpressure and lease-held cases.
- `CadenceEngine.mjs`: does not consume executor return values.

Mitigation spec:

- Sub 2 should persist deferral state with the task, not only in recent health
  outcome history.
- Sub 3 should keep deferrals sparse but visible.

### 5. Orphan Lease

Detection:

1. Inspect `.neo-ai-data/orchestrator-daemon/heavy-maintenance-lease.json`.
2. Verify whether `pid` is alive.
3. Compare `expiresAt` to current time.
4. If stale or malformed, verify acquisition replaces it before work starts.

Evidence anchors:

- `HeavyMaintenanceLeaseService.mjs`: stale and malformed leases are recoverable.
- `MaintenanceBackpressureService.mjs`: active leases defer orchestrator work
  rather than throwing.

Mitigation spec:

- Surface lease state in REM preflight telemetry.
- Test held, stale, malformed, and inherited-token paths.

### 6. `DreamService.initAsync` Dependency Hang

Detection:

1. In manual runs, note whether output reaches `DreamService Ready`.
2. Search logs for `StorageRouter`, `ChromaClient`, and
   `SystemLifecycleService` errors around the hang timestamp.
3. If Chroma is unavailable, distinguish "initialization degraded" from
   "ready but no sessions".

Evidence anchors:

- `DreamService.mjs`: waits on `StorageRouter.ready()`, summary collection, and
  Memory Core lifecycle readiness.
- `runSandman.mjs`: waits for `DreamService.ready()` without a local timeout.

Mitigation spec:

- Add per-dependency readiness spans and timeout outcomes.
- A hung dependency must fail the REM cycle, not leave the operator at an
  ambiguous waiting line.

### 7. `autoDream` Config Flip

Detection:

1. Inspect effective Memory Core config or health for `autoDream`.
2. Search logs for `[Startup] DreamService: Checking for undigested session
   memories...`.
3. Confirm whether the run came from boot-time auto-dream or orchestrator
   periodic `dream`.

Evidence anchors:

- `ai/mcp/server/memory-core/config.mjs`: default `autoDream: false`.
- `runSandman.mjs`: disables auto-dream before manual execution.

Mitigation spec:

- Keep startup auto-dream disabled for unified REM.
- Expose the trigger source in cycle telemetry: manual, orchestrator periodic,
  or boot-time auto.

### 8. OpenAiCompatible Hardwire Regression

Detection:

1. Search graph-generation services for direct `OpenAiCompatible` construction.
2. Verify they route through `buildGraphProvider()`.
3. Verify unsupported generic `modelProvider: gemini` cannot reach graph
   dispatch.

Evidence anchors:

- `providerDispatch.mjs`: centralized graph-provider resolver.
- `SemanticGraphExtractor.mjs` and `TopologyInferenceEngine.mjs`: current graph
  provider dispatch call sites.

Mitigation spec:

- Keep provider selector tests close to each graph-generation consumer.
- Treat new direct provider construction in graph services as a regression.

### 9. Context-Size Guardrail Precheck

Detection:

1. Log the effective `contextLimitTokens` and `safeProcessingLimitTokens` before
   extraction.
2. Search logs for `size-precheck-skip`.
3. Compare tracked template config with ignored local `ai/config.mjs`; local
   overlays can keep the old 32K cap after a template PR lands.

Evidence anchors:

- `ConsumerFrictionHelper.mjs`: default safe threshold is 75 percent of
  `contextLimitTokens` when unset.
- `SemanticGraphExtractor.mjs`: passes OpenAI-compatible context-limit knobs to
  the guardrail for graph extraction.

Mitigation spec:

- Sub 3 telemetry must record effective cap and payload estimate.
- Sub 7 chunking must activate before the guardrail skips large sessions.

### 10. Topology Inference Void Return

Detection:

1. Search for `Topological Conflicts took`.
2. Check whether the topology pass returned conflicts, no conflicts, provider
   offline, parse failure, or write failure. Current source does not expose this
   distinction.
3. Inspect `resources/content/sandman_handoff.md` only as the durable output,
   not as proof that topology ran successfully.

Evidence anchors:

- `TopologyInferenceEngine.mjs`: returns `undefined` for no conflicts and catches
  provider errors internally.
- `DreamService.mjs`: does not inspect topology result.

Mitigation spec:

- Return structured topology stats and include them in cycle status.
- A provider error in topology should not masquerade as "no conflicts".

### 11. JSON Repair Exhaustion

Detection:

1. Search logs for `Failed to validate extracted Tri-Vector A2A payload`.
2. Search for `FINAL EXHAUSTED RAW LLM DUMP`.
3. Verify `graphDigested` remains unset for that session.
4. Verify the orchestrator does not mark the task as completed if extraction
   failed for every processed session.

Evidence anchors:

- `SemanticGraphExtractor.mjs`: three retry loop and `return null` on
  exhaustion.
- `DreamService.mjs`: only marks `graphDigested` when `success` is truthy and
  deterministic ingestion has zero errors.

Mitigation spec:

- Return an extraction result object with `status`, `attempts`, and `errorKind`.
- Sub 9 should cover invalid JSON across all retries.

### 12. Provenance Edge Culling

Detection:

1. Search logs for `Culling hallucinated edge` and `Queuing unresolved
   provenance edge`.
2. Classify culls by source/target shape:
   - session/memory provenance
   - issue or PR identifiers
   - concept tags
   - arbitrary hallucinated nodes
3. Inspect the lazy-edge queue when present.

Evidence anchors:

- `SemanticGraphExtractor.mjs`: queues unresolved provenance edges only when
  the relationship is provenance and either endpoint is `SESSION:` or `MEMORY:`.
- Other unresolved edges are skipped with a warning.

Mitigation spec:

- Count queued, linked, retained, malformed, and culled edges.
- Include cull counts in the handoff or health outcome so missing provenance is
  not invisible.

### 13. Lazy Edge Queue Overflow

Detection:

1. Check `.neo-ai-data/memory-core/lazy-edges.jsonl` line count and byte size.
2. Check for `.neo-ai-data/memory-core/lazy-edges.jsonl.draining`.
3. Run a dry-run drain only when safe:
   `node ai/scripts/migrations/priorityBackfill.mjs --dry-run`.
4. Search current source for `LazyEdgeDrainer.drainQueue()` call sites.

Evidence anchors:

- `LazyEdgeDrainer.mjs`: supports dry-run, queue rotation, retained failures,
  malformed discard, and orphan `.draining` recovery.
- Current source search shows `DreamService` does not import or invoke
  `LazyEdgeDrainer`; `priorityBackfill.mjs` does.

Mitigation spec:

- Sub 3 must explicitly decide whether the REM cycle drains lazy edges.
- If yes, sequence the drain after session/memory ingestion and semantic
  extraction, before Golden Path synthesis.
- If no, create a separate observable drain cadence; do not rely on stale docs
  that claim REM already drains the queue.

## Sub 3 Preconditions

The unified REM method should not just wrap the existing body. It needs a typed
cycle contract:

```js
{
    status: 'completed' | 'skipped' | 'failed',
    trigger: 'manual' | 'orchestrator-periodic' | 'startup-auto',
    reasonCode: 'ok' | 'no-undigested-sessions' | 'already-processing' |
        'provider-unreachable' | 'provider-unsupported' |
        'backpressure' | 'lease-held' | 'extraction-failed' |
        'topology-failed' | 'lazy-edge-drain-failed',
    stages: {
        providerReady: {},
        sessionQuery: {},
        memorySessionIngest: {},
        triVector: {},
        topology: {},
        testGaps: {},
        conceptGaps: {},
        lazyEdges: {},
        garbageCollection: {},
        goldenPath: {}
    }
}
```

Minimum behavior changes:

- Do not mark orchestrator `dream` completed when provider readiness failed,
  extraction skipped by guardrail, topology failed, or all sessions failed.
- Preserve no-op states as `skipped`, not `completed`.
- Include effective model/provider/cap values in the stage payload.
- Include queue and cull counts so provenance loss is visible.
- Keep `runSandman` as a tiny wrapper only while needed, or remove it when the
  orchestrator-owned manual path is complete.

## Sub 9 Test Mapping

Regression tests should cover these classes of failure:

- Already-processing skip maps to skipped outcome.
- Resolved graph provider is probed for daemon and manual paths.
- Generic `modelProvider: gemini` does not bypass graph-provider readiness.
- Provider unreachable does not mark `dream` completed.
- Backpressure and lease-held states are recorded as skipped with blocker
  metadata.
- Stale and malformed leases recover before work runs.
- DreamService readiness timeout reports the dependency surface.
- `autoDream` boot trigger is distinguishable from orchestrator trigger.
- Direct provider construction in graph-generation services is rejected by
  focused source or unit coverage.
- Context guardrail skip records payload estimate and effective caps.
- Topology provider failure returns a failed topology stage, not no-conflicts.
- JSON repair exhaustion returns extraction-failed with attempt count.
- Provenance culls are counted and do not disappear into logs only.
- Lazy-edge queue drain is either in-cycle and tested, or out-of-cycle with an
  explicit coordinator/test owner.

## Operator Notes

- Do not use a successful `dream.lastSuccessAt` timestamp alone as proof of a
  successful REM digest. It currently can mean "DreamService returned without
  throwing".
- Do not trust `sandman_handoff.md` absence of alerts as proof that topology
  extraction ran; `TopologyInferenceEngine` can return void or catch provider
  errors.
- Before validating context-cap fixes, check ignored local `ai/config.mjs`.
  Template-only PRs do not update existing local overlays.
- Before running live Sandman cycles after this incident, capture a backup and
  ensure the current graph-provider and context-cap fixes are both effective in
  the runtime config.

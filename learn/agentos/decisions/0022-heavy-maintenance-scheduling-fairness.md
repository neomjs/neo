# ADR 0022: Heavy-Maintenance Scheduling Fairness Model

> Architectural Decision Record for how the `Orchestrator`'s scheduling picker selects work, so the REM/Dream chain (`memory-summary-backfill` → `summary` → `dream` → `golden-path`) drains to idle in bounded time instead of a backlog-draining `summary` monopolizing the single heavy-maintenance lease. Graduated from Discussion #13594. **Extends — does not fork — ADR-0014's scheduler task taxonomy:** ADR-0014 classifies lanes on the *deployment* axis (cloud-deployable / local-only / shared primitive); this ADR adds the orthogonal *fairness / dispatch-priority* axis on top of those same lanes.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-06-20 (graduated from Discussion #13594; §5.2 Step-Back SOUND, §6.2 family-keyed quorum met — Claude/Opus signals + GPT-family `[GRADUATION_APPROVED]`. Human merge gate per ADR-0005 lifecycle.) |
| **Author** | @neo-opus-grace (Grace, Claude Opus 4.8) drafting; substrate-truth grounded in the live `ai/daemons/orchestrator/` source audited at `dev` |
| **Resolves** | #13604 — *"Heavy-maintenance scheduling fairness ADR"* (graduated from Discussion #13594) |
| **Graduated from** | Discussion #13594 (*Cost-aware + dependency-ordered scheduling for the orchestrator's heavy-maintenance lane*) |
| **Depends on** | ADR-0014 (scheduler task taxonomy — **extended here, not forked**), ADR-0019 (config SSOT — every leaf extends an existing `leaf()`), ADR-0009 (cross-daemon heavy-maintenance lease) |
| **Implemented by** | #13586 (A — staleness-ratio picker, ✅ merged + live), #13592 (bounded lease-hold + soft `backfill→summary` gate), a conditional B′/E off-lease-multi-dispatch leaf (post-#13586+#13592, falsifier-gated) |
| **Anti-anchor for** | A first-class cost model as the scheduling default; a hard dependency-DAG; hard preemption of a running heavy task |

---

## 1. Context

The `Orchestrator`'s heavy-maintenance lane is a **single-mutex** seam: ADR-0009's cross-daemon lease serializes the heavy lanes (`summary` / `dream` / `backup` / `kbSync` / `primary-dev-sync` / `memory-summary-backfill`) so only one holds the heavy lease at a time. The picker that chooses *which* due task wins each poll was, before #13586, **registry-order static-priority**: the first due task in `TASK_REGISTRY` won, every poll.

That composition — single mutex + static registry priority + unbounded lease-hold — let a backlog-draining `summary` **monopolize** the one heavy lease and starve both its upstream prerequisite (`memory-summary-backfill`, which produces the per-turn mini-summaries an over-context-window session needs) and its downstream consumer (`dream` → `golden-path`). Live forensic anchor (Discussion #13594, 2026-06-20): `get_rem_pipeline_state` showed undigested 371 / sessionNodes 304 / `recentCycles: []` — `dream` starved behind `summary`'s monopoly → the graph lagging Chroma's 1,354 summaries → the Golden Path topology weeks-stale.

#13586 (the staleness-ratio fair picker) fixed the **dominant** symptom: it replaced registry-order with `backup`-prio-0 → staleness-ratio → registry-fallback, so a weeks-stale `golden-path` or a starved `memory-summary-backfill` out-ranks a just-drained `summary` at each lease release. Discussion #13594 then asked the deeper question — *is the model right?* — and converged, across three model families (Claude/Opus + GPT), on the minimal model this ADR records as the Decision.

**Substrate audited at `dev`:** `ai/daemons/orchestrator/scheduling/{picker,pipeline,registry}.mjs`, `ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs`, `ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs`, `ai/daemons/orchestrator/services/GoldenPathSynthesizer.mjs`, `ai/services/memory-core/SessionService.mjs`.

## 2. Decision

### 2.1 The lever is OQ3 (one-winner-per-poll), not OQ1 (a cost model)

The convergence's central correction (it overturned the proposal's own opening framing): the cost-asymmetry *symptom* — `golden-path` synthesis is near-free pure math (semantic-distance + structural-weight scoring, plus one tiny optional LLM brief) while `summary` / `dream` / `memory-summary-backfill` are full multi-minute model inferences — is **not** a lease problem. `golden-path` already runs **off** the heavy lease (`pipeline.mjs` → `executeWithGoldenPathDependencyGate`, no `acquireLease`). The residual delay is purely that the picker selects **one** winner per poll across all due tasks, so a near-free off-lease task still waits a quantum behind whatever wins.

The fix is therefore the **one-winner-per-poll** lever, not a first-class cost model: after the single heavy winner, also dispatch the due non-heavy / off-lease lanes that do not contend for the lease.

### 2.2 The converged minimal model

> **A** (staleness-ratio picker — #13586, ✅ live) **+ B′/E** (off-lease / non-heavy **multi-dispatch**: an *additive* second dispatch-pass internal to the scheduling pipeline) **+ a soft `memory-summary-backfill → summary` gate** (reuse the existing `dream`-dependency deferral-only precedent) **+ stall-observability** on the durable health / task-state flow.

The full cost-model and the hard dependency-DAG are **held as escalation paths with named falsifiers** (§2.5), not adopted as defaults.

- **A — staleness-ratio (live, #13586).** `selectByPriority` ranks due candidates: priority-0 data-safety task (`backup`) wins unconditionally; otherwise the most-overdue-by-`(now − lastRunAt)/cadenceMs` candidate among the lease-competing set wins; registry order breaks the cross-class boundary and ties. Emergent fairness — a starved lane out-ranks a freshly-drained one — with no explicit edges.
- **B′/E — off-lease multi-dispatch (conditional leaf).** The residual one-winner-per-poll wait is closed by a second dispatch pass that runs the already-surviving non-heavy / off-lease due lanes after the heavy winner. It is **additive** (§2.4 AC-2): it preserves the pipeline's `{winner: Object|null}` return shape, extending it with an `alsoDispatched` set, because the single-winner contract is load-bearing for every scheduling test and the fire-and-forget `Orchestrator.poll()` consumer.
- **Soft `backfill → summary` gate.** A session that overflows the chat-model context window degrades its summary to per-turn mini-summaries produced by `memory-summary-backfill` — a real producer→consumer dependency. It is modeled as a **soft, deferral-only** edge (defer `summary` for a session when `backfill` is due-and-behind; same-poll re-check; never a hard block), reusing the exact `recordDeferral → return false` shape `golden-path`'s `dream` dependency already uses. This dodges a hard-DAG's deadlock failure mode.
- **Stall-observability.** A lease-held-duration + deferral-chain-depth gauge rides the **durable** health-outcome / task-state flow (not an ephemeral in-memory set), so "is the chain draining to idle?" is a watchable first-class metric rather than an unobservable policy.

### 2.3 The categorical task split (extends ADR-0014's taxonomy)

OQ1 resolves *away* from a cost model toward a **categorical** distinction that maps directly onto ADR-0014's existing lane classes — it does not introduce a competing taxonomy:

- **Resource-mutex tasks** contend for the heavy-maintenance lease (`summary`, `dream`, `backup`, `kbSync`, `primary-dev-sync`, `memory-summary-backfill`, `tenant-repo-sync`). Fairness among them is the staleness-ratio picker (A).
- **Semantic-prerequisite / off-lease tasks** contend on graph freshness or a dependency gate, not the lease (`golden-path` — graph-dependent, gated on `dream`). These are the multi-dispatch beneficiaries (B′/E).

This split is *why* static registry-priority masqueraded as scheduling: it collapsed two different contention models into one ordered list. ADR-0014 already encodes the underlying lane identities (heavy-lease vs off-lease/dependency-gated vs deployment-disabled); this ADR reads fairness/dispatch policy off those classes. Cost-*within*-the-non-heavy-class is escalation-only (§2.5).

### 2.4 The four binding constraints (graduation ACs)

From Discussion #13594's §5.2 Step-Back (SOUND, 0 blockers, 4 ⚠ → 4 ACs). These bind the implementation leaves:

- **AC-1 (authority).** The Discussion body and this ADR lead with the OQ3-lever model; the original cost-model framing is retained only as divergence history. (Satisfied.)
- **AC-2 (return-shape).** B′/E is an additive second dispatch-pass internal to the scheduling pipeline, preserving `{winner: Object|null}` (extended with `alsoDispatched`), **not** a `winner → winners` rename. The picker already exempts non-heavy candidates from the exclusive-heavy filter, so the change is minimal; the same-poll dependency-handoff re-collect must be preserved.
- **AC-3 (durable observability).** The stall-gauge + the soft-gate deferral state ride the durable health-outcome / task-state flow, **not** an ephemeral in-memory `Set` that resets on restart. The `embed-drain-liveness-watchdog` is the precedent shape.
- **AC-4 (sequencing).** The B′/E leaf is filed only **after** #13586 + #13592 land, gated on the live falsifier (§2.5). It is its own leaf, not bundled.

### 2.5 Escalation paths with named falsifiers

The rejected-as-default alternatives are not deleted — they are **conditional escalations** with explicit falsifiers, so a future maintainer escalates on evidence, not preference:

- **Full cost-tiered scheduling (B).** Escalate **iff** a future cheap task is *not* off-lease (i.e. it must take the heavy mutex) — then off-lease bypass alone cannot help and a real cost model is warranted. Today no such task exists.
- **Hard dependency-DAG (C).** Escalate **iff** the soft deferral gate is empirically shown to under-serialize a chain that *must* be ordered. The soft gate's same-poll re-check self-balances; a hard edge risks over-serialization / deadlock.
- **B′/E itself (AC-4 falsifier).** Build the multi-dispatch leaf **iff** live logs, post-#13586+#13592, still show a cheap off-lease lane (`golden-path`) waiting behind unrelated heavy backlog at a poll boundary. If instead the wait is `dream` absent/running, the defect is dream-freshness, not dispatch — and B′/E is **not** filed.

## 3. Decision Process — Rejected Alternatives (as defaults)

| Option | Rejection-as-default rationale (retained as escalation per §2.5) |
|---|---|
| **First-class cost model (OQ1 original framing)** | The author's own over-reach, corrected by the convergence. `golden-path` already runs off the lease; the residual is one-winner-per-poll, not cost. A cost substrate is heavier machinery than the lever requires — escalation-only. |
| **Hard dependency-DAG** | A hard edge can over-serialize and deadlock (`summary` blocked forever if `backfill` never drains); staleness + a soft deferral gate self-balance without that failure mode. |
| **Hard preemption of a running heavy task** | #13586 explicitly rejected hard-preempt; killing a mid-flight multi-minute inference wastes the work. Bounded lease-hold (#13592) is the safer half of the duration concern. |
| **`winner → winners` pipeline return-shape change** | Breaks every `result.winner` scheduling assertion and the fire-and-forget `Orchestrator.poll()` consumer for zero benefit; the additive `alsoDispatched` pass (AC-2) is strictly smaller. |
| **A parallel cost/priority config substrate** | Violates ADR-0019 "use the existing leaf": fairness reads off the frozen registry's existing `maintenanceClass` / `backpressure` identity + the existing `DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS` seam. No new metadata contract. |

## 4. Consequences

### Positive
- **The REM chain drains to idle in bounded time** — a starved `dream` / weeks-stale `golden-path` out-ranks a re-firing `summary`, so the chain settles instead of a backlog monopolizing the lease.
- **Cloud-safe by construction** — the picker's eligibility is *is-a-due-candidate*; an ADR-0014 disabled-in-cloud lane has a null `getDueTask` → never a candidate → never picked or multi-dispatched. The fairness model needs no cloud-profile fork; it inherits ADR-0014's deployment classification unchanged.
- **Minimal blast radius** — every piece extends an existing primitive (the picker's filter stages, the deferral-gate shape, the compatible-pairs seam, the health-outcome flow) per ADR-0019. No new subsystem.
- **Watchable** — the stall-observability AC makes "draining to idle?" a first-class durable metric.

### Negative / handoffs
- **B′/E is conditional** — its value is gated on the live falsifier (§2.5 / AC-4); if the wait turns out to be dream-freshness, the multi-dispatch leaf is never built, and the §2.2 model ships as A + soft-gate + observability only.
- **Soft-gate vs eventual starvation** — a soft `backfill → summary` gate that defers indefinitely if `backfill` never drains is *advisory*; the stall-gauge (AC-3) is the backstop that surfaces such a stuck chain for operator attention rather than silently deadlocking.
- **The `alsoDispatched` second pass adds a density bound** — it must dispatch only the few cheap off-lease lanes per poll (`golden-path` / `swarm-heartbeat`), never two heavy tasks; the heavy backlog continues to drain serially on the lease. (`tenant-repo-sync` is **not** in this set — per ADR-0014 it is `periodic, heavy` / resource-mutex, §2.3 — it drains on the lease, not via the cheap second pass.)

## 5. Anti-Patterns

### 5.1 Reintroducing static registry-priority as the fairness model
Collapsing the resource-mutex and semantic-prerequisite contention models back into one ordered list is the exact shape that let `summary` masquerade as highest-priority and monopolize the lease.

### 5.2 Making the second dispatch-pass lease-acquiring
B′/E multi-dispatch is for off-lease / non-heavy lanes only. Generalizing it to anything that acquires the heavy lease re-creates the single-mutex contention it exists to bypass, and breaks the cloud-density bound (§4).

### 5.3 A hard `backfill → summary` edge
A hard block (vs the soft deferral-only gate) reintroduces the deadlock falsifier the soft-gate precedent exists to dodge. The gate defers + re-checks; it never hard-blocks.

### 5.4 Forking ADR-0014's taxonomy
This ADR's categorical split (§2.3) *reads off* ADR-0014's lane classes. A competing cost/priority taxonomy that re-classifies lanes independently drifts from the deployment-classification source of truth and reintroduces the dual-model confusion (§5.1).

## 6. Boundary — What this ADR does NOT decide

- **The bounded lease-hold cap value** — #13592 owns the cap + the 6h-TTL crash-recovery story.
- **Whether B′/E is built at all** — the §2.5 / AC-4 falsifier decides, post-#13586+#13592, from live evidence.
- **The stall-gauge's exact threshold + alarm cadence** — AC-3 mandates the durable-flow placement; the threshold tuning is the implementing leaf's call.
- **Provider-endpoint / deployment-mode concerns** — owned by ADR-0014 and its subs.

## 7. Related

- **Graduated from:** Discussion #13594 (*Cost-aware + dependency-ordered scheduling for the orchestrator's heavy-maintenance lane*)
- **Resolves:** #13604
- **Implemented by:** #13586 (A — staleness picker, merged + live), #13592 (bounded-hold + soft gate), conditional B′/E leaf (AC-4-gated)
- **Depends on:** ADR-0014 (scheduler task taxonomy — extended, not forked), ADR-0019 (config SSOT), ADR-0009 (cross-daemon heavy-maintenance lease)
- **Related tickets:** #13590 (summary backlog settling), #12065 (Orchestrator-as-SSOT for the REM pipeline), #12073 (hierarchical summarization)
- **Substrate:** `ai/daemons/orchestrator/scheduling/{picker,pipeline,registry}.mjs`, `ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs`, `ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs`, `learn/agentos/DreamPipeline.md`

## 8. Status / Lifecycle

- **Proposed** — graduated from Discussion #13594 with §6.2 family-keyed quorum (Claude/Opus signals + GPT-family `[GRADUATION_APPROVED]`) and a SOUND §5.2 Step-Back. Becomes **Accepted** on merge to `dev` with cross-family review per ADR-0005. Human merge gate.
- **Periodic re-review trigger:** any PR that changes the scheduling picker's selection policy, adds a heavy-maintenance lane, or escalates one of the §2.5 paths (cost model / hard-DAG) MUST cite this ADR and record the escalation falsifier it satisfies.

Origin Session ID: `03a4b86f-ef24-4691-8d23-04e769fcd028` (Discussion #13594 graduation lineage)

Retrieval Hint: `query_raw_memories("heavy-maintenance scheduling fairness OQ3 lever staleness picker off-lease multi-dispatch soft backfill summary gate #13594 #13604")`

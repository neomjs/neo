# ADR 0009: Cross-Daemon Heavy-Maintenance Lease Inheritance via Env-Var Token

> Architectural Decision Record codifying the env-based parent→child lease-inheritance contract that extends `HeavyMaintenanceLeaseService` (#11505 / PR #11506) across nested spawn boundaries. Authority artifact for cross-daemon coordination decisions on the heavy-maintenance mutex; implementation companion is PR resolving #11519; this ADR is the graph-queryable WHY for the env-var contract shape.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-17 (awaiting #11519 PR merge to establish empirical substrate before transition to Accepted, per ADR 0005 lifecycle) |
| **Author** | @neo-opus-4-7 (Claude Opus 4.7) drafting; substrate-truth grounded in #11503 umbrella + #11519 cross-daemon design dialogue (`learn/agentos/AGENTS_ATLAS.md` §6.5 peer-role substrate-validation conventions) |
| **Implementation ticket** | #11519 — *"Cross-daemon lease coverage: orchestrator-side shared-lease adoption + env-var child inheritance"* |
| **Companion implementation PR** | PR resolving #11519 (this ADR's §2 contract becomes live substrate only after that PR merges) |
| **Anti-anchor for** | Self-defer regression on nested-cascade spawns (orchestrator-owned heavy task holding the lease + cascading a child that also reaches `withHeavyMaintenanceLease`); allowlist/bypass anti-patterns rejected in §3 |

---

## 1. Context

`HeavyMaintenanceLeaseService` (#11505 / PR #11506) introduced a shared file-based mutex preventing Chroma / SQLite / LLM maintenance lanes from overlapping across process boundaries. Lane C (#11507 / PR #11509) wired the four manual CLI scripts (`runSandman`, `syncKnowledgeBase`, `backup`, `syncGithubWorkflow`) to that mutex via `withHeavyMaintenanceLease`. Lane A (#11513 / PR #11514) added `backup` to `DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES` so the orchestrator's process-local `activeHeavyTask` check serializes it correctly.

Two substrate gaps remained:

1. **Orchestrator-side heavy tasks did NOT acquire the shared file lease.** `grep -rn 'withHeavyMaintenanceLease|acquireHeavyMaintenanceLease' ai/daemons/` returned only the primitive itself; the orchestrator used in-process `activeHeavyTask` only. Two concurrent orchestrator instances (e.g., operator restart-overlap, or one ai-data sync daemon + one local-dev daemon) could each run `summary` / `kbSync` / `backup` concurrently — exactly the cross-process collision the lease was supposed to prevent.

2. **Nested cascade self-defer hazard.** Once the orchestrator acquires the lease for `primary-dev-sync`, its `PrimaryRepoSyncService.runKbSync()` cascade shells out to `npm run ai:sync-kb` (Lane C-wrapped). The child's `withHeavyMaintenanceLease` would see its OWN parent's lease and defer with `held` — **self-defer bug**. The cascade kbSync would never run; `primary-dev-sync` would complete its git work without the dev-checkout's KB sync.

Both gaps had to land together — adding orchestrator-side wrapping without inheritance creates the self-defer hazard; adding inheritance without orchestrator-side wrapping doesn't close the actual cross-daemon substrate gap.

**Empirical anchor — #11503 peer-role design dialogue:** Substrate audit across 5 surfaces (orchestrator wrap point + 2 spawn sites + lease entry + lease file shape) surfaced four candidate inheritance mechanisms; Option A (env-var token inheritance) was selected over Options B/C/D as the substrate-minimal shape per §3 Decision Process below.

---

## 2. Decision: Env-Var Token Inheritance Contract

### 2.1 Inheritance Signal — `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`

A parent process holding an acquired heavy-maintenance lease MAY export its lease's `token` field to a spawned child via the environment variable `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`. When the child invokes `withHeavyMaintenanceLease`, the wrapper:

1. Reads `process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN` at entry.
2. If unset / empty → falls through to normal `acquireHeavyMaintenanceLease` semantics. No behavior change.
3. If set → calls `inspectHeavyMaintenanceLease` and checks `current.lease.token === env-token`.
4. **Match** → returns `{status: 'inherited', acquired: false, lease}` and runs the task body WITHOUT acquire/release on the lease file. The parent retains ownership; child task simply executes under the inherited lease window.
5. **Mismatch** (lease missing, token differs, stale-replaced by another owner) → falls through to normal `acquireHeavyMaintenanceLease` semantics. Mismatch is treated as "no inheritance available," not as an error — the child either acquires its own lease (path: empty) or defers with `held` (path: another owner active).

### 2.2 Producer Sites (parent writes the env-var)

Two producer sites in `ai/daemons/`:

| Site | File:line | Behavior |
|---|---|---|
| Orchestrator child-spawn for heavy tasks | `ai/daemons/Orchestrator.mjs#createMaintenanceExecutor` (post-#11519) | After `acquireHeavyMaintenanceLeaseSync` succeeds for a heavy task, the wrapper passes `{env: {NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: acquisition.lease.token}, onComplete: releaseFn}` to `ProcessSupervisorService.runTask`. Spawned child inherits the env. |
| PrimaryRepoSyncService cascade spawn | `ai/daemons/services/PrimaryRepoSyncService.mjs#runKbSync` (post-#11519) | Reads `process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN` (set by its own orchestrator parent above) and explicitly forwards via `execFileSyncFn(npmBin, ['run', 'ai:sync-kb'], {env: {...process.env, NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: inheritedToken}, ...})`. The cascade child inherits transitively. |

### 2.3 Consumer Site (child reads the env-var)

Single consumer: `withHeavyMaintenanceLease` in `ai/daemons/services/HeavyMaintenanceLeaseService.mjs`. Inherits the contract for all consumers automatically — both orchestrator-spawned children (which themselves may call `withHeavyMaintenanceLease` via Lane C wrappers) and operator-invoked CLI scripts (e.g., `npm run ai:sync-kb` cascade target).

### 2.4 Sync Overloads — Orchestrator Poll Compatibility

`acquireHeavyMaintenanceLeaseSync`, `releaseHeavyMaintenanceLeaseSync`, `inspectHeavyMaintenanceLeaseSync` are introduced as parallel synchronous variants of the async primary API. **Rationale:** the orchestrator's poll cycle is synchronous; making `createMaintenanceExecutor` async would break the test contract that `orchestrator.poll()` is observable synchronously post-call. The sync overloads share `buildLeasePayload` + `isLeaseStale` + the exact return-shape contract with the async path — only the IO seam differs. CLI scripts and operator-invoked entry points continue to use the async surface via `withHeavyMaintenanceLease`.

---

## 3. Decision Process — Why Token Match Over Alternatives

Four candidate inheritance mechanisms were evaluated during the #11503 peer-role design dialogue. Option A (env-var token inheritance) was selected for the substrate-minimal property: zero changes to the lease file shape, zero new surfaces to audit, the existing `token` field carries the inheritance contract.

| Option | Rejection rationale |
|---|---|
| **B — Allowlist in lease file**: parent appends spawned child PID to a `permittedPIDs` array in the lease payload. | File-mutation outside the acquire/release boundary creates a concurrency hazard (multiple parents simultaneously appending). Shape-bloat for a single feature. PID can be reused after process death, falsely re-inheriting. |
| **C — Forced bypass env-var**: a separate `NEO_HEAVY_MAINTENANCE_LEASE_BYPASS=1` env-var causes the child to skip lease entirely. | Loses auditability — any env-injection bypasses substrate protection without proving lineage. Hostile to incident forensics: a "bypass" footprint never traces back to the legitimate parent. |
| **D — Same-owner-string re-entrancy**: child supplies the same `owner` string; primitive treats same-owner re-acquire as inheritance. | Ambiguous when two daemons both run `summary` — same owner string, different processes, ACTUALLY contending — would falsely inherit when they should defer. Token uniqueness is the load-bearing property. |
| **A — Env-var token inheritance** ✓ | Lease file shape unchanged (token already present); spawn call sites unchanged structurally (only `env` parameter added); audit trail preserved (env-var carries inheriting owner identity; lease file still records single owner — the parent); stale-recovery safe (TTL handles parent-death; child's stale env-var defers correctly to new owner via mismatch fall-through); test isolation trivial (env unset by default in spec processes). |

---

## 4. Audit-Trail Rationale

A core property of #11503's substrate is **auditability**. Operator dashboards + Memory Core graph ingestion + post-incident forensics rely on `lease.owner` + `lease.pid` + `lease.acquiredAt` to distinguish "who held the substrate-heavy mutex at time T."

The env-var inheritance contract preserves auditability because:

- **Single-owner-per-window invariant:** the lease file always names exactly one owner (the parent). Inheritance does not write a "second owner" or fork the file. The child's task executes under the parent's name from the audit perspective.
- **Inheritance is read-only:** the child neither writes nor mutates the lease file when inheriting. Side-effects only fire when the parent ultimately releases.
- **Mismatch is observable:** if a child's env-var token doesn't match the file's token, the fall-through to normal acquire is logged via the standard `recordCrossDaemonLeaseDeferral` outcome — operators see the contention with reasonCode `heavy-maintenance-lease-held`, including `holdingOwner` for diagnostic.

The deliberate audit-trail design rejects Option C (forced-bypass env-var) precisely because bypass would create an invisible inheritance path with no name-and-PID trail.

---

## 5. Boundary Conditions

### 5.1 Lease File Missing
Env-var set but file does not exist on disk (e.g., parent died, TTL cleanup ran). `inspectHeavyMaintenanceLease` returns `status: 'missing'`. No token to match → falls through to normal acquire path. Child task may safely acquire its own lease.

### 5.2 Token Mismatch
Env-var set, file exists, but `lease.token !== process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`. No inheritance → falls through to normal acquire path. Child either acquires (if owner is stale) or defers with `held` (if owner is active).

### 5.3 Stale-Replaced Parent
Env-var captured token-X; parent died before child executed; TTL expired; another owner has stale-acquired with token-Y. Child's env=X, file has token=Y → mismatch → falls through. New owner's active lease deflects child to defer with `held`. **No false inheritance under stale-replaced parent.**

### 5.4 Cross-Process Tooling (CLI scripts)
Operator-invoked `npm run ai:sync-kb` outside an orchestrator-managed cascade does NOT have `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN` set; falls through to normal acquire. Behavior unchanged from PR #11509.

---

## 6. Status / Lifecycle

This ADR is **Proposed** at filing. Transition to **Accepted** is gated on:

1. PR resolving #11519 merges to `dev`.
2. Operator validates orchestrator boot + cascade behavior under the new contract on a real `npm run ai:orchestrator` cycle (L4 evidence per `learn/agentos/process/evidence-ladder.md`).
3. Optional: 7-day observation window for any cross-daemon collision regressions before transitioning to Accepted.

Per ADR 0005, Proposed status is acceptable for future-agent `ticket-intake` reads as authoritative-pending-empirical-validation context.

---

## 7. Related Substrate

- **Parent umbrella**: #11503 (Enforce heavy-maintenance mutex across Agent OS tasks)
- **Substrate primitive**: PR #11506 / #11505 (`HeavyMaintenanceLeaseService` — primitive extended by this ADR)
- **Sibling Lane A**: #11513 / PR #11514 (orchestrator's `backup` joins heavy set + cross-poll tests)
- **Sibling Lane C**: #11507 / PR #11509 (manual CLI script lease adoption)
- **Sibling consumer-guidance**: #11515 / PR #11518 (release-timing JSDoc + spec)
- **Implementation ticket**: #11519 (this ADR's companion ticket)
- **Future surface**: Lane E observability/stale-collision health surfaces (unfiled; expected post-merge friction → gold candidate)

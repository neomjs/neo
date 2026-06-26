# ADR 0027: Autonomous Memory Core Data-Recovery Actuator

> Architectural Decision Record for the **data-mutation half** of the deployment immune system: the Memory-Core-resident **data-recovery actuator** that consumes a corruption/maintenance **mode** (derived by the ADR-0025 detect half + the runner-classifier) and applies **one bounded, snapshot-protected, rate-limited data-repair action** — or **freezes / records** when the residue is systemic or not-yet-healable. The load-bearing decision is the **two-worlds split**: ADR-0026 governs the **lifecycle/config world** (restart a container, re-apply an env override — cheap, reversible, "never code-exec"); **this ADR governs the data world** (re-embed missing vectors, restore rows, quarantine a collection — mutating the MC graph itself, the substrate the organism *remembers* with). A botched data heal corrupts memory, so the data-world envelope is **stricter** than the lifecycle envelope (snapshot-before-mutate + validation-clean auto-promote + systemic-fault freeze + auto-reopening loss fingerprints) and is fixed **before** any wired-mutation code. The second load-bearing decision is the **operator-directed boundary change**: v13.1's premise is operatorless cloud self-healing, so **`escalate` is removed from the live recovery path** — safety lives entirely in the autonomous envelope, never a human gate that does not exist in cloud.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-06-26 (graduated from Discussion #14032 → #14134; v13.1 epic #14039 act-half; pending human merge gate per ADR-0005 lifecycle). **Merge-ordered with/after #14143** — the executable dispatch-core proof lives there, so this record never cites unmerged code as established. |
| **Author** | @neo-opus-grace (Grace, Claude Opus 4.8, Claude Code) — authored the actuator envelope, the heal-action vocabulary, and the OQ1/OQ9 resolutions on #14032. The detect≠actuator separation and the persisted anti-thrash discipline are inherited from ADR-0025/ADR-0026's cross-family convergence with @neo-gpt (Euclid) and carried forward via the §2.1 successor-risk audit. |
| **Resolves** | the new-ADR requirement — Discussion #14032 **OQ1 [RESOLVED_TO_AC]** ("file a *new* ADR for the autonomous data-recovery actuator envelope; ADR-0026 remains lifecycle/config authority") — tracked under #14134. |
| **Parent epic** | #14039 — *"Agent OS Stability & Self-Healing — the v13.1 data-integrity immune system."* |
| **Depends on** | **ADR-0025** (detect + diagnose — the raw evidence the classifier consumes), **ADR-0026** (the lifecycle/config actuator — the *two-worlds sibling*; this ADR is its data-world complement, not its extension), **ADR-0019** (config SSOT — every bound is an existing `leaf()`, never a parallel reader), **ADR-0009** (durable harness-state — the recovery-run-state + the durable audit reuse the lease layer, never process memory). |
| **Connects to** | **#14109** (the runner-classifier that derives the mode and calls `applyHeal`), **#14139** (the producers emitting raw evidence, not `actionClass: escalate`), **#14137** (the autonomous accepted-loss settlement — OQ9's shipped artifact, the fingerprint-bound terminal), **#14132** (the DELETE-`escalate` umbrella this ADR formalizes), the **pure dispatch core** under review in **#14143** (`ai/services/memory-core/helpers/healActionDispatch.mjs`, 20/20). |
| **Implemented by** | the **`DataRecoveryActuatorService`** (the wired `applyHeal({action, collection, evidence, now})` seam → `dispatchHeal` with real injected repair primitives + recovery-run-state) under #14134; the **pure dispatch core** `healActionDispatch.mjs` (**under review in #14143** — the bounded, fail-closed action-admission decision). |
| **Anti-anchor for** | `escalate`-to-operator as a **live** recovery terminal (cloud has no operator; escalation is demoted to non-blocking evidence/logging — safety lives in the envelope, not a human gate); **silent** data acceptance (every accepted loss is a durable, fingerprint-bound, **auto-reopening** audit record, never a quiet drop); **ADR-0026 expansion** into data mutation (the two-worlds boundary: lifecycle/config ≠ data, each with its own envelope); **mass auto-re-embed** during a false dimension-storm (the systemic-fault `freeze`); an **un-snapshotted** mutating heal (snapshot-before-mutate + validation-clean auto-promote is binding); folding the **mode classifier into the actuator** (the actuator is mode-blind — it admits an *action* within the envelope, it does not re-derive the mode). |

---

## 1. Context

The v13.1 deployment immune system is three ADRs, one organism:

- **ADR-0025 (detect + diagnose):** samples Memory-Core data-integrity reality (vector-coverage gaps, document presence, row-count deltas, dimension-mismatch rate, SQLite integrity) and emits **raw evidence**. Load-bearing principle: detect-signal ≠ actuator-authority.
- **ADR-0026 (lifecycle/config recovery):** consumes a diagnosis and applies one bounded **lifecycle** action (restart / recycle / throttle / reconfigure) — the *config + lifecycle world*, "never code-exec / dynamic-import."
- **This ADR (data recovery):** consumes a **classifier-derived mode** and applies one bounded **data** action (re-embed / restore / quarantine / freeze / defrag) — the *data world*, mutating the MC graph itself.

**Why a new ADR and not an ADR-0026 amendment (the two-worlds split).** ADR-0026's actions mutate **lifecycle/config**: a restart is cheap and self-reversing; re-applying an env override is idempotent. The blast radius of a botched lifecycle heal is a thrashing container — bad, but bounded by the anti-thrash ledger. **Data** actions are categorically different: re-embedding vectors, restoring rows, or quarantining a collection mutate **the substrate the organism remembers with**. A botched data heal does not thrash a process — it *corrupts memory*, silently and possibly irreversibly. The two worlds therefore need **different envelopes**: the data world adds **snapshot-before-mutate + validation-clean auto-promote** (a mutating heal proves itself on a shadow/copy before it touches the live collection) and the **systemic-fault freeze** (a mass-terminal residue is a misconfigured embedder, never a thing to mass-repair) — safety properties the lifecycle envelope neither has nor needs. Collapsing them into one actuator would either over-constrain lifecycle or under-protect data. OQ1 of #14032 resolved this explicitly: **a new ADR; ADR-0026 stays lifecycle/config.**

**Why `escalate` is removed from the live path (the operator-directed boundary change).** This is the explicit high-blast hinge @neo-opus-vega's STEP_BACK required this ADR to document, not smuggle. ADR-0025/0026 inherited an **escalate-with-diagnosis-when-un-healable** terminal — *page a human operator who decides*. v13.1's premise (epic #14039, operator directive #14132) is **operatorless cloud self-healing**: in a cloud deployment there is no human in the loop, so an `escalate` terminal pages a **nonexistent** operator — the smoke-detector-not-fire-extinguisher failure. This ADR therefore **removes `escalate` from the live data-recovery path**: producers emit raw evidence (not `actionClass: escalate`), the runner derives a mode, and the actuator applies an autonomous terminal. Escalation survives only as **non-blocking evidence/logging** for unhealable or not-yet-implemented residue — a record, never a blocking page. Safety does not weaken; it **moves from the human gate into the envelope** (fail-closed selection, anti-thrash, rate limits, systemic bounds, snapshot/reversibility, durable audit, empty-blocklist default).

**Substrate audited at `dev`/the v13.1 branches:** `ai/services/memory-core/helpers/healActionDispatch.mjs` (the pure dispatch core under review in #14143 — `decideHealAction` fail-closed admission + `dispatchHeal`), `ai/services/memory-core/helpers/classifyRepairResidue.mjs` (the residue classifier + `TERMINAL_REASONS` + `computeResidueFingerprint`), `ai/scripts/maintenance/defragChromaDB.mjs` (the autonomous accepted-loss settlement, #14137 — OQ9's live terminal), ADR-0026 (the lifecycle sibling whose envelope this complements).

## 2. Decision

### 2.1 Inherit-audit — properties carried forward from ADR-0025/0026 (and the deliberate DEPARTURES)

This ADR is a **successor** to the ADR-0026 actuator model on the two-worlds split. Per the successor-risk audit, the inherited safety properties are **kept, not re-derived** — and the **departures** (where the data world deliberately diverges) are named so a future agent cannot silently collapse them:

| Property (origin) | Status here |
|---|---|
| **detect ≠ actuator** (ADR-0025) | **KEPT + sharpened** — the actuator consumes a classifier-derived *mode*, never a raw probe; the classifier single-sources the mode taxonomy (§2.5) |
| **persisted anti-thrash state** (ADR-0026 §2.5) | **KEPT — binding** — `recentRuns` / recovery-run-state lives in the durable harness-state store (ADR-0009), survives restart; a data heal that re-fires across a restart is the loop this forbids (§2.4) |
| **one bounded action → cooldown → re-observe** (ADR-0026 §2.5) | **KEPT — binding** (§2.4) |
| **opt-out activation, empty-blocklist default** (ADR-0026 §2.2, #13952) | **KEPT** — autonomous-by-default; `NEO_*_BLOCKED_*` opt-out per target (§2.4) |
| **config + lifecycle only / never code-exec** (ADR-0026 two-worlds) | **N/A here — this *is* the other world.** Data mutation is the explicit complement; the "never code-exec" boundary is unchanged (data heals are bounded data ops, not arbitrary code) |
| **escalate-with-diagnosis when un-healable** (ADR-0025/0026) | **DEPARTED — removed from the live path** (§2.2). Unhealable residue is recorded (non-blocking), never paged. The cloud premise removes the operator the escalate assumed |
| **reversibility** (ADR-0026: restart is self-reversing) | **STRENGTHENED — snapshot-before-mutate + validation-clean auto-promote** (§2.4). Data mutation is not self-reversing, so reversibility is *engineered* (shadow/copy repair, promote only on validation-clean) |

### 2.2 Autonomous-by-default — `escalate` removed from the live recovery path (AC-1)

The live data-recovery path is **producer (raw evidence) → runner/classifier (mode) → `applyHeal({action, collection, evidence, now})` → autonomous terminal**. There is **no blocking operator-acknowledgement and no `escalate` action** in this path. `escalateDiagnosis` is demoted to non-blocking evidence/logging for residue that is unhealable or not-yet-implemented. This is binding: any reintroduction of an operator-gate or a blocking-escalate terminal into the data-recovery path reverses the v13.1 premise and is rejected at review (#14132).

### 2.3 The heal-action vocabulary and the actuator seam (AC-2)

The actuator seam is fixed: **`applyHeal({action, collection, evidence, now})`**, where

> `action ∈ { re-embed-missing, re-embed-rows, restore-delta-merge, quarantine, freeze, defrag, none }`

The actuator is **mode-blind** (the complement of ADR-0026 §2.4's controller-blind actuator): the classifier (§2.5) chooses the action; the actuator admits it only if the §2.4 envelope allows, executes it through an **injected** repair primitive, and records the outcome. **Containment** actions (`freeze`, `quarantine`) are non-mutating and always execute (fail-safe). **Mutating** actions (`re-embed-missing`, `re-embed-rows`, `restore-delta-merge`, `defrag`) are rate-/thrash-/snapshot-bounded. `restore-delta-merge` is **declared but v13.2-deferred** (OQ5/OQ8) — in v13.1 the `wipe` mode contains via `quarantine`; the actuator returns a recorded *deferred* outcome for `restore-delta-merge`, never a silent no-op. The pure admission decision is implemented in the #14143 dispatch core: `decideHealAction` → `{execute, status: 'execute' | 'no-op' | 'unknown-action' | 'unsafe-input' | 'thrash-cooldown' | 'rate-limited'}`, fail-closed on unknown actions AND on under-specified mutating inputs (missing collection / clock / bounds).

### 2.4 The autonomous data-mutation safety envelope (AC-3 — binding)

Every action the actuator applies passes the envelope; this is the safety that replaces the (absent) human gate:

- **Fail closed** on an unknown action or missing proof (`decideHealAction` → `unknown-action`, no execution).
- **Cooldown / anti-thrash** per action **and** collection (a wedged collection cannot be re-healed in a tight loop).
- **Rate-limit** mutating heal attempts per time window (`DEFAULT_DISPATCH_BOUNDS`: `maxRunsPerWindow`, `windowMs`, `cooldownMs` — config leaves per ADR-0019).
- **Systemic-fault freeze bound** — a terminal residue at or above the systemic bound (ratio **or** absolute) is a misconfigured embedder (the #14115 `expectedDimension` false-storm class), not a repairable loss: choose **`freeze` + record**, never mass auto-re-embed or mass auto-settle.
- **Snapshot-before-mutate + reversibility** — a mutating action snapshots the affected slice before touching it; the heal runs on a shadow/copy.
- **Auto-promote only after validation-clean** — the shadow/copy result is promoted to the live collection only when validation is clean; a dirty result is discarded (the snapshot stands), recorded, and not promoted.
- **Durable audit for every outcome** — `healed | frozen | quarantined | deferred | no-op | rate-limited` each writes a durable record (ADR-0009 store / the `auto-accepted-loss.jsonl` precedent from #14137). Audit is **observability, never a gate** — the system never blocks on a human reading it.
- **Auto-reopening loss fingerprint** — an accepted-loss terminal records the residue fingerprint (`computeResidueFingerprint`, shared with #14137); a later embedding-capability change re-opens the residue. The loss is **recorded-and-reversible, not silent**.
- **Empty-blocklist autonomous default** — enabled by default in cloud; `NEO_*_BLOCKED_*` per-target opt-out is the only restriction surface (no enumerate-before-acting).

### 2.5 Classifier → actuator routing (the mode-to-terminal table) (AC-4)

The runner-classifier (#14109) owns the mode taxonomy; the actuator consumes its output. The v13.1 routing (from the graduated #14032 contract):

| Mode | Autonomous terminal | Envelope note |
|---|---|---|
| `wal-stall` (coverage gap + documents present) | `warm-provider` (ADR-0026) **+** `re-embed-missing` (this ADR) | the lifecycle half routes to ADR-0026; the data half here |
| `wipe` (coverage gap + documents gone) | `quarantine` (v13.1); `restore-delta-merge` deferred v13.2 | data already left — contain, do not fabricate |
| `count-loss` (row count regressed) | `quarantine` | record + contain |
| `dimension-targeted` (mismatch below systemic bound) | `re-embed-rows` | bounded row repair |
| `dimension-systemic` (mismatch at/above bound) | `freeze` | never mass-re-embed a false storm |
| `sqlite-integrity` | `quarantine` | restore-class containment |
| `store-bloat` | `defrag` | maintenance, not corruption recovery |
| `clean` | `none` | no action |

**`warm-provider` stays in ADR-0026** — the `wal-stall` terminal is a *pair*: the provider-warming (lifecycle) is ADR-0026's actuator, the re-embed (data) is this actuator. The runner routes each half to its world. This is the two-worlds boundary in live operation.

### 2.6 Binding constraints (graduation ACs)

- **AC-1 — autonomous-by-default, no live escalate.** The data-recovery path has no operator-ack and no blocking-escalate terminal; escalation is non-blocking evidence only (§2.2, #14132).
- **AC-2 — fixed mode-blind seam.** `applyHeal({action, collection, evidence, now})`; the closed `HEAL_ACTIONS` vocabulary; the actuator admits an action within the envelope, it does not re-derive the mode (§2.3).
- **AC-3 — the data-mutation envelope is binding.** Fail-closed, anti-thrash, rate-limit, systemic-fault freeze, snapshot-before-mutate, validation-clean auto-promote, durable audit, auto-reopening fingerprint, empty-blocklist default (§2.4). A mutating heal that skips snapshot/validation-promote is rejected.
- **AC-4 — classifier single-sources the mode.** Producers emit raw evidence; the runner-classifier derives the mode; the actuator routes per §2.5. Producers do not re-implement terminal routing.
- **AC-5 — two-worlds boundary kept.** ADR-0026 owns lifecycle/config; this ADR owns data mutation; `warm-provider` stays in ADR-0026; neither actuator absorbs the other's world (§2.1, §2.5).
- **AC-6 — persisted anti-thrash, inherited.** `recentRuns` / recovery-run-state lives in the durable harness-state store (ADR-0009); a data heal re-firing across a restart is the forbidden loop.
- **AC-7 — v13.2 deferrals are recorded, not silent.** `restore-delta-merge`, the full corruption-%×mode cost selector, and the authoritative post-backup delta source are v13.2 (OQ5/OQ7/OQ8); in v13.1 they return a recorded *deferred* outcome, never a silent no-op or a premature mutation.
- **AC-8 — Memory-Core-resident SPOF, accepted + recorded.** The data actuator runs where the MC repair runs; if that host dies there is no data heal. Recorded so a future agent does not grant a second independent home without re-opening the privilege/locality decision (mirrors ADR-0026 AC-8).

## 3. Considered alternatives (rejected)

- **Extend ADR-0026 into data mutation (one actuator, both worlds).** Rejected (§2.1): data mutation needs snapshot-before-mutate + validation-clean auto-promote + the systemic-fault freeze — properties lifecycle neither has nor needs. One actuator would over-constrain lifecycle or under-protect data. OQ1 resolved to a new ADR.
- **Operator-gated data recovery (the original A-H surface).** Rejected (§2.2): cloud has no operator; an operator-gate is a perpetual block in the deployments v13.1 targets. Safety moves to the envelope (#14132).
- **`escalate` as a live data-recovery terminal.** Rejected (§2.2): it pages a nonexistent cloud operator (the detect→escalate-only smoke detector epic #14039 exists to dismantle). Demoted to non-blocking evidence.
- **Silent accepted-loss (drop unembeddable residue quietly).** Rejected (§2.4): every accepted loss is a durable, fingerprint-bound, auto-reopening audit record (#14137 / OQ9). Recorded-and-reversible, never silent.
- **Mass auto-re-embed on a dimension-mismatch storm.** Rejected (§2.4): a mass-terminal residue is a misconfigured embedder; the systemic-fault bound chooses `freeze`, never amplify the fault into a mass mutation.
- **Fold the mode classifier into the actuator.** Rejected (§2.3): welds the mode taxonomy into the actuator and forces a rewrite when a new corruption mode arrives. The mode-blind seam is the cost of not repaying that debt later (mirrors ADR-0026 §2.4).

## 4. Resolved and open questions

- **OQ1 — authority shape: RESOLVED (#14032).** A new ADR (this one) for the autonomous data-recovery envelope; ADR-0026 remains lifecycle/config.
- **OQ2 — automation default: RESOLVED (#14032).** Bounded, reversible, snapshot-protected operations automate by default; per-target blocklist opt-out; no operator-execution default.
- **OQ9 — accepted-loss: RESOLVED + SHIPPED (#14137).** An autonomous fingerprint-bound terminal settlement, not an operator acknowledgement; governed by the PR review/merge gate.
- **OQ5 / OQ7 / OQ8 — DEFERRED to v13.2.** `restore-delta-merge` + authoritative delta source + the full corruption-%×mode cost selector lack the empirical data to choose a selector; v13.1 contains `wipe`/`count-loss`/`sqlite-integrity` via `quarantine`. The deferrals return recorded *deferred* outcomes (AC-7).
- **Liveness / revalidation trigger.** Re-validate this ADR if the embeddability logic changes (the #14126 `strategyVersion` fingerprint-binding) or a new corruption mode appears (add a classifier mode + a heal action + a routing row); @neo-gemini-pro is `operator_benched` — re-poll Gemini liveness before citing #14032 for v13.2 restore/delta or a future amendment.

## 5. Consequences

The organism gains the **data act-half** of its immune response — and gains it **fully autonomous**, with no operator gate that cloud cannot honor. Paired with ADR-0026 (lifecycle/config) under ADR-0025 (detect+diagnose), the three ADRs are the v13.1 self-healing immune system: detect → classify → act, across both the lifecycle world and the data world, with escalation demoted to a record rather than a blocking page. The cost is the data-world envelope's strictness — snapshot-before-mutate, validation-clean auto-promote, the systemic-fault freeze, the auto-reopening loss fingerprint — which is *more* machinery than the lifecycle world needs, and is the deliberate price of mutating the substrate the organism remembers with. The v13.2 boundary is explicit: this ADR contains corruption; it does not yet *reconstruct* it (`restore-delta-merge` + the cost selector await empirical grounding). The wired `DataRecoveryActuatorService` (#14134) implements this envelope against the dispatch core (#14143); it is the only authority for autonomous Memory Core data mutation, and it must not widen its action set, bypass its envelope, or reintroduce a live operator gate without re-opening this ADR under cross-family review.

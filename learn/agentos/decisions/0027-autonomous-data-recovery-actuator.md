# ADR 0027: Autonomous Memory Core Data-Recovery Actuator

> Architectural Decision Record for the **data-mutation half** of the deployment immune system: the Memory-Core-resident **data-recovery actuator** that consumes a corruption/maintenance **mode** (derived by the ADR-0025 detect half + the runner-classifier) and applies **one bounded, snapshot-protected, rate-limited data-repair action** — or **freezes / records** when the residue is systemic or not-yet-healable. The load-bearing decision is the **two-worlds split**: ADR-0026 governs the **lifecycle/config world** (restart a container, re-apply an env override — cheap, reversible, "never code-exec"); **this ADR governs the data world** (re-embed missing vectors, restore rows, quarantine a collection — mutating the MC graph itself, the substrate the organism *remembers* with). A botched data heal corrupts memory, so the data-world envelope is **stricter** than the lifecycle envelope (snapshot-before-mutate + validation-clean auto-promote + systemic-fault freeze + auto-reopening loss fingerprints) and is fixed **before** any wired-mutation code. The second load-bearing decision is the **operator-directed boundary change**: v13.1's premise is operatorless cloud self-healing, so **`escalate` is removed from the live recovery path** — safety lives entirely in the autonomous envelope, never a human gate that does not exist in cloud.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-06-26 (graduated from Discussion #14032 → #14134; merged through #14141 after the ADR-0005 human gate). **Amended 2026-07-22 via #15739** for the separately graduated v13.2 `restore-empty-target` target-set action; the amendment is merge-ordered before #15740 and #15639. |
| **Author** | @neo-opus-grace (Grace, Claude Opus 4.8, Claude Code) — authored the actuator envelope, the heal-action vocabulary, and the OQ1/OQ9 resolutions on #14032. The detect≠actuator separation and the persisted anti-thrash discipline are inherited from ADR-0025/ADR-0026's cross-family convergence with @neo-gpt (Euclid) and carried forward via the §2.1 successor-risk audit. |
| **Resolves** | the new-ADR requirement — Discussion #14032 **OQ1 [RESOLVED_TO_AC]** ("file a *new* ADR for the autonomous data-recovery actuator envelope; ADR-0026 remains lifecycle/config authority") — tracked under #14134. |
| **Parent epic** | #14039 — *"Agent OS Stability & Self-Healing — the v13.1 data-integrity immune system."* |
| **Depends on** | **ADR-0025** (detect + diagnose — the raw evidence the classifier consumes), **ADR-0026** (the lifecycle/config actuator — the *two-worlds sibling*; this ADR is its data-world complement, not its extension), **ADR-0019** (config SSOT — every bound is an existing `leaf()`, never a parallel reader), **ADR-0009** (durable harness-state — the recovery-run-state + the durable audit reuse the lease layer, never process memory). |
| **Connects to** | **#14109** (the runner-classifier that derives the mode and calls `applyHeal`), **#14139** (the producers emitting raw evidence, not `actionClass: escalate`), **#14137** (the autonomous accepted-loss settlement — OQ9's shipped artifact, the fingerprint-bound terminal), **#14132** (the DELETE-`escalate` umbrella this ADR formalizes), the landed **#14143** pure dispatch core, **#15740** (the exact `restore-empty-target` action), **#15695** (its target-set scale gate), and **#15639** (the default-off selector/projection consumer). |
| **Implemented by** | The v13.1 **`DataRecoveryActuatorService`** + `healActionDispatch.mjs` seam under #14134/#14143. The v13.2 amendment is implemented only by #15740 after this ADR amendment lands; #15639 may submit typed bootstrap evidence and project the result, but does not mutate or select the terminal. |
| **Anti-anchor for** | `escalate`-to-operator as a **live** recovery terminal (cloud has no operator; escalation is demoted to non-blocking evidence/logging — safety lives in the envelope, not a human gate); **silent** data acceptance (every accepted loss is a durable, fingerprint-bound, **auto-reopening** audit record, never a quiet drop); **ADR-0026 expansion** into data mutation (the two-worlds boundary: lifecycle/config ≠ data, each with its own envelope); **mass auto-re-embed** during a false dimension-storm (the systemic-fault `freeze`); an **un-snapshotted** mutating heal (snapshot-before-mutate + validation-clean auto-promote is binding); folding the **mode classifier into the actuator** (the actuator is mode-blind — it admits an *action* within the envelope, it does not re-derive the mode); the retired overloaded **`restore-delta-merge`** vocabulary; per-collection or synthetic-collection substitutes for one logical target-set run; cross-store transactional-atomicity claims; and provider-gating preserved-vector restore. |

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

The live data-recovery path is **producer (raw evidence) → runner/classifier (mode) → `applyHeal({action, collection?, targetSet?, evidence, now})` → autonomous terminal**. Collection-scoped actions and the target-set action are mutually exclusive per §2.7. There is **no blocking operator-acknowledgement and no `escalate` action** in this path. `escalateDiagnosis` is demoted to non-blocking evidence/logging for residue that is unhealable or not-yet-implemented. This is binding: any reintroduction of an operator-gate or a blocking-escalate terminal into the data-recovery path reverses the v13.1 premise and is rejected at review (#14132).

### 2.3 The heal-action vocabulary and the actuator seam (AC-2)

The actuator seam is fixed: **`applyHeal({action, collection?, targetSet?, evidence, now})`**, where exactly one of `collection` and `targetSet` is accepted according to the action (§2.7), and

> `action ∈ { re-embed-missing, re-embed-rows, restore-empty-target, quarantine, freeze, defrag, none }`

The actuator is **mode-blind** (the complement of ADR-0026 §2.4's controller-blind actuator): the classifier (§2.5, §2.7) chooses the action; the actuator admits it only if the §2.4 envelope allows, executes it through an **injected** repair primitive, and records the outcome. **Containment** actions (`freeze`, `quarantine`) are non-mutating and always execute (fail-safe). **Mutating** actions (`re-embed-missing`, `re-embed-rows`, `restore-empty-target`, `defrag`) are rate-/thrash-/snapshot-bounded. The overloaded `restore-delta-merge` name is retired without a compatibility alias: exact empty-target recovery is §2.7's target-set action; row-addressable `restore-shadow-fill` and journal-backed replay remain unauthorized/deferred. The pure admission decision is implemented in the #14143 dispatch core: `decideHealAction` → `{execute, status: 'execute' | 'no-op' | 'unknown-action' | 'unsafe-input' | 'thrash-cooldown' | 'rate-limited'}`, fail-closed on unknown actions and on under-specified mutating inputs.

### 2.4 The autonomous data-mutation safety envelope (AC-3 — binding)

Every action the actuator applies passes the envelope; this is the safety that replaces the (absent) human gate:

- **Fail closed** on an unknown action or missing proof (`decideHealAction` → `unknown-action`, no execution).
- **Cooldown / anti-thrash** per action **and canonical recovery unit** — one collection for collection-scoped actions; one versioned destination topology for `restore-empty-target` (§2.7). A different bundle cannot evade the same target set's cap.
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
| `wipe` (coverage gap + documents gone) | `quarantine` | data already left — contain, do not fabricate; count/loss evidence cannot select target-set restore |
| `count-loss` (row count regressed) | `quarantine` | record + contain |
| `dimension-targeted` (mismatch below systemic bound) | `re-embed-rows` | bounded row repair |
| `dimension-systemic` (mismatch at/above bound) | `freeze` | never mass-re-embed a false storm |
| `sqlite-integrity` | `quarantine` | restore-class containment |
| `store-bloat` | `defrag` | maintenance, not corruption recovery |
| `clean` | `none` | no action |

**`warm-provider` stays in ADR-0026** — the `wal-stall` terminal is a *pair*: the provider-warming (lifecycle) is ADR-0026's actuator, the re-embed (data) is this actuator. The runner routes each half to its world. This is the two-worlds boundary in live operation.

`restore-empty-target` is not a renamed `wipe` terminal. It is selected only from the typed, default-off fresh-empty bootstrap diagnosis defined in §2.7, after all three target identities and the admitted bundle descriptor are present.

### 2.6 Binding constraints (graduation ACs)

- **AC-1 — autonomous-by-default, no live escalate.** The data-recovery path has no operator-ack and no blocking-escalate terminal; escalation is non-blocking evidence only (§2.2, #14132).
- **AC-2 — fixed mode-blind seam.** `applyHeal({action, collection?, targetSet?, evidence, now})` with action-specific XOR validation; the closed `HEAL_ACTIONS` vocabulary; the actuator admits an action within the envelope, it does not re-derive the mode (§2.3, §2.7).
- **AC-3 — the data-mutation envelope is binding.** Fail-closed, anti-thrash, rate-limit, systemic-fault freeze, snapshot-before-mutate, validation-clean auto-promote, durable audit, auto-reopening fingerprint, empty-blocklist default (§2.4). A mutating heal that skips snapshot/validation-promote is rejected.
- **AC-4 — classifier single-sources the mode.** Producers emit raw evidence; the runner-classifier derives the mode; the actuator routes per §2.5. Producers do not re-implement terminal routing.
- **AC-5 — two-worlds boundary kept.** ADR-0026 owns lifecycle/config; this ADR owns data mutation; `warm-provider` stays in ADR-0026; neither actuator absorbs the other's world (§2.1, §2.5).
- **AC-6 — persisted anti-thrash, inherited.** `recentRuns` / recovery-run-state lives in the durable harness-state store (ADR-0009); a data heal re-firing across a restart is the forbidden loop. For `restore-empty-target`, the cap binds to the bundle-independent recovery-unit key (§2.7), not the attempt fingerprint.
- **AC-7 — ungraduated restore surfaces stay explicit.** The legacy `restore-delta-merge` name is retired. `restore-shadow-fill`, journal replay, the full corruption-%×mode cost selector, and authoritative post-backup delta sourcing remain deferred/unauthorized; they never fall through to `restore-empty-target` or a silent no-op.
- **AC-8 — Memory-Core-resident SPOF, accepted + recorded.** The data actuator runs where the MC repair runs; if that host dies there is no data heal. Recorded so a future agent does not grant a second independent home without re-opening the privilege/locality decision (mirrors ADR-0026 AC-8).

### 2.7 `restore-empty-target` target-set recovery [Amendment 2026-07-22, #15739]

Discussion #14032's v13.2 revalidation graduates exactly one restore action at raw GitHub-body SHA-256 `9b3139f6678dca536407e3d5f0d426df83f9a28d281781a7e404a2cb692d684c`, with GPT-family author signal `DC_kwDODSospM4BDrCV` and Kimi-family non-author approval `DC_kwDODSospM4BDrB9`. It does not reopen the complete v13.1 envelope above.

#### 2.7.1 Authority and selection boundary

- The default-off #15639 bootstrap selector may emit a typed **fresh-empty bootstrap diagnosis**. This is an opt-in selection exception to the ordinary autonomous-by-default posture; after admission, mutation is autonomous inside this ADR's envelope.
- The orchestrator classifier alone maps that diagnosis to `restore-empty-target`. Bootstrap, diagnostics, and self-healing observers do not choose the terminal, call an importer, or spawn `restore.mjs`.
- `DataRecoveryActuatorService` remains the sole persistent recovery-mutation seam. Knowledge Base rebuilds from source and is outside this action.
- Preserved-vector restore performs no embedding-provider call. Embedding and eventual re-embedding remain separately classified and Orchestrator-driven.

#### 2.7.2 Target identity, action identity, and the additive seam

The versioned v1 target set contains exactly the configured Memory Core **memories Chroma collection, summaries Chroma collection, and SQLite graph destination**, in that order. Concepts, RLAIF trajectories, the sent-to-cull archive, temporal summaries, and every Knowledge Base target are excluded. Adding a destination requires a new target-set version, admission evidence, and scale evidence.

The request carries a canonical descriptor containing the ordered destination identities, destination-topology fingerprint, bundle-manifest fingerprint, and the #15691 descriptor fingerprint. Two identities are normative:

- **recovery-unit key** = action + target-set version + canonical destination identities/topology. Cooldown and rate limits bind here, so changing bundles cannot evade anti-thrash.
- **attempt fingerprint** = recovery-unit key + bundle/descriptor fingerprints. Idempotent crash resume binds to this exact attempt.

The seam extends additively without a synthetic collection alias:

- collection-scoped actions require `collection` and reject `targetSet`;
- `restore-empty-target` requires `targetSet` and rejects `collection`;
- the safety gate derives the canonical recovery-unit key before reading or recording attempts.

#### 2.7.3 Under-fence seed-aware freshness proof

One heavy-maintenance lease / writer fence spans action-time proof, staging, promotion, validation, and settlement. After acquiring it, the actuator re-reads all destinations and proves:

| Destination | Binding fresh predicate |
|---|---|
| Memories Chroma | The configured collection is opened canonically and `collection.count() === 0`. |
| Summaries Chroma | The configured collection is opened canonically and `collection.count() === 0`. |
| SQLite graph | Ignoring schema tables, normalized records exactly equal one canonical boot-seed manifest/fingerprint: `frontier`, `Neo-Master-Architecture`, all current `IDENTITIES` roots, and the single `frontier -[SYSTEM_TENET]-> Neo-Master-Architecture` edge. No extra, missing, or altered node/edge is allowed. |
| Whole target set | All three predicates pass under the same fence and the destination-topology fingerprint matches the admitted descriptor. |

Boot and recovery proof consume the same extracted graph-seed SSOT; they do not duplicate literals. If a future seed is not mechanically enumerable, recovery fails closed until a versioned pre-user-mutation marker is designed. Any action-time drift strict-settles `deferred-target-not-empty` with zero production promotion; a pre-fence selector snapshot is advisory only.

#### 2.7.4 Staging, ordered promotion, and hard eligibility

The actuator stages all three targets in run-owned isolated destinations and validates the complete staged set against the admitted bundle/target descriptor before the first production promotion. Promotion order is **memories → summaries → graph**; graph is last because it projects identities and relationships over the vector stores.

The strict run ledger fails loud and includes the semantic chain

> `admitted → fenced → staged → promoted:memories → promoted:summaries → promoted:graph → validated → committed`

plus explicit deferred, interrupted/nonterminal, and `failed-contained` states. Only strict `committed` opens data-consuming service eligibility. `recordHealOutcome` may mirror an outcome for diagnostics, but best-effort telemetry is never completion authority.

A restart consumes the same attempt fingerprint, keeps eligibility closed, reacquires the fence, reconciles component fingerprints, and resumes idempotently. Before production promotion, compensation may delete only run-owned unpromoted staging. After promotion begins, the safe direction is forward completion; if reconciliation cannot prove it, the run settles `failed-contained` / quarantine and eligibility remains denied. It never overwrites independently observed live state or claims cross-store rollback.

#### 2.7.5 Merge order and measured scale gate

The order is binding: this ADR amendment (#15739) → exact actuator action (#15740) → selector/projection consumer (#15639). #15691 supplies provider-free bundle/row admission; #15692 supplies bounded vector batches. Before #15740 may merge, #15695 must record exact-head 5,000/20,000 memories + summaries + graph staging/promotion timings, peak Node/Chroma/SQLite memory, temporary-disk high-water marks, maximum observed batch size, and zero provider calls. Synthetic controls do not replace the exact implementation receipt.

The stores are not transactionally atomic together. The safety invariant is **atomic service eligibility**: absence of `committed` keeps every data-consuming lane closed.

## 3. Considered alternatives (rejected)

- **Extend ADR-0026 into data mutation (one actuator, both worlds).** Rejected (§2.1): data mutation needs snapshot-before-mutate + validation-clean auto-promote + the systemic-fault freeze — properties lifecycle neither has nor needs. One actuator would over-constrain lifecycle or under-protect data. OQ1 resolved to a new ADR.
- **Operator-gated data recovery (the original A-H surface).** Rejected (§2.2): cloud has no operator; an operator-gate is a perpetual block in the deployments v13.1 targets. Safety moves to the envelope (#14132).
- **`escalate` as a live data-recovery terminal.** Rejected (§2.2): it pages a nonexistent cloud operator (the detect→escalate-only smoke detector epic #14039 exists to dismantle). Demoted to non-blocking evidence.
- **Silent accepted-loss (drop unembeddable residue quietly).** Rejected (§2.4): every accepted loss is a durable, fingerprint-bound, auto-reopening audit record (#14137 / OQ9). Recorded-and-reversible, never silent.
- **Mass auto-re-embed on a dimension-mismatch storm.** Rejected (§2.4): a mass-terminal residue is a misconfigured embedder; the systemic-fault bound chooses `freeze`, never amplify the fault into a mass mutation.
- **Fold the mode classifier into the actuator.** Rejected (§2.3): welds the mode taxonomy into the actuator and forces a rewrite when a new corruption mode arrives. The mode-blind seam is the cost of not repaying that debt later (mirrors ADR-0026 §2.4).
- **Keep the overloaded `restore-delta-merge` action.** Rejected (§2.7): empty-target reconstruction, row-addressable shadow fill, and journal replay have different evidence and collision models. One action name hides which authority exists.
- **Model the target set as three independent collection heals or one synthetic collection.** Rejected (§2.7.2): partial success could expose vectors with a stale graph, while a synthetic key erases destination topology and permits bundle swaps to evade or corrupt identity.
- **Claim transactional atomicity across Chroma and SQLite.** Rejected (§2.7.4): the stores promote sequentially. The enforceable invariant is a strict `committed` eligibility barrier, not fictional cross-store rollback.
- **Reuse the broad `runRestore` CLI.** Rejected (§2.7): it owns a wider maintenance substrate and lacks the action-specific target identity, isolated three-target staging, strict component ledger, and committed-only eligibility boundary.
- **Gate restore on provider readiness.** Rejected (§2.7.1): admitted bundles carry explicit vectors. A provider preflight tests an unrelated dependency and can dead-end otherwise valid disaster recovery.

## 4. Resolved and open questions

- **OQ1 — authority shape: RESOLVED (#14032).** A new ADR (this one) for the autonomous data-recovery envelope; ADR-0026 remains lifecycle/config.
- **OQ2 — automation default: RESOLVED (#14032).** Bounded, reversible, snapshot-protected operations automate by default; per-target blocklist opt-out; no operator-execution default.
- **OQ9 — accepted-loss: RESOLVED + SHIPPED (#14137).** An autonomous fingerprint-bound terminal settlement, not an operator acknowledgement; governed by the PR review/merge gate.
- **OQ5 — restore + delta: SPLIT for v13.2 (#14032 revalidation).** The overloaded `restore-delta-merge` name is retired. Exact first-boot recovery is the graduated `restore-empty-target` action (§2.7). Row-addressable `restore-shadow-fill` remains deferred, and journal-backed replay has no source authority.
- **OQ7 — full corruption-percent × mode selector: NARROWED, STILL OPEN.** It is unnecessary for an exact fresh-empty target set and remains unresolved for broad in-place repair selection.
- **OQ8 — post-backup authority: NARROWED, STILL OPEN.** Exact empty-target restore needs no replay journal because there is no live collision or claimed delta. Any later replay action requires a complete ordered mutation source; count evidence never supplies row identity.
- **Liveness / revalidation trigger.** Re-validate this ADR if embeddability logic changes (the #14126 `strategyVersion` fingerprint-binding), a new corruption mode appears, the v1 target set changes, the graph boot-seed manifest cannot be enumerated, #15695 exposes an unsafe scale curve, or a source-backed `restore-shadow-fill` / replay contract graduates. @neo-gemini-pro is `operator_benched`; re-poll Gemini liveness before using a future Gemini signal as amendment authority.

## 5. Consequences

The organism gains the **data act-half** of its immune response — and gains it **fully autonomous**, with no operator gate that cloud cannot honor. Paired with ADR-0026 (lifecycle/config) under ADR-0025 (detect+diagnose), the three ADRs are the v13.1 self-healing immune system: detect → classify → act, across both the lifecycle world and the data world, with escalation demoted to a record rather than a blocking page. The cost is the data-world envelope's strictness — snapshot-before-mutate, validation-clean auto-promote, the systemic-fault freeze, the auto-reopening loss fingerprint — which is *more* machinery than the lifecycle world needs, and is the deliberate price of mutating the substrate the organism remembers with.

The v13.2 amendment adds one deliberately narrow reconstruction terminal: a default-off, exact fresh-empty Memory Core target set restored through the same classifier/actuator authority, with isolated staging, ordered promotion, forward-only crash recovery, and `committed` as the sole eligibility opener. It does not authorize generic in-place restore, count-based promotion, replay, Knowledge Base restore, provider gating, or re-embedding. The added machinery is substantial because multi-store mutation cannot be made transactionally atomic; strict service eligibility and a durable component ledger are the honest substitute. The #15695 exact-head scale receipt remains a merge gate so architectural safety does not conceal an operational dead end.

`DataRecoveryActuatorService` remains the only authority for autonomous Memory Core data mutation. It must not widen the action set, bypass the envelope, let #15639 mutate directly, or reintroduce a live operator gate without re-opening this ADR under cross-family review.
